pub mod session;
pub mod stream;
pub mod tokens;

pub use session::ScreencastSession;
pub use stream::run_capture_loop;

use std::time::Duration;

/// Duration to continue capturing after stop signal to drain PipeWire's internal buffer.
pub const DRAIN_DURATION: Duration = Duration::from_millis(200);

/// Message sent from capture loop to writer thread.
pub enum CaptureMessage {
    /// Video format metadata (sent once after format negotiation).
    Metadata { width: u32, height: u32 },
    /// A single frame in RGBA format.
    Frame(Vec<u8>),
    /// End of stream signal.
    EndOfStream,
}

/// Statistics from a capture session.
#[derive(Debug, Clone)]
pub struct CaptureStats {
    /// Total frames captured.
    pub frame_count: u32,
    /// Actual capture framerate (from PipeWire, typically monitor refresh rate).
    pub source_framerate: f64,
}

/// Capture mode requested by the user.
#[derive(Clone, Copy, Debug)]
pub enum CaptureSource {
    /// Capture full monitor (no user selection UI).
    Fullscreen,
    /// Let user select a region/area.
    Area,
}

impl From<super::super::types::PipeWireCaptureMode> for CaptureSource {
    fn from(mode: super::super::types::PipeWireCaptureMode) -> Self {
        match mode {
            super::super::types::PipeWireCaptureMode::Fullscreen => CaptureSource::Fullscreen,
            super::super::types::PipeWireCaptureMode::Area => CaptureSource::Area,
        }
    }
}
