//! RecordingCoordinator - single owner actor for recording lifecycle.
//!
//! The coordinator owns all recording resources (portal handle, capture thread, writer thread)
//! and processes events through the state machine. This eliminates shared mutexes between threads
//! and ensures proper cleanup order.
//!
//! Architecture:
//! - Tauri commands send Commands to coordinator via command_tx
//! - Capture/writer threads send Events to coordinator via event_tx
//! - Coordinator processes commands/events and executes SideEffects
//! - Frontend receives state changes via Tauri events ('quickclip:state-change')

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot};

use super::super::capture::{
    run_capture_loop, CaptureMessage, CaptureSource, CaptureStats, ScreencastSession,
};
use super::super::errors::{CaptureError, EncodingError, QuickClipError};
use super::super::persistence::{
    get_sessions_dir, get_thumbnails_dir, get_videos_dir, save_recording, Recording,
};
use super::super::types::{AudioMode, Framerate, ResolutionScale};
use super::ffmpeg::{check_ffmpeg, cleanup_session_dir, generate_thumbnail};
use super::state::{transition, RecordingEvent, RecordingState, SideEffect};
use super::writer::{spawn_writer_thread, WriterResult};

/// Commands sent from Tauri IPC to coordinator.
#[derive(Debug)]
pub enum Command {
    Start {
        resolution_scale: ResolutionScale,
        framerate: Framerate,
        audio_mode: AudioMode,
        response_tx: oneshot::Sender<Result<(), QuickClipError>>,
    },
    Stop {
        response_tx: oneshot::Sender<Result<Recording, QuickClipError>>,
    },
    Status {
        response_tx: oneshot::Sender<RecordingStatus>,
    },
}

/// Events sent from worker threads to coordinator.
#[derive(Debug)]
pub enum WorkerEvent {
    PortalReady {
        session: ScreencastSession,
        resolution: (u32, u32),
    },
    PortalFailed {
        error: QuickClipError,
    },
    CaptureCompleted {
        stats: CaptureStats,
    },
    CaptureFailed {
        error: QuickClipError,
    },
    EncodingCompleted {
        result: WriterResult,
    },
    EncodingFailed {
        error: QuickClipError,
    },
}

/// Recording status for frontend.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingStatus {
    pub is_recording: bool,
    pub is_starting: bool,
    pub is_stopping: bool,
    pub frame_count: u32,
    pub elapsed_seconds: f64,
    pub resolution: Option<(u32, u32)>,
    pub error: Option<String>,
    pub started_at_timestamp: Option<f64>,
}

/// Session data for an active recording.
struct RecordingSession {
    session_dir: PathBuf,
    video_path: PathBuf,
    thumbnail_path: PathBuf,
    recording_id: String,
    timestamp: i64,
    audio_mode: AudioMode,
}

/// Handles for worker threads.
struct WorkerHandles {
    stop_signal: Arc<AtomicBool>,
    capture_handle: Option<JoinHandle<Result<CaptureStats, QuickClipError>>>,
    writer_handle: Option<JoinHandle<Result<WriterResult, QuickClipError>>>,
    /// Portal session (owns the portal thread - dropping closes it).
    portal_session: Option<ScreencastSession>,
}

impl Default for WorkerHandles {
    fn default() -> Self {
        Self {
            stop_signal: Arc::new(AtomicBool::new(false)),
            capture_handle: None,
            writer_handle: None,
            portal_session: None,
        }
    }
}

pub struct RecordingCoordinator {
    app_handle: AppHandle,
    state: RecordingState,
    handles: WorkerHandles,
    session: Option<RecordingSession>,
    pending_start_response: Option<oneshot::Sender<Result<(), QuickClipError>>>,
    pending_stop_response: Option<oneshot::Sender<Result<Recording, QuickClipError>>>,
    pending_config: Option<(ResolutionScale, Framerate, AudioMode)>,
    writer_result: Option<WriterResult>,
    capture_stats: Option<CaptureStats>,
    command_rx: mpsc::Receiver<Command>,
    event_rx: mpsc::Receiver<WorkerEvent>,
    event_tx: mpsc::Sender<WorkerEvent>,
}

impl RecordingCoordinator {
    pub fn new(app_handle: AppHandle) -> (Self, mpsc::Sender<Command>) {
        let (command_tx, command_rx) = mpsc::channel(16);
        let (event_tx, event_rx) = mpsc::channel(64);

        let coordinator = Self {
            app_handle,
            state: RecordingState::Idle,
            handles: WorkerHandles::default(),
            session: None,
            pending_start_response: None,
            pending_stop_response: None,
            pending_config: None,
            writer_result: None,
            capture_stats: None,
            command_rx,
            event_rx,
            event_tx,
        };

        (coordinator, command_tx)
    }

