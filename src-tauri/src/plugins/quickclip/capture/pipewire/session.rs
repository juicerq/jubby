use super::tokens::{clear_token, load_tokens, save_token, RESTORE_TOKEN};
use super::CaptureSource;
use crate::plugins::quickclip::errors::{CaptureError, PortalError, QuickClipError};
use ashpd::desktop::screencast::{CursorMode, Screencast, SourceType, Stream as PortalStream};
use ashpd::desktop::PersistMode;
use ashpd::enumflags2::BitFlags;
use std::os::fd::OwnedFd;

fn classify_portal_error<E: std::fmt::Display>(e: E) -> PortalError {
    let msg = e.to_string();
    if msg.contains("cancelled") || msg.contains("Cancelled") {
        PortalError::UserCancelled
    } else {
        PortalError::SessionFailed(msg)
    }
}

/// Result of starting a screencast session.
pub struct ScreencastSession {
    /// PipeWire file descriptor for connecting to the stream.
    pub pipewire_fd: OwnedFd,
    /// PipeWire node ID for the capture stream.
    pub node_id: u32,
    /// Internal session handle (kept alive to maintain the capture).
    #[allow(dead_code)]
    pub session: ashpd::desktop::Session<'static, Screencast<'static>>,
}

impl ScreencastSession {
    pub async fn new(source: CaptureSource) -> Result<Self, QuickClipError> {
        tracing::info!(target: "quickclip", "[PORTAL] Creating screencast session: source={:?}", source);

        let tokens = load_tokens();
        let stored_token = match source {
            CaptureSource::Fullscreen => tokens.fullscreen,
            CaptureSource::Area => tokens.area,
        };
        let restore_token = stored_token.or_else(|| RESTORE_TOKEN.lock().unwrap().clone());
        let had_token = restore_token.is_some();

        if had_token {
            tracing::debug!(target: "quickclip", "[PORTAL] Using restore token to skip dialog");
        }

        match Self::create_session_internal(source, restore_token.as_deref()).await {
            Ok(session) => Ok(session),
            Err(QuickClipError::Portal(PortalError::UserCancelled)) => {
                Err(PortalError::UserCancelled.into())
            }
            Err(QuickClipError::Portal(e)) if had_token && e.is_recoverable_with_retry() => {
                tracing::warn!(target: "quickclip", "[PORTAL] Token invalid, clearing and retrying: {}", e);
                clear_token(source);
                *RESTORE_TOKEN.lock().unwrap() = None;
                Self::create_session_internal(source, None).await
            }
            Err(e) => Err(e),
        }
    }

    async fn create_session_internal(
        source: CaptureSource,
        restore_token: Option<&str>,
    ) -> Result<Self, QuickClipError> {
        let proxy = Screencast::new().await.map_err(|e| {
            tracing::error!(target: "quickclip", "[PORTAL] Failed to create Screencast proxy: {}", e);
            PortalError::Unavailable
        })?;

        let session = proxy.create_session().await.map_err(|e| {
            tracing::error!(target: "quickclip", "[PORTAL] Failed to create session: {}", e);
            PortalError::SessionFailed(format!("Failed to create session: {}", e))
        })?;

        let source_type = match source {
            CaptureSource::Fullscreen => SourceType::Monitor,
            CaptureSource::Area => SourceType::Monitor,
        };

        let multiple = matches!(source, CaptureSource::Area);

        tracing::debug!(target: "quickclip", "[PORTAL] Selecting sources: type={:?}, multiple={}", source_type, multiple);

        proxy
            .select_sources(
                &session,
                CursorMode::Embedded,
                BitFlags::from_flag(source_type),
                multiple,
                restore_token,
                PersistMode::Application,
            )
            .await
            .map_err(|e| {
                tracing::warn!(target: "quickclip", "[PORTAL] Source selection failed: {}", e);
                classify_portal_error(e)
            })?;

        let response = proxy
            .start(&session, None)
            .await
            .map_err(|e| {
                tracing::warn!(target: "quickclip", "[PORTAL] Failed to start session: {}", e);
                classify_portal_error(e)
            })?
            .response()
            .map_err(|e| {
                tracing::warn!(target: "quickclip", "[PORTAL] Session response error: {}", e);
                classify_portal_error(e)
            })?;

        if let Some(token) = response.restore_token() {
            tracing::debug!(target: "quickclip", "[PORTAL] Saving restore token");
            save_token(source, token);
            *RESTORE_TOKEN.lock().unwrap() = Some(token.to_string());
        }

        let streams: Vec<&PortalStream> = response.streams().iter().collect();
        if streams.is_empty() {
            tracing::error!(target: "quickclip", "[PORTAL] No streams returned");
            return Err(CaptureError::InitFailed("No streams returned from portal".to_string()).into());
        }

        let stream = streams[0];
        let node_id = stream.pipe_wire_node_id();
        let portal_size = stream.size();

        tracing::info!(target: "quickclip",
            "[PORTAL] Stream acquired: node_id={}, portal_size={:?}",
            node_id, portal_size);

        let pipewire_fd = proxy.open_pipe_wire_remote(&session).await.map_err(|e| {
            tracing::error!(target: "quickclip", "[PORTAL] Failed to open PipeWire remote: {}", e);
            CaptureError::InitFailed(format!("Failed to open PipeWire remote: {}", e))
        })?;

        tracing::debug!(target: "quickclip", "[PORTAL] PipeWire remote fd acquired");

        let session: ashpd::desktop::Session<'static, Screencast<'static>> =
            unsafe { std::mem::transmute(session) };

        Ok(Self {
            pipewire_fd,
            node_id,
            session,
        })
    }
}
