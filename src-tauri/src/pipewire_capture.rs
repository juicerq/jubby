//! PipeWire screen capture module for Wayland
//!
//! Uses XDG Desktop Portal (via ashpd) to request screen capture permission
//! and PipeWire to capture frames at native refresh rate (~60fps vs xcap's ~3fps).

use crate::recorder::RecorderError;
use ashpd::desktop::screencast::{CursorMode, Screencast, SourceType, Stream as PortalStream};
use ashpd::desktop::PersistMode;
use pipewire as pw;
use pw::spa::param::format::{FormatProperties, MediaSubtype, MediaType};
use pw::spa::param::video::VideoFormat;
use pw::spa::param::video::VideoInfoRaw;
use pw::spa::param::ParamType;
use pw::spa::pod::serialize::PodSerializer;
use pw::spa::pod::Pod;
use pw::spa::utils::SpaTypes;
use pw::stream::StreamFlags;
use serde::{Deserialize, Serialize};
use std::os::fd::OwnedFd;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::SyncSender;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

/// Duration to continue capturing after stop signal to drain PipeWire's internal buffer
/// 200ms is sufficient for any real PipeWire buffer, while 3s caused recordings to be too long
const DRAIN_DURATION: Duration = Duration::from_millis(200);

/// Message sent from capture loop to writer thread
pub enum CaptureMessage {
    /// Video format metadata (sent once after format negotiation)
    /// Note: framerate is not included because PipeWire doesn't report accurate framerate
    /// for screen capture (returns 0/1). The actual rate depends on monitor refresh rate
    /// and is measured by the writer thread from frame arrival times.
    Metadata { width: u32, height: u32 },
    /// A single frame in RGBA format
    Frame(Vec<u8>),
    /// End of stream signal
    EndOfStream,
}

/// Statistics from a capture session
pub struct CaptureStats {
    /// Total frames captured
    pub frame_count: u32,
    /// Actual capture framerate (from PipeWire, typically monitor refresh rate)
    pub source_framerate: f64,
}

/// Restore token for skipping portal dialog on subsequent recordings
/// This persists across recordings within the same app session (fallback for in-memory)
static RESTORE_TOKEN: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

/// Persistent tokens for XDG Portal, stored per capture mode
#[derive(Serialize, Deserialize, Default)]
struct QuickClipTokens {
    fullscreen: Option<String>,
    area: Option<String>,
}

/// Get the storage directory path following XDG Base Directory Specification
fn get_storage_dir() -> PathBuf {
    if let Ok(xdg_data) = std::env::var("XDG_DATA_HOME") {
        return PathBuf::from(xdg_data).join("jubby");
    }

    let home = std::env::var("HOME").expect("HOME environment variable must be set");
    PathBuf::from(home)
        .join(".local")
        .join("share")
        .join("jubby")
}

/// Get the path to the quickclip tokens file
fn get_tokens_path() -> PathBuf {
    get_storage_dir().join("quickclip-tokens.json")
}

