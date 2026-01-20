use std::time::Duration;
use thiserror::Error;

/// Errors from XDG Desktop Portal interactions.
#[derive(Error, Debug, Clone, PartialEq)]
pub enum PortalError {
    #[error("XDG Desktop Portal is not available")]
    Unavailable,
    #[error("User cancelled the capture selection")]
    UserCancelled,
    #[error("Stored restore token is invalid or expired")]
    TokenInvalid,
    #[error("Portal session failed: {0}")]
    SessionFailed(String),
    #[error("Portal operation timed out after {0:?}")]
    Timeout(Duration),
}

impl PortalError {
    /// Returns true if this error might be resolved by clearing the token and retrying.
    pub fn is_recoverable_with_retry(&self) -> bool {
        matches!(self, PortalError::TokenInvalid | PortalError::SessionFailed(_))
    }
}

/// Errors from PipeWire capture pipeline.
#[derive(Error, Debug, Clone, PartialEq)]
pub enum CaptureError {
    #[error("Failed to initialize capture: {0}")]
    InitFailed(String),
    #[error("Capture stream failed: {0}")]
    StreamFailed(String),
    #[error("No frames were captured")]
    NoFrames,
    #[error("Failed to negotiate stream format")]
    FormatNegotiationFailed,
    #[error("PipeWire mainloop timed out after {0:?}")]
    MainloopTimeout(Duration),
    #[error("Writer thread stalled (frame send timeout)")]
    WriterStalled,
    #[error("Writer thread disconnected unexpectedly")]
    WriterDisconnected,
}

/// Errors from FFmpeg encoding pipeline.
#[derive(Error, Debug, Clone, PartialEq)]
pub enum EncodingError {
    #[error("FFmpeg not found. Please install ffmpeg.")]
    FfmpegNotFound,
    #[error("FFmpeg process failed with exit code {exit_code}: {stderr}")]
    ProcessFailed { exit_code: i32, stderr: String },
    #[error("Failed to write to FFmpeg: {0}")]
    WriteFailed(String),
    #[error("Encoding timed out after {0:?}")]
    Timeout(Duration),
}

/// Top-level error type for QuickClip operations.
#[derive(Error, Debug)]
pub enum QuickClipError {
    #[error(transparent)]
    Portal(#[from] PortalError),
    #[error(transparent)]
    Capture(#[from] CaptureError),
    #[error(transparent)]
    Encoding(#[from] EncodingError),
    #[error("Failed to create directory: {0}")]
    StorageError(String),
    #[error("Recording already in progress")]
    AlreadyRecording,
    #[error("No recording in progress")]
    NotRecording,
    #[error("Event error: {0}")]
    EventError(String),
}
