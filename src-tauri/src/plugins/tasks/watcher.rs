//! File watcher for tasks directory.
//!
//! Watches task JSON files for changes and emits Tauri events when modifications are detected.
//! Uses debouncing to avoid rapid event spam when editors write files in multiple operations.

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebouncedEvent, Debouncer};
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use super::storage::get_tasks_dir;

const DEBOUNCE_DURATION_MS: u64 = 200;
const EVENT_NAME: &str = "tasks:file-changed";

/// Payload emitted when a tasks file changes.
#[derive(Clone, serde::Serialize)]
pub struct FileChangedPayload {
    /// The folder ID whose file changed (extracted from filename).
    pub folder_id: String,
    /// The path of the changed file.
    pub path: String,
}

/// Manages file watchers for the tasks directory.
///
/// The watcher monitors the entire tasks directory and emits events
/// when individual folder JSON files are modified.
pub struct TasksFileWatcher {
    /// The debounced watcher instance.
    debouncer: Debouncer<RecommendedWatcher>,
    /// The tasks directory being watched.
    watched_path: PathBuf,
}

impl TasksFileWatcher {
    /// Creates a new file watcher for the tasks directory.
    ///
    /// # Arguments
    /// * `app_handle` - Tauri app handle for emitting events.
    ///
    /// # Returns
    /// A new TasksFileWatcher instance, or an error if the watcher could not be created.
    pub fn new(app_handle: AppHandle) -> Result<Self, notify::Error> {
        let tasks_dir = get_tasks_dir();

        // Ensure the directory exists
        if !tasks_dir.exists() {
            std::fs::create_dir_all(&tasks_dir).map_err(|e| {
                notify::Error::generic(&format!("Failed to create tasks directory: {}", e))
            })?;
        }

        let (tx, rx) = channel::<Result<Vec<DebouncedEvent>, notify::Error>>();

        // Create debounced watcher
        let debouncer = new_debouncer(Duration::from_millis(DEBOUNCE_DURATION_MS), tx)?;

        let watched_path = tasks_dir.clone();

        // Spawn event handler thread
        let handle = app_handle.clone();
        std::thread::spawn(move || {
            handle_events(rx, handle);
        });

        let mut watcher = Self {
            debouncer,
            watched_path,
        };

        // Start watching
        watcher.start()?;

        tracing::info!(
            target: "tasks::watcher",
            path = %watcher.watched_path.display(),
            "File watcher started"
        );

        Ok(watcher)
    }

    /// Starts watching the tasks directory.
    fn start(&mut self) -> Result<(), notify::Error> {
        self.debouncer
            .watcher()
            .watch(&self.watched_path, RecursiveMode::NonRecursive)
    }

    /// Stops watching the tasks directory.
    pub fn stop(&mut self) -> Result<(), notify::Error> {
        self.debouncer.watcher().unwatch(&self.watched_path)
    }
}

/// Handles debounced file events and emits Tauri events.
fn handle_events(rx: Receiver<Result<Vec<DebouncedEvent>, notify::Error>>, app_handle: AppHandle) {
    loop {
        match rx.recv() {
            Ok(Ok(events)) => {
                for event in events {
                    process_event(&event, &app_handle);
                }
            }
            Ok(Err(e)) => {
                tracing::error!(
                    target: "tasks::watcher",
                    error = %e,
                    "Watcher error"
                );
            }
            Err(_) => {
                // Channel closed, watcher was dropped
                tracing::info!(
                    target: "tasks::watcher",
                    "Watcher channel closed, stopping event handler"
                );
                break;
            }
        }
    }
}

/// Processes a single file event.
fn process_event(event: &DebouncedEvent, app_handle: &AppHandle) {
    let path = &event.path;

    // Only process JSON files
    if path.extension().map_or(true, |ext| ext != "json") {
        return;
    }

    // Skip folders.json - we only care about folder data files
    if path
        .file_name()
        .map_or(false, |name| name == "folders.json")
    {
        return;
    }

    // Extract folder ID from filename (e.g., "abc-123.json" -> "abc-123")
    let folder_id = match path.file_stem().and_then(|s| s.to_str()) {
        Some(id) => id.to_string(),
        None => return,
    };

    tracing::debug!(
        target: "tasks::watcher",
        folder_id = %folder_id,
        path = %path.display(),
        "File changed detected"
    );

    let payload = FileChangedPayload {
        folder_id,
        path: path.to_string_lossy().to_string(),
    };

    if let Err(e) = app_handle.emit(EVENT_NAME, payload) {
        tracing::error!(
            target: "tasks::watcher",
            error = %e,
            "Failed to emit file changed event"
        );
    }
}

/// Thread-safe wrapper for managing the tasks file watcher.
pub struct WatcherState {
    watcher: Mutex<Option<TasksFileWatcher>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watcher: Mutex::new(None),
        }
    }

    /// Starts the file watcher if not already running.
    pub fn start(&self, app_handle: AppHandle) -> Result<(), String> {
        let mut guard = self.watcher.lock().map_err(|e| e.to_string())?;

        if guard.is_some() {
            tracing::debug!(
                target: "tasks::watcher",
                "Watcher already running"
            );
            return Ok(());
        }

        let watcher = TasksFileWatcher::new(app_handle).map_err(|e| e.to_string())?;
        *guard = Some(watcher);

        Ok(())
    }

    /// Stops the file watcher if running.
    pub fn stop(&self) -> Result<(), String> {
        let mut guard = self.watcher.lock().map_err(|e| e.to_string())?;

        if let Some(mut watcher) = guard.take() {
            watcher.stop().map_err(|e| e.to_string())?;
            tracing::info!(
                target: "tasks::watcher",
                "File watcher stopped"
            );
        }

        Ok(())
    }

    /// Returns true if the watcher is currently running.
    pub fn is_running(&self) -> bool {
        self.watcher
            .lock()
            .map(|guard| guard.is_some())
            .unwrap_or(false)
    }
}

impl Default for WatcherState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_watcher_state_default() {
        let state = WatcherState::default();
        assert!(!state.is_running());
    }
}
