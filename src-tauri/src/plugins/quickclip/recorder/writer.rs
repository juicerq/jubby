use super::super::capture::CaptureMessage;
use super::super::errors::{CaptureError, EncodingError, QuickClipError};
use super::super::types::{AudioMode, Framerate, ResolutionScale, ENCODING_CRF, ENCODING_PRESET};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::Receiver;
use std::thread::JoinHandle;

/// RAII guard ensuring FFmpeg process cleanup and partial file deletion on abnormal exit.
///
/// On drop, if not marked as completed:
/// 1. Kills the FFmpeg process (SIGKILL on Unix)
/// 2. Deletes the partial output file
///
/// This ensures cleanup happens even on panic or early return.
pub struct WriterGuard {
    child: Option<Child>,
    output_path: PathBuf,
    completed: bool,
}

impl WriterGuard {
    pub fn new(child: Child, output_path: PathBuf) -> Self {
        Self {
            child: Some(child),
            output_path,
            completed: false,
        }
    }

    /// Prevents cleanup on drop. Call after FFmpeg successfully completes.
    pub fn mark_completed(&mut self) {
        self.completed = true;
    }

    /// Takes ownership of child for wait_with_output(). Drop will not kill after this.
    pub fn take_child(&mut self) -> Option<Child> {
        self.child.take()
    }

    pub fn child_mut(&mut self) -> Option<&mut Child> {
        self.child.as_mut()
    }
}

impl Drop for WriterGuard {
    fn drop(&mut self) {
        if self.completed {
            return;
        }

        tracing::warn!(target: "quickclip", "[WRITER] WriterGuard dropping without completion, cleaning up...");

        if let Some(mut child) = self.child.take() {
            tracing::info!(target: "quickclip", "[WRITER] Killing FFmpeg process");
            if let Err(e) = child.kill() {
                tracing::warn!(target: "quickclip", "[WRITER] Failed to kill FFmpeg: {}", e);
            }
            let _ = child.wait();
        }

        if self.output_path.exists() {
            tracing::info!(target: "quickclip", "[WRITER] Deleting partial file: {:?}", self.output_path);
            if let Err(e) = std::fs::remove_file(&self.output_path) {
                tracing::warn!(target: "quickclip", "[WRITER] Failed to delete partial file: {}", e);
            }
        }
    }
}

/// Number of frames to buffer during calibration phase to measure actual framerate.
const CALIBRATION_FRAMES: usize = 30;

/// Result from the writer thread.
pub struct WriterResult {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub frame_count: u32,
}

