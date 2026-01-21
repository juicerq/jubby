use std::fs::OpenOptions;
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::Duration;

use chrono::Local;

use super::types::LogEntry;
use crate::shared::paths::get_log_dir;

const BUFFER_CAPACITY: usize = 32;
const FLUSH_INTERVAL_MS: u64 = 100;

/// Buffered log writer that writes to daily JSONL files
pub struct LogWriter {
    tx: Sender<LogEntry>,
}

impl LogWriter {
    /// Spawn the log writer thread and return a handle to send entries
    pub fn spawn() -> Self {
        let (tx, rx) = mpsc::channel::<LogEntry>();

        thread::spawn(move || {
            writer_loop(rx);
        });

        Self { tx }
    }

    /// Send a log entry to the writer (fire-and-forget)
    pub fn send(&self, entry: LogEntry) {
        let _ = self.tx.send(entry);
    }
}

fn writer_loop(rx: Receiver<LogEntry>) {
    let mut buffer: Vec<LogEntry> = Vec::with_capacity(BUFFER_CAPACITY);
    let timeout = Duration::from_millis(FLUSH_INTERVAL_MS);

    loop {
        match rx.recv_timeout(timeout) {
            Ok(entry) => {
                buffer.push(entry);
                if buffer.len() >= BUFFER_CAPACITY {
                    flush_buffer(&mut buffer);
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                if !buffer.is_empty() {
                    flush_buffer(&mut buffer);
                }
            }
            Err(RecvTimeoutError::Disconnected) => {
                if !buffer.is_empty() {
                    flush_buffer(&mut buffer);
                }
                break;
            }
        }
    }
}

fn flush_buffer(buffer: &mut Vec<LogEntry>) {
    let date = Local::now().format("%Y-%m-%d").to_string();
    let path = get_traces_path(&date);

    if let Err(e) = write_entries_to_file(&path, buffer) {
        eprintln!("Failed to write trace entries: {}", e);
    }

    buffer.clear();
}

fn get_traces_path(date: &str) -> PathBuf {
    get_log_dir().join("traces").join(format!("{}.jsonl", date))
}

fn write_entries_to_file(path: &PathBuf, entries: &[LogEntry]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;

    let mut writer = BufWriter::new(file);

    for entry in entries {
        if let Ok(json) = serde_json::to_string(entry) {
            writeln!(writer, "{}", json)?;
        }
    }

    writer.flush()?;
    Ok(())
}
