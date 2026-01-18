use super::super::capture::CaptureMessage;
use super::super::errors::QuickClipError;
use super::super::types::{BitrateMode, Framerate, ResolutionScale};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc::Receiver;
use std::thread::JoinHandle;

/// Number of frames to buffer during calibration phase to measure actual framerate.
const CALIBRATION_FRAMES: usize = 30;

/// Result from the writer thread.
pub struct WriterResult {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub frame_count: u32,
}

/// Spawns a thread that receives frames from the capture loop and writes them to FFmpeg.
pub fn spawn_writer_thread(
    frame_receiver: Receiver<CaptureMessage>,
    video_path: PathBuf,
    bitrate_mode: BitrateMode,
    resolution_scale: ResolutionScale,
    framerate: Framerate,
) -> JoinHandle<Result<WriterResult, QuickClipError>> {
    std::thread::spawn(move || {
        // Phase 1: Wait for metadata
        let (width, height) = loop {
            match frame_receiver.recv() {
                Ok(CaptureMessage::Metadata { width, height }) => {
                    tracing::info!(target: "quickclip", "[WRITER] Received metadata: {}x{}", width, height);
                    break (width, height);
                }
                Ok(CaptureMessage::EndOfStream) => {
                    tracing::warn!(target: "quickclip", "[WRITER] EndOfStream before metadata");
                    return Err(QuickClipError::NoFrames);
                }
                Ok(CaptureMessage::Frame(_)) => {
                    tracing::warn!(target: "quickclip", "[WRITER] Frame received before metadata, skipping");
                    continue;
                }
                Err(_) => {
                    tracing::error!(target: "quickclip", "[WRITER] Channel closed before metadata");
                    return Err(QuickClipError::NoFrames);
                }
            }
        };

        let expected_size = (width * height * 4) as usize;

        // Phase 2: Calibration
        let mut frame_buffer: Vec<Vec<u8>> = Vec::with_capacity(CALIBRATION_FRAMES);
        let calibration_start = std::time::Instant::now();
        let mut got_end_of_stream = false;

        tracing::debug!(target: "quickclip", "[WRITER] Starting calibration phase, buffering {} frames...", CALIBRATION_FRAMES);

        loop {
            match frame_receiver.recv() {
                Ok(CaptureMessage::Frame(frame_data)) => {
                    if frame_data.len() != expected_size {
                        tracing::warn!(target: "quickclip",
                            "[WRITER] Frame size mismatch during calibration: expected {}, got {}",
                            expected_size, frame_data.len());
                        continue;
                    }
                    frame_buffer.push(frame_data);
                    if frame_buffer.len() >= CALIBRATION_FRAMES {
                        break;
                    }
                }
                Ok(CaptureMessage::EndOfStream) => {
                    tracing::info!(target: "quickclip",
                        "[WRITER] EndOfStream during calibration, got {} frames",
                        frame_buffer.len());
                    got_end_of_stream = true;
                    break;
                }
                Ok(CaptureMessage::Metadata { .. }) => {
                    tracing::warn!(target: "quickclip", "[WRITER] Duplicate metadata during calibration, ignoring");
                }
                Err(_) => {
                    tracing::warn!(target: "quickclip", "[WRITER] Channel closed during calibration");
                    got_end_of_stream = true;
                    break;
                }
            }
        }

        // Phase 3: Calculate framerate
        let calibration_elapsed = calibration_start.elapsed().as_secs_f64();
        let measured_fps = if frame_buffer.len() > 1 && calibration_elapsed > 0.01 {
            (frame_buffer.len() - 1) as f64 / calibration_elapsed
        } else {
            60.0
        };
        let input_fps = (measured_fps.round() as u32).clamp(1, 240);

        tracing::info!(target: "quickclip",
            "[WRITER] Calibration complete: measured {:.2}fps from {} frames in {:.3}s (using {}fps)",
            measured_fps, frame_buffer.len(), calibration_elapsed, input_fps);

        if frame_buffer.is_empty() {
            return Err(QuickClipError::NoFrames);
        }

        // Phase 4: Start FFmpeg
        let target_fps = framerate.value();

        let video_filter = {
            let mut filters = Vec::new();
            filters.push(format!("fps={}", target_fps));
            if let Some(scale) = resolution_scale.scale_filter() {
                filters.push(format!("scale={}", scale));
            }
            filters.join(",")
        };

        let video_size = format!("{}x{}", width, height);
        let input_framerate = input_fps.to_string();
        let output_str = video_path.to_string_lossy().to_string();

        tracing::info!(target: "quickclip",
            "[WRITER] Starting FFmpeg: {}x{} @ {}fps -> {}fps, preset={}, crf={}, scale={:?}",
            width, height, input_fps, target_fps, bitrate_mode.preset(), bitrate_mode.crf(), resolution_scale);

        let mut child = Command::new("ffmpeg")
            .args([
                "-f", "rawvideo",
                "-pixel_format", "rgba",
                "-video_size", &video_size,
                "-framerate", &input_framerate,
                "-i", "pipe:0",
                "-vf", &video_filter,
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-crf", bitrate_mode.crf(),
                "-preset", bitrate_mode.preset(),
                "-movflags", "+faststart",
                "-y",
                &output_str,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| QuickClipError::EncodingError(format!("Failed to spawn FFmpeg: {}", e)))?;

        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| QuickClipError::EncodingError("Failed to capture FFmpeg stdin".to_string()))?;

        // Phase 5: Flush buffered frames
        let mut frame_count: u32 = 0;
        for frame_data in frame_buffer {
            if let Err(e) = stdin.write_all(&frame_data) {
                drop(stdin);
                let output = child.wait_with_output().map_err(|e2| {
                    QuickClipError::EncodingError(format!(
                        "Write failed: {}, then wait failed: {}",
                        e, e2
                    ))
                })?;
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(QuickClipError::EncodingError(format!(
                    "Failed to write buffered frame {}: {} - FFmpeg stderr: {}",
                    frame_count, e, stderr
                )));
            }
            frame_count += 1;
        }

        tracing::debug!(target: "quickclip", "[WRITER] Flushed {} buffered frames", frame_count);

        // Phase 6: Continue streaming
        if !got_end_of_stream {
            loop {
                match frame_receiver.recv() {
                    Ok(CaptureMessage::Frame(frame_data)) => {
                        if frame_data.len() != expected_size {
                            tracing::warn!(target: "quickclip",
                                "[WRITER] Frame size mismatch: expected {}, got {}",
                                expected_size, frame_data.len());
                            continue;
                        }

                        if let Err(e) = stdin.write_all(&frame_data) {
                            drop(stdin);
                            let output = child.wait_with_output().map_err(|e2| {
                                QuickClipError::EncodingError(format!(
                                    "Write failed: {}, then wait failed: {}",
                                    e, e2
                                ))
                            })?;
                            let stderr = String::from_utf8_lossy(&output.stderr);
                            return Err(QuickClipError::EncodingError(format!(
                                "Failed to write frame {}: {} - FFmpeg stderr: {}",
                                frame_count, e, stderr
                            )));
                        }

                        frame_count += 1;

                        if frame_count % 60 == 0 {
                            tracing::debug!(target: "quickclip", "[WRITER] Written {} frames", frame_count);
                        }
                    }
                    Ok(CaptureMessage::EndOfStream) => {
                        tracing::info!(target: "quickclip", "[WRITER] EndOfStream received, finalizing...");
                        break;
                    }
                    Ok(CaptureMessage::Metadata { .. }) => {
                        tracing::warn!(target: "quickclip", "[WRITER] Duplicate metadata received, ignoring");
                    }
                    Err(_) => {
                        tracing::warn!(target: "quickclip", "[WRITER] Channel closed, finalizing...");
                        break;
                    }
                }
            }
        }

        drop(stdin);

        tracing::debug!(target: "quickclip", "[WRITER] Waiting for FFmpeg to finish...");

        let output = child
            .wait_with_output()
            .map_err(|e| QuickClipError::EncodingError(format!("FFmpeg wait failed: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::error!(target: "quickclip", "[WRITER] FFmpeg failed: {}", stderr);
            return Err(QuickClipError::EncodingError(stderr.to_string()));
        }

        tracing::info!(target: "quickclip", "[WRITER] FFmpeg complete, {} frames written", frame_count);

        // Get duration using ffprobe
        let duration_output = Command::new("ffprobe")
            .args([
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                &output_str,
            ])
            .output()
            .map_err(|e| QuickClipError::EncodingError(format!("ffprobe failed: {}", e)))?;

        let duration_str = String::from_utf8_lossy(&duration_output.stdout);
        let duration: f64 = duration_str.trim().parse().unwrap_or(0.0);

        tracing::info!(target: "quickclip", "[WRITER] Video duration: {:.2}s", duration);

        Ok(WriterResult {
            duration,
            width,
            height,
            frame_count,
        })
    })
}