    /// Main event loop. Run this as a tokio task.
    pub async fn run(mut self) {
        tracing::info!(target: "quickclip", "[COORDINATOR] Starting event loop");

        loop {
            tokio::select! {
                Some(cmd) = self.command_rx.recv() => {
                    self.handle_command(cmd).await;
                }
                Some(event) = self.event_rx.recv() => {
                    self.handle_worker_event(event).await;
                }
                else => {
                    tracing::info!(target: "quickclip", "[COORDINATOR] All channels closed, shutting down");
                    break;
                }
            }
        }

        self.cleanup();
    }

    async fn handle_command(&mut self, cmd: Command) {
        match cmd {
            Command::Start {
                resolution_scale,
                framerate,
                audio_mode,
                response_tx,
            } => {
                self.handle_start(resolution_scale, framerate, audio_mode, response_tx)
                    .await;
            }
            Command::Stop { response_tx } => {
                self.handle_stop(response_tx).await;
            }
            Command::Status { response_tx } => {
                let status = self.get_status();
                let _ = response_tx.send(status);
            }
        }
    }

    async fn handle_start(
        &mut self,
        resolution_scale: ResolutionScale,
        framerate: Framerate,
        audio_mode: AudioMode,
        response_tx: oneshot::Sender<Result<(), QuickClipError>>,
    ) {
        if let Err(e) = check_ffmpeg() {
            let _ = response_tx.send(Err(e));
            return;
        }

        if self.state.is_active() {
            let _ = response_tx.send(Err(QuickClipError::AlreadyRecording));
            return;
        }

        let event = RecordingEvent::StartRequested;
        let (new_state, effects) = transition(self.state.clone(), event);
        self.state = new_state;

        self.pending_start_response = Some(response_tx);
        self.pending_config = Some((resolution_scale, framerate, audio_mode));

        for effect in effects {
            self.execute_effect(effect).await;
        }
    }

    async fn handle_stop(&mut self, response_tx: oneshot::Sender<Result<Recording, QuickClipError>>) {
        if !self.state.is_active() {
            let _ = response_tx.send(Err(QuickClipError::NotRecording));
            return;
        }

        self.pending_stop_response = Some(response_tx);

        let event = RecordingEvent::StopRequested;
        let (new_state, effects) = transition(self.state.clone(), event);
        self.state = new_state;

        for effect in effects {
            self.execute_effect(effect).await;
        }
    }

    async fn handle_worker_event(&mut self, event: WorkerEvent) {
        let recording_event = match event {
            WorkerEvent::PortalReady { session, resolution } => {
                self.handles.portal_session = Some(session);
                RecordingEvent::PortalReady { resolution }
            }
            WorkerEvent::PortalFailed { error } => RecordingEvent::PortalFailed { error },
            WorkerEvent::CaptureCompleted { stats } => {
                self.capture_stats = Some(stats.clone());
                RecordingEvent::CaptureCompleted {
                    frame_count: stats.frame_count,
                }
            }
            WorkerEvent::CaptureFailed { error } => RecordingEvent::CaptureFailed { error },
            WorkerEvent::EncodingCompleted { result } => {
                self.writer_result = Some(result);
                RecordingEvent::EncodingCompleted
            }
            WorkerEvent::EncodingFailed { error } => RecordingEvent::EncodingFailed { error },
        };

        let (new_state, effects) = transition(self.state.clone(), recording_event);
        self.state = new_state;

        for effect in effects {
            self.execute_effect(effect).await;
        }
    }

    async fn execute_effect(&mut self, effect: SideEffect) {
        match effect {
            SideEffect::InitiatePortal => {
                self.initiate_portal().await;
            }
            SideEffect::StartCapture { resolution } => {
                self.start_capture(resolution).await;
            }
            SideEffect::SignalStop => {
                self.signal_stop();
            }
            SideEffect::EmitStateChange { state } => {
                self.emit_state_change(&state);
            }
            SideEffect::Cleanup => {
                self.cleanup();
            }
            SideEffect::SaveRecording => {
                self.save_recording().await;
            }
        }
    }

