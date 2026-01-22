//! Core file watcher manager for JSON-based plugins.
//!
//! Provides a centralized way to watch JSON files for changes and emit Tauri events.
//! Each plugin can register its own watcher with a custom event name.
//!
//! # Usage
//!
//! ```rust
//! // In plugin setup:
//! let config = WatchConfig {
//!     plugin_id: "tasks".to_string(),
//!     watch_path: PathBuf::from("/path/to/watch"),
//!     event_name: "tasks:storage-updated".to_string(),
//!     recursive: false,
//!     debounce_ms: 200,
//! };
//! watch_manager.start_watching(app_handle, config)?;
//!
//! // When plugin closes:
//! watch_manager.stop_watching("tasks")?;
//! ```

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebouncedEvent, Debouncer};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Default debounce duration in milliseconds.
const DEFAULT_DEBOUNCE_MS: u64 = 200;

/// Configuration for a plugin's file watcher.
#[derive(Clone, Debug)]
pub struct WatchConfig {
    /// Unique identifier for the plugin (e.g., "tasks", "quickclip").
    pub plugin_id: String,
    /// The path to watch (file or directory).
    pub watch_path: PathBuf,
    /// The Tauri event name to emit when changes are detected.
    pub event_name: String,
    /// Whether to watch subdirectories recursively.
    pub recursive: bool,
    /// Debounce duration in milliseconds.
    pub debounce_ms: u64,
}

impl WatchConfig {
    /// Creates a new WatchConfig with default debounce settings.
    pub fn new(
        plugin_id: impl Into<String>,
        watch_path: PathBuf,
        event_name: impl Into<String>,
    ) -> Self {
        Self {
            plugin_id: plugin_id.into(),
            watch_path,
            event_name: event_name.into(),
            recursive: false,
            debounce_ms: DEFAULT_DEBOUNCE_MS,
        }
    }

    /// Sets whether to watch recursively.
    pub fn recursive(mut self, recursive: bool) -> Self {
        self.recursive = recursive;
        self
    }

    /// Sets the debounce duration in milliseconds.
    pub fn debounce_ms(mut self, ms: u64) -> Self {
        self.debounce_ms = ms;
        self
    }
}

/// Payload emitted when a watched file changes.
#[derive(Clone, serde::Serialize)]
pub struct FileChangedPayload {
    /// The plugin that owns this watcher.
    pub plugin_id: String,
    /// The path of the changed file.
    pub path: String,
    /// The filename without extension (useful as an ID).
    pub file_stem: Option<String>,
}

/// Internal state for a single plugin's watcher.
struct PluginWatcher {
    /// The debounced watcher instance.
    debouncer: Debouncer<RecommendedWatcher>,
    /// The configuration used to create this watcher.
    config: WatchConfig,
    /// Sender to signal the event handler thread to stop.
    _stop_tx: Sender<()>,
}

/// Central manager for all plugin file watchers.
///
/// Maintains one watcher per plugin, allowing plugins to start watching
/// when they become active and stop when they close.
pub struct WatchManager {
    /// Map of plugin_id -> watcher.
    watchers: Mutex<HashMap<String, PluginWatcher>>,
}

