pub mod commands;
pub mod coordinator;
pub mod ffmpeg;
pub mod state;
pub mod writer;

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::thread::JoinHandle;
use tokio::sync::Mutex;

use super::errors::QuickClipError;
use super::types::AudioMode;
use writer::WriterResult;

struct RecordingSession {
    pub session_dir: PathBuf,
    pub start_time: std::time::Instant,
    pub video_path: PathBuf,
    pub thumbnail_path: PathBuf,
    pub recording_id: String,
    pub timestamp: i64,
    pub audio_mode: AudioMode,
}

pub struct RecorderState {
    is_recording: Arc<AtomicBool>,
    session: Arc<Mutex<Option<RecordingSession>>>,
    stop_signal: Mutex<Option<Arc<AtomicBool>>>,
    writer_handle: std::sync::Mutex<Option<JoinHandle<Result<WriterResult, QuickClipError>>>>,
    capture_handle:
        std::sync::Mutex<Option<JoinHandle<Result<super::capture::CaptureStats, QuickClipError>>>>,
}

impl RecorderState {
    pub fn new() -> Self {
        Self {
            is_recording: Arc::new(AtomicBool::new(false)),
            session: Arc::new(Mutex::new(None)),
            stop_signal: Mutex::new(None),
            writer_handle: std::sync::Mutex::new(None),
            capture_handle: std::sync::Mutex::new(None),
        }
    }
}

impl Default for RecorderState {
    fn default() -> Self {
        Self::new()
    }
}