    async fn initiate_portal(&mut self) {
        let event_tx = self.event_tx.clone();

        std::thread::spawn(move || {
            tracing::info!(target: "quickclip", "[COORDINATOR] Initiating portal session...");

            match ScreencastSession::new(CaptureSource::Fullscreen) {
                Ok(session) => {
                    let _ = event_tx.blocking_send(WorkerEvent::PortalReady {
                        session,
                        resolution: (0, 0),
                    });
                }
                Err(e) => {
                    tracing::error!(target: "quickclip", "[COORDINATOR] Portal failed: {}", e);
                    let _ = event_tx.blocking_send(WorkerEvent::PortalFailed { error: e });
                }
            }
        });
    }

    async fn start_capture(&mut self, _resolution: (u32, u32)) {
        let Some((resolution_scale, framerate, audio_mode)) = self.pending_config.take() else {
            tracing::error!(target: "quickclip", "[COORDINATOR] No config for start_capture");
            return;
        };

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let session_dir = match get_sessions_dir() {
            Ok(dir) => dir.join(format!("session_{}", timestamp)),
            Err(e) => {
                self.fail_start(e);
                return;
            }
        };

        if let Err(e) = std::fs::create_dir_all(&session_dir) {
            self.fail_start(QuickClipError::StorageError(e.to_string()));
            return;
        }

        let recording_id = uuid::Uuid::new_v4().to_string();
        let video_filename = format!("recording_{}.mp4", timestamp);
        let thumbnail_filename = format!("thumb_{}.png", timestamp);

        let video_path = match get_videos_dir() {
            Ok(dir) => dir.join(&video_filename),
            Err(e) => {
                self.fail_start(e);
                return;
            }
        };

        let thumbnail_path = match get_thumbnails_dir() {
            Ok(dir) => dir.join(&thumbnail_filename),
            Err(e) => {
                self.fail_start(e);
                return;
            }
        };

        self.session = Some(RecordingSession {
            session_dir,
            video_path: video_path.clone(),
            thumbnail_path: thumbnail_path.clone(),
            recording_id,
            timestamp,
            audio_mode,
        });

        let Some(portal_session) = self.handles.portal_session.take() else {
            self.fail_start(CaptureError::InitFailed("No portal session".to_string()).into());
            return;
        };

        let (frame_sender, frame_receiver) = crossbeam_channel::bounded::<CaptureMessage>(30);

        let event_tx_writer = self.event_tx.clone();
        let writer_handle = spawn_writer_thread(
            frame_receiver,
            video_path,
            resolution_scale,
            framerate,
            audio_mode,
        );

        let writer_handle = std::thread::spawn(move || {
            let result = writer_handle.join();
            match result {
                Ok(Ok(writer_result)) => {
                    let _ = event_tx_writer.blocking_send(WorkerEvent::EncodingCompleted {
                        result: writer_result,
                    });
                    Ok(WriterResult {
                        duration: 0.0,
                        frame_count: 0,
                    })
                }
                Ok(Err(e)) => {
                    let _ = event_tx_writer.blocking_send(WorkerEvent::EncodingFailed { error: e.clone() });
                    Err(e)
                }
                Err(_) => {
                    let err = EncodingError::WriteFailed("Writer thread panicked".to_string());
                    let _ = event_tx_writer.blocking_send(WorkerEvent::EncodingFailed {
                        error: err.clone().into(),
                    });
                    Err(err.into())
                }
            }
        });

        let stop_signal = Arc::new(AtomicBool::new(false));
        let stop_signal_clone = stop_signal.clone();
        let event_tx_capture = self.event_tx.clone();
        let recording_start = Instant::now();

        let capture_handle = std::thread::spawn(move || {
            let result = run_capture_loop(portal_session, stop_signal_clone, recording_start, frame_sender);
            match &result {
                Ok(stats) => {
                    let _ = event_tx_capture.blocking_send(WorkerEvent::CaptureCompleted {
                        stats: CaptureStats {
                            frame_count: stats.frame_count,
                            source_framerate: stats.source_framerate,
                        },
                    });
                }
                Err(e) => {
                    let _ = event_tx_capture.blocking_send(WorkerEvent::CaptureFailed {
                        error: e.clone(),
                    });
                }
            }
            result
        });

        self.handles.stop_signal = stop_signal;
        self.handles.capture_handle = Some(capture_handle);
        self.handles.writer_handle = Some(writer_handle);

        if let Some(response_tx) = self.pending_start_response.take() {
            let _ = response_tx.send(Ok(()));
        }

        tracing::info!(target: "quickclip", "[COORDINATOR] Recording started");
    }

