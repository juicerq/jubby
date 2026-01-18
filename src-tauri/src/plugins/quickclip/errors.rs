use thiserror::Error;

#[derive(Error, Debug)]
pub enum QuickClipError {
    #[error("Failed to capture frame: {0}")]
    CaptureFailure(String),
    #[error("Failed to create directory: {0}")]
    StorageError(String),
    #[error("FFmpeg not found. Please install ffmpeg.")]
    FfmpegNotFound,
    #[error("FFmpeg encoding failed: {0}")]
    EncodingError(String),
    #[error("No frames captured")]
    NoFrames,
    #[error("Recording already in progress")]
    AlreadyRecording,
    #[error("No recording in progress")]
    NotRecording,
    #[error("Encoding timeout after {0} seconds")]
    EncodingTimeout(u64),
    #[error("XDG Desktop Portal is not available")]
    PortalUnavailable,
    #[error("User cancelled the capture selection")]
    UserCancelled,
    #[error("PipeWire error: {0}")]
    PipeWireError(String),
    #[error("Event error: {0}")]
    EventError(String),
}
