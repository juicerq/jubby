use super::super::capture::{CaptureMessage, CaptureSource, ScreencastSession};
use super::super::errors::QuickClipError;
use super::super::persistence::{get_sessions_dir, get_thumbnails_dir, get_videos_dir};
use super::super::types::{AudioMode, Framerate, ResolutionScale};
use super::ffmpeg::{check_ffmpeg, cleanup_session_dir, generate_thumbnail};
use super::writer::spawn_writer_thread;
use super::RecorderState;
use super::RecordingSession;
use serde::Serialize;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::timeout;

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
    resolution_scale: Option<ResolutionScale>,
    framerate: Option<Framerate>,
    audio_mode: Option<AudioMode>,
) -> Result<(), String> {
    let scale = resolution_scale.unwrap_or_default();
    let fps = framerate.unwrap_or_default();
    let audio = audio_mode.unwrap_or_default();
    start_recording_internal(&state, scale, fps, audio)
        .await
        .map_err(|e| e.to_string())
}

async fn start_recording_internal(
    state: &RecorderState,
    resolution_scale: ResolutionScale,
    framerate: Framerate,
    audio_mode: AudioMode,
) -> Result<(), QuickClipError> {
    tracing::info!(target: "quickclip",
        "[RECORD] Starting: resolution_scale={:?}, framerate={:?}, audio_mode={:?}",
        resolution_scale, framerate, audio_mode);

    check_ffmpeg()?;

    if state.is_recording.load(Ordering::SeqCst) {
        tracing::warn!(target: "quickclip", "[RECORD] Already recording");
        return Err(QuickClipError::AlreadyRecording);
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis() as i64;

    let session_dir = get_sessions_dir()?.join(format!("session_{}", timestamp));
    std::fs::create_dir_all(&session_dir)
        .map_err(|e| QuickClipError::StorageError(e.to_string()))?;

    let recording_id = uuid::Uuid::new_v4().to_string();
    let video_filename = format!("recording_{}.mp4", timestamp);
    let thumbnail_filename = format!("thumb_{}.png", timestamp);
    let video_path = get_videos_dir()?.join(&video_filename);
    let thumbnail_path = get_thumbnails_dir()?.join(&thumbnail_filename);

    let screencast_session = ScreencastSession::new(CaptureSource::Fullscreen).await?;

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

    let stop_signal = Arc::new(std::sync::atomic::AtomicBool::new(false));
    *state.stop_signal.lock().await = Some(stop_signal.clone());

    let (frame_sender, frame_receiver) = std::sync::mpsc::sync_channel::<CaptureMessage>(30);

    let writer_handle = spawn_writer_thread(
        frame_receiver,
        video_path,
        resolution_scale,
        framerate,
        audio_mode,
    );
    *state.writer_handle.lock().unwrap() = Some(writer_handle);

    let capture_handle = std::thread::spawn(move || {
        super::super::capture::run_capture_loop(
            screencast_session,
            stop_signal,
            recording_start,
            frame_sender,
        )
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

async fn stop_recording_internal(state: &RecorderState) -> Result<RecordingResult, QuickClipError> {
    tracing::info!(target: "quickclip", "[RECORD] Stopping...");

    if !state.is_recording.load(Ordering::SeqCst) {
        tracing::warn!(target: "quickclip", "[RECORD] Not recording");
        return Err(QuickClipError::NotRecording);
    }

    if let Some(stop_signal) = state.stop_signal.lock().await.take() {
        stop_signal.store(true, Ordering::SeqCst);
        tracing::debug!(target: "quickclip", "[RECORD] Stop signal sent");
    }

    let session = state
        .session
        .lock()
        .await
        .take()
        .ok_or(QuickClipError::NotRecording)?;

    let capture_handle = state
        .capture_handle
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| QuickClipError::CaptureFailure("No capture handle".to_string()))?;

    let writer_handle = state
        .writer_handle
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| QuickClipError::CaptureFailure("No writer handle".to_string()))?;

    tracing::debug!(target: "quickclip", "[RECORD] Waiting for capture thread...");
    let capture_join_result = timeout(
        Duration::from_secs(30),
        tauri::async_runtime::spawn_blocking(move || capture_handle.join()),
    )
    .await
    .map_err(|_| {
        tracing::error!(target: "quickclip", "[RECORD] Timeout waiting for capture thread");
        QuickClipError::EncodingTimeout(30)
    })?
    .map_err(|e| QuickClipError::CaptureFailure(format!("Spawn blocking failed: {}", e)))?;

    let capture_stats = capture_join_result
        .map_err(|_| QuickClipError::CaptureFailure("Capture thread panicked".to_string()))??;

    tracing::info!(target: "quickclip",
        "[RECORD] Capture complete: frames={}, fps={:.2}",
        capture_stats.frame_count, capture_stats.source_framerate);

    tracing::debug!(target: "quickclip", "[RECORD] Waiting for writer thread...");
    let writer_join_result = timeout(
        Duration::from_secs(300),
        tauri::async_runtime::spawn_blocking(move || writer_handle.join()),
    )
    .await
    .map_err(|_| {
        tracing::error!(target: "quickclip", "[RECORD] Timeout waiting for writer thread");
        QuickClipError::EncodingTimeout(300)
    })?
    .map_err(|e| QuickClipError::EncodingError(format!("Spawn blocking failed: {}", e)))?;

    let writer_result = writer_join_result
        .map_err(|_| QuickClipError::EncodingError("Writer thread panicked".to_string()))??;

    tracing::info!(target: "quickclip",
        "[RECORD] Writer complete: duration={:.2}s, frames={}, size={}x{}",
        writer_result.duration, writer_result.frame_count,
        writer_result.width, writer_result.height);

    state.is_recording.store(false, Ordering::SeqCst);

    let video_path_for_thumb = session.video_path.clone();
    let thumbnail_path_clone = session.thumbnail_path.clone();

    tauri::async_runtime::spawn_blocking(move || {
        generate_thumbnail(&video_path_for_thumb, &thumbnail_path_clone)
    })
    .await
    .map_err(|e| QuickClipError::EncodingError(e.to_string()))??;

    tracing::debug!(target: "quickclip", "[RECORD] Thumbnail generated");

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
    let frame_count = if is_recording {
        (elapsed * 60.0) as u32
    } else {
        0
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

#[tauri::command]
pub fn read_video_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read video: {}", e))
}