/// Gets the default PulseAudio/PipeWire monitor source for system audio capture.
fn get_default_monitor_source() -> Option<String> {
    let output = Command::new("pactl")
        .args(["get-default-sink"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let sink_name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if sink_name.is_empty() {
        return None;
    }

    Some(format!("{}.monitor", sink_name))
}

/// Gets the default PulseAudio/PipeWire input source for microphone capture.
fn get_default_input_source() -> Option<String> {
    let output = Command::new("pactl")
        .args(["get-default-source"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let source_name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if source_name.is_empty() {
        return None;
    }

    Some(source_name)
}

/// Spawns a thread that receives frames from the capture loop and writes them to FFmpeg.
pub fn spawn_writer_thread(
    frame_receiver: Receiver<CaptureMessage>,
    video_path: PathBuf,
    resolution_scale: ResolutionScale,
    framerate: Framerate,
    audio_mode: AudioMode,
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
                    return Err(CaptureError::NoFrames.into());
                }
                Ok(CaptureMessage::Frame(_)) => {
                    tracing::warn!(target: "quickclip", "[WRITER] Frame received before metadata, skipping");
                    continue;
                }
                Err(_) => {
                    tracing::error!(target: "quickclip", "[WRITER] Channel closed before metadata");
                    return Err(CaptureError::NoFrames.into());
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
            return Err(CaptureError::NoFrames.into());
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

        // Build FFmpeg args dynamically based on audio mode
        let mut ffmpeg_args: Vec<String> = Vec::new();

        // Audio inputs (must come before video input)
        let (has_system_audio, has_mic_audio) = match audio_mode {
            AudioMode::None => (false, false),
            AudioMode::System => (true, false),
            AudioMode::Mic => (false, true),
            AudioMode::Both => (true, true),
        };

        let system_source = if has_system_audio {
            get_default_monitor_source()
        } else {
            None
        };

        let mic_source = if has_mic_audio {
            get_default_input_source()
        } else {
            None
        };

        // Audio offset to sync with buffered video frames
        // Use full calibration time - audio starts when FFmpeg spawns, video started at T=0
        let audio_offset_secs = calibration_elapsed;
        let audio_offset = format!("{:.3}", audio_offset_secs);

        tracing::info!(target: "quickclip",
            "[WRITER] Audio config: mode={:?}, system_source={:?}, mic_source={:?}, calibration={:.3}s, offset={:.3}s",
            audio_mode, system_source, mic_source, calibration_elapsed, audio_offset_secs);

        // Add system audio input (index 0 if present)
        // Positive itsoffset delays audio to sync with buffered video frames
        if let Some(ref source) = system_source {
            ffmpeg_args.extend([
                "-itsoffset".to_string(), audio_offset.clone(),
                "-f".to_string(), "pulse".to_string(),
                "-i".to_string(), source.clone(),
            ]);
        }

        // Add mic audio input (index 0 or 1 depending on system audio)
        if let Some(ref source) = mic_source {
            ffmpeg_args.extend([
                "-itsoffset".to_string(), audio_offset.clone(),
                "-f".to_string(), "pulse".to_string(),
                "-i".to_string(), source.clone(),
            ]);
        }

        // Video input (piped rawvideo) - this will be the last input
        ffmpeg_args.extend([
            "-f".to_string(), "rawvideo".to_string(),
            "-pixel_format".to_string(), "rgba".to_string(),
            "-video_size".to_string(), video_size.clone(),
            "-framerate".to_string(), input_framerate.clone(),
            "-i".to_string(), "pipe:0".to_string(),
        ]);

        // Calculate input indices for mapping
        let video_input_idx = match (system_source.is_some(), mic_source.is_some()) {
            (true, true) => 2,
            (true, false) | (false, true) => 1,
            (false, false) => 0,
        };

        // Video filter
        ffmpeg_args.extend(["-vf".to_string(), video_filter.clone()]);

        // Stream mapping and audio filter for multiple inputs
        match (system_source.is_some(), mic_source.is_some()) {
            (true, true) => {
                // Both: merge audio streams, use video from last input
                ffmpeg_args.extend([
                    "-filter_complex".to_string(),
                    "[0:a][1:a]amerge=inputs=2[aout]".to_string(),
                    "-map".to_string(), format!("{}:v", video_input_idx),
                    "-map".to_string(), "[aout]".to_string(),
                    "-ac".to_string(), "2".to_string(),
                ]);
            }
            (true, false) | (false, true) => {
                // Single audio source: map video and audio explicitly
                ffmpeg_args.extend([
                    "-map".to_string(), format!("{}:v", video_input_idx),
                    "-map".to_string(), "0:a".to_string(),
                ]);
            }
            (false, false) => {
                // No audio: just use video
            }
        }

        // Video encoding
        ffmpeg_args.extend([
            "-c:v".to_string(), "libx264".to_string(),
            "-pix_fmt".to_string(), "yuv420p".to_string(),
            "-crf".to_string(), ENCODING_CRF.to_string(),
            "-preset".to_string(), ENCODING_PRESET.to_string(),
        ]);

        // Audio encoding (if any audio input)
        if system_source.is_some() || mic_source.is_some() {
            ffmpeg_args.extend([
                "-c:a".to_string(), "aac".to_string(),
                "-b:a".to_string(), "128k".to_string(),
            ]);
        }

        // Output options
        if system_source.is_some() || mic_source.is_some() {
            ffmpeg_args.push("-shortest".to_string());
        }
        ffmpeg_args.extend([
            "-movflags".to_string(), "+faststart".to_string(),
            "-y".to_string(),
            output_str.clone(),
        ]);

        tracing::info!(target: "quickclip",
            "[WRITER] Starting FFmpeg: {}x{} @ {}fps -> {}fps, preset={}, crf={}, scale={:?}, audio={:?}",
            width, height, input_fps, target_fps, ENCODING_PRESET, ENCODING_CRF, resolution_scale, audio_mode);
        tracing::debug!(target: "quickclip", "[WRITER] FFmpeg args: {:?}", ffmpeg_args);

        let child = Command::new("ffmpeg")
            .args(&ffmpeg_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| EncodingError::WriteFailed(format!("Failed to spawn FFmpeg: {}", e)))?;

        let mut guard = WriterGuard::new(child, video_path.clone());

        let mut stdin = guard
            .child_mut()
            .and_then(|c| c.stdin.take())
            .ok_or_else(|| EncodingError::WriteFailed("Failed to capture FFmpeg stdin".to_string()))?;

        let mut frame_count: u32 = 0;
        for frame_data in frame_buffer {
            if let Err(e) = stdin.write_all(&frame_data) {
                drop(stdin);
                return Err(EncodingError::WriteFailed(format!(
                    "Failed to write buffered frame {}: {}",
                    frame_count, e
                )).into());
            }
            frame_count += 1;
        }

        tracing::debug!(target: "quickclip", "[WRITER] Flushed {} buffered frames", frame_count);

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
                            return Err(EncodingError::WriteFailed(format!(
                                "Failed to write frame {}: {}",
                                frame_count, e
                            )).into());
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

        let child = guard.take_child()
            .ok_or_else(|| EncodingError::WriteFailed("FFmpeg child already taken".to_string()))?;
        
        let output = child
            .wait_with_output()
            .map_err(|e| EncodingError::WriteFailed(format!("FFmpeg wait failed: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::error!(target: "quickclip", "[WRITER] FFmpeg failed: {}", stderr);
            let exit_code = output.status.code().unwrap_or(-1);
            return Err(EncodingError::ProcessFailed { exit_code, stderr: stderr.to_string() }.into());
        }

        guard.mark_completed();

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
            .map_err(|e| EncodingError::WriteFailed(format!("ffprobe failed: {}", e)))?;

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
