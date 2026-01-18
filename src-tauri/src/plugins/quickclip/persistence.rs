use super::errors::QuickClipError;
use super::types::{AudioMode, BitrateMode, Framerate};
use crate::shared::paths::{ensure_dir, get_plugin_dir};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

fn get_quickclip_dir() -> PathBuf {
    get_plugin_dir("quickclip")
}

pub fn get_videos_dir() -> Result<PathBuf, QuickClipError> {
    let videos_dir = get_quickclip_dir().join("videos");
    ensure_dir(&videos_dir).map_err(|e| QuickClipError::StorageError(e.to_string()))?;
    Ok(videos_dir)
}

pub fn get_thumbnails_dir() -> Result<PathBuf, QuickClipError> {
    let thumbnails_dir = get_quickclip_dir().join("thumbnails");
    ensure_dir(&thumbnails_dir).map_err(|e| QuickClipError::StorageError(e.to_string()))?;
    Ok(thumbnails_dir)
}

pub fn get_sessions_dir() -> Result<PathBuf, QuickClipError> {
    let sessions_dir = get_quickclip_dir().join("sessions");
    ensure_dir(&sessions_dir).map_err(|e| QuickClipError::StorageError(e.to_string()))?;
    Ok(sessions_dir)
}

pub fn get_frames_dir() -> Result<PathBuf, QuickClipError> {
    let frames_dir = get_quickclip_dir().join("frames");
    ensure_dir(&frames_dir).map_err(|e| QuickClipError::StorageError(e.to_string()))?;
    Ok(frames_dir)
}

fn get_data_path() -> Result<PathBuf, QuickClipError> {
    let dir = get_quickclip_dir();
    ensure_dir(&dir).map_err(|e| QuickClipError::StorageError(e.to_string()))?;
    Ok(dir.join("quickclip.json"))
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSettings {
    pub audio_mode: AudioMode,
    pub bitrate_mode: BitrateMode,
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

#[derive(Clone, Copy, Serialize, Deserialize, Default)]
pub enum PersistedResolution {
    #[default]
    #[serde(rename = "720p")]
    P720,
    #[serde(rename = "1080p")]
    P1080,
    #[serde(rename = "480p")]
    P480,
    #[serde(rename = "native")]
    Native,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickClipUserSettings {
    #[serde(default)]
    pub bitrate_mode: BitrateMode,
    #[serde(default)]
    pub resolution: PersistedResolution,
    #[serde(default)]
    pub audio_mode: AudioMode,
    #[serde(default)]
    pub framerate: Framerate,
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
}

fn default_hotkey() -> String {
    "Ctrl+Shift+R".to_string()
}

impl Default for QuickClipUserSettings {
    fn default() -> Self {
        Self {
            bitrate_mode: BitrateMode::Light,
            resolution: PersistedResolution::P720,
            audio_mode: AudioMode::None,
            framerate: Framerate::Fps30,
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

fn load_data() -> Result<QuickClipData, QuickClipError> {
    let path = get_data_path()?;

    if !path.exists() {
        return Ok(QuickClipData::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| QuickClipError::StorageError(format!("Failed to read data file: {}", e)))?;

    serde_json::from_str(&content)
        .map_err(|e| QuickClipError::StorageError(format!("Failed to parse data file: {}", e)))
}

fn save_data(data: &QuickClipData) -> Result<(), QuickClipError> {
    let path = get_data_path()?;

    let content = serde_json::to_string_pretty(data)
        .map_err(|e| QuickClipError::StorageError(format!("Failed to serialize data: {}", e)))?;

    fs::write(&path, content)
        .map_err(|e| QuickClipError::StorageError(format!("Failed to write data file: {}", e)))
}

#[tauri::command]
pub fn quickclip_get_recordings() -> Result<Vec<Recording>, String> {
    let data = load_data().map_err(|e| e.to_string())?;

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
    audio_mode: AudioMode,
    bitrate_mode: BitrateMode,
) -> Result<Recording, String> {
    let mut data = load_data().map_err(|e| e.to_string())?;

    let recording = Recording {
        id,
        video_path,
        thumbnail_path,
        duration,
        timestamp,
        settings: RecordingSettings {
            audio_mode,
            bitrate_mode,
        },
    };

    data.recordings.insert(0, recording.clone());
    save_data(&data).map_err(|e| e.to_string())?;

    Ok(recording)
}

#[tauri::command]
pub fn quickclip_delete_recording(id: String) -> Result<(), String> {
    tracing::debug!(target: "quickclip", "[RECORD] Deleting: id={}", id);

    let mut data = load_data().map_err(|e| e.to_string())?;

    let recording = data.recordings.iter().find(|r| r.id == id).cloned();

    if let Some(rec) = recording {
        if std::path::Path::new(&rec.video_path).exists() {
            fs::remove_file(&rec.video_path)
                .map_err(|e| format!("Failed to delete video: {}", e))?;
        }

        if std::path::Path::new(&rec.thumbnail_path).exists() {
            fs::remove_file(&rec.thumbnail_path)
                .map_err(|e| format!("Failed to delete thumbnail: {}", e))?;
        }
    }

    data.recordings.retain(|r| r.id != id);
    save_data(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn quickclip_get_settings() -> Result<QuickClipUserSettings, String> {
    let data = load_data().map_err(|e| e.to_string())?;
    Ok(data.settings)
}

#[tauri::command]
pub fn quickclip_update_settings(settings: QuickClipUserSettings) -> Result<(), String> {
    let mut data = load_data().map_err(|e| e.to_string())?;
    data.settings = settings;
    save_data(&data).map_err(|e| e.to_string())?;
    Ok(())
}
