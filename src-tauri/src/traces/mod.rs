mod cleanup;
mod guard;
mod trace;
mod types;
mod writer;

use std::fs;
use std::sync::mpsc::Sender;

use once_cell::sync::OnceCell;

use crate::shared::paths::get_log_dir;

pub use cleanup::cleanup_old_traces;
pub use guard::ContextGuard;
pub use trace::Trace;
pub use types::{LogEntry, LogLevel, TraceError};
pub use writer::LogWriter;

/// Global log writer instance
static LOG_WRITER: OnceCell<LogWriter> = OnceCell::new();

/// Must be called once during app setup, before any Trace is created.
pub fn init_tracing() {
    let traces_dir = get_log_dir().join("traces");
    if let Err(e) = fs::create_dir_all(&traces_dir) {
        eprintln!("Failed to create traces directory: {}", e);
    }

    cleanup_old_traces();

    let writer = LogWriter::spawn();
    LOG_WRITER
        .set(writer)
        .expect("init_tracing called more than once");
}

/// Get the global log writer sender. Panics if init_tracing() hasn't been called.
pub(crate) fn get_writer_tx() -> Sender<LogEntry> {
    LOG_WRITER
        .get()
        .expect("init_tracing() must be called before using traces")
        .sender()
}
