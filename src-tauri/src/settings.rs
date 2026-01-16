use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{
    GlobalShortcutExt, Shortcut, ShortcutState as ShortcutEventState,
};
use thiserror::Error;

use crate::window;

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub global_shortcut: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            global_shortcut: "F9".to_string(),
        }
    }
}

#[derive(Error, Debug)]
pub enum SettingsError {
    #[error("Failed to read settings file: {0}")]
    ReadError(#[from] std::io::Error),
    #[error("Failed to parse settings: {0}")]
    ParseError(#[from] serde_json::Error),
    #[error("Failed to parse shortcut: {0}")]
    ShortcutParseError(String),
    #[error("Failed to register shortcut: {0}")]
    ShortcutRegisterError(String),
}

/// State to track the currently registered shortcut
pub struct CurrentShortcut {
    pub current: Mutex<String>,
}

impl CurrentShortcut {
    pub fn new(shortcut: String) -> Self {
        Self {
            current: Mutex::new(shortcut),
        }
    }
}

/// Get the storage directory path following XDG Base Directory Specification
fn get_storage_dir() -> PathBuf {
    if let Ok(xdg_data) = std::env::var("XDG_DATA_HOME") {
        return PathBuf::from(xdg_data).join("jubby");
    }

    let home = std::env::var("HOME").expect("HOME environment variable must be set");
    PathBuf::from(home)
        .join(".local")
        .join("share")
        .join("jubby")
}

/// Get the path to the settings file
fn get_settings_path() -> PathBuf {
    get_storage_dir().join("settings.json")
}

/// Load settings from disk, returning default if file doesn't exist or is invalid
pub fn load_settings() -> AppSettings {
    let path = get_settings_path();

    if !path.exists() {
        eprintln!("[JUBBY] Settings file not found, using defaults");
        return AppSettings::default();
    }

    match load_settings_from_file(&path) {
        Ok(settings) => {
            eprintln!("[JUBBY] Settings loaded from {:?}", path);
            settings
        }
        Err(e) => {
            eprintln!("[JUBBY] Failed to load settings: {}, using defaults", e);
            AppSettings::default()
        }
    }
}

/// Internal function to load settings from a specific path
fn load_settings_from_file(path: &PathBuf) -> Result<AppSettings, SettingsError> {
    let contents = std::fs::read_to_string(path)?;
    let settings = serde_json::from_str(&contents)?;
    Ok(settings)
}

/// Save settings to disk
pub fn save_settings(settings: &AppSettings) -> Result<(), SettingsError> {
    let storage_dir = get_storage_dir();

    // Create directory if it doesn't exist
    if !storage_dir.exists() {
        std::fs::create_dir_all(&storage_dir)?;
    }

    let path = get_settings_path();
    let contents = serde_json::to_string_pretty(settings)?;
    std::fs::write(&path, contents)?;

    eprintln!("[JUBBY] Settings saved to {:?}", path);
    Ok(())
}

/// Parse a shortcut string (e.g., "Ctrl+Shift+J", "F9") into a Shortcut
pub fn parse_shortcut(shortcut_str: &str) -> Result<Shortcut, SettingsError> {
    shortcut_str
        .parse()
        .map_err(|e: global_hotkey::hotkey::HotKeyParseError| {
            SettingsError::ShortcutParseError(e.to_string())
        })
}

/// Register the toggle shortcut handler for a given shortcut
fn register_toggle_shortcut(app: &AppHandle, shortcut: Shortcut) -> Result<(), SettingsError> {
    app.global_shortcut()
        .on_shortcut(shortcut, |app_handle, _shortcut, event| {
            if event.state == ShortcutEventState::Released {
                window::toggle(app_handle);
            }
        })
        .map_err(|e| SettingsError::ShortcutRegisterError(e.to_string()))
}

/// Update the global shortcut at runtime
/// Unregisters the current shortcut, registers the new one, and saves settings
pub fn update_shortcut(app: &AppHandle, new_shortcut_str: &str) -> Result<(), SettingsError> {
    // Parse the new shortcut first to validate it
    let new_shortcut = parse_shortcut(new_shortcut_str)?;

    // Get the current shortcut from state
    let current_state = app.state::<CurrentShortcut>();
    let current_str = current_state.current.lock().unwrap().clone();

    // Unregister the current shortcut
    if let Ok(current_shortcut) = parse_shortcut(&current_str) {
        if let Err(e) = app.global_shortcut().unregister(current_shortcut) {
            eprintln!(
                "[JUBBY] Warning: failed to unregister old shortcut '{}': {}",
                current_str, e
            );
        }
    }

    // Register the new shortcut with the toggle handler
    register_toggle_shortcut(app, new_shortcut)?;

    // Update state
    *current_state.current.lock().unwrap() = new_shortcut_str.to_string();

    // Save to settings file
    let settings = AppSettings {
        global_shortcut: new_shortcut_str.to_string(),
    };
    save_settings(&settings)?;

    eprintln!("[JUBBY] Shortcut updated to: {}", new_shortcut_str);
    Ok(())
}

/// Tauri command: Get current settings
#[tauri::command]
pub fn get_settings() -> AppSettings {
    load_settings()
}

/// Tauri command: Update the global shortcut
#[tauri::command]
pub fn update_global_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    update_shortcut(&app, &shortcut).map_err(|e| e.to_string())
}
