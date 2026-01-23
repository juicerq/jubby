use std::collections::HashSet;
use std::env;

use super::types::LogLevel;

/// Controls which trace entries are written to disk.
///
/// Default policy (optimized for low disk usage):
/// - Allowed levels: Debug, Warn, Error (Info is dropped)
/// - trace_end only emitted when the trace had an error
///
/// Override via env var: JUBBY_TRACE_LEVELS=debug,info,warn,error
/// Override trace_end behavior: JUBBY_TRACE_END_ALWAYS=1
#[derive(Debug)]
pub struct TracePolicy {
    allowed_levels: HashSet<LogLevel>,
    trace_end_only_on_error: bool,
}

impl TracePolicy {
    /// Create policy from environment variables, falling back to defaults.
    pub fn from_env() -> Self {
        let allowed_levels = match env::var("JUBBY_TRACE_LEVELS") {
            Ok(val) => parse_levels(&val),
            Err(_) => {
                // Default: debug, warn, error (no info)
                let mut set = HashSet::new();
                set.insert(LogLevel::Debug);
                set.insert(LogLevel::Warn);
                set.insert(LogLevel::Error);
                set
            }
        };

        let trace_end_only_on_error = env::var("JUBBY_TRACE_END_ALWAYS")
            .map(|v| v != "1" && v.to_lowercase() != "true")
            .unwrap_or(true);

        Self {
            allowed_levels,
            trace_end_only_on_error,
        }
    }

    /// Check if a log level should be written.
    pub fn should_log(&self, level: LogLevel) -> bool {
        self.allowed_levels.contains(&level)
    }

    /// Check if trace_end should be emitted for a trace.
    pub fn should_emit_trace_end(&self, has_error: bool) -> bool {
        if self.trace_end_only_on_error {
            has_error
        } else {
            true
        }
    }
}

fn parse_levels(val: &str) -> HashSet<LogLevel> {
    let mut set = HashSet::new();
    for part in val.split(',') {
        match part.trim().to_lowercase().as_str() {
            "debug" => {
                set.insert(LogLevel::Debug);
            }
            "info" => {
                set.insert(LogLevel::Info);
            }
            "warn" => {
                set.insert(LogLevel::Warn);
            }
            "error" => {
                set.insert(LogLevel::Error);
            }
            _ => {}
        }
    }
    set
}
