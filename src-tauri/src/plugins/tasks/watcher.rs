//! File watcher for tasks directory.
//!
//! Watches task JSON files for changes, reloads from disk, updates the in-memory store,
//! and emits Tauri events when modifications are detected.
//! Uses debouncing to avoid rapid event spam when editors write files in multiple operations.

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebouncedEvent, Debouncer};
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use super::storage::{
    cleanup_write_registry, get_folder_filename, get_tasks_dir, load_folder_data,
    load_folders_index, should_suppress_event,
};
use super::TasksStore;

const DEBOUNCE_DURATION_MS: u64 = 200;
const EVENT_NAME: &str = "tasks:storage-updated";

/// Maximum number of retries for JSON parse when file is mid-write.
const MAX_PARSE_RETRIES: u32 = 3;
/// Backoff duration between parse retries in milliseconds.
const PARSE_RETRY_BACKOFF_MS: u64 = 50;

/// Payload emitted when a tasks storage file changes and is reloaded.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUpdatedPayload {
    /// The folder ID whose storage was updated (extracted from filename).
    pub folder_id: String,
    /// Version timestamp (milliseconds since UNIX epoch) for cache invalidation.
    pub version: i64,
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

/// Handles debounced file events, reloads storage, and emits Tauri events.
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

/// Returns current timestamp in milliseconds since UNIX epoch.
fn current_version() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Processes a single file event: reloads storage and emits event.
fn process_event(event: &DebouncedEvent, app_handle: &AppHandle) {
    // Clean up expired write records periodically
    cleanup_write_registry();

    let path = &event.path;

    // Only process JSON files
    if path.extension().map_or(true, |ext| ext != "json") {
        return;
    }

    // Handle folders.json specially - emit with folder_id = "folders"
    let is_folders_index = path
        .file_name()
        .map_or(false, |name| name == "folders.json");

    if is_folders_index {
        // Check if this is a self-write that should be suppressed
        if should_suppress_event(&path.to_path_buf()) {
            tracing::debug!(
                target: "tasks::watcher",
                path = %path.display(),
                "Folders index event suppressed (self-write)"
            );
            return;
        }

        tracing::debug!(
            target: "tasks::watcher",
            path = %path.display(),
            "Folders index changed (external write)"
        );

        // Emit event with folder_id = "folders" for frontend to reload folder list
        let payload = StorageUpdatedPayload {
            folder_id: "folders".to_string(),
            version: current_version(),
        };

        if let Err(e) = app_handle.emit(EVENT_NAME, payload) {
            tracing::error!(
                target: "tasks::watcher",
                error = %e,
                "Failed to emit folders index updated event"
            );
        }
        return;
    }

    // Check if this is a self-write that should be suppressed
    if should_suppress_event(&path.to_path_buf()) {
        tracing::debug!(
            target: "tasks::watcher",
            path = %path.display(),
            "Event suppressed (self-write)"
        );
        return;
    }

    // Extract filename from path (e.g., "my-folder.json" -> "my-folder")
    let filename = match path.file_stem().and_then(|s| s.to_str()) {
        Some(name) => name.to_string(),
        None => return,
    };

    // Look up the folder by filename to get the folder_id
    let folder_id = match find_folder_id_by_filename(&filename) {
        Some(id) => id,
        None => {
            tracing::debug!(
                target: "tasks::watcher",
                filename = %filename,
                "No folder found for filename, may be a new or orphaned file"
            );
            return;
        }
    };

    tracing::debug!(
        target: "tasks::watcher",
        folder_id = %folder_id,
        filename = %filename,
        path = %path.display(),
        "File changed detected (external write)"
    );

    // Reload folder data with retry for mid-write scenarios
    let folder_data = match load_folder_data_with_retry(&filename, &folder_id) {
        Ok(data) => data,
        Err(e) => {
            tracing::error!(
                target: "tasks::watcher",
                folder_id = %folder_id,
                filename = %filename,
                error = %e,
                "Failed to reload folder data after retries"
            );
            return;
        }
    };

    // Update the in-memory store
    if let Some(store) = app_handle.try_state::<TasksStore>() {
        let mut data = store.write();

        // Remove old tasks and tags for this folder
        data.tasks.retain(|t| t.folder_id != folder_id);
        data.tags.retain(|t| t.folder_id != folder_id);

        // Add reloaded tasks and tags
        data.tasks.extend(folder_data.tasks);
        data.tags.extend(folder_data.tags);

        tracing::debug!(
            target: "tasks::watcher",
            folder_id = %folder_id,
            "In-memory store updated"
        );
    } else {
        tracing::warn!(
            target: "tasks::watcher",
            "TasksStore not available in app state"
        );
    }

    // Emit event with version for frontend cache invalidation
    let payload = StorageUpdatedPayload {
        folder_id,
        version: current_version(),
    };

    if let Err(e) = app_handle.emit(EVENT_NAME, payload) {
        tracing::error!(
            target: "tasks::watcher",
            error = %e,
            "Failed to emit storage updated event"
        );
    }
}

/// Finds a folder ID by its filename.
///
/// Loads the folders index and searches for a folder whose effective filename matches.
fn find_folder_id_by_filename(filename: &str) -> Option<String> {
    let index = match load_folders_index() {
        Ok(idx) => idx,
        Err(e) => {
            tracing::error!(
                target: "tasks::watcher",
                error = %e,
                "Failed to load folders index"
            );
            return None;
        }
    };

    for folder in &index.folders {
        let folder_filename = get_folder_filename(folder);
        if folder_filename == filename {
            return Some(folder.id.clone());
        }
    }

    None
}

/// Loads folder data with retry logic for mid-write scenarios.
///
/// When an external process (like an AI) writes to the JSON file, there may be
/// a brief moment where the file is incomplete or invalid. This function retries
/// with exponential backoff to handle such cases.
fn load_folder_data_with_retry(
    filename: &str,
    folder_id: &str,
) -> Result<super::types::FolderData, Box<dyn std::error::Error + Send + Sync>> {
    let mut last_error: Option<Box<dyn std::error::Error + Send + Sync>> = None;

    for attempt in 0..MAX_PARSE_RETRIES {
        match load_folder_data(filename, folder_id) {
            Ok(data) => {
                if attempt > 0 {
                    tracing::debug!(
                        target: "tasks::watcher",
                        folder_id = %folder_id,
                        filename = %filename,
                        attempt = attempt + 1,
                        "Successfully loaded folder data after retry"
                    );
                }
                return Ok(data);
            }
            Err(e) => {
                let is_parse_error = e.to_string().contains("expected")
                    || e.to_string().contains("EOF")
                    || e.to_string().contains("syntax");

                if !is_parse_error || attempt == MAX_PARSE_RETRIES - 1 {
                    last_error = Some(e.to_string().into());
                    break;
                }

                tracing::debug!(
                    target: "tasks::watcher",
                    folder_id = %folder_id,
                    filename = %filename,
                    attempt = attempt + 1,
                    error = %e,
                    "JSON parse failed, retrying..."
                );

                // Exponential backoff: 50ms, 100ms, 150ms
                thread::sleep(Duration::from_millis(
                    PARSE_RETRY_BACKOFF_MS * (attempt as u64 + 1),
                ));
                last_error = Some(e.to_string().into());
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "Unknown error".into()))
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
