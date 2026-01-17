use image::RgbaImage;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use thiserror::Error;
use tokio::sync::Mutex;
use tokio::time::timeout;
use xcap::Monitor;

const MAX_FRAME_BUFFER_BYTES: usize = 1_500_000_000;

#[derive(Error, Debug)]
pub enum RecorderError {
    #[error("Failed to get monitors: {0}")]
    MonitorError(String),
    #[error("Monitor not found: {0}")]
    MonitorNotFound(String),
    #[error("Failed to capture frame: {0}")]
    CaptureFailure(String),
    #[error("Failed to save frame: {0}")]
    SaveError(String),
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
    #[error("Memory limit exceeded ({0} MB). Recording auto-stopped.")]
    MemoryLimitExceeded(u64),
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QualityMode {
    Light,
    High,
}

impl QualityMode {
    fn crf(&self) -> &str {
        match self {
            QualityMode::Light => "28",
            QualityMode::High => "18",
        }
    }

    fn preset(&self) -> &str {
        match self {
            QualityMode::Light => "fast",
            QualityMode::High => "slower",
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
    monitor_id: String,
    quality: QualityMode,
    frame_count: u32,
    width: u32,
    height: u32,
    start_time: std::time::Instant,
    fps: u32,
    frames: Vec<Vec<u8>>,
}

pub struct RecorderState {
    is_recording: Arc<AtomicBool>,
    session: Arc<Mutex<Option<RecordingSession>>>,
    stop_signal: Mutex<Option<Arc<AtomicBool>>>,
}

impl RecorderState {
    pub fn new() -> Self {
        Self {
            is_recording: Arc::new(AtomicBool::new(false)),
            session: Arc::new(Mutex::new(None)),
            stop_signal: Mutex::new(None),
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

fn capture_frame_to_buffer(monitor: &Monitor) -> Result<(Vec<u8>, u32, u32), RecorderError> {
    let image = monitor
        .capture_image()
        .map_err(|e| RecorderError::CaptureFailure(e.to_string()))?;

    let width = image.width();
    let height = image.height();
    let buffer = image.into_raw();

    Ok((buffer, width, height))
}

fn encode_frames_to_video(
    session_dir: &PathBuf,
    output_path: &PathBuf,
    fps: u32,
    quality: QualityMode,
) -> Result<f64, RecorderError> {
    let frame_pattern = session_dir.join("frame_%06d.png");

    tracing::debug!(target: "quickclip", "[FFMPEG] Starting encode: preset={}, crf={}", quality.preset(), quality.crf());
    let ffmpeg_encode_start = std::time::Instant::now();

    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-framerate",
            &fps.to_string(),
            "-i",
            &frame_pattern.to_string_lossy(),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            quality.crf(),
            "-preset",
            quality.preset(),
            "-movflags",
            "+faststart",
            &output_path.to_string_lossy(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| RecorderError::EncodingError(e.to_string()))?;

    tracing::debug!(target: "quickclip", "[FFMPEG] Encode finished in {:.2}s", ffmpeg_encode_start.elapsed().as_secs_f64());

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::error!(target: "quickclip", "FFmpeg encoding failed: {}", stderr);
        return Err(RecorderError::EncodingError(stderr.to_string()));
    }

    // Get video duration using ffprobe
    tracing::debug!(target: "quickclip", "[FFMPEG] Getting duration with ffprobe...");
    let probe_start = std::time::Instant::now();

    let duration_output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            &output_path.to_string_lossy(),
        ])
        .output()
        .map_err(|e| RecorderError::EncodingError(format!("ffprobe failed: {}", e)))?;

    tracing::debug!(target: "quickclip", "[FFMPEG] ffprobe finished in {:.2}s", probe_start.elapsed().as_secs_f64());

    let duration_str = String::from_utf8_lossy(&duration_output.stdout);
    let duration: f64 = duration_str.trim().parse().unwrap_or(0.0);

    Ok(duration)
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
        tracing::error!(target: "quickclip", "Thumbnail generation failed: {}", stderr);
        return Err(RecorderError::EncodingError(format!(
            "Thumbnail generation failed: {}",
            stderr
        )));
    }

    tracing::debug!(target: "quickclip", "Thumbnail generated: {:?}", thumbnail_path);

    Ok(())
}

fn cleanup_session_dir(session_dir: &PathBuf) {
    if session_dir.exists() {
        let _ = std::fs::remove_dir_all(session_dir);
    }
}

#[tauri::command]
pub fn recorder_check_ffmpeg() -> Result<bool, String> {
    match check_ffmpeg() {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn recorder_start(
    state: tauri::State<'_, RecorderState>,
    monitor_id: String,
    quality: QualityMode,
    fps: Option<u32>,
) -> Result<(), String> {
    start_recording_internal(&state, monitor_id, quality, fps.unwrap_or(30))
        .await
        .map_err(|e| e.to_string())
}

async fn start_recording_internal(
    state: &RecorderState,
    monitor_id: String,
    quality: QualityMode,
    fps: u32,
) -> Result<(), RecorderError> {
    tracing::info!(target: "quickclip", "Starting recording - monitor: {}, quality: {:?}, fps: {}", monitor_id, quality, fps);

    check_ffmpeg()?;

    if state.is_recording.load(Ordering::SeqCst) {
        tracing::warn!(target: "quickclip", "Recording already in progress");
        return Err(RecorderError::AlreadyRecording);
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis() as i64;

    let session_dir = get_sessions_dir()?.join(format!("session_{}", timestamp));
    std::fs::create_dir_all(&session_dir).map_err(|e| RecorderError::StorageError(e.to_string()))?;

    // Find and cache monitor before creating session
    let monitors = Monitor::all().map_err(|e| RecorderError::MonitorError(e.to_string()))?;
    let monitor = monitors
        .into_iter()
        .find(|m| m.id().to_string() == monitor_id)
        .ok_or_else(|| RecorderError::MonitorNotFound(monitor_id.clone()))?;

    let session = RecordingSession {
        session_dir,
        monitor_id,
        quality,
        frame_count: 0,
        width: 0,
        height: 0,
        start_time: std::time::Instant::now(),
        fps,
        frames: Vec::new(),
    };

    *state.session.lock().await = Some(session);
    state.is_recording.store(true, Ordering::SeqCst);

    tracing::info!(target: "quickclip", "Recording session started");

    let stop_signal = Arc::new(AtomicBool::new(false));
    *state.stop_signal.lock().await = Some(stop_signal.clone());

    // Spawn the capture loop
    let is_recording = state.is_recording.clone();
    let session_mutex = state.session.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let frame_interval = Duration::from_millis(1000 / fps as u64);
        let mut total_buffer_size: usize = 0;

        loop {
            if stop_signal.load(Ordering::SeqCst) {
                break;
            }

            let capture_start = std::time::Instant::now();

            // Capture frame as raw RGBA buffer (fast: ~5ms vs ~100ms for PNG)
            if let Ok((buffer, width, height)) = capture_frame_to_buffer(&monitor) {
                total_buffer_size += buffer.len();

                // Memory safeguard: auto-stop if buffer exceeds ~1.5GB
                if total_buffer_size > MAX_FRAME_BUFFER_BYTES {
                    tracing::warn!(target: "quickclip", "Memory limit exceeded ({} MB), auto-stopping recording", total_buffer_size / 1_000_000);
                    stop_signal.store(true, Ordering::SeqCst);
                    break;
                }

                // Store frame in session
                let mut session_guard = session_mutex.blocking_lock();
                if let Some(ref mut session) = *session_guard {
                    if session.frame_count == 0 {
                        session.width = width;
                        session.height = height;
                    }
                    session.frames.push(buffer);
                    session.frame_count += 1;
                }
                drop(session_guard);
            }

            // Sleep for the remaining time in the frame interval
            let elapsed = capture_start.elapsed();
            if elapsed < frame_interval {
                std::thread::sleep(frame_interval - elapsed);
            }
        }

        is_recording.store(false, Ordering::SeqCst);
    });

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
    tracing::info!(target: "quickclip", "Stopping recording...");

    if !state.is_recording.load(Ordering::SeqCst) {
        tracing::warn!(target: "quickclip", "No recording in progress");
        return Err(RecorderError::NotRecording);
    }

    // Signal stop
    if let Some(stop_signal) = state.stop_signal.lock().await.take() {
        stop_signal.store(true, Ordering::SeqCst);
    }

    // Wait for capture loop to finish
    tokio::time::sleep(Duration::from_millis(100)).await;

    let session = state
        .session
        .lock()
        .await
        .take()
        .ok_or(RecorderError::NotRecording)?;

    if session.frame_count == 0 {
        cleanup_session_dir(&session.session_dir);
        return Err(RecorderError::NoFrames);
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis() as i64;

    let recording_id = uuid::Uuid::new_v4().to_string();
    let video_filename = format!("recording_{}.mp4", timestamp);
    let thumbnail_filename = format!("thumb_{}.png", timestamp);

    let video_path = get_videos_dir()?.join(&video_filename);
    let thumbnail_path = get_thumbnails_dir()?.join(&thumbnail_filename);

    // Calculate actual fps based on real elapsed time
    let elapsed_secs = session.start_time.elapsed().as_secs_f64();
    let actual_fps = if elapsed_secs > 0.0 {
        (session.frame_count as f64 / elapsed_secs).round() as u32
    } else {
        session.fps
    };
    // Clamp fps to reasonable range (1-60)
    let actual_fps = actual_fps.clamp(1, 60);

    // Write in-memory frames to PNG files, then encode to video
    const ENCODING_TIMEOUT_SECS: u64 = 300; // 5 minutes max
    let session_dir = session.session_dir.clone();
    let video_path_clone = video_path.clone();
    let quality = session.quality;
    let frames = session.frames;
    let width = session.width;
    let height = session.height;
    let frame_count = session.frame_count;

    tracing::info!(target: "quickclip", "Starting encoding: {} frames, {}x{}, fps: {}", frame_count, width, height, actual_fps);

    let encode_task = tauri::async_runtime::spawn_blocking(move || {
        let total_start = std::time::Instant::now();

        // Phase 1: Write all frames to PNG files
        tracing::info!(target: "quickclip", "[ENCODE] Phase 1: Writing {} frames to PNG files...", frames.len());
        let png_start = std::time::Instant::now();

        for (i, frame_buffer) in frames.into_iter().enumerate() {
            let frame_start = std::time::Instant::now();
            let frame_path = session_dir.join(format!("frame_{:06}.png", i));

            if let Some(img) = RgbaImage::from_raw(width, height, frame_buffer) {
                img.save(&frame_path)
                    .map_err(|e| RecorderError::SaveError(e.to_string()))?;
            }

            // Log every 30 frames (roughly 1 second of video at 30fps)
            if (i + 1) % 30 == 0 || i == 0 {
                tracing::debug!(target: "quickclip", "[ENCODE] Written frame {}/{} ({:.1}ms)",
                    i + 1, frame_count, frame_start.elapsed().as_secs_f64() * 1000.0);
            }
        }

        let png_elapsed = png_start.elapsed();
        tracing::info!(target: "quickclip", "[ENCODE] Phase 1 complete: wrote {} PNGs in {:.2}s ({:.1}ms/frame avg)",
            frame_count, png_elapsed.as_secs_f64(),
            png_elapsed.as_secs_f64() * 1000.0 / frame_count as f64);

        // Phase 2: Encode frames to video
        tracing::info!(target: "quickclip", "[ENCODE] Phase 2: Running FFmpeg encoding...");
        let ffmpeg_start = std::time::Instant::now();

        let result = encode_frames_to_video(&session_dir, &video_path_clone, actual_fps, quality);

        let ffmpeg_elapsed = ffmpeg_start.elapsed();
        tracing::info!(target: "quickclip", "[ENCODE] Phase 2 complete: FFmpeg finished in {:.2}s", ffmpeg_elapsed.as_secs_f64());

        let total_elapsed = total_start.elapsed();
        tracing::info!(target: "quickclip", "[ENCODE] Total encoding time: {:.2}s (PNG: {:.2}s, FFmpeg: {:.2}s)",
            total_elapsed.as_secs_f64(), png_elapsed.as_secs_f64(), ffmpeg_elapsed.as_secs_f64());

        result
    });

    let duration = timeout(Duration::from_secs(ENCODING_TIMEOUT_SECS), encode_task)
        .await
        .map_err(|_| {
            tracing::error!(target: "quickclip", "Encoding timeout after {} seconds", ENCODING_TIMEOUT_SECS);
            RecorderError::EncodingTimeout(ENCODING_TIMEOUT_SECS)
        })?
        .map_err(|e| RecorderError::EncodingError(e.to_string()))??;

    tracing::info!(target: "quickclip", "Encoding completed, duration: {:.2}s, output: {:?}", duration, video_path);

    // Phase 3: Generate thumbnail
    tracing::info!(target: "quickclip", "[ENCODE] Phase 3: Generating thumbnail...");
    let thumb_start = std::time::Instant::now();
    let video_path_for_thumb = video_path.clone();
    let thumbnail_path_clone = thumbnail_path.clone();

    tauri::async_runtime::spawn_blocking(move || {
        generate_thumbnail(&video_path_for_thumb, &thumbnail_path_clone)
    })
    .await
    .map_err(|e| RecorderError::EncodingError(e.to_string()))??;

    tracing::info!(target: "quickclip", "[ENCODE] Phase 3 complete: thumbnail generated in {:.2}s", thumb_start.elapsed().as_secs_f64());

    // Cleanup session directory
    cleanup_session_dir(&session.session_dir);

    tracing::info!(target: "quickclip", "Recording saved: id={}, frames={}, duration={:.2}s", recording_id, session.frame_count, duration);

    Ok(RecordingResult {
        id: recording_id,
        video_path: video_path.to_string_lossy().to_string(),
        thumbnail_path: thumbnail_path.to_string_lossy().to_string(),
        duration,
        width: session.width,
        height: session.height,
        frame_count: session.frame_count,
        timestamp,
    })
}

#[tauri::command]
pub async fn recorder_status(
    state: tauri::State<'_, RecorderState>,
) -> Result<RecordingStatus, String> {
    let is_recording = state.is_recording.load(Ordering::SeqCst);

    let session_guard = state.session.lock().await;
    let (frame_count, elapsed) = if let Some(ref session) = *session_guard {
        (session.frame_count, session.start_time.elapsed().as_secs_f64())
    } else {
        (0, 0.0)
    };

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

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuickClipData {
    pub recordings: Vec<Recording>,
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
    tracing::info!(target: "quickclip", "Deleting recording: {}", id);

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

    tracing::info!(target: "quickclip", "Recording deleted: {}", id);

    Ok(())
}
