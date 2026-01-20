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
#[derive(Error, Debug, Clone)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_invalid_is_recoverable() {
        assert!(PortalError::TokenInvalid.is_recoverable_with_retry());
    }

    #[test]
    fn test_session_failed_is_recoverable() {
        let error = PortalError::SessionFailed("connection refused".to_string());
        assert!(error.is_recoverable_with_retry());
    }

    #[test]
    fn test_user_cancelled_is_not_recoverable() {
        assert!(!PortalError::UserCancelled.is_recoverable_with_retry());
    }

    #[test]
    fn test_unavailable_is_not_recoverable() {
        assert!(!PortalError::Unavailable.is_recoverable_with_retry());
    }

    #[test]
    fn test_timeout_is_not_recoverable() {
        assert!(!PortalError::Timeout(Duration::from_secs(30)).is_recoverable_with_retry());
    }

    #[test]
    fn test_portal_error_converts_to_quickclip_error() {
        let portal_err = PortalError::UserCancelled;
        let quick_err: QuickClipError = portal_err.into();
        assert!(matches!(quick_err, QuickClipError::Portal(PortalError::UserCancelled)));
    }

    #[test]
    fn test_capture_error_converts_to_quickclip_error() {
        let capture_err = CaptureError::NoFrames;
        let quick_err: QuickClipError = capture_err.into();
        assert!(matches!(quick_err, QuickClipError::Capture(CaptureError::NoFrames)));
    }

    #[test]
    fn test_encoding_error_converts_to_quickclip_error() {
        let encoding_err = EncodingError::FfmpegNotFound;
        let quick_err: QuickClipError = encoding_err.into();
        assert!(matches!(quick_err, QuickClipError::Encoding(EncodingError::FfmpegNotFound)));
    }

    #[test]
    fn test_error_from_conversion_with_question_mark() {
        fn fallible_portal() -> Result<(), QuickClipError> {
            let portal_err = PortalError::TokenInvalid;
            Err(portal_err)?
        }

        let result = fallible_portal();
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            QuickClipError::Portal(PortalError::TokenInvalid)
        ));
    }

    #[test]
    fn test_error_display_messages() {
        assert_eq!(
            PortalError::UserCancelled.to_string(),
            "User cancelled the capture selection"
        );
        assert_eq!(
            CaptureError::WriterStalled.to_string(),
            "Writer thread stalled (frame send timeout)"
        );
        assert_eq!(
            EncodingError::ProcessFailed {
                exit_code: 1,
                stderr: "codec error".to_string()
            }
            .to_string(),
            "FFmpeg process failed with exit code 1: codec error"
        );
    }
}
