use super::tokens::{clear_token, load_tokens, save_token, RESTORE_TOKEN};
use super::CaptureSource;
use crate::plugins::quickclip::errors::{CaptureError, PortalError, QuickClipError};
use ashpd::desktop::screencast::{CursorMode, Screencast, SourceType, Stream as PortalStream};
use ashpd::desktop::PersistMode;
use ashpd::enumflags2::BitFlags;
use std::os::fd::OwnedFd;
use std::sync::mpsc;
use std::thread::JoinHandle;
use std::time::Duration;

const PORTAL_TIMEOUT: Duration = Duration::from_secs(30);
/// Timeout for portal session creation when using a restore token.
/// If the token is valid, the portal responds almost instantly.
/// A short timeout ensures we quickly fall back to showing the dialog if the token is stale.
const TOKEN_RESTORE_TIMEOUT: Duration = Duration::from_secs(5);

fn classify_portal_error<E: std::fmt::Display>(e: E) -> PortalError {
    let msg = e.to_string();
    if msg.contains("cancelled") || msg.contains("Cancelled") {
        PortalError::UserCancelled
    } else {
        PortalError::SessionFailed(msg)
    }
}

pub struct PortalSessionData {
    pub pipewire_fd: OwnedFd,
    pub node_id: u32,
}

pub struct PortalHandle {
    close_tx: mpsc::Sender<()>,
    join_handle: Option<JoinHandle<()>>,
}

impl std::fmt::Debug for PortalHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PortalHandle")
            .field("join_handle", &self.join_handle.is_some())
            .finish()
    }
}

impl Drop for PortalHandle {
    fn drop(&mut self) {
        let _ = self.close_tx.send(());
        if let Some(handle) = self.join_handle.take() {
            let _ = handle.join();
        }
    }
}

pub struct PortalSession {
    pub data: PortalSessionData,
    pub handle: PortalHandle,
}

#[derive(Debug)]
pub struct ScreencastSession {
    pub pipewire_fd: OwnedFd,
    pub node_id: u32,
    pub handle: PortalHandle,
}

pub fn spawn_portal_thread(source: CaptureSource) -> Result<PortalSession, QuickClipError> {
    let (data_tx, data_rx) = mpsc::channel::<Result<PortalSessionData, QuickClipError>>();
    let (close_tx, close_rx) = mpsc::channel::<()>();

    let join_handle = std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime for portal thread");

        rt.block_on(async {
            let result = create_portal_session(source).await;
            match result {
                Ok(PortalResources { data, proxy, session }) => {
                    if data_tx.send(Ok(data)).is_err() {
                        tracing::warn!(target: "quickclip", "[PORTAL] Receiver dropped before data sent");
                        return;
                    }
                    let _ = close_rx.recv();
                    tracing::debug!(target: "quickclip", "[PORTAL] Close signal received, dropping session");
                    drop(session);
                    drop(proxy);
                }
                Err(e) => {
                    let _ = data_tx.send(Err(e));
                }
            }
        });
    });

    let data = data_rx
        .recv_timeout(PORTAL_TIMEOUT)
        .map_err(|e| match e {
            mpsc::RecvTimeoutError::Timeout => PortalError::Timeout(PORTAL_TIMEOUT),
            mpsc::RecvTimeoutError::Disconnected => {
                PortalError::SessionFailed("Portal thread died".to_string())
            }
        })??;

    Ok(PortalSession {
        data,
        handle: PortalHandle {
            close_tx,
            join_handle: Some(join_handle),
        },
    })
}

struct PortalResources {
    data: PortalSessionData,
    #[allow(dead_code)]
    proxy: Screencast<'static>,
    #[allow(dead_code)]
    session: ashpd::desktop::Session<'static, Screencast<'static>>,
}

