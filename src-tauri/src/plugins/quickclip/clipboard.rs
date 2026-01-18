use clipboard_rs::{Clipboard, ClipboardContext};
use std::path::Path;

#[tauri::command]
pub fn copy_file_to_clipboard(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err(format!("File not found: {}", path));
    }

    let ctx = ClipboardContext::new()
        .map_err(|e| format!("Failed to access clipboard: {}", e))?;

    let file_uri = format!("file://{}", path);

    ctx.set_files(vec![file_uri])
        .map_err(|e| format!("Failed to copy file: {}", e))?;

    tracing::info!(target: "quickclip", "File copied to clipboard: {}", path);
    Ok(())
}
