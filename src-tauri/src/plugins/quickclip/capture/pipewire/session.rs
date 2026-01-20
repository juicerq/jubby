use super::tokens::{clear_token, load_tokens, save_token, RESTORE_TOKEN};
use super::CaptureSource;
use crate::plugins::quickclip::errors::{CaptureError, PortalError, QuickClipError};
use ashpd::desktop::screencast::{CursorMode, Screencast, SourceType, Stream as PortalStream};
use ashpd::desktop::PersistMode;
use ashpd::enumflags2::BitFlags;
use std::os::fd::OwnedFd;
use std::sync::mpsc;
use std::thread::JoinHandle;

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

/// Dropping signals the portal thread to close and waits for cleanup.
pub struct PortalHandle {
    close_tx: mpsc::Sender<()>,
    join_handle: Option<JoinHandle<()>>,
}

impl PortalHandle {
    pub fn close(mut self) {
        let _ = self.close_tx.send(());
        if let Some(handle) = self.join_handle.take() {
            let _ = handle.join();
        }
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

// TODO(Task 8): Remove ScreencastSession after RecordingCoordinator migration
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
        .recv()
        .map_err(|_| PortalError::SessionFailed("Portal thread died".to_string()))??;

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
    let restore_token = stored_token.or_else(|| RESTORE_TOKEN.lock().unwrap().clone());
    let had_token = restore_token.is_some();

    if had_token {
        tracing::debug!(target: "quickclip", "[PORTAL] Using restore token to skip dialog");
    }

    match create_portal_session_internal(source, restore_token.as_deref()).await {
        Ok(result) => Ok(result),
        Err(QuickClipError::Portal(PortalError::UserCancelled)) => {
            Err(PortalError::UserCancelled.into())
        }
        Err(QuickClipError::Portal(e)) if had_token && e.is_recoverable_with_retry() => {
            tracing::warn!(target: "quickclip", "[PORTAL] Token invalid, clearing and retrying: {}", e);
            clear_token(source);
            *RESTORE_TOKEN.lock().unwrap() = None;
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
        *RESTORE_TOKEN.lock().unwrap() = Some(token.to_string());
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
