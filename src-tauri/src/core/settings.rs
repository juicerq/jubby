use crate::shared::paths::{ensure_dir, get_storage_dir};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use thiserror::Error;

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

fn get_settings_path() -> PathBuf {
    get_storage_dir().join("settings.json")
}

pub fn load_settings() -> AppSettings {
    let path = get_settings_path();

    if !path.exists() {
        return AppSettings::default();
    }

    load_settings_from_file(&path).unwrap_or_default()
}

fn load_settings_from_file(path: &PathBuf) -> Result<AppSettings, SettingsError> {
    let contents = std::fs::read_to_string(path)?;
    let settings = serde_json::from_str(&contents)?;
    Ok(settings)
}

pub fn save_settings(settings: &AppSettings) -> Result<(), SettingsError> {
    let storage_dir = get_storage_dir();
    ensure_dir(&storage_dir)?;

    let path = get_settings_path();
    let contents = serde_json::to_string_pretty(settings)?;
    std::fs::write(&path, contents)?;
    Ok(())
}

pub fn parse_shortcut(shortcut_str: &str) -> Result<Shortcut, SettingsError> {
    shortcut_str
        .parse()
        .map_err(|e: global_hotkey::hotkey::HotKeyParseError| {
            SettingsError::ShortcutParseError(e.to_string())
        })
}

fn register_shortcut(app: &AppHandle, shortcut: Shortcut) -> Result<(), SettingsError> {
    app.global_shortcut()
        .register(shortcut)
        .map_err(|e| SettingsError::ShortcutRegisterError(e.to_string()))
}

pub fn update_shortcut(app: &AppHandle, new_shortcut_str: &str) -> Result<(), SettingsError> {
    let new_shortcut = parse_shortcut(new_shortcut_str)?;

    let current_state = app.state::<CurrentShortcut>();
    let current_str = current_state.current.lock().unwrap().clone();

    if let Ok(current_shortcut) = parse_shortcut(&current_str) {
        let _ = app.global_shortcut().unregister(current_shortcut);
    }

    register_shortcut(app, new_shortcut)?;

    *current_state.current.lock().unwrap() = new_shortcut_str.to_string();

    let settings = AppSettings {
        global_shortcut: new_shortcut_str.to_string(),
    };
    save_settings(&settings)?;
    Ok(())
}

#[tauri::command]
pub fn get_settings() -> AppSettings {
    load_settings()
}

#[tauri::command]
pub fn update_global_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    update_shortcut(&app, &shortcut).map_err(|e| e.to_string())
}
