use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Log level for trace entries
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
    TraceEnd,
}

/// A single log entry in a trace
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    /// ISO 8601 timestamp
    pub ts: String,
    /// Trace ID (8 hex chars)
    pub trace: String,
    /// Log level
    pub level: LogLevel,
    /// Log message
    pub msg: String,
    /// Merged context from the trace stack
    pub ctx: Value,
    /// Error details (only present on error logs)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub err: Option<TraceError>,
    /// Duration in milliseconds (only present on trace_end)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    /// Trace status: "ok" or "error" (only present on trace_end)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<&'static str>,
}

/// Error details for trace logs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceError {
    /// Human-readable error message
    pub message: String,
    /// Machine-readable error code
    pub code: &'static str,
}

impl TraceError {
    pub fn new(message: impl Into<String>, code: &'static str) -> Self {
        Self {
            message: message.into(),
            code,
        }
    }
}
