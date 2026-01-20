use super::{CaptureMessage, CaptureStats, ScreencastSession, DRAIN_DURATION};
use crate::plugins::quickclip::errors::{CaptureError, QuickClipError};
use crossbeam_channel::{SendTimeoutError, Sender};
use pipewire as pw;
use pw::spa::param::format::{FormatProperties, MediaSubtype, MediaType};
use pw::spa::param::video::VideoFormat;
use pw::spa::param::video::VideoInfoRaw;
use pw::spa::param::ParamType;
use pw::spa::pod::serialize::PodSerializer;
use pw::spa::pod::Pod;
use pw::spa::utils::SpaTypes;
use pw::stream::StreamFlags;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const SEND_TIMEOUT: Duration = Duration::from_secs(5);
/// Maximum recording duration (4 hours) to prevent PipeWire mainloop from running indefinitely
const MAX_RECORDING_DURATION: Duration = Duration::from_secs(4 * 60 * 60);

fn send_frame(sender: &Sender<CaptureMessage>, msg: CaptureMessage) -> Result<(), CaptureError> {
    match sender.send_timeout(msg, SEND_TIMEOUT) {
        Ok(()) => Ok(()),
        Err(SendTimeoutError::Timeout(_)) => Err(CaptureError::WriterStalled),
        Err(SendTimeoutError::Disconnected(_)) => Err(CaptureError::WriterDisconnected),
    }
}

pub struct CaptureGuard {
    mainloop: pw::main_loop::MainLoop,
    completed: bool,
}

impl CaptureGuard {
    pub fn new(mainloop: pw::main_loop::MainLoop) -> Self {
        Self {
            mainloop,
            completed: false,
        }
    }

    pub fn mainloop(&self) -> &pw::main_loop::MainLoop {
        &self.mainloop
    }

    pub fn mark_completed(&mut self) {
        self.completed = true;
    }

    pub fn run(&self) {
        self.mainloop.run();
    }
}

impl Drop for CaptureGuard {
    fn drop(&mut self) {
        self.mainloop.quit();

        if !self.completed {
            tracing::warn!(
                target: "quickclip",
                "[CAPTURE] CaptureGuard dropped without completion - abnormal termination"
            );
        }
    }
}

