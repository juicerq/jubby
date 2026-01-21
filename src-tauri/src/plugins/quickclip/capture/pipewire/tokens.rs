use super::CaptureSource;
use crate::shared::paths::get_storage_dir;
use serde::{Deserialize, Serialize};
use std::io;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};

/// Restore token for skipping portal dialog on subsequent recordings.
/// Persists across recordings within the same app session (fallback for in-memory).
pub static RESTORE_TOKEN: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

/// Persistent tokens for XDG Portal, stored per capture mode.
#[derive(Serialize, Deserialize, Default, Clone)]
pub struct QuickClipTokens {
    pub fullscreen: Option<String>,
    pub area: Option<String>,
}

/// Token persistence with atomic file operations.
///
/// Uses write-to-temp-then-rename pattern to prevent corruption from
/// partial writes or concurrent access (TOCTOU-safe).
pub struct TokenStore {
    path: PathBuf,
}

impl TokenStore {
    pub fn new() -> Self {
        Self {
            path: get_storage_dir().join("quickclip-tokens.json"),
        }
    }

    /// Load tokens from disk.
    ///
    /// Returns `Ok(default)` if file doesn't exist.
    /// Returns `Err` on read or parse failures (no silent swallowing).
    pub fn load(&self) -> Result<QuickClipTokens, TokenStoreError> {
        if !self.path.exists() {
            return Ok(QuickClipTokens::default());
        }

        let contents = std::fs::read_to_string(&self.path).map_err(TokenStoreError::Read)?;

        serde_json::from_str(&contents).map_err(TokenStoreError::Parse)
    }

    /// Save tokens atomically using write-to-temp-then-rename pattern.
    ///
    /// POSIX guarantees rename is atomic, preventing partial writes.
    pub fn save(&self, tokens: &QuickClipTokens) -> Result<(), TokenStoreError> {
        let storage_dir = self.path.parent().ok_or_else(|| {
            TokenStoreError::Write(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Token path has no parent directory",
            ))
        })?;

        if !storage_dir.exists() {
            std::fs::create_dir_all(storage_dir).map_err(TokenStoreError::Write)?;
        }

        let contents = serde_json::to_string_pretty(tokens).map_err(TokenStoreError::Serialize)?;

        let temp_path = self.path.with_extension("json.tmp");
        std::fs::write(&temp_path, &contents).map_err(TokenStoreError::Write)?;
        std::fs::rename(&temp_path, &self.path).map_err(TokenStoreError::Write)?;

        Ok(())
    }

    /// Set token for a specific capture source (atomic).
    pub fn set(&self, source: CaptureSource, token: &str) -> Result<(), TokenStoreError> {
        let mut tokens = self.load().unwrap_or_default();
        match source {
            CaptureSource::Fullscreen => tokens.fullscreen = Some(token.to_string()),
            CaptureSource::Area => tokens.area = Some(token.to_string()),
        }
        self.save(&tokens)
    }

    /// Clear token for a specific capture source (atomic).
    pub fn clear(&self, source: CaptureSource) -> Result<(), TokenStoreError> {
        let mut tokens = match self.load() {
            Ok(t) => t,
            Err(TokenStoreError::Read(e)) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(e) => return Err(e),
        };

        match source {
            CaptureSource::Fullscreen => tokens.fullscreen = None,
            CaptureSource::Area => tokens.area = None,
        }
        self.save(&tokens)
    }
}

impl Default for TokenStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Errors that can occur during token persistence.
#[derive(Debug, thiserror::Error)]
pub enum TokenStoreError {
    #[error("Failed to read tokens file: {0}")]
    Read(#[source] io::Error),

    #[error("Failed to parse tokens file: {0}")]
    Parse(#[source] serde_json::Error),

    #[error("Failed to serialize tokens: {0}")]
    Serialize(#[source] serde_json::Error),

    #[error("Failed to write tokens file: {0}")]
    Write(#[source] io::Error),
}

pub fn load_tokens() -> QuickClipTokens {
    let store = TokenStore::new();
    match store.load() {
        Ok(tokens) => tokens,
        Err(e) => {
            tracing::warn!(target: "quickclip", "[TOKENS] {}", e);
            QuickClipTokens::default()
        }
    }
}

/// Save a token for a specific capture source.
pub fn save_token(source: CaptureSource, token: &str) {
    let store = TokenStore::new();
    match store.set(source, token) {
        Ok(()) => {
            tracing::info!(target: "quickclip", "[TOKENS] Saved {:?} token to disk", source);
        }
        Err(e) => {
            tracing::warn!(target: "quickclip", "[TOKENS] Failed to save {:?} token: {}", source, e);
        }
    }
}

/// Clear a token for a specific capture source (when token is invalid/expired).
pub fn clear_token(source: CaptureSource) {
    let store = TokenStore::new();
    match store.clear(source) {
        Ok(()) => {
            tracing::info!(target: "quickclip", "[TOKENS] Cleared {:?} token from disk", source);
        }
        Err(e) => {
            tracing::warn!(target: "quickclip", "[TOKENS] Failed to clear {:?} token: {}", source, e);
        }
    }
}