impl WatchManager {
    /// Creates a new WatchManager.
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }

    /// Starts watching for a plugin.
    ///
    /// If the plugin already has a watcher running, this is a no-op.
    ///
    /// # Arguments
    /// * `app_handle` - Tauri app handle for emitting events.
    /// * `config` - Configuration for the watcher.
    ///
    /// # Returns
    /// Ok(()) on success, or an error message.
    pub fn start_watching(&self, app_handle: AppHandle, config: WatchConfig) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;

        // Already watching for this plugin
        if watchers.contains_key(&config.plugin_id) {
            tracing::debug!(
                target: "core::watch",
                plugin_id = %config.plugin_id,
                "Watcher already running"
            );
            return Ok(());
        }

        // Ensure the watch path exists
        if !config.watch_path.exists() {
            std::fs::create_dir_all(&config.watch_path).map_err(|e| {
                format!(
                    "Failed to create watch directory {}: {}",
                    config.watch_path.display(),
                    e
                )
            })?;
        }

        // Create channels for debounced events and stop signal
        let (event_tx, event_rx) = channel::<Result<Vec<DebouncedEvent>, notify::Error>>();
        let (stop_tx, stop_rx) = channel::<()>();

        // Create debounced watcher
        let mut debouncer = new_debouncer(Duration::from_millis(config.debounce_ms), event_tx)
            .map_err(|e| format!("Failed to create watcher: {}", e))?;

        // Start watching
        let recursive_mode = if config.recursive {
            RecursiveMode::Recursive
        } else {
            RecursiveMode::NonRecursive
        };

        debouncer
            .watcher()
            .watch(&config.watch_path, recursive_mode)
            .map_err(|e| format!("Failed to watch path: {}", e))?;

        // Spawn event handler thread
        let event_name = config.event_name.clone();
        let plugin_id = config.plugin_id.clone();
        let handle = app_handle.clone();

        std::thread::spawn(move || {
            handle_events(event_rx, stop_rx, handle, &plugin_id, &event_name);
        });

        tracing::info!(
            target: "core::watch",
            plugin_id = %config.plugin_id,
            path = %config.watch_path.display(),
            event_name = %config.event_name,
            "File watcher started"
        );

        watchers.insert(
            config.plugin_id.clone(),
            PluginWatcher {
                debouncer,
                config,
                _stop_tx: stop_tx,
            },
        );

        Ok(())
    }

    /// Stops watching for a plugin.
    ///
    /// If the plugin doesn't have a watcher running, this is a no-op.
    ///
    /// # Arguments
    /// * `plugin_id` - The plugin identifier.
    ///
    /// # Returns
    /// Ok(()) on success, or an error message.
    pub fn stop_watching(&self, plugin_id: &str) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;

        if let Some(mut watcher) = watchers.remove(plugin_id) {
            // Stop the watcher
            let _ = watcher
                .debouncer
                .watcher()
                .unwatch(&watcher.config.watch_path);

            tracing::info!(
                target: "core::watch",
                plugin_id = %plugin_id,
                "File watcher stopped"
            );
        }

        Ok(())
    }

    /// Checks if a plugin has an active watcher.
    pub fn is_watching(&self, plugin_id: &str) -> bool {
        self.watchers
            .lock()
            .map(|watchers| watchers.contains_key(plugin_id))
            .unwrap_or(false)
    }

    /// Returns the list of plugins currently being watched.
    pub fn active_plugins(&self) -> Vec<String> {
        self.watchers
            .lock()
            .map(|watchers| watchers.keys().cloned().collect())
            .unwrap_or_default()
    }

    /// Stops all watchers.
    pub fn stop_all(&self) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;

        for (plugin_id, mut watcher) in watchers.drain() {
            let _ = watcher
                .debouncer
                .watcher()
                .unwatch(&watcher.config.watch_path);
            tracing::info!(
                target: "core::watch",
                plugin_id = %plugin_id,
                "File watcher stopped (stop_all)"
            );
        }

        Ok(())
    }
}

impl Default for WatchManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Handles debounced file events and emits Tauri events.
fn handle_events(
    event_rx: Receiver<Result<Vec<DebouncedEvent>, notify::Error>>,
    stop_rx: Receiver<()>,
    app_handle: AppHandle,
    plugin_id: &str,
    event_name: &str,
) {
    loop {
        // Check for stop signal (non-blocking)
        if stop_rx.try_recv().is_ok() {
            tracing::debug!(
                target: "core::watch",
                plugin_id = %plugin_id,
                "Received stop signal"
            );
            break;
        }

        // Wait for events with timeout to allow checking stop signal
        match event_rx.recv_timeout(Duration::from_millis(100)) {
            Ok(Ok(events)) => {
                for event in events {
                    process_event(&event, &app_handle, plugin_id, event_name);
                }
            }
            Ok(Err(e)) => {
                tracing::error!(
                    target: "core::watch",
                    plugin_id = %plugin_id,
                    error = %e,
                    "Watcher error"
                );
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                // Continue loop to check stop signal
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                // Channel closed, watcher was dropped
                tracing::info!(
                    target: "core::watch",
                    plugin_id = %plugin_id,
                    "Watcher channel closed"
                );
                break;
            }
        }
    }
}

/// Processes a single file event.
fn process_event(
    event: &DebouncedEvent,
    app_handle: &AppHandle,
    plugin_id: &str,
    event_name: &str,
) {
    let path = &event.path;

    // Only process JSON files
    if path.extension().map_or(true, |ext| ext != "json") {
        return;
    }

    // Extract file stem (filename without extension)
    let file_stem = path.file_stem().and_then(|s| s.to_str()).map(String::from);

    tracing::debug!(
        target: "core::watch",
        plugin_id = %plugin_id,
        path = %path.display(),
        file_stem = ?file_stem,
        "File changed"
    );

    let payload = FileChangedPayload {
        plugin_id: plugin_id.to_string(),
        path: path.to_string_lossy().to_string(),
        file_stem,
    };

    if let Err(e) = app_handle.emit(event_name, payload) {
        tracing::error!(
            target: "core::watch",
            plugin_id = %plugin_id,
            error = %e,
            "Failed to emit file changed event"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_watch_config_builder() {
        let config = WatchConfig::new("test", PathBuf::from("/tmp"), "test:event")
            .recursive(true)
            .debounce_ms(500);

        assert_eq!(config.plugin_id, "test");
        assert_eq!(config.watch_path, PathBuf::from("/tmp"));
        assert_eq!(config.event_name, "test:event");
        assert!(config.recursive);
        assert_eq!(config.debounce_ms, 500);
    }

    #[test]
    fn test_watch_manager_default() {
        let manager = WatchManager::default();
        assert!(manager.active_plugins().is_empty());
        assert!(!manager.is_watching("test"));
    }
}
