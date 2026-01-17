//! PipeWire screen capture module for Wayland
//!
//! Uses XDG Desktop Portal (via ashpd) to request screen capture permission
//! and PipeWire to capture frames at native refresh rate (~60fps vs xcap's ~3fps).

use crate::recorder::RecorderError;
use ashpd::desktop::screencast::{CursorMode, Screencast, SourceType, Stream};
use ashpd::desktop::PersistMode;
use std::os::fd::OwnedFd;

/// Capture mode requested by the user
#[derive(Clone, Copy, Debug)]
pub enum CaptureSource {
    /// Capture full monitor (no user selection UI)
    Fullscreen,
    /// Let user select a region/area
    Area,
}

/// Result of starting a screencast session
pub struct ScreencastSession {
    /// PipeWire file descriptor for connecting to the stream
    pub pipewire_fd: OwnedFd,
    /// PipeWire node ID for the capture stream
    pub node_id: u32,
    /// Stream dimensions if available
    pub size: Option<(i32, i32)>,
    /// Internal session handle (kept alive to maintain the capture)
    #[allow(dead_code)]
    session: ashpd::desktop::Session<'static, Screencast<'static>>,
}

impl ScreencastSession {
    /// Create a new screencast session via XDG Desktop Portal
    pub async fn new(source: CaptureSource) -> Result<Self, RecorderError> {
        tracing::info!(target: "quickclip", "[CAPTURE] Starting portal screencast session (source: {:?})", source);

        // Create screencast proxy
        let proxy = Screencast::new().await.map_err(|e| {
            tracing::error!(target: "quickclip", "[CAPTURE] Failed to create Screencast proxy: {}", e);
            RecorderError::PortalUnavailable
        })?;

        tracing::debug!(target: "quickclip", "[CAPTURE] Screencast proxy created");

        // Create session
        let session = proxy.create_session().await.map_err(|e| {
            tracing::error!(target: "quickclip", "[CAPTURE] Failed to create session: {}", e);
            RecorderError::PortalUnavailable
        })?;

        tracing::debug!(target: "quickclip", "[CAPTURE] Session created");

        // Select sources based on capture mode
        let source_type = match source {
            CaptureSource::Fullscreen => SourceType::Monitor,
            CaptureSource::Area => SourceType::Monitor, // Portal handles area selection
        };

        let multiple = matches!(source, CaptureSource::Area);

        tracing::debug!(target: "quickclip", "[CAPTURE] Selecting sources: type={:?}, multiple={}", source_type, multiple);

        proxy
            .select_sources(
                &session,
                CursorMode::Embedded, // Include cursor in capture
                source_type.into(),   // Convert to BitFlags
                multiple,
                None,                 // No restore token
                PersistMode::DoNot,   // Don't persist selection
            )
            .await
            .map_err(|e| {
                let err_str = e.to_string();
                tracing::warn!(target: "quickclip", "[CAPTURE] Source selection failed: {}", err_str);
                if err_str.contains("cancelled") || err_str.contains("Cancelled") {
                    RecorderError::UserCancelled
                } else {
                    RecorderError::PipeWireError(format!("Source selection failed: {}", e))
                }
            })?;

        tracing::debug!(target: "quickclip", "[CAPTURE] Sources selected, starting session");

        // Start the session (this shows the portal UI if needed)
        let response = proxy
            .start(&session, None)
            .await
            .map_err(|e| {
                let err_str = e.to_string();
                tracing::warn!(target: "quickclip", "[CAPTURE] Failed to start session: {}", err_str);
                if err_str.contains("cancelled") || err_str.contains("Cancelled") {
                    RecorderError::UserCancelled
                } else {
                    RecorderError::PipeWireError(format!("Failed to start session: {}", e))
                }
            })?
            .response()
            .map_err(|e| {
                let err_str = e.to_string();
                tracing::warn!(target: "quickclip", "[CAPTURE] Session response error: {}", err_str);
                if err_str.contains("cancelled") || err_str.contains("Cancelled") {
                    RecorderError::UserCancelled
                } else {
                    RecorderError::PipeWireError(format!("Session response error: {}", e))
                }
            })?;

        // Get stream info
        let streams: Vec<&Stream> = response.streams().iter().collect();
        if streams.is_empty() {
            tracing::error!(target: "quickclip", "[CAPTURE] No streams returned from portal");
            return Err(RecorderError::PipeWireError(
                "No streams returned from portal".to_string(),
            ));
        }

        let stream = streams[0];
        let node_id = stream.pipe_wire_node_id();
        let size = stream.size();

        tracing::info!(target: "quickclip", "[CAPTURE] Got stream: node_id={}, size={:?}", node_id, size);

        // Open PipeWire remote
        let pipewire_fd = proxy.open_pipe_wire_remote(&session).await.map_err(|e| {
            tracing::error!(target: "quickclip", "[CAPTURE] Failed to open PipeWire remote: {}", e);
            RecorderError::PipeWireError(format!("Failed to open PipeWire remote: {}", e))
        })?;

        tracing::info!(target: "quickclip", "[CAPTURE] PipeWire remote opened successfully");

        // We need to leak the session to get a 'static lifetime
        // This is safe because we keep it in the struct and drop it properly
        let session: ashpd::desktop::Session<'static, Screencast<'static>> =
            unsafe { std::mem::transmute(session) };

        Ok(Self {
            pipewire_fd,
            node_id,
            size,
            session,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capture_source_debug() {
        // Just ensure the types compile
        let _fullscreen = CaptureSource::Fullscreen;
        let _area = CaptureSource::Area;
    }
}
