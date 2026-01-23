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
    cleanup_write_registry, get_folder_filename, get_tasks_dir, load_folders_index,
    should_suppress_event,
};
use super::types::Task;
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
    /// Uses Recursive mode to watch folder subdirectories containing task files.
    fn start(&mut self) -> Result<(), notify::Error> {
        self.debouncer
            .watcher()
            .watch(&self.watched_path, RecursiveMode::Recursive)
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

    // Check if this is a self-write that should be suppressed
    if should_suppress_event(&path.to_path_buf()) {
        tracing::debug!(
            target: "tasks::watcher",
            path = %path.display(),
            "Event suppressed (self-write)"
        );
        return;
    }

    let tasks_dir = get_tasks_dir();

    // Handle folders.json specially - emit with folder_id = "folders"
    let is_folders_index = path
        .file_name()
        .map_or(false, |name| name == "folders.json");

    if is_folders_index {
        tracing::debug!(
            target: "tasks::watcher",
            path = %path.display(),
            "Folders index changed (external write)"
        );

        // Reload folders and tags into store
        if let Some(store) = app_handle.try_state::<TasksStore>() {
            match load_folders_index() {
                Ok(index) => {
                    let mut data = store.write();
                    data.folders = index.folders;
                    data.tags = index.tags;
                    tracing::debug!(
                        target: "tasks::watcher",
                        "Folders index reloaded into store"
                    );
                }
                Err(e) => {
                    tracing::error!(
                        target: "tasks::watcher",
                        error = %e,
                        "Failed to reload folders index"
                    );
                }
            }
        }

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

    // Check if this is a task file inside a folder directory
    // Path structure: ~/.../tasks/{folder_filename}/{task_filename}.json
    let parent = match path.parent() {
        Some(p) => p,
        None => return,
    };

    // If parent is the tasks_dir itself, this is a file at root level (old format, ignore)
    if parent == tasks_dir {
        tracing::debug!(
            target: "tasks::watcher",
            path = %path.display(),
            "Ignoring file at tasks root (legacy format)"
        );
        return;
    }

    // Parent should be the folder directory, grandparent should be tasks_dir
    let grandparent = match parent.parent() {
        Some(p) => p,
        None => return,
    };

    if grandparent != tasks_dir {
        tracing::debug!(
            target: "tasks::watcher",
            path = %path.display(),
            "Ignoring file not in expected location"
        );
        return;
    }

    // Extract folder_filename from parent directory name
    let folder_filename = match parent.file_name().and_then(|s| s.to_str()) {
        Some(name) => name.to_string(),
        None => return,
    };

    // Extract task_filename from file name
    let task_filename = match path.file_stem().and_then(|s| s.to_str()) {
        Some(name) => name.to_string(),
        None => return,
    };

    // Look up the folder by filename to get the folder_id
    let folder_id = match find_folder_id_by_filename(&folder_filename) {
        Some(id) => id,
        None => {
            tracing::debug!(
                target: "tasks::watcher",
                folder_filename = %folder_filename,
                "No folder found for directory name"
            );
            return;
        }
    };

    tracing::debug!(
        target: "tasks::watcher",
        folder_id = %folder_id,
        folder_filename = %folder_filename,
        task_filename = %task_filename,
        path = %path.display(),
        "Task file changed detected (external write)"
    );

    // Reload the single task file with retry
    let task = match load_task_with_retry(path, &folder_id, &task_filename) {
        Ok(Some(task)) => task,
        Ok(None) => {
            // File was deleted - remove from store
            if let Some(store) = app_handle.try_state::<TasksStore>() {
                let mut data = store.write();
                let before_count = data.tasks.len();
                data.tasks
                    .retain(|t| !(t.folder_id == folder_id && t.filename == task_filename));
                let removed = before_count - data.tasks.len();
                if removed > 0 {
                    tracing::debug!(
                        target: "tasks::watcher",
                        folder_id = %folder_id,
                        task_filename = %task_filename,
                        "Task removed from store (file deleted)"
                    );
                }
            }

            // Emit event for frontend
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
            return;
        }
        Err(e) => {
            tracing::error!(
                target: "tasks::watcher",
                folder_id = %folder_id,
                task_filename = %task_filename,
                error = %e,
                "Failed to reload task file after retries"
            );
            return;
        }
    };

    // Update the in-memory store
    if let Some(store) = app_handle.try_state::<TasksStore>() {
        let mut data = store.write();

        // Find and update or add the task
        if let Some(existing_task) = data.tasks.iter_mut().find(|t| t.id == task.id) {
            // Update existing task
            *existing_task = task.clone();
            tracing::debug!(
                target: "tasks::watcher",
                task_id = %task.id,
                "Task updated in store"
            );
        } else {
            // Add new task
            data.tasks.push(task.clone());
            tracing::debug!(
                target: "tasks::watcher",
                task_id = %task.id,
                "Task added to store"
            );
        }
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

/// Loads a single task file with retry logic for mid-write scenarios.
///
/// When an external process (like an AI) writes to the JSON file, there may be
/// a brief moment where the file is incomplete or invalid. This function retries
/// with exponential backoff to handle such cases.
///
/// Returns Ok(None) if the file doesn't exist (was deleted).
fn load_task_with_retry(
    path: &PathBuf,
    folder_id: &str,
    task_filename: &str,
) -> Result<Option<Task>, Box<dyn std::error::Error + Send + Sync>> {
    // Check if file exists
    if !path.exists() {
        return Ok(None);
    }

    let mut last_error: Option<Box<dyn std::error::Error + Send + Sync>> = None;

    for attempt in 0..MAX_PARSE_RETRIES {
        match std::fs::read_to_string(path) {
            Ok(content) => match serde_json::from_str::<Task>(&content) {
                Ok(mut task) => {
                    task.folder_id = folder_id.to_string();
                    task.filename = task_filename.to_string();

                    if attempt > 0 {
                        tracing::debug!(
                            target: "tasks::watcher",
                            task_filename = %task_filename,
                            attempt = attempt + 1,
                            "Successfully loaded task after retry"
                        );
                    }
                    return Ok(Some(task));
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
                        task_filename = %task_filename,
                        attempt = attempt + 1,
                        error = %e,
                        "JSON parse failed, retrying..."
                    );

                    thread::sleep(Duration::from_millis(
                        PARSE_RETRY_BACKOFF_MS * (attempt as u64 + 1),
                    ));
                    last_error = Some(e.to_string().into());
                }
            },
            Err(e) => {
                if e.kind() == std::io::ErrorKind::NotFound {
                    return Ok(None);
                }
                last_error = Some(e.to_string().into());
                break;
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
