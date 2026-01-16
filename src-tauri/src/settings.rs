use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;

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
