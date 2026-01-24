use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;
use tauri::State;

use crate::traces::{Trace, TraceError};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedSession {
    pub session_id: String,
    pub task_id: String,
    pub subtask_id: Option<String>,
    pub started_at: i64,
    pub port: u16,
    pub working_directory: String,
}

pub struct ActiveSessions(pub RwLock<HashMap<String, PersistedSession>>);

impl ActiveSessions {
    pub fn new() -> Self {
        Self(RwLock::new(HashMap::new()))
    }
}

impl Default for ActiveSessions {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
pub async fn opencode_persist_session(
    sessions: State<'_, ActiveSessions>,
    session_id: String,
    task_id: String,
    subtask_id: Option<String>,
    started_at: i64,
    port: u16,
    working_directory: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_persist_session")
        .with("session_id", session_id.clone())
        .with("task_id", task_id.clone())
        .with("has_subtask_id", subtask_id.is_some())
        .with("port", port)
        .with("working_directory", working_directory.clone());
    trace.info("Persisting OpenCode session");

    let mut sessions = sessions.0.write().map_err(|e| {
        trace.error(
            "Failed to lock active sessions for persist",
            TraceError::new(e.to_string(), "OPENCODE_SESSIONS_LOCK_FAILED"),
        );
        "Failed to lock active sessions".to_string()
    })?;

    let persisted = PersistedSession {
        session_id: session_id.clone(),
        task_id,
        subtask_id,
        started_at,
        port,
        working_directory,
    };

    sessions.insert(session_id, persisted);

    trace.info("OpenCode session persisted");
    drop(trace);
    Ok(())
}

#[tauri::command]
pub async fn opencode_get_persisted_sessions(
    sessions: State<'_, ActiveSessions>,
) -> Result<Vec<PersistedSession>, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_get_persisted_sessions");
    trace.info("Loading persisted OpenCode sessions");

    let sessions = sessions.0.read().map_err(|e| {
        trace.error(
            "Failed to lock active sessions for read",
            TraceError::new(e.to_string(), "OPENCODE_SESSIONS_LOCK_FAILED"),
        );
        "Failed to lock active sessions".to_string()
    })?;

    let result = sessions.values().cloned().collect::<Vec<_>>();
    trace.info(&format!("Loaded {} persisted sessions", result.len()));
    drop(trace);
    Ok(result)
}

#[tauri::command]
pub async fn opencode_clear_session(
    sessions: State<'_, ActiveSessions>,
    session_id: String,
) -> Result<bool, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_clear_session")
        .with("session_id", session_id.clone());
    trace.info("Clearing persisted OpenCode session");

    let mut sessions = sessions.0.write().map_err(|e| {
        trace.error(
            "Failed to lock active sessions for delete",
            TraceError::new(e.to_string(), "OPENCODE_SESSIONS_LOCK_FAILED"),
        );
        "Failed to lock active sessions".to_string()
    })?;

    let removed = sessions.remove(&session_id).is_some();
    trace.info(&format!("Persisted session removed: {}", removed));
    drop(trace);
    Ok(removed)
}
