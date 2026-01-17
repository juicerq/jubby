use crate::pipewire_capture::{
    self, CaptureMessage, CaptureSource, CaptureStats, ScreencastSession,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Receiver;
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;
use thiserror::Error;
use tokio::sync::Mutex;
use tokio::time::timeout;

#[derive(Error, Debug)]
pub enum RecorderError {
    #[error("Failed to capture frame: {0}")]
    CaptureFailure(String),
    #[error("Failed to create directory: {0}")]
    StorageError(String),
    #[error("FFmpeg not found. Please install ffmpeg.")]
    FfmpegNotFound,
    #[error("FFmpeg encoding failed: {0}")]
    EncodingError(String),
    #[error("No frames captured")]
    NoFrames,
    #[error("Recording already in progress")]
    AlreadyRecording,
    #[error("No recording in progress")]
    NotRecording,
    #[error("Encoding timeout after {0} seconds")]
    EncodingTimeout(u64),
    #[error("XDG Desktop Portal is not available")]
    PortalUnavailable,
    #[error("User cancelled the capture selection")]
    UserCancelled,
    #[error("PipeWire error: {0}")]
    PipeWireError(String),
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum QualityMode {
    #[default]
    Light,
    High,
}

impl QualityMode {
    fn crf(&self) -> &str {
        match self {
            QualityMode::Light => "32",
            QualityMode::High => "18",
        }
    }

    fn preset(&self) -> &str {
        match self {
            QualityMode::Light => "fast",
            QualityMode::High => "slower",
        }
    }

    fn default_scale(&self) -> ResolutionScale {
        match self {
            QualityMode::Light => ResolutionScale::P720,
            QualityMode::High => ResolutionScale::Native,
        }
    }

    fn default_target_fps(&self) -> u32 {
        // 30fps is Discord-friendly and keeps file sizes small
        30
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ResolutionScale {
    #[default]
    Native,
    P720,
    P480,
}

impl ResolutionScale {
    fn scale_filter(&self) -> Option<&str> {
        match self {
            ResolutionScale::Native => None,
            ResolutionScale::P720 => Some("1280:-2"),
            ResolutionScale::P480 => Some("854:-2"),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingResult {
    pub id: String,
    pub video_path: String,
    pub thumbnail_path: String,
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub frame_count: u32,
    pub timestamp: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingStatus {
    pub is_recording: bool,
    pub frame_count: u32,
    pub elapsed_seconds: f64,
}

struct RecordingSession {
    session_dir: PathBuf,
    start_time: std::time::Instant,
    video_path: PathBuf,
    thumbnail_path: PathBuf,
    recording_id: String,
    timestamp: i64,
}

pub struct RecorderState {
    is_recording: Arc<AtomicBool>,
    session: Arc<Mutex<Option<RecordingSession>>>,
    stop_signal: Mutex<Option<Arc<AtomicBool>>>,
    writer_handle: std::sync::Mutex<Option<JoinHandle<Result<WriterResult, RecorderError>>>>,
    capture_handle: std::sync::Mutex<Option<JoinHandle<Result<CaptureStats, RecorderError>>>>,
}

impl RecorderState {
    pub fn new() -> Self {
        Self {
            is_recording: Arc::new(AtomicBool::new(false)),
            session: Arc::new(Mutex::new(None)),
            stop_signal: Mutex::new(None),
            writer_handle: std::sync::Mutex::new(None),
            capture_handle: std::sync::Mutex::new(None),
        }
    }
}

impl Default for RecorderState {
    fn default() -> Self {
        Self::new()
    }
}

fn get_quickclip_dir() -> Result<PathBuf, RecorderError> {
    let base_dir = if let Ok(xdg_data) = std::env::var("XDG_DATA_HOME") {
        PathBuf::from(xdg_data)
    } else {
        let home = std::env::var("HOME").expect("HOME environment variable must be set");
        PathBuf::from(home).join(".local").join("share")
    };

    let quickclip_dir = base_dir.join("jubby").join("quickclip");

    if !quickclip_dir.exists() {
        std::fs::create_dir_all(&quickclip_dir)
            .map_err(|e| RecorderError::StorageError(e.to_string()))?;
    }

    Ok(quickclip_dir)
}

fn get_videos_dir() -> Result<PathBuf, RecorderError> {
    let videos_dir = get_quickclip_dir()?.join("videos");

    if !videos_dir.exists() {
        std::fs::create_dir_all(&videos_dir)
            .map_err(|e| RecorderError::StorageError(e.to_string()))?;
    }

    Ok(videos_dir)
}

fn get_thumbnails_dir() -> Result<PathBuf, RecorderError> {
    let thumbnails_dir = get_quickclip_dir()?.join("thumbnails");

    if !thumbnails_dir.exists() {
        std::fs::create_dir_all(&thumbnails_dir)
            .map_err(|e| RecorderError::StorageError(e.to_string()))?;
    }

    Ok(thumbnails_dir)
}

fn get_sessions_dir() -> Result<PathBuf, RecorderError> {
    let sessions_dir = get_quickclip_dir()?.join("sessions");

    if !sessions_dir.exists() {
        std::fs::create_dir_all(&sessions_dir)
            .map_err(|e| RecorderError::StorageError(e.to_string()))?;
    }

    Ok(sessions_dir)
}

fn check_ffmpeg() -> Result<(), RecorderError> {
    Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|_| RecorderError::FfmpegNotFound)?;
    Ok(())
}

fn generate_thumbnail(video_path: &PathBuf, thumbnail_path: &PathBuf) -> Result<(), RecorderError> {
    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            &video_path.to_string_lossy(),
            "-ss",
            "00:00:00",
            "-vframes",
            "1",
            "-vf",
            "scale=320:-1",
            &thumbnail_path.to_string_lossy(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| RecorderError::EncodingError(format!("Thumbnail generation failed: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::error!(target: "quickclip", "[ENCODE] Thumbnail failed: {}", stderr);
        return Err(RecorderError::EncodingError(format!(
            "Thumbnail generation failed: {}",
            stderr
        )));
    }

    Ok(())
}

fn cleanup_session_dir(session_dir: &PathBuf) {
    if session_dir.exists() {
        let _ = std::fs::remove_dir_all(session_dir);
    }
}

/// Result from the writer thread
pub struct WriterResult {
    /// Duration of the video in seconds
    pub duration: f64,
    /// Width of the video
    pub width: u32,
    /// Height of the video
    pub height: u32,
    /// Total frames written
    pub frame_count: u32,
}

/// Number of frames to buffer during calibration phase to measure actual framerate
const CALIBRATION_FRAMES: usize = 30;

/// Spawns a thread that receives frames from the capture loop and writes them to FFmpeg.
///
/// Uses a calibration phase to measure the actual capture framerate from frame arrival times
/// before starting FFmpeg. This is necessary because PipeWire doesn't report accurate framerate
/// for screen capture (returns 0/1), but the actual rate depends on monitor refresh rate.
fn spawn_writer_thread(
    frame_receiver: Receiver<CaptureMessage>,
    video_path: PathBuf,
    quality: QualityMode,
    resolution_scale: ResolutionScale,
) -> JoinHandle<Result<WriterResult, RecorderError>> {
    std::thread::spawn(move || {
        // Phase 1: Wait for metadata message to get dimensions
        let (width, height) = loop {
            match frame_receiver.recv() {
                Ok(CaptureMessage::Metadata { width, height }) => {
                    tracing::info!(target: "quickclip", "[WRITER] Received metadata: {}x{}", width, height);
                    break (width, height);
                }
                Ok(CaptureMessage::EndOfStream) => {
                    tracing::warn!(target: "quickclip", "[WRITER] EndOfStream before metadata");
                    return Err(RecorderError::NoFrames);
                }
                Ok(CaptureMessage::Frame(_)) => {
                    tracing::warn!(target: "quickclip", "[WRITER] Frame received before metadata, skipping");
                    continue;
                }
                Err(_) => {
                    tracing::error!(target: "quickclip", "[WRITER] Channel closed before metadata");
                    return Err(RecorderError::NoFrames);
                }
            }
        };

        let expected_size = (width * height * 4) as usize;

        // Phase 2: Calibration - buffer frames and measure timing
        let mut frame_buffer: Vec<Vec<u8>> = Vec::with_capacity(CALIBRATION_FRAMES);
        let calibration_start = std::time::Instant::now();
        let mut got_end_of_stream = false;

        tracing::debug!(target: "quickclip", "[WRITER] Starting calibration phase, buffering {} frames...", CALIBRATION_FRAMES);

        loop {
            match frame_receiver.recv() {
                Ok(CaptureMessage::Frame(frame_data)) => {
                    // Validate frame size
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
                    // Very short recording - use what we have
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

        // Phase 3: Calculate measured framerate from calibration
        let calibration_elapsed = calibration_start.elapsed().as_secs_f64();
        let measured_fps = if frame_buffer.len() > 1 && calibration_elapsed > 0.01 {
            (frame_buffer.len() - 1) as f64 / calibration_elapsed
        } else {
            60.0 // Fallback for edge cases (very short recordings or timing issues)
        };
        let input_fps = (measured_fps.round() as u32).clamp(1, 240);

        tracing::info!(target: "quickclip",
            "[WRITER] Calibration complete: measured {:.2}fps from {} frames in {:.3}s (using {}fps)",
            measured_fps, frame_buffer.len(), calibration_elapsed, input_fps);

        // Handle case of no frames captured
        if frame_buffer.is_empty() {
            return Err(RecorderError::NoFrames);
        }

        // Phase 4: Start FFmpeg with measured framerate
        let target_fps = quality.default_target_fps();

        // Build video filter chain: fps conversion + optional scaling
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
            width, height, input_fps, target_fps, quality.preset(), quality.crf(), resolution_scale);

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
                "-crf", quality.crf(),
                "-preset", quality.preset(),
                "-movflags", "+faststart",
                "-y",
                &output_str,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| RecorderError::EncodingError(format!("Failed to spawn FFmpeg: {}", e)))?;

        let mut stdin = child.stdin.take()
            .ok_or_else(|| RecorderError::EncodingError("Failed to capture FFmpeg stdin".to_string()))?;

        // Phase 5: Flush buffered frames to FFmpeg
        let mut frame_count: u32 = 0;
        for frame_data in frame_buffer {
            if let Err(e) = stdin.write_all(&frame_data) {
                drop(stdin);
                let output = child.wait_with_output()
                    .map_err(|e2| RecorderError::EncodingError(
                        format!("Write failed: {}, then wait failed: {}", e, e2)
                    ))?;
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(RecorderError::EncodingError(format!(
                    "Failed to write buffered frame {}: {} - FFmpeg stderr: {}",
                    frame_count, e, stderr
                )));
            }
            frame_count += 1;
        }

        tracing::debug!(target: "quickclip", "[WRITER] Flushed {} buffered frames", frame_count);

        // Phase 6: Continue streaming new frames (skip if we already got EndOfStream)
        if !got_end_of_stream {
            loop {
                match frame_receiver.recv() {
                    Ok(CaptureMessage::Frame(frame_data)) => {
                        // Validate frame size
                        if frame_data.len() != expected_size {
                            tracing::warn!(target: "quickclip",
                                "[WRITER] Frame size mismatch: expected {}, got {}",
                                expected_size, frame_data.len());
                            continue;
                        }

                        // Write frame to FFmpeg stdin
                        if let Err(e) = stdin.write_all(&frame_data) {
                            drop(stdin);
                            let output = child.wait_with_output()
                                .map_err(|e2| RecorderError::EncodingError(
                                    format!("Write failed: {}, then wait failed: {}", e, e2)
                                ))?;
                            let stderr = String::from_utf8_lossy(&output.stderr);
                            return Err(RecorderError::EncodingError(format!(
                                "Failed to write frame {}: {} - FFmpeg stderr: {}",
                                frame_count, e, stderr
                            )));
                        }

                        frame_count += 1;

                        // Log progress every 60 frames
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

        // Close stdin to signal EOF to FFmpeg
        drop(stdin);

        tracing::debug!(target: "quickclip", "[WRITER] Waiting for FFmpeg to finish...");

        // Wait for FFmpeg to finish
        let output = child.wait_with_output()
            .map_err(|e| RecorderError::EncodingError(format!("FFmpeg wait failed: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::error!(target: "quickclip", "[WRITER] FFmpeg failed: {}", stderr);
            return Err(RecorderError::EncodingError(stderr.to_string()));
        }

        tracing::info!(target: "quickclip", "[WRITER] FFmpeg complete, {} frames written", frame_count);

        // Get video duration using ffprobe
        let duration_output = Command::new("ffprobe")
            .args([
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                &output_str,
            ])
            .output()
            .map_err(|e| RecorderError::EncodingError(format!("ffprobe failed: {}", e)))?;

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

#[tauri::command]
pub fn recorder_check_ffmpeg() -> Result<bool, String> {
    match check_ffmpeg() {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Capture mode for the recorder (maps to PipeWire CaptureSource)
#[derive(Clone, Copy, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum PipeWireCaptureMode {
    #[default]
    Fullscreen,
    Area,
}

impl From<PipeWireCaptureMode> for CaptureSource {
    fn from(mode: PipeWireCaptureMode) -> Self {
        match mode {
            PipeWireCaptureMode::Fullscreen => CaptureSource::Fullscreen,
            PipeWireCaptureMode::Area => CaptureSource::Area,
        }
    }
}

#[tauri::command]
pub async fn recorder_start(
    state: tauri::State<'_, RecorderState>,
    quality: QualityMode,
    capture_mode: Option<PipeWireCaptureMode>,
    resolution_scale: Option<ResolutionScale>,
) -> Result<(), String> {
    let scale = resolution_scale.unwrap_or_else(|| quality.default_scale());
    start_recording_internal(&state, quality, capture_mode.unwrap_or_default(), scale)
        .await
        .map_err(|e| e.to_string())
}

async fn start_recording_internal(
    state: &RecorderState,
    quality: QualityMode,
    capture_mode: PipeWireCaptureMode,
    resolution_scale: ResolutionScale,
) -> Result<(), RecorderError> {
    tracing::info!(target: "quickclip",
        "[RECORD] Starting: quality={:?}, capture_mode={:?}, resolution_scale={:?}",
        quality, capture_mode, resolution_scale);

    check_ffmpeg()?;

    if state.is_recording.load(Ordering::SeqCst) {
        tracing::warn!(target: "quickclip", "[RECORD] Already recording");
        return Err(RecorderError::AlreadyRecording);
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis() as i64;

    let session_dir = get_sessions_dir()?.join(format!("session_{}", timestamp));
    std::fs::create_dir_all(&session_dir).map_err(|e| RecorderError::StorageError(e.to_string()))?;

    // Generate video and thumbnail paths upfront for the writer thread
    let recording_id = uuid::Uuid::new_v4().to_string();
    let video_filename = format!("recording_{}.mp4", timestamp);
    let thumbnail_filename = format!("thumb_{}.png", timestamp);
    let video_path = get_videos_dir()?.join(&video_filename);
    let thumbnail_path = get_thumbnails_dir()?.join(&thumbnail_filename);

    // Create PipeWire screencast session via XDG Desktop Portal
    let capture_source: CaptureSource = capture_mode.into();
    let screencast_session = ScreencastSession::new(capture_source).await?;

    // Capture start time before storing session (needed for duration calculation)
    let recording_start = std::time::Instant::now();

    let session = RecordingSession {
        session_dir,
        start_time: recording_start,
        video_path: video_path.clone(),
        thumbnail_path: thumbnail_path.clone(),
        recording_id,
        timestamp,
    };

    *state.session.lock().await = Some(session);
    state.is_recording.store(true, Ordering::SeqCst);

    tracing::info!(target: "quickclip", "[RECORD] Session started: node_id={}", screencast_session.node_id);

    let stop_signal = Arc::new(AtomicBool::new(false));
    *state.stop_signal.lock().await = Some(stop_signal.clone());

    // Create bounded channel for frame streaming (30 frames = ~0.5s backpressure at 60fps)
    let (frame_sender, frame_receiver) = std::sync::mpsc::sync_channel::<CaptureMessage>(30);

    // Spawn the writer thread (receives frames and writes to FFmpeg)
    let writer_handle = spawn_writer_thread(
        frame_receiver,
        video_path,
        quality,
        resolution_scale,
    );
    *state.writer_handle.lock().unwrap() = Some(writer_handle);

    // Spawn the PipeWire capture loop in a blocking thread
    let capture_handle = std::thread::spawn(move || {
        pipewire_capture::run_capture_loop(screencast_session, stop_signal, recording_start, frame_sender)
    });
    *state.capture_handle.lock().unwrap() = Some(capture_handle);

    Ok(())
}

#[tauri::command]
pub async fn recorder_stop(
    state: tauri::State<'_, RecorderState>,
) -> Result<RecordingResult, String> {
    stop_recording_internal(&state)
        .await
        .map_err(|e| e.to_string())
}

async fn stop_recording_internal(state: &RecorderState) -> Result<RecordingResult, RecorderError> {
    tracing::info!(target: "quickclip", "[RECORD] Stopping...");

    if !state.is_recording.load(Ordering::SeqCst) {
        tracing::warn!(target: "quickclip", "[RECORD] Not recording");
        return Err(RecorderError::NotRecording);
    }

    // Signal stop (triggers 3s drain in capture loop)
    if let Some(stop_signal) = state.stop_signal.lock().await.take() {
        stop_signal.store(true, Ordering::SeqCst);
        tracing::debug!(target: "quickclip", "[RECORD] Stop signal sent");
    }

    // Get session metadata before joining threads
    let session = state
        .session
        .lock()
        .await
        .take()
        .ok_or(RecorderError::NotRecording)?;

    // Take thread handles
    let capture_handle = state
        .capture_handle
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| RecorderError::CaptureFailure("No capture handle".to_string()))?;

    let writer_handle = state
        .writer_handle
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| RecorderError::CaptureFailure("No writer handle".to_string()))?;

    // Join capture thread with timeout (includes 3s drain period + some margin)
    tracing::debug!(target: "quickclip", "[RECORD] Waiting for capture thread...");
    let capture_join_result = timeout(
        Duration::from_secs(30),
        tauri::async_runtime::spawn_blocking(move || capture_handle.join()),
    )
    .await
    .map_err(|_| {
        tracing::error!(target: "quickclip", "[RECORD] Timeout waiting for capture thread");
        RecorderError::EncodingTimeout(30)
    })?
    .map_err(|e| RecorderError::CaptureFailure(format!("Spawn blocking failed: {}", e)))?;

    let capture_stats = capture_join_result
        .map_err(|_| RecorderError::CaptureFailure("Capture thread panicked".to_string()))??;

    tracing::info!(target: "quickclip",
        "[RECORD] Capture complete: frames={}, fps={:.2}",
        capture_stats.frame_count, capture_stats.source_framerate);

    // Join writer thread with timeout
    tracing::debug!(target: "quickclip", "[RECORD] Waiting for writer thread...");
    let writer_join_result = timeout(
        Duration::from_secs(300), // 5 minutes max for encoding
        tauri::async_runtime::spawn_blocking(move || writer_handle.join()),
    )
    .await
    .map_err(|_| {
        tracing::error!(target: "quickclip", "[RECORD] Timeout waiting for writer thread");
        RecorderError::EncodingTimeout(300)
    })?
    .map_err(|e| RecorderError::EncodingError(format!("Spawn blocking failed: {}", e)))?;

    let writer_result = writer_join_result
        .map_err(|_| RecorderError::EncodingError("Writer thread panicked".to_string()))??;

    tracing::info!(target: "quickclip",
        "[RECORD] Writer complete: duration={:.2}s, frames={}, size={}x{}",
        writer_result.duration, writer_result.frame_count,
        writer_result.width, writer_result.height);

    // Update recording state
    state.is_recording.store(false, Ordering::SeqCst);

    // Generate thumbnail
    let video_path_for_thumb = session.video_path.clone();
    let thumbnail_path_clone = session.thumbnail_path.clone();

    tauri::async_runtime::spawn_blocking(move || {
        generate_thumbnail(&video_path_for_thumb, &thumbnail_path_clone)
    })
    .await
    .map_err(|e| RecorderError::EncodingError(e.to_string()))??;

    tracing::debug!(target: "quickclip", "[RECORD] Thumbnail generated");

    // Cleanup session directory
    cleanup_session_dir(&session.session_dir);

    tracing::info!(target: "quickclip",
        "[RECORD] Complete: id={}, frames={}, duration={:.2}s, path={}",
        session.recording_id, writer_result.frame_count, writer_result.duration,
        session.video_path.display());

    Ok(RecordingResult {
        id: session.recording_id,
        video_path: session.video_path.to_string_lossy().to_string(),
        thumbnail_path: session.thumbnail_path.to_string_lossy().to_string(),
        duration: writer_result.duration,
        width: writer_result.width,
        height: writer_result.height,
        frame_count: writer_result.frame_count,
        timestamp: session.timestamp,
    })
}

#[tauri::command]
pub async fn recorder_status(
    state: tauri::State<'_, RecorderState>,
) -> Result<RecordingStatus, String> {
    let is_recording = state.is_recording.load(Ordering::SeqCst);

    let session_guard = state.session.lock().await;
    let elapsed = if let Some(ref session) = *session_guard {
        session.start_time.elapsed().as_secs_f64()
    } else {
        0.0
    };
    // Frame count is no longer tracked in session (captured frames go through channel)
    // We estimate based on elapsed time and 60fps
    let frame_count = if is_recording { (elapsed * 60.0) as u32 } else { 0 };

    Ok(RecordingStatus {
        is_recording,
        frame_count,
        elapsed_seconds: elapsed,
    })
}

#[tauri::command]
pub fn recorder_delete_video(video_path: String, thumbnail_path: String) -> Result<(), String> {
    if std::path::Path::new(&video_path).exists() {
        std::fs::remove_file(&video_path).map_err(|e| format!("Failed to delete video: {}", e))?;
    }

    if std::path::Path::new(&thumbnail_path).exists() {
        std::fs::remove_file(&thumbnail_path)
            .map_err(|e| format!("Failed to delete thumbnail: {}", e))?;
    }

    Ok(())
}

// ============================================================================
// Recording Metadata Persistence
// ============================================================================

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureMode {
    Fullscreen,
    Window,
    Region,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioMode {
    None,
    System,
    Microphone,
    Both,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSettings {
    pub capture_mode: CaptureMode,
    pub audio_mode: AudioMode,
    pub quality_mode: QualityMode,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recording {
    pub id: String,
    pub video_path: String,
    pub thumbnail_path: String,
    pub duration: f64,
    pub timestamp: i64,
    pub settings: RecordingSettings,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PersistedCaptureMode {
    Fullscreen,
    Area,
}

impl Default for PersistedCaptureMode {
    fn default() -> Self {
        Self::Fullscreen
    }
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PersistedResolution {
    Native,
    P720,
    P480,
}

impl Default for PersistedResolution {
    fn default() -> Self {
        Self::P720
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickClipUserSettings {
    #[serde(default)]
    pub capture_mode: PersistedCaptureMode,
    #[serde(default)]
    pub system_audio: bool,
    #[serde(default)]
    pub microphone: bool,
    #[serde(default)]
    pub quality_mode: QualityMode,
    #[serde(default)]
    pub resolution: PersistedResolution,
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
}

fn default_hotkey() -> String {
    "Ctrl+Shift+R".to_string()
}

impl Default for QuickClipUserSettings {
    fn default() -> Self {
        Self {
            capture_mode: PersistedCaptureMode::Fullscreen,
            system_audio: false,
            microphone: false,
            quality_mode: QualityMode::Light,
            resolution: PersistedResolution::P720,
            hotkey: default_hotkey(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuickClipData {
    pub recordings: Vec<Recording>,
    #[serde(default)]
    pub settings: QuickClipUserSettings,
}

fn get_quickclip_data_path() -> Result<PathBuf, RecorderError> {
    Ok(get_quickclip_dir()?.join("quickclip.json"))
}

fn load_quickclip_data() -> Result<QuickClipData, RecorderError> {
    let path = get_quickclip_data_path()?;

    if !path.exists() {
        return Ok(QuickClipData::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| RecorderError::StorageError(format!("Failed to read data file: {}", e)))?;

    serde_json::from_str(&content)
        .map_err(|e| RecorderError::StorageError(format!("Failed to parse data file: {}", e)))
}

fn save_quickclip_data(data: &QuickClipData) -> Result<(), RecorderError> {
    let path = get_quickclip_data_path()?;

    let content = serde_json::to_string_pretty(data)
        .map_err(|e| RecorderError::StorageError(format!("Failed to serialize data: {}", e)))?;

    fs::write(&path, content)
        .map_err(|e| RecorderError::StorageError(format!("Failed to write data file: {}", e)))
}

#[tauri::command]
pub fn quickclip_get_recordings() -> Result<Vec<Recording>, String> {
    let data = load_quickclip_data().map_err(|e| e.to_string())?;

    // Filter out stale recordings where video files were deleted
    let valid: Vec<Recording> = data
        .recordings
        .into_iter()
        .filter(|r| std::path::Path::new(&r.video_path).exists())
        .collect();

    Ok(valid)
}

#[tauri::command]
pub fn quickclip_save_recording(
    id: String,
    video_path: String,
    thumbnail_path: String,
    duration: f64,
    timestamp: i64,
    capture_mode: CaptureMode,
    audio_mode: AudioMode,
    quality_mode: QualityMode,
) -> Result<Recording, String> {
    let mut data = load_quickclip_data().map_err(|e| e.to_string())?;

    let recording = Recording {
        id,
        video_path,
        thumbnail_path,
        duration,
        timestamp,
        settings: RecordingSettings {
            capture_mode,
            audio_mode,
            quality_mode,
        },
    };

    // Insert at the beginning (newest first)
    data.recordings.insert(0, recording.clone());

    save_quickclip_data(&data).map_err(|e| e.to_string())?;

    Ok(recording)
}

#[tauri::command]
pub fn read_video_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read video: {}", e))
}

#[tauri::command]
pub fn quickclip_delete_recording(id: String) -> Result<(), String> {
    tracing::debug!(target: "quickclip", "[RECORD] Deleting: id={}", id);

    let mut data = load_quickclip_data().map_err(|e| e.to_string())?;

    // Find the recording to get file paths
    let recording = data
        .recordings
        .iter()
        .find(|r| r.id == id)
        .cloned();

    if let Some(rec) = recording {
        // Delete video and thumbnail files
        if std::path::Path::new(&rec.video_path).exists() {
            fs::remove_file(&rec.video_path)
                .map_err(|e| format!("Failed to delete video: {}", e))?;
        }

        if std::path::Path::new(&rec.thumbnail_path).exists() {
            fs::remove_file(&rec.thumbnail_path)
                .map_err(|e| format!("Failed to delete thumbnail: {}", e))?;
        }
    }

    // Remove from data
    data.recordings.retain(|r| r.id != id);

    save_quickclip_data(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn quickclip_get_settings() -> Result<QuickClipUserSettings, String> {
    let data = load_quickclip_data().map_err(|e| e.to_string())?;
    Ok(data.settings)
}

#[tauri::command]
pub fn quickclip_update_settings(settings: QuickClipUserSettings) -> Result<(), String> {
    let mut data = load_quickclip_data().map_err(|e| e.to_string())?;
    data.settings = settings;
    save_quickclip_data(&data).map_err(|e| e.to_string())?;
    Ok(())
}
