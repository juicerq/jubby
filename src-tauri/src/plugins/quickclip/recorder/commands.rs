use super::super::errors::QuickClipError;
use super::super::persistence::{load_quickclip_settings, Recording};
use super::super::types::{AudioMode, Framerate, ResolutionScale};
use super::coordinator::{CoordinatorHandle, RecordingStatus};
use super::ffmpeg::check_ffmpeg;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
pub fn recorder_check_ffmpeg() -> Result<bool, String> {
    match check_ffmpeg() {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn recorder_start(
    handle: tauri::State<'_, CoordinatorHandle>,
    resolution_scale: Option<ResolutionScale>,
    framerate: Option<Framerate>,
    audio_mode: Option<AudioMode>,
) -> Result<(), String> {
    let scale = resolution_scale.unwrap_or_default();
    let fps = framerate.unwrap_or_default();
    let audio = audio_mode.unwrap_or_default();
    
    handle
        .start(scale, fps, audio)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn recorder_stop(
    handle: tauri::State<'_, CoordinatorHandle>,
) -> Result<Recording, String> {
    handle.stop().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn recorder_status(
    handle: tauri::State<'_, CoordinatorHandle>,
) -> Result<RecordingStatus, String> {
    Ok(handle.status().await)
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
pub fn read_video_file(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read video: {}", e))?;
    Ok(tauri::ipc::Response::new(bytes))
}

pub async fn toggle_recording(app: &AppHandle) -> Result<Option<Recording>, QuickClipError> {
    let handle = app.state::<CoordinatorHandle>();
    let status = handle.status().await;

    if status.is_recording || status.is_stopping {
        tracing::info!(target: "quickclip", "[TOGGLE] Stopping recording");
        let result = handle.stop().await?;
        app.emit("quickclip:recording-stopped", ())
            .map_err(|e| QuickClipError::EventError(e.to_string()))?;
        Ok(Some(result))
    } else if status.is_starting {
        tracing::info!(target: "quickclip", "[TOGGLE] Already starting, ignoring");
        Ok(None)
    } else {
        tracing::info!(target: "quickclip", "[TOGGLE] Starting recording");
        let settings = load_quickclip_settings()?;
        handle
            .start(
                settings.resolution.into(),
                settings.framerate,
                settings.audio_mode,
            )
            .await?;
        app.emit("quickclip:recording-started", ())
            .map_err(|e| QuickClipError::EventError(e.to_string()))?;
        Ok(None)
    }
}

pub async fn toggle_recording_with_notification(app: &AppHandle) {
    match toggle_recording(app).await {
        Ok(Some(recording)) => {
            tracing::info!(target: "quickclip", "[TOGGLE] Recording saved: id={}", recording.id);
        }
        Ok(None) => {}
        Err(e) => {
            tracing::error!(target: "quickclip", "[TOGGLE] Error: {}", e);
            if let Err(notify_err) = app
                .notification()
                .builder()
                .title("QuickClip Error")
                .body(e.to_string())
                .show()
            {
                tracing::warn!(target: "quickclip", "[TOGGLE] Failed to show notification: {}", notify_err);
            }
        }
    }
}
