use std::fs;
use std::path::PathBuf;

/// Get the storage directory path (~/.local/share/jubby/)
fn get_storage_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home)
        .join(".local")
        .join("share")
        .join("jubby")
}

/// Get the file path for a specific plugin's data
fn get_plugin_file_path(plugin_id: &str) -> PathBuf {
    get_storage_dir().join(format!("{}.json", plugin_id))
}

/// Read plugin data from storage
/// Returns JSON string or null if file doesn't exist
#[tauri::command]
pub fn read_plugin_data(plugin_id: String) -> Option<String> {
    let path = get_plugin_file_path(&plugin_id);
    fs::read_to_string(path).ok()
}

/// Write plugin data to storage
/// Creates directory if it doesn't exist
#[tauri::command]
pub fn write_plugin_data(plugin_id: String, data: String) -> Result<(), String> {
    let dir = get_storage_dir();

    // Create directory if it doesn't exist
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    let path = get_plugin_file_path(&plugin_id);
    fs::write(path, data).map_err(|e| e.to_string())
}