/// Load tokens from disk, returning default if file doesn't exist or is invalid
fn load_tokens() -> QuickClipTokens {
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

/// Save a token for a specific capture source
fn save_token(source: CaptureSource, token: &str) {
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

/// Clear a token for a specific capture source (when token is invalid/expired)
fn clear_token(source: CaptureSource) {
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
    /// Internal session handle (kept alive to maintain the capture)
    #[allow(dead_code)]
    session: ashpd::desktop::Session<'static, Screencast<'static>>,
}

impl ScreencastSession {
    /// Create a new screencast session via XDG Desktop Portal
    pub async fn new(source: CaptureSource) -> Result<Self, RecorderError> {
        tracing::info!(target: "quickclip", "[PORTAL] Creating screencast session: source={:?}", source);

        // Load restore token: prioritize persisted token on disk, fallback to in-memory
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

        // Try with token first
        match Self::create_session_internal(source, restore_token.as_deref()).await {
            Ok(session) => Ok(session),
            Err(RecorderError::UserCancelled) => {
                // User cancelled - don't retry, just propagate
                Err(RecorderError::UserCancelled)
            }
            Err(e) if had_token => {
                // Failed with a token - token might be invalid/expired
                // Clear the invalid token and retry without it
                tracing::warn!(target: "quickclip", "[PORTAL] Token invalid, clearing and retrying: {}", e);
                clear_token(source);
                *RESTORE_TOKEN.lock().unwrap() = None;

                // Retry without token (will show portal dialog)
                Self::create_session_internal(source, None).await
            }
            Err(e) => {
                // Failed without a token - just propagate the error
                Err(e)
            }
        }
    }

    /// Internal function to create a session with an optional restore token
    async fn create_session_internal(
        source: CaptureSource,
        restore_token: Option<&str>,
    ) -> Result<Self, RecorderError> {
        // Create screencast proxy
        let proxy = Screencast::new().await.map_err(|e| {
            tracing::error!(target: "quickclip", "[PORTAL] Failed to create Screencast proxy: {}", e);
            RecorderError::PortalUnavailable
        })?;

        // Create session
        let session = proxy.create_session().await.map_err(|e| {
            tracing::error!(target: "quickclip", "[PORTAL] Failed to create session: {}", e);
            RecorderError::PortalUnavailable
        })?;

        // Select sources based on capture mode
        let source_type = match source {
            CaptureSource::Fullscreen => SourceType::Monitor,
            CaptureSource::Area => SourceType::Monitor, // Portal handles area selection
        };

        let multiple = matches!(source, CaptureSource::Area);

        tracing::debug!(target: "quickclip", "[PORTAL] Selecting sources: type={:?}, multiple={}", source_type, multiple);

        proxy
            .select_sources(
                &session,
                CursorMode::Embedded,      // Include cursor in capture
                source_type.into(),        // Convert to BitFlags
                multiple,
                restore_token,             // Use restore token if available
                PersistMode::Application,  // Persist selection for this app session
            )
            .await
            .map_err(|e| {
                let err_str = e.to_string();
                tracing::warn!(target: "quickclip", "[PORTAL] Source selection failed: {}", err_str);
                if err_str.contains("cancelled") || err_str.contains("Cancelled") {
                    RecorderError::UserCancelled
                } else {
                    RecorderError::PipeWireError(format!("Source selection failed: {}", e))
                }
            })?;

        // Start the session (this shows the portal UI if needed)
        let response = proxy
            .start(&session, None)
            .await
            .map_err(|e| {
                let err_str = e.to_string();
                tracing::warn!(target: "quickclip", "[PORTAL] Failed to start session: {}", err_str);
                if err_str.contains("cancelled") || err_str.contains("Cancelled") {
                    RecorderError::UserCancelled
                } else {
                    RecorderError::PipeWireError(format!("Failed to start session: {}", e))
                }
            })?
            .response()
            .map_err(|e| {
                let err_str = e.to_string();
                tracing::warn!(target: "quickclip", "[PORTAL] Session response error: {}", err_str);
                if err_str.contains("cancelled") || err_str.contains("Cancelled") {
                    RecorderError::UserCancelled
                } else {
                    RecorderError::PipeWireError(format!("Session response error: {}", e))
                }
            })?;

        // Save restore token for future recordings (skips portal dialog)
        if let Some(token) = response.restore_token() {
            tracing::debug!(target: "quickclip", "[PORTAL] Saving restore token");
            // Persist to disk for cross-session reuse
            save_token(source, token);
            // Also keep in memory as fallback
            *RESTORE_TOKEN.lock().unwrap() = Some(token.to_string());
        }

        // Get stream info
        let streams: Vec<&PortalStream> = response.streams().iter().collect();
        if streams.is_empty() {
            tracing::error!(target: "quickclip", "[PORTAL] No streams returned");
            return Err(RecorderError::PipeWireError(
                "No streams returned from portal".to_string(),
            ));
        }

        let stream = streams[0];
        let node_id = stream.pipe_wire_node_id();
        let portal_size = stream.size();

        tracing::info!(target: "quickclip",
            "[PORTAL] Stream acquired: node_id={}, portal_size={:?}",
            node_id, portal_size);

        // Open PipeWire remote
        let pipewire_fd = proxy.open_pipe_wire_remote(&session).await.map_err(|e| {
            tracing::error!(target: "quickclip", "[PORTAL] Failed to open PipeWire remote: {}", e);
            RecorderError::PipeWireError(format!("Failed to open PipeWire remote: {}", e))
        })?;

        tracing::debug!(target: "quickclip", "[PORTAL] PipeWire remote fd acquired");

        // We need to leak the session to get a 'static lifetime
        // This is safe because we keep it in the struct and drop it properly
        let session: ashpd::desktop::Session<'static, Screencast<'static>> =
            unsafe { std::mem::transmute(session) };

        Ok(Self {
            pipewire_fd,
            node_id,
            session,
        })
    }
}

/// Shared state for frame capture between PipeWire callbacks and main thread
struct CaptureState {
    /// Current video format info
    format: VideoInfoRaw,
    /// Whether format has been negotiated
    format_ready: bool,
    /// Whether metadata has been sent to the channel
    metadata_sent: bool,
    /// Frame counter for logging
    frame_count: u32,
    /// Width of captured frames
    width: u32,
    /// Height of captured frames
    height: u32,
    /// When stop was signaled (to track drain duration)
    drain_start: Option<std::time::Instant>,
}

impl Default for CaptureState {
    fn default() -> Self {
        Self {
            format: VideoInfoRaw::new(),
            format_ready: false,
            metadata_sent: false,
            frame_count: 0,
            width: 0,
            height: 0,
            drain_start: None,
        }
    }
}

/// Run the PipeWire capture loop in a blocking thread
///
/// This function takes ownership of the ScreencastSession and runs the PipeWire
/// main loop until the stop signal is set. Frames are streamed directly to the
/// writer thread via the provided channel instead of being buffered in memory.
///
/// The `recording_start` parameter should be the Instant when recording began,
/// used for accurate duration calculation (frame arrival timestamps are unreliable).
pub fn run_capture_loop(
    session: ScreencastSession,
    stop_signal: Arc<AtomicBool>,
    recording_start: std::time::Instant,
    frame_sender: SyncSender<CaptureMessage>,
) -> Result<CaptureStats, RecorderError> {
    tracing::info!(target: "quickclip", "[PIPEWIRE] Initializing capture loop: node_id={}", session.node_id);

    // Extract the portal session so we can close it at the end
    // The pipewire_fd and node_id are used for capture, portal_session keeps the portal alive
    let ScreencastSession {
        pipewire_fd,
        node_id,
        session: portal_session,
    } = session;

    // Initialize PipeWire
    pw::init();

    // Create main loop
    let mainloop = pw::main_loop::MainLoop::new(None).map_err(|e| {
        tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to create main loop: {}", e);
        RecorderError::PipeWireError(format!("Failed to create main loop: {}", e))
    })?;

    // Create context from mainloop
    let context = pw::context::Context::new(&mainloop).map_err(|e| {
        tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to create context: {}", e);
        RecorderError::PipeWireError(format!("Failed to create context: {}", e))
    })?;

    // Connect using the portal-provided file descriptor
    let core = context.connect_fd(pipewire_fd, None).map_err(|e| {
        tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to connect with fd: {}", e);
        RecorderError::PipeWireError(format!("Failed to connect with fd: {}", e))
    })?;

    tracing::debug!(target: "quickclip", "[PIPEWIRE] Connected to core via portal fd");

    // Shared state for callbacks
    let state = Arc::new(Mutex::new(CaptureState::default()));
    // Track if channel is still open (set to false when SendError occurs)
    let channel_open = Arc::new(AtomicBool::new(true));

    // Create video stream
    let stream = pw::stream::Stream::new(
        &core,
        "quickclip-video-capture",
        pw::properties::properties! {
            *pw::keys::MEDIA_TYPE => "Video",
            *pw::keys::MEDIA_CATEGORY => "Capture",
            *pw::keys::MEDIA_ROLE => "Screen",
        },
    )
    .map_err(|e| {
        tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to create stream: {}", e);
        RecorderError::PipeWireError(format!("Failed to create stream: {}", e))
    })?;

    // Clone references for callbacks
    let state_param = Arc::clone(&state);
    let state_process = Arc::clone(&state);
    let stop_signal_process = Arc::clone(&stop_signal);
    let channel_open_process = Arc::clone(&channel_open);
    let frame_sender_process = frame_sender.clone();
    let mainloop_quit = mainloop.clone();

    // Register stream listener
    let _listener = stream
        .add_local_listener_with_user_data(())
        .param_changed(move |_stream, _user_data, id, param| {
            // Only handle Format parameters
            let Some(param) = param else { return };
            if id != pw::spa::param::ParamType::Format.as_raw() {
                return;
            }

            let mut state_guard = state_param.lock().unwrap();

            // Parse video format
            if let Err(e) = state_guard.format.parse(param) {
                tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to parse video format: {}", e);
                return;
            }

            let size = state_guard.format.size();
            let format = state_guard.format.format();

            state_guard.width = size.width;
            state_guard.height = size.height;
            state_guard.format_ready = true;

            tracing::info!(target: "quickclip",
                "[PIPEWIRE] Format negotiated: {}x{} {:?}",
                size.width, size.height, format
            );
        })
        .process(move |stream, _user_data| {
            // Check if channel is closed (writer thread died)
            if !channel_open_process.load(Ordering::SeqCst) {
                mainloop_quit.quit();
                return;
            }

            let mut state_guard = state_process.lock().unwrap();

            // Check if we should start draining
            if stop_signal_process.load(Ordering::SeqCst) && state_guard.drain_start.is_none() {
                state_guard.drain_start = Some(std::time::Instant::now());
                tracing::info!(target: "quickclip", "[CAPTURE] Stop signal received, draining buffer for {:?}...", DRAIN_DURATION);
            }

            // Check if drain period is complete
            if let Some(drain_start) = state_guard.drain_start {
                if drain_start.elapsed() >= DRAIN_DURATION {
                    tracing::info!(target: "quickclip", "[CAPTURE] Drain complete, captured {} frames total", state_guard.frame_count);
                    drop(state_guard);
                    mainloop_quit.quit();
                    return;
                }
            }

            // Send metadata if not yet sent and format is ready
            if state_guard.format_ready && !state_guard.metadata_sent {
                let width = state_guard.width;
                let height = state_guard.height;
                state_guard.metadata_sent = true;
                drop(state_guard);

                if frame_sender_process.send(CaptureMessage::Metadata { width, height }).is_err() {
                    tracing::warn!(target: "quickclip", "[CAPTURE] Channel closed, stopping capture");
                    channel_open_process.store(false, Ordering::SeqCst);
                    mainloop_quit.quit();
                    return;
                }

                // Re-acquire lock for frame processing
                state_guard = state_process.lock().unwrap();
            }

            // Release lock before dequeuing buffer
            drop(state_guard);

            // Try to dequeue a buffer
            let Some(mut buffer) = stream.dequeue_buffer() else {
                return;
            };

            let datas = buffer.datas_mut();
            if datas.is_empty() {
                return;
            }

            let data = &mut datas[0];
            let chunk = data.chunk();

            let chunk_size = chunk.size() as usize;
            let chunk_offset = chunk.offset() as usize;

            if chunk_size == 0 {
                return;
            }

            // Get the data slice
            let Some(slice) = data.data() else {
                return;
            };

            // Validate bounds
            if chunk_offset + chunk_size > slice.len() {
                tracing::warn!(target: "quickclip", "[CAPTURE] Invalid chunk bounds: offset={}, size={}, len={}",
                    chunk_offset, chunk_size, slice.len());
                return;
            }

            let frame_data = &slice[chunk_offset..chunk_offset + chunk_size];

            // Convert BGRx to RGBA in-place and send frame
            let mut rgba_frame = frame_data.to_vec();
            for pixel in rgba_frame.chunks_exact_mut(4) {
                // BGRx: [B, G, R, x] -> RGBA: [R, G, B, A]
                pixel.swap(0, 2);
                pixel[3] = 255;
            }

            // Send frame to writer thread (blocks if channel is full - backpressure)
            if frame_sender_process.send(CaptureMessage::Frame(rgba_frame)).is_err() {
                tracing::warn!(target: "quickclip", "[CAPTURE] Channel closed, stopping capture");
                channel_open_process.store(false, Ordering::SeqCst);
                mainloop_quit.quit();
                return;
            }

            // Lock state and update counter
            let mut state_guard = state_process.lock().unwrap();
            state_guard.frame_count += 1;

            // Log progress every 60 frames (~1 second at 60fps)
            if state_guard.frame_count % 60 == 0 {
                tracing::debug!(target: "quickclip", "[CAPTURE] Progress: {} frames streamed",
                    state_guard.frame_count);
            }
        })
        .register()
        .map_err(|e| {
            tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to register stream listener: {}", e);
            RecorderError::PipeWireError(format!("Failed to register listener: {}", e))
        })?;

    // Build format parameters for negotiation using the object! macro
    // We prefer BGRx (common for screen capture on Linux), but also accept RGBA and RGB
    let obj = pw::spa::pod::object!(
        SpaTypes::ObjectParamFormat,
        ParamType::EnumFormat,
        pw::spa::pod::property!(FormatProperties::MediaType, Id, MediaType::Video),
        pw::spa::pod::property!(FormatProperties::MediaSubtype, Id, MediaSubtype::Raw),
        pw::spa::pod::property!(
            FormatProperties::VideoFormat,
            Choice,
            Enum,
            Id,
            VideoFormat::BGRx,  // Default/preferred
            VideoFormat::BGRx,
            VideoFormat::RGBA,
            VideoFormat::RGBx,
            VideoFormat::RGB
        ),
        pw::spa::pod::property!(
            FormatProperties::VideoSize,
            Choice,
            Range,
            Rectangle,
            pw::spa::utils::Rectangle { width: 1920, height: 1080 },
            pw::spa::utils::Rectangle { width: 1, height: 1 },
            pw::spa::utils::Rectangle { width: 4096, height: 4096 }
        ),
        pw::spa::pod::property!(
            FormatProperties::VideoFramerate,
            Choice,
            Range,
            Fraction,
            pw::spa::utils::Fraction { num: 60, denom: 1 },
            pw::spa::utils::Fraction { num: 0, denom: 1 },
            pw::spa::utils::Fraction { num: 1000, denom: 1 }
        ),
    );

    let values: Vec<u8> = PodSerializer::serialize(
        std::io::Cursor::new(Vec::new()),
        &pw::spa::pod::Value::Object(obj),
    )
    .map_err(|e| {
        tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to serialize format pod: {:?}", e);
        RecorderError::PipeWireError(format!("Failed to serialize format pod: {:?}", e))
    })?
    .0
    .into_inner();

    let mut params = [Pod::from_bytes(&values).expect("Pod from bytes should succeed")];

    // Connect the stream
    stream
        .connect(
            pw::spa::utils::Direction::Input,
            Some(node_id),
            StreamFlags::AUTOCONNECT | StreamFlags::MAP_BUFFERS,
            &mut params,
        )
        .map_err(|e| {
            tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to connect stream: {}", e);
            RecorderError::PipeWireError(format!("Failed to connect stream: {}", e))
        })?;

    tracing::info!(target: "quickclip", "[PIPEWIRE] Stream connected, entering capture loop");

    // Add a timer to periodically check stop signal (handles case where no frames arrive)
    let stop_signal_timer = Arc::clone(&stop_signal);
    let mainloop_for_timer = mainloop.clone();
    let state_timer = Arc::clone(&state);
    let timer_callback = move |_expirations: u64| {
        if stop_signal_timer.load(Ordering::SeqCst) {
            // Let the process callback handle the drain logic
            // Only quit from timer if drain is complete
            let mut state_guard = state_timer.lock().unwrap();

            // Start drain if not already started
            if state_guard.drain_start.is_none() {
                state_guard.drain_start = Some(std::time::Instant::now());
                tracing::info!(target: "quickclip", "[CAPTURE] Stop signal (timer), draining buffer for {:?}...", DRAIN_DURATION);
            }

            // Check if drain period is complete
            if let Some(drain_start) = state_guard.drain_start {
                if drain_start.elapsed() >= DRAIN_DURATION {
                    mainloop_for_timer.quit();
                }
            }
        }
    };

    // Create timer source that fires every 100ms
    let timer = mainloop.loop_().add_timer(timer_callback);
    timer.update_timer(
        Some(Duration::from_millis(100)), // Initial delay
        Some(Duration::from_millis(100)), // Repeat interval
    );

    // Run the main loop until stop signal or error
    mainloop.run();

    // Send EndOfStream to signal writer thread that capture is complete
    let _ = frame_sender.send(CaptureMessage::EndOfStream);

    // Extract statistics
    let state_guard = state.lock().unwrap();

    if state_guard.frame_count == 0 {
        tracing::warn!(target: "quickclip", "[CAPTURE] No frames captured");
        return Err(RecorderError::NoFrames);
    }

    // Calculate fps from actual wall-clock recording duration
    // Using recording_start (when recording began) is more reliable than frame arrival timestamps,
    // because PipeWire buffers frames and delivers them in batches.
    // Duration is from start to when stop was signaled (not including drain time).
    let actual_duration = state_guard
        .drain_start
        .map(|drain| drain.duration_since(recording_start).as_secs_f64())
        .unwrap_or_else(|| recording_start.elapsed().as_secs_f64());
    let source_framerate = if actual_duration > 0.1 && state_guard.frame_count > 0 {
        state_guard.frame_count as f64 / actual_duration
    } else {
        60.0 // Fallback for very short recordings
    };

    tracing::info!(target: "quickclip",
        "[CAPTURE] Complete: frames={}, size={}x{}, duration={:.2}s, fps={:.2}",
        state_guard.frame_count, state_guard.width, state_guard.height,
        actual_duration, source_framerate);

    // Extract stats before dropping the guard
    let stats = CaptureStats {
        frame_count: state_guard.frame_count,
        source_framerate,
    };
    drop(state_guard);

    // Close the portal session to remove the screen sharing indicator
    // Spawn a thread so this doesn't block the capture thread's return
    std::thread::spawn(move || {
        if let Ok(rt) = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            if let Err(e) = rt.block_on(portal_session.close()) {
                tracing::warn!(target: "quickclip", "[PORTAL] Failed to close session: {}", e);
            } else {
                tracing::debug!(target: "quickclip", "[PORTAL] Session closed successfully");
            }
        }
    });

    Ok(stats)
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