    fn signal_stop(&mut self) {
        tracing::info!(target: "quickclip", "[COORDINATOR] Signaling stop...");
        self.handles.stop_signal.store(true, Ordering::SeqCst);
    }

    fn emit_state_change(&self, state: &RecordingState) {
        let status = self.build_status_from_state(state);
        tracing::debug!(target: "quickclip", "[COORDINATOR] Emitting state change: {:?}", status);

        if let Err(e) = self.app_handle.emit("quickclip:state-change", &status) {
            tracing::error!(target: "quickclip", "[COORDINATOR] Failed to emit state-change: {}", e);
        }

        // Emit legacy events for backwards compatibility with tray icon
        match state {
            RecordingState::Recording { .. } => {
                let _ = self.app_handle.emit("quickclip:recording-started", ());
            }
            RecordingState::Idle => {
                let _ = self.app_handle.emit("quickclip:recording-stopped", ());
            }
            _ => {}
        }
    }

    fn build_status_from_state(&self, state: &RecordingState) -> RecordingStatus {
        let elapsed_seconds = state.elapsed().map_or(0.0, |d| d.as_secs_f64());

        let started_at_timestamp = state.started_at().map(|instant| {
            let elapsed = instant.elapsed();
            let start_system_time = SystemTime::now() - elapsed;
            start_system_time
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs_f64()
        });

        match state {
            RecordingState::Idle => RecordingStatus {
                is_recording: false,
                is_starting: false,
                is_stopping: false,
                frame_count: 0,
                elapsed_seconds: 0.0,
                resolution: None,
                error: None,
                started_at_timestamp: None,
            },
            RecordingState::Starting { .. } => RecordingStatus {
                is_recording: false,
                is_starting: true,
                is_stopping: false,
                frame_count: 0,
                elapsed_seconds,
                resolution: None,
                error: None,
                started_at_timestamp,
            },
            RecordingState::Recording {
                frame_count,
                resolution,
                ..
            } => RecordingStatus {
                is_recording: true,
                is_starting: false,
                is_stopping: false,
                frame_count: *frame_count,
                elapsed_seconds,
                resolution: Some(*resolution),
                error: None,
                started_at_timestamp,
            },
            RecordingState::Stopping { .. } => RecordingStatus {
                is_recording: false,
                is_starting: false,
                is_stopping: true,
                frame_count: 0,
                elapsed_seconds,
                resolution: None,
                error: None,
                started_at_timestamp,
            },
            RecordingState::Failed { error, .. } => RecordingStatus {
                is_recording: false,
                is_starting: false,
                is_stopping: false,
                frame_count: 0,
                elapsed_seconds: 0.0,
                resolution: None,
                error: Some(error.clone()),
                started_at_timestamp: None,
            },
        }
    }

    fn cleanup(&mut self) {
        tracing::info!(target: "quickclip", "[COORDINATOR] Cleaning up resources...");

        self.handles.stop_signal.store(true, Ordering::SeqCst);

        if let Some(handle) = self.handles.writer_handle.take() {
            tracing::debug!(target: "quickclip", "[COORDINATOR] Waiting for writer thread...");
            let _ = handle.join();
        }

        if let Some(handle) = self.handles.capture_handle.take() {
            tracing::debug!(target: "quickclip", "[COORDINATOR] Waiting for capture thread...");
            let _ = handle.join();
        }

        self.handles.portal_session = None;

        if let Some(ref session) = self.session {
            cleanup_session_dir(&session.session_dir);
        }

        self.handles = WorkerHandles::default();

        if let Some(response_tx) = self.pending_start_response.take() {
            let _ = response_tx.send(Err(QuickClipError::NotRecording));
        }

        if let Some(response_tx) = self.pending_stop_response.take() {
            let _ = response_tx.send(Err(QuickClipError::NotRecording));
        }

        tracing::info!(target: "quickclip", "[COORDINATOR] Cleanup complete");
    }