async fn create_portal_session(source: CaptureSource) -> Result<PortalResources, QuickClipError> {
    tracing::info!(target: "quickclip", "[PORTAL] Creating screencast session: source={:?}", source);

    let tokens = load_tokens();
    let stored_token = match source {
        CaptureSource::Fullscreen => tokens.fullscreen,
        CaptureSource::Area => tokens.area,
    };
    let restore_token = stored_token.or_else(|| {
        RESTORE_TOKEN
            .lock()
            .expect("RESTORE_TOKEN mutex poisoned")
            .clone()
    });
    let had_token = restore_token.is_some();

    if had_token {
        tracing::info!(target: "quickclip", "[PORTAL] Attempting restore with saved token ({}s timeout)", TOKEN_RESTORE_TIMEOUT.as_secs());
    }

    // When using a restore token, apply a short timeout.
    // If the token is valid, the portal responds almost instantly.
    // If it hangs (stale token), we quickly fall back to showing the dialog.
    let result = if had_token {
        match tokio::time::timeout(
            TOKEN_RESTORE_TIMEOUT,
            create_portal_session_internal(source, restore_token.as_deref()),
        )
        .await
        {
            Ok(inner_result) => inner_result,
            Err(_elapsed) => {
                tracing::warn!(target: "quickclip", "[PORTAL] Token restore timed out after {}s, will retry without token", TOKEN_RESTORE_TIMEOUT.as_secs());
                Err(PortalError::Timeout(TOKEN_RESTORE_TIMEOUT).into())
            }
        }
    } else {
        create_portal_session_internal(source, None).await
    };

    match result {
        Ok(result) => Ok(result),
        Err(QuickClipError::Portal(PortalError::UserCancelled)) => {
            Err(PortalError::UserCancelled.into())
        }
        Err(QuickClipError::Portal(e)) if had_token && e.is_recoverable_with_retry() => {
            tracing::warn!(target: "quickclip", "[PORTAL] Token invalid, clearing and retrying: {}", e);
            clear_token(source);
            *RESTORE_TOKEN
                .lock()
                .expect("RESTORE_TOKEN mutex poisoned") = None;
            create_portal_session_internal(source, None).await
        }
        Err(QuickClipError::Portal(PortalError::Timeout(_))) if had_token => {
            tracing::info!(target: "quickclip", "[PORTAL] Clearing stale token and retrying with dialog");
            clear_token(source);
            *RESTORE_TOKEN
                .lock()
                .expect("RESTORE_TOKEN mutex poisoned") = None;
            create_portal_session_internal(source, None).await
        }
        Err(e) => Err(e),
    }
}

async fn create_portal_session_internal(
    source: CaptureSource,
    restore_token: Option<&str>,
) -> Result<PortalResources, QuickClipError> {
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
        *RESTORE_TOKEN
            .lock()
            .expect("RESTORE_TOKEN mutex poisoned") = Some(token.to_string());
    }

    let streams: Vec<&PortalStream> = response.streams().iter().collect();
    if streams.is_empty() {
        tracing::error!(target: "quickclip", "[PORTAL] No streams returned");
        return Err(
            CaptureError::InitFailed("No streams returned from portal".to_string()).into(),
        );
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

    // SAFETY: The proxy and session use 'static internally (ashpd::Proxy<'static>).
    // The lifetime parameter is a compile-time constraint, not runtime. These types
    // are created and owned by this thread, which keeps them alive until close signal.
    let proxy: Screencast<'static> = unsafe { std::mem::transmute(proxy) };
    let session: ashpd::desktop::Session<'static, Screencast<'static>> =
        unsafe { std::mem::transmute(session) };

    Ok(PortalResources {
        data: PortalSessionData { pipewire_fd, node_id },
        proxy,
        session,
    })
}

impl ScreencastSession {
    pub fn new(source: CaptureSource) -> Result<Self, QuickClipError> {
        let portal = spawn_portal_thread(source)?;
        Ok(Self {
            pipewire_fd: portal.data.pipewire_fd,
            node_id: portal.data.node_id,
            handle: portal.handle,
        })
    }
}
