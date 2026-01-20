use super::super::persistence::get_frames_dir;
use serde::Serialize;
use thiserror::Error;
use xcap::{Monitor, Window};

#[derive(Error, Debug)]
pub enum CaptureError {
    #[error("Failed to get monitors: {0}")]
    MonitorError(String),
    #[error("Failed to get windows: {0}")]
    WindowError(String),
    #[error("Monitor not found: {0}")]
    MonitorNotFound(String),
    #[error("Window not found: {0}")]
    WindowNotFound(u32),
    #[error("Failed to capture: {0}")]
    CaptureFailure(String),
    #[error("Failed to save image: {0}")]
    SaveError(String),
    #[error("Failed to create storage directory: {0}")]
    StorageError(String),
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    pub id: u32,
    pub title: String,
    pub app_name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_minimized: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSourcesResponse {
    pub monitors: Vec<MonitorInfo>,
    pub windows: Vec<WindowInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub timestamp: i64,
}

#[tauri::command]
pub fn capture_get_sources() -> Result<CaptureSourcesResponse, String> {
    get_sources_internal().map_err(|e| e.to_string())
}

fn get_sources_internal() -> Result<CaptureSourcesResponse, CaptureError> {
    let monitors = Monitor::all().map_err(|e| CaptureError::MonitorError(e.to_string()))?;

    let monitor_infos: Vec<MonitorInfo> = monitors
        .iter()
        .map(|m| MonitorInfo {
            id: m.id().to_string(),
            name: m.name().to_string(),
            x: m.x(),
            y: m.y(),
            width: m.width(),
            height: m.height(),
            is_primary: m.is_primary(),
        })
        .collect();

    let windows = Window::all().map_err(|e| CaptureError::WindowError(e.to_string()))?;

    let window_infos: Vec<WindowInfo> = windows
        .iter()
        .filter(|w| !w.is_minimized())
        .map(|w| WindowInfo {
            id: w.id(),
            title: w.title().to_string(),
            app_name: w.app_name().to_string(),
            x: w.x(),
            y: w.y(),
            width: w.width(),
            height: w.height(),
            is_minimized: w.is_minimized(),
        })
        .collect();

    Ok(CaptureSourcesResponse {
        monitors: monitor_infos,
        windows: window_infos,
    })
}

#[tauri::command]
pub fn capture_monitor(monitor_id: String) -> Result<CaptureResult, String> {
    capture_monitor_internal(&monitor_id).map_err(|e| e.to_string())
}

fn capture_monitor_internal(monitor_id: &str) -> Result<CaptureResult, CaptureError> {
    let monitors = Monitor::all().map_err(|e| CaptureError::MonitorError(e.to_string()))?;

    let monitor = monitors
        .into_iter()
        .find(|m| m.id().to_string() == monitor_id)
        .ok_or_else(|| CaptureError::MonitorNotFound(monitor_id.to_string()))?;

    let image = monitor
        .capture_image()
        .map_err(|e| CaptureError::CaptureFailure(e.to_string()))?;

    let width = image.width();
    let height = image.height();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("System clock before UNIX epoch - invariant violation")
        .as_millis() as i64;

    let frames_dir = get_frames_dir().map_err(|e| CaptureError::StorageError(e.to_string()))?;
    let filename = format!("frame_{}.png", timestamp);
    let path = frames_dir.join(&filename);

    image
        .save(&path)
        .map_err(|e| CaptureError::SaveError(e.to_string()))?;

    Ok(CaptureResult {
        path: path.to_string_lossy().to_string(),
        width,
        height,
        timestamp,
    })
}

#[tauri::command]
pub fn capture_window(window_id: u32) -> Result<CaptureResult, String> {
    capture_window_internal(window_id).map_err(|e| e.to_string())
}

fn capture_window_internal(window_id: u32) -> Result<CaptureResult, CaptureError> {
    let windows = Window::all().map_err(|e| CaptureError::WindowError(e.to_string()))?;

    let window = windows
        .into_iter()
        .find(|w| w.id() == window_id)
        .ok_or(CaptureError::WindowNotFound(window_id))?;

    let image = window
        .capture_image()
        .map_err(|e| CaptureError::CaptureFailure(e.to_string()))?;

    let width = image.width();
    let height = image.height();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("System clock before UNIX epoch - invariant violation")
        .as_millis() as i64;

    let frames_dir = get_frames_dir().map_err(|e| CaptureError::StorageError(e.to_string()))?;
    let filename = format!("frame_{}.png", timestamp);
    let path = frames_dir.join(&filename);

    image
        .save(&path)
        .map_err(|e| CaptureError::SaveError(e.to_string()))?;

    Ok(CaptureResult {
        path: path.to_string_lossy().to_string(),
        width,
        height,
        timestamp,
    })
}

#[tauri::command]
pub fn capture_primary() -> Result<CaptureResult, String> {
    capture_primary_internal().map_err(|e| e.to_string())
}

fn capture_primary_internal() -> Result<CaptureResult, CaptureError> {
    let monitors = Monitor::all().map_err(|e| CaptureError::MonitorError(e.to_string()))?;

    let monitor = monitors
        .into_iter()
        .find(|m| m.is_primary())
        .or_else(|| Monitor::all().ok()?.into_iter().next())
        .ok_or_else(|| CaptureError::MonitorNotFound("No monitors found".to_string()))?;

    let image = monitor
        .capture_image()
        .map_err(|e| CaptureError::CaptureFailure(e.to_string()))?;

    let width = image.width();
    let height = image.height();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("System clock before UNIX epoch - invariant violation")
        .as_millis() as i64;

    let frames_dir = get_frames_dir().map_err(|e| CaptureError::StorageError(e.to_string()))?;
    let filename = format!("frame_{}.png", timestamp);
    let path = frames_dir.join(&filename);

    image
        .save(&path)
        .map_err(|e| CaptureError::SaveError(e.to_string()))?;

    Ok(CaptureResult {
        path: path.to_string_lossy().to_string(),
        width,
        height,
        timestamp,
    })
}
