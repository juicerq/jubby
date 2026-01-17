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
use std::os::fd::OwnedFd;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// Maximum memory for frame buffer (~1.5GB)
const MAX_FRAME_BUFFER_BYTES: usize = 1_500_000_000;

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
        let streams: Vec<&PortalStream> = response.streams().iter().collect();
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

/// Shared state for frame capture between PipeWire callbacks and main thread
struct CaptureState {
    /// Captured frames as RGBA buffers
    frames: Vec<Vec<u8>>,
    /// Current video format info
    format: VideoInfoRaw,
    /// Whether format has been negotiated
    format_ready: bool,
    /// Accumulated buffer size for memory limit checking
    total_buffer_bytes: usize,
    /// Frame counter for logging
    frame_count: u32,
    /// Width of captured frames
    width: u32,
    /// Height of captured frames
    height: u32,
}

impl Default for CaptureState {
    fn default() -> Self {
        Self {
            frames: Vec::new(),
            format: VideoInfoRaw::new(),
            format_ready: false,
            total_buffer_bytes: 0,
            frame_count: 0,
            width: 0,
            height: 0,
        }
    }
}

/// Result of a capture session containing captured frames
pub struct CaptureResult {
    /// Captured frames as RGBA buffers
    pub frames: Vec<Vec<u8>>,
    /// Width of captured frames
    pub width: u32,
    /// Height of captured frames
    pub height: u32,
    /// Number of frames captured
    pub frame_count: u32,
}