    async fn save_recording(&mut self) {
        let Some(session) = self.session.take() else {
            tracing::error!(target: "quickclip", "[COORDINATOR] No session for save_recording");
            self.fail_stop(QuickClipError::NotRecording);
            return;
        };

        let Some(writer_result) = self.writer_result.take() else {
            tracing::error!(target: "quickclip", "[COORDINATOR] No writer result for save_recording");
            self.fail_stop(EncodingError::WriteFailed("No writer result".to_string()).into());
            return;
        };

        let video_path = session.video_path.clone();
        let thumbnail_path = session.thumbnail_path.clone();

        let thumbnail_result = tokio::task::spawn_blocking(move || {
            generate_thumbnail(&video_path, &thumbnail_path)
        })
        .await;

        if let Err(e) = thumbnail_result {
            tracing::warn!(target: "quickclip", "[COORDINATOR] Thumbnail generation failed: {}", e);
        }

        match save_recording(
            session.recording_id.clone(),
            session.video_path.to_string_lossy().to_string(),
            session.thumbnail_path.to_string_lossy().to_string(),
            writer_result.duration,
            session.timestamp,
            session.audio_mode,
        ) {
            Ok(recording) => {
                tracing::info!(target: "quickclip",
                    "[COORDINATOR] Recording saved: id={}, duration={:.2}s",
                    recording.id, writer_result.duration);

                if let Some(response_tx) = self.pending_stop_response.take() {
                    let _ = response_tx.send(Ok(recording));
                }
            }
            Err(e) => {
                tracing::error!(target: "quickclip", "[COORDINATOR] Failed to save recording: {}", e);
                self.fail_stop(e);
            }
        }

        cleanup_session_dir(&session.session_dir);

        self.state = RecordingState::Idle;
        self.writer_result = None;
        self.capture_stats = None;
    }

    fn emit_error(&self, error: &str) {
        if let Err(e) = self.app_handle.emit("quickclip:error", error) {
            tracing::error!(target: "quickclip", "[COORDINATOR] Failed to emit error: {}", e);
        }
    }

    fn fail_start(&mut self, error: QuickClipError) {
        tracing::error!(target: "quickclip", "[COORDINATOR] Start failed: {}", error);
        self.emit_error(&error.to_string());

        if let Some(response_tx) = self.pending_start_response.take() {
            let _ = response_tx.send(Err(error.clone()));
        }

        let event = RecordingEvent::PortalFailed { error };
        let (new_state, _) = transition(self.state.clone(), event);
        self.state = new_state;

        self.cleanup();
    }

    fn fail_stop(&mut self, error: QuickClipError) {
        tracing::error!(target: "quickclip", "[COORDINATOR] Stop failed: {}", error);
        self.emit_error(&error.to_string());

        if let Some(response_tx) = self.pending_stop_response.take() {
            let _ = response_tx.send(Err(error));
        }

        self.state = RecordingState::Idle;
    }

    fn get_status(&self) -> RecordingStatus {
        self.build_status_from_state(&self.state)
    }
}

/// Handle to send commands to the coordinator.
#[derive(Clone)]
pub struct CoordinatorHandle {
    command_tx: mpsc::Sender<Command>,
}

impl CoordinatorHandle {
    pub fn new(command_tx: mpsc::Sender<Command>) -> Self {
        Self { command_tx }
    }

    pub async fn start(
        &self,
        resolution_scale: ResolutionScale,
        framerate: Framerate,
        audio_mode: AudioMode,
    ) -> Result<(), QuickClipError> {
        let (response_tx, response_rx) = oneshot::channel();

        self.command_tx
            .send(Command::Start {
                resolution_scale,
                framerate,
                audio_mode,
                response_tx,
            })
            .await
            .map_err(|_| QuickClipError::NotRecording)?;

        response_rx
            .await
            .map_err(|_| QuickClipError::NotRecording)?
    }

    pub async fn stop(&self) -> Result<Recording, QuickClipError> {
        let (response_tx, response_rx) = oneshot::channel();

        self.command_tx
            .send(Command::Stop { response_tx })
            .await
            .map_err(|_| QuickClipError::NotRecording)?;

        response_rx
            .await
            .map_err(|_| QuickClipError::NotRecording)?
    }

    pub async fn status(&self) -> RecordingStatus {
        let (response_tx, response_rx) = oneshot::channel();

        if self
            .command_tx
            .send(Command::Status { response_tx })
            .await
            .is_err()
        {
            return RecordingStatus {
                is_recording: false,
                is_starting: false,
                is_stopping: false,
                frame_count: 0,
                elapsed_seconds: 0.0,
                resolution: None,
                error: Some("Coordinator not running".to_string()),
                started_at_timestamp: None,
            };
        }

        response_rx.await.unwrap_or(RecordingStatus {
            is_recording: false,
            is_starting: false,
            is_stopping: false,
            frame_count: 0,
            elapsed_seconds: 0.0,
            resolution: None,
            error: Some("Coordinator not responding".to_string()),
            started_at_timestamp: None,
        })
    }
}
