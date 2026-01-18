use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::fmt::MakeWriter;
use tracing_subscriber::prelude::*;
use tracing_subscriber::EnvFilter;

/// Guards that must be kept alive to ensure logs are flushed
pub struct LoggingGuards {
    _guards: Vec<WorkerGuard>,
}

/// Get the logs directory path following XDG Base Directory Specification
pub fn get_log_dir() -> PathBuf {
    if let Ok(xdg_data) = std::env::var("XDG_DATA_HOME") {
        return PathBuf::from(xdg_data).join("jubby").join("logs");
    }

    let home = std::env::var("HOME").expect("HOME environment variable must be set");
    PathBuf::from(home)
        .join(".local")
        .join("share")
        .join("jubby")
        .join("logs")
}

/// Multi-target writer that routes logs to different files based on target
struct PluginWriter {
    writers: HashMap<String, tracing_appender::non_blocking::NonBlocking>,
    system_writer: tracing_appender::non_blocking::NonBlocking,
}

impl PluginWriter {
    fn new(
        writers: HashMap<String, tracing_appender::non_blocking::NonBlocking>,
        system_writer: tracing_appender::non_blocking::NonBlocking,
    ) -> Self {
        Self {
            writers,
            system_writer,
        }
    }
}

impl<'a> MakeWriter<'a> for PluginWriter {
    type Writer = Box<dyn std::io::Write + 'a>;

    fn make_writer(&'a self) -> Self::Writer {
        Box::new(self.system_writer.clone())
    }

    fn make_writer_for(&'a self, meta: &tracing::Metadata<'_>) -> Self::Writer {
        let target = meta.target();

        // Check if target matches any plugin
        for (plugin_name, writer) in &self.writers {
            if target == plugin_name || target.starts_with(&format!("{}::", plugin_name)) {
                return Box::new(writer.clone());
            }
        }

        // Default to system writer
        Box::new(self.system_writer.clone())
    }
}

/// Initialize the logging system with per-plugin log files
pub fn init_logging() -> LoggingGuards {
    let log_dir = get_log_dir();

    // Create logs directory if it doesn't exist
    if !log_dir.exists() {
        std::fs::create_dir_all(&log_dir).expect("Failed to create logs directory");
    }

    let mut guards = Vec::new();
    let mut plugin_writers = HashMap::new();

    // Known plugins that get their own log files
    let plugins = ["quickclip", "todo"];

    // Create non-blocking writers for each plugin
    for plugin in plugins {
        let file_appender = RollingFileAppender::new(Rotation::DAILY, &log_dir, format!("{}.log", plugin));
        let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
        plugin_writers.insert(plugin.to_string(), non_blocking);
        guards.push(guard);
    }

    // System log writer (default)
    let system_appender = RollingFileAppender::new(Rotation::DAILY, &log_dir, "system.log");
    let (system_writer, system_guard) = tracing_appender::non_blocking(system_appender);
    guards.push(system_guard);

    // Create the multi-target writer
    let plugin_writer = PluginWriter::new(plugin_writers, system_writer);

    // Build the subscriber with env filter
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    let subscriber = tracing_subscriber::registry()
        .with(env_filter)
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(plugin_writer)
                .with_ansi(false)
                .with_target(true)
                .with_thread_ids(false)
                .with_thread_names(false),
        );

    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to set global tracing subscriber");

    tracing::info!(target: "system", "Logging initialized at {:?}", log_dir);

    LoggingGuards { _guards: guards }
}

/// State to hold logging guards - must live for the app lifetime
pub struct LoggingState {
    _guards: Mutex<Option<LoggingGuards>>,
}

impl LoggingState {
    pub fn new(guards: LoggingGuards) -> Self {
        Self {
            _guards: Mutex::new(Some(guards)),
        }
    }
}

/// IPC command for frontend to write logs
/// Note: tracing macros require static string literals for targets, so we match on known plugins
#[tauri::command]
pub fn log_from_frontend(
    plugin: String,
    level: String,
    message: String,
    context: Option<serde_json::Value>,
) {
    let ctx_str = context
        .map(|c| format!(" {:?}", c))
        .unwrap_or_default();

    // Macro to emit log with static target
    macro_rules! emit_log {
        ($target:expr, $level:ident, $msg:expr, $ctx:expr) => {
            tracing::$level!(target: $target, "{}{}", $msg, $ctx)
        };
    }

    // Match on plugin to use static target strings
    // Unknown plugins are logged to system
    match (plugin.as_str(), level.as_str()) {
        ("quickclip", "trace") => emit_log!("quickclip", trace, message, ctx_str),
        ("quickclip", "debug") => emit_log!("quickclip", debug, message, ctx_str),
        ("quickclip", "info") => emit_log!("quickclip", info, message, ctx_str),
        ("quickclip", "warn") => emit_log!("quickclip", warn, message, ctx_str),
        ("quickclip", "error") => emit_log!("quickclip", error, message, ctx_str),
        ("quickclip", _) => emit_log!("quickclip", info, message, ctx_str),

        ("todo", "trace") => emit_log!("todo", trace, message, ctx_str),
        ("todo", "debug") => emit_log!("todo", debug, message, ctx_str),
        ("todo", "info") => emit_log!("todo", info, message, ctx_str),
        ("todo", "warn") => emit_log!("todo", warn, message, ctx_str),
        ("todo", "error") => emit_log!("todo", error, message, ctx_str),
        ("todo", _) => emit_log!("todo", info, message, ctx_str),

        (_, "trace") => emit_log!("system", trace, message, ctx_str),
        (_, "debug") => emit_log!("system", debug, message, ctx_str),
        (_, "info") => emit_log!("system", info, message, ctx_str),
        (_, "warn") => emit_log!("system", warn, message, ctx_str),
        (_, "error") => emit_log!("system", error, message, ctx_str),
        _ => emit_log!("system", info, message, ctx_str),
    }
}

/// Helper macro to log with plugin target
#[macro_export]
macro_rules! log_plugin {
    ($plugin:expr, $level:ident, $($arg:tt)+) => {
        tracing::$level!(target: $plugin, $($arg)+)
    };
}