/// Run the PipeWire capture loop in a blocking thread
///
/// This function takes ownership of the ScreencastSession and runs the PipeWire
/// main loop until the stop signal is set. It captures frames from the screencast
/// stream and returns them as RGBA buffers.
pub fn run_capture_loop(
    session: ScreencastSession,
    stop_signal: Arc<AtomicBool>,
) -> Result<CaptureResult, RecorderError> {
    tracing::info!(target: "quickclip", "[CAPTURE] Starting PipeWire capture loop");

    // Initialize PipeWire
    pw::init();

    // Create main loop
    let mainloop = pw::main_loop::MainLoop::new(None).map_err(|e| {
        tracing::error!(target: "quickclip", "[CAPTURE] Failed to create main loop: {}", e);
        RecorderError::PipeWireError(format!("Failed to create main loop: {}", e))
    })?;

    // Create context from mainloop
    let context = pw::context::Context::new(&mainloop).map_err(|e| {
        tracing::error!(target: "quickclip", "[CAPTURE] Failed to create context: {}", e);
        RecorderError::PipeWireError(format!("Failed to create context: {}", e))
    })?;

    tracing::debug!(target: "quickclip", "[CAPTURE] PipeWire context created");

    // Connect using the portal-provided file descriptor
    let core = context.connect_fd(session.pipewire_fd, None).map_err(|e| {
        tracing::error!(target: "quickclip", "[CAPTURE] Failed to connect with fd: {}", e);
        RecorderError::PipeWireError(format!("Failed to connect with fd: {}", e))
    })?;

    tracing::debug!(target: "quickclip", "[CAPTURE] Connected to PipeWire via fd");

    // Shared state for callbacks
    let state = Arc::new(Mutex::new(CaptureState::default()));
    let memory_exceeded = Arc::new(AtomicBool::new(false));

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
        tracing::error!(target: "quickclip", "[CAPTURE] Failed to create stream: {}", e);
        RecorderError::PipeWireError(format!("Failed to create stream: {}", e))
    })?;

    tracing::debug!(target: "quickclip", "[CAPTURE] Stream created");

    // Clone references for callbacks
    let state_param = Arc::clone(&state);
    let state_process = Arc::clone(&state);
    let stop_signal_process = Arc::clone(&stop_signal);
    let memory_exceeded_process = Arc::clone(&memory_exceeded);
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

            tracing::debug!(target: "quickclip", "[CAPTURE] param_changed: id={}", id);

            let mut state_guard = state_param.lock().unwrap();

            // Parse video format
            if let Err(e) = state_guard.format.parse(param) {
                tracing::error!(target: "quickclip", "[CAPTURE] Failed to parse video format: {}", e);
                return;
            }

            let size = state_guard.format.size();
            let format = state_guard.format.format();

            state_guard.width = size.width;
            state_guard.height = size.height;
            state_guard.format_ready = true;

            tracing::info!(target: "quickclip",
                "[CAPTURE] Video format negotiated: {}x{}, format={:?}",
                size.width, size.height, format
            );
        })
        .process(move |stream, _user_data| {
            // Check stop signal
            if stop_signal_process.load(Ordering::SeqCst) {
                tracing::debug!(target: "quickclip", "[CAPTURE] Stop signal received, quitting mainloop");
                mainloop_quit.quit();
                return;
            }

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
                tracing::warn!(target: "quickclip", "[CAPTURE] Invalid chunk bounds: offset={}, size={}, slice_len={}",
                    chunk_offset, chunk_size, slice.len());
                return;
            }

            let frame_data = &slice[chunk_offset..chunk_offset + chunk_size];

            // Lock state and store frame
            let mut state_guard = state_process.lock().unwrap();

            // Check memory limit
            if state_guard.total_buffer_bytes + chunk_size > MAX_FRAME_BUFFER_BYTES {
                tracing::warn!(target: "quickclip", "[CAPTURE] Memory limit exceeded ({} MB), stopping capture",
                    state_guard.total_buffer_bytes / 1_000_000);
                memory_exceeded_process.store(true, Ordering::SeqCst);
                drop(state_guard);
                mainloop_quit.quit();
                return;
            }

            // Store the frame
            state_guard.frames.push(frame_data.to_vec());
            state_guard.total_buffer_bytes += chunk_size;
            state_guard.frame_count += 1;

            // Log every 30th frame to avoid spam
            if state_guard.frame_count % 30 == 0 {
                tracing::debug!(target: "quickclip", "[CAPTURE] Captured frame {}: {} bytes (total: {} MB)",
                    state_guard.frame_count, chunk_size, state_guard.total_buffer_bytes / 1_000_000);
            }
        })
        .register()
        .map_err(|e| {
            tracing::error!(target: "quickclip", "[CAPTURE] Failed to register stream listener: {}", e);
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
        tracing::error!(target: "quickclip", "[CAPTURE] Failed to serialize format pod: {:?}", e);
        RecorderError::PipeWireError(format!("Failed to serialize format pod: {:?}", e))
    })?
    .0
    .into_inner();

    let mut params = [Pod::from_bytes(&values).expect("Pod from bytes should succeed")];

    tracing::debug!(target: "quickclip", "[CAPTURE] Connecting stream to node {}", session.node_id);

    // Connect the stream
    stream
        .connect(
            pw::spa::utils::Direction::Input,
            Some(session.node_id),
            StreamFlags::AUTOCONNECT | StreamFlags::MAP_BUFFERS,
            &mut params,
        )
        .map_err(|e| {
            tracing::error!(target: "quickclip", "[CAPTURE] Failed to connect stream: {}", e);
            RecorderError::PipeWireError(format!("Failed to connect stream: {}", e))
        })?;

    tracing::info!(target: "quickclip", "[CAPTURE] Stream connected, starting main loop");

    // Run the main loop until stop signal or error
    mainloop.run();

    tracing::info!(target: "quickclip", "[CAPTURE] Main loop finished");

    // Check for memory exceeded error
    if memory_exceeded.load(Ordering::SeqCst) {
        return Err(RecorderError::MemoryLimitExceeded(
            MAX_FRAME_BUFFER_BYTES as u64 / 1_000_000,
        ));
    }

    // Extract results
    let state_guard = state.lock().unwrap();

    if state_guard.frames.is_empty() {
        tracing::warn!(target: "quickclip", "[CAPTURE] No frames captured");
        return Err(RecorderError::NoFrames);
    }

    tracing::info!(target: "quickclip", "[CAPTURE] Capture complete: {} frames, {}x{}",
        state_guard.frame_count, state_guard.width, state_guard.height);

    Ok(CaptureResult {
        frames: state_guard.frames.clone(),
        width: state_guard.width,
        height: state_guard.height,
        frame_count: state_guard.frame_count,
    })
}

/// Convert frames from BGRx to RGBA format (in-place modification)
pub fn convert_bgrx_to_rgba(frames: &mut [Vec<u8>]) {
    for frame in frames.iter_mut() {
        for pixel in frame.chunks_exact_mut(4) {
            // BGRx: [B, G, R, x] -> RGBA: [R, G, B, A]
            pixel.swap(0, 2); // Swap B and R
            pixel[3] = 255;   // Set alpha to opaque
        }
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

    #[test]
    fn test_bgrx_to_rgba_conversion() {
        let mut frames = vec![
            vec![0u8, 128, 255, 0], // BGRx: Blue=0, Green=128, Red=255
        ];
        convert_bgrx_to_rgba(&mut frames);
        // After conversion: RGBA: Red=255, Green=128, Blue=0, Alpha=255
        assert_eq!(frames[0], vec![255, 128, 0, 255]);
    }
}