/// Shared state for frame capture between PipeWire callbacks and main thread.
struct CaptureState {
    format: VideoInfoRaw,
    format_ready: bool,
    metadata_sent: bool,
    frame_count: u32,
    width: u32,
    height: u32,
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

pub fn run_capture_loop(
    session: ScreencastSession,
    stop_signal: Arc<AtomicBool>,
    recording_start: std::time::Instant,
    frame_sender: Sender<CaptureMessage>,
) -> Result<CaptureStats, QuickClipError> {
    tracing::info!(target: "quickclip", "[PIPEWIRE] Initializing capture loop: node_id={}", session.node_id);

    let ScreencastSession {
        pipewire_fd,
        node_id,
        handle,
    } = session;

    pw::init();

    let mainloop = pw::main_loop::MainLoop::new(None).map_err(|e| {
        tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to create main loop: {}", e);
        CaptureError::InitFailed(format!("Failed to create main loop: {}", e))
    })?;

    let mut guard = CaptureGuard::new(mainloop);

    let context = pw::context::Context::new(guard.mainloop()).map_err(|e| {
        tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to create context: {}", e);
        CaptureError::InitFailed(format!("Failed to create context: {}", e))
    })?;

    let core = context.connect_fd(pipewire_fd, None).map_err(|e| {
        tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to connect with fd: {}", e);
        CaptureError::InitFailed(format!("Failed to connect with fd: {}", e))
    })?;

    tracing::debug!(target: "quickclip", "[PIPEWIRE] Connected to core via portal fd");

    let state = Arc::new(Mutex::new(CaptureState::default()));
    let capture_error: Arc<Mutex<Option<CaptureError>>> = Arc::new(Mutex::new(None));

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
        CaptureError::InitFailed(format!("Failed to create stream: {}", e))
    })?;

    let state_param = Arc::clone(&state);
    let state_process = Arc::clone(&state);
    let stop_signal_process = Arc::clone(&stop_signal);
    let capture_error_process = Arc::clone(&capture_error);
    let frame_sender_process = frame_sender.clone();
    let mainloop_quit = guard.mainloop().clone();

    let _listener = stream
        .add_local_listener_with_user_data(())
        .param_changed(move |_stream, _user_data, id, param| {
            let Some(param) = param else { return };
            if id != pw::spa::param::ParamType::Format.as_raw() {
                return;
            }

            let mut state_guard = state_param
                .lock()
                .expect("CaptureState mutex poisoned in param_changed callback");

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
            let mut state_guard = state_process
                .lock()
                .expect("CaptureState mutex poisoned in process callback");

            if stop_signal_process.load(Ordering::SeqCst) && state_guard.drain_start.is_none() {
                state_guard.drain_start = Some(std::time::Instant::now());
                tracing::info!(target: "quickclip", "[CAPTURE] Stop signal received, draining buffer for {:?}...", DRAIN_DURATION);
            }

            if let Some(drain_start) = state_guard.drain_start {
                if drain_start.elapsed() >= DRAIN_DURATION {
                    tracing::info!(target: "quickclip", "[CAPTURE] Drain complete, captured {} frames total", state_guard.frame_count);
                    drop(state_guard);
                    mainloop_quit.quit();
                    return;
                }
            }

            if state_guard.format_ready && !state_guard.metadata_sent {
                let width = state_guard.width;
                let height = state_guard.height;
                state_guard.metadata_sent = true;
                drop(state_guard);

                if let Err(e) = send_frame(&frame_sender_process, CaptureMessage::Metadata { width, height }) {
                    tracing::warn!(target: "quickclip", "[CAPTURE] Failed to send metadata: {:?}", e);
                    *capture_error_process
                        .lock()
                        .expect("capture_error mutex poisoned") = Some(e);
                    mainloop_quit.quit();
                    return;
                }

                state_guard = state_process
                    .lock()
                    .expect("CaptureState mutex poisoned in process callback");
            }

            drop(state_guard);

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

            let Some(slice) = data.data() else {
                return;
            };

            if chunk_offset + chunk_size > slice.len() {
                tracing::warn!(target: "quickclip", "[CAPTURE] Invalid chunk bounds: offset={}, size={}, len={}",
                    chunk_offset, chunk_size, slice.len());
                return;
            }

            let frame_data = &slice[chunk_offset..chunk_offset + chunk_size];

            let mut rgba_frame = frame_data.to_vec();
            for pixel in rgba_frame.chunks_exact_mut(4) {
                pixel.swap(0, 2);
                pixel[3] = 255;
            }

            if let Err(e) = send_frame(&frame_sender_process, CaptureMessage::Frame(rgba_frame)) {
                tracing::warn!(target: "quickclip", "[CAPTURE] Failed to send frame: {:?}", e);
                *capture_error_process
                    .lock()
                    .expect("capture_error mutex poisoned") = Some(e);
                mainloop_quit.quit();
                return;
            }

            let mut state_guard = state_process
                .lock()
                .expect("CaptureState mutex poisoned in process callback");
            state_guard.frame_count += 1;

            if state_guard.frame_count % 60 == 0 {
                tracing::debug!(target: "quickclip", "[CAPTURE] Progress: {} frames streamed",
                    state_guard.frame_count);
            }
        })
        .register()
        .map_err(|e| {
            tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to register stream listener: {}", e);
            CaptureError::InitFailed(format!("Failed to register listener: {}", e))
        })?;

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
            VideoFormat::BGRx,
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
        CaptureError::InitFailed(format!("Failed to serialize format pod: {:?}", e))
    })?
    .0
    .into_inner();

    let pod = Pod::from_bytes(&values).ok_or_else(|| {
        tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to parse serialized format pod");
        CaptureError::InitFailed("Failed to parse serialized format pod".to_string())
    })?;
    let mut params = [pod];

    stream
        .connect(
            pw::spa::utils::Direction::Input,
            Some(node_id),
            StreamFlags::AUTOCONNECT | StreamFlags::MAP_BUFFERS,
            &mut params,
        )
        .map_err(|e| {
            tracing::error!(target: "quickclip", "[PIPEWIRE] Failed to connect stream: {}", e);
            CaptureError::StreamFailed(format!("Failed to connect stream: {}", e))
        })?;

    tracing::info!(target: "quickclip", "[PIPEWIRE] Stream connected, entering capture loop");

    let stop_signal_timer = Arc::clone(&stop_signal);
    let mainloop_for_timer = guard.mainloop().clone();
    let state_timer = Arc::clone(&state);
    let capture_error_timer = Arc::clone(&capture_error);
    let timer_callback = move |_expirations: u64| {
        if recording_start.elapsed() >= MAX_RECORDING_DURATION {
            tracing::warn!(target: "quickclip",
                "[CAPTURE] Maximum recording duration ({:?}) exceeded, forcing stop",
                MAX_RECORDING_DURATION
            );
            *capture_error_timer
                .lock()
                .expect("capture_error mutex poisoned in timer callback") =
                Some(CaptureError::MainloopTimeout(MAX_RECORDING_DURATION));
            mainloop_for_timer.quit();
            return;
        }

        if stop_signal_timer.load(Ordering::SeqCst) {
            let mut state_guard = state_timer
                .lock()
                .expect("CaptureState mutex poisoned in timer callback");

            if state_guard.drain_start.is_none() {
                state_guard.drain_start = Some(std::time::Instant::now());
                tracing::info!(target: "quickclip", "[CAPTURE] Stop signal (timer), draining buffer for {:?}...", DRAIN_DURATION);
            }

            if let Some(drain_start) = state_guard.drain_start {
                if drain_start.elapsed() >= DRAIN_DURATION {
                    mainloop_for_timer.quit();
                }
            }
        }
    };

    {
        let timer = guard.mainloop().loop_().add_timer(timer_callback);
        timer.update_timer(
            Some(Duration::from_millis(100)),
            Some(Duration::from_millis(100)),
        );

        guard.run();
    }

    if let Some(err) = capture_error
        .lock()
        .expect("capture_error mutex poisoned")
        .take()
    {
        return Err(err.into());
    }

    let _ = frame_sender.send_timeout(CaptureMessage::EndOfStream, SEND_TIMEOUT);

    let state_guard = state
        .lock()
        .expect("CaptureState mutex poisoned after capture loop");

    if state_guard.frame_count == 0 {
        tracing::warn!(target: "quickclip", "[CAPTURE] No frames captured");
        return Err(CaptureError::NoFrames.into());
    }

    let actual_duration = state_guard
        .drain_start
        .map(|drain| drain.duration_since(recording_start).as_secs_f64())
        .unwrap_or_else(|| recording_start.elapsed().as_secs_f64());

    let source_framerate = if actual_duration > 0.1 && state_guard.frame_count > 0 {
        state_guard.frame_count as f64 / actual_duration
    } else {
        60.0
    };

    tracing::info!(target: "quickclip",
        "[CAPTURE] Complete: frames={}, size={}x{}, duration={:.2}s, fps={:.2}",
        state_guard.frame_count, state_guard.width, state_guard.height,
        actual_duration, source_framerate);

    let stats = CaptureStats {
        frame_count: state_guard.frame_count,
        source_framerate,
    };
    drop(state_guard);

    guard.mark_completed();

    drop(handle);
    tracing::debug!(target: "quickclip", "[PORTAL] Session handle dropped, portal thread will close");

    Ok(stats)
}
