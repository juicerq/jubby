use super::CaptureSource;
use crate::shared::paths::get_storage_dir;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};

/// Restore token for skipping portal dialog on subsequent recordings.
/// Persists across recordings within the same app session (fallback for in-memory).
pub static RESTORE_TOKEN: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

/// Persistent tokens for XDG Portal, stored per capture mode.
#[derive(Serialize, Deserialize, Default)]
pub struct QuickClipTokens {
    pub fullscreen: Option<String>,
    pub area: Option<String>,
}

fn get_tokens_path() -> PathBuf {
    get_storage_dir().join("quickclip-tokens.json")
}

/// Load tokens from disk, returning default if file doesn't exist or is invalid.
pub fn load_tokens() -> QuickClipTokens {
    let path = get_tokens_path();

    if !path.exists() {
        return QuickClipTokens::default();
    }

    match std::fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(e) => {
            tracing::warn!(target: "quickclip", "[TOKENS] Failed to read tokens file: {}", e);
            QuickClipTokens::default()
        }
    }
}

/// Save a token for a specific capture source.
pub fn save_token(source: CaptureSource, token: &str) {
    let storage_dir = get_storage_dir();

    if !storage_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&storage_dir) {
            tracing::warn!(target: "quickclip", "[TOKENS] Failed to create storage dir: {}", e);
            return;
        }
    }

    let mut tokens = load_tokens();
    match source {
        CaptureSource::Fullscreen => tokens.fullscreen = Some(token.to_string()),
        CaptureSource::Area => tokens.area = Some(token.to_string()),
    }

    let path = get_tokens_path();
    match serde_json::to_string_pretty(&tokens) {
        Ok(contents) => {
            if let Err(e) = std::fs::write(&path, contents) {
                tracing::warn!(target: "quickclip", "[TOKENS] Failed to write tokens file: {}", e);
            } else {
                tracing::info!(target: "quickclip", "[TOKENS] Saved {:?} token to disk", source);
            }
        }
        Err(e) => {
            tracing::warn!(target: "quickclip", "[TOKENS] Failed to serialize tokens: {}", e);
        }
    }
}

/// Clear a token for a specific capture source (when token is invalid/expired).
pub fn clear_token(source: CaptureSource) {
    let path = get_tokens_path();
    if !path.exists() {
        return;
    }

    let mut tokens = load_tokens();
    match source {
        CaptureSource::Fullscreen => tokens.fullscreen = None,
        CaptureSource::Area => tokens.area = None,
    }

    match serde_json::to_string_pretty(&tokens) {
        Ok(contents) => {
            if let Err(e) = std::fs::write(&path, contents) {
                tracing::warn!(target: "quickclip", "[TOKENS] Failed to clear token: {}", e);
            } else {
                tracing::info!(target: "quickclip", "[TOKENS] Cleared {:?} token from disk", source);
            }
        }
        Err(e) => {
            tracing::warn!(target: "quickclip", "[TOKENS] Failed to serialize tokens: {}", e);
        }
    }
}
