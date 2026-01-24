pub mod server;
pub mod persistence;
mod state;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use crate::traces::{Trace, TraceError};

use super::watcher::StorageUpdatedPayload;

pub use server::{
    opencode_ensure_server, opencode_ensure_server_with_dir,
    opencode_ensure_server_with_dir_compat, opencode_stop_all_servers, opencode_stop_server,
    stop_server_for_directory,
};
pub use persistence::ActiveSessions;
pub use state::OpenCodeServerState;
pub use state::{OpenCodeServersState, ServerInfo};

// Port range for dynamic allocation (supports up to 100 concurrent directories)
pub const OPENCODE_PORT_START: u16 = 4096;
pub const OPENCODE_PORT_END: u16 = 4196;
pub const OPENCODE_HOST: &str = "127.0.0.1";
const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

// Model configuration
const DEFAULT_PROVIDER_ID: &str = "anthropic";
const DEFAULT_MODEL_ID: &str = "claude-opus-4-5";

// Permissions - allow external_directory to avoid permission prompts during subtask execution
const OPENCODE_PERMISSIONS: &str = r#"{"external_directory":"allow","edit":"allow","bash":"allow","task":"allow"}"#;

// Promise marker to detect if the agent truly completed its work
const PROMISE_COMPLETED_MARKER: &str = "<promise>completed</promise>";
const MAX_CONTINUE_ATTEMPTS: u32 = 5;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub healthy: bool,
    pub version: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTime {
    pub created: i64,
    pub updated: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub additions: i64,
    pub deletions: i64,
    pub files: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionResponse {
    pub id: String,
    pub slug: String,
    #[serde(rename = "projectID")]
    pub project_id: String,
    pub directory: String,
    pub title: String,
    pub version: String,
    pub time: SessionTime,
    #[serde(default)]
    pub summary: Option<SessionSummary>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePart {
    #[serde(rename = "type")]
    pub part_type: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfig {
    #[serde(rename = "providerID")]
    pub provider_id: String,
    #[serde(rename = "modelID")]
    pub model_id: String,
}

impl Default for ModelConfig {
    fn default() -> Self {
        Self {
            provider_id: DEFAULT_PROVIDER_ID.to_string(),
            model_id: DEFAULT_MODEL_ID.to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendPromptRequest {
    pub parts: Vec<MessagePart>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<ModelConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub session_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempt: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Build base URL for a specific port.
pub fn base_url_for_port(port: u16) -> String {
    format!("http://{}:{}", OPENCODE_HOST, port)
}

/// Build base URL using the first port in the range (for backward compatibility during migration).
/// DEPRECATED: Use base_url_for_port() with a dynamically allocated port instead.
fn base_url() -> String {
    base_url_for_port(OPENCODE_PORT_START)
}

/// Allocate the first available port in the range [OPENCODE_PORT_START, OPENCODE_PORT_END).
/// Returns None if all ports are in use.
///
/// This function checks the OpenCodeServersState to avoid ports already used by other
/// running servers, supporting up to 100 concurrent directories.
pub fn allocate_port(servers_state: &state::OpenCodeServersState) -> Option<u16> {
    for port in OPENCODE_PORT_START..OPENCODE_PORT_END {
        if !servers_state.is_port_in_use(port) {
            // Double-check by trying to bind to the port (in case of external usage)
            if std::net::TcpListener::bind((OPENCODE_HOST, port)).is_ok() {
                return Some(port);
            }
        }
    }
    None
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .expect("Failed to create HTTP client")
}

fn truncate_for_trace(value: &str) -> String {
    const MAX_LEN: usize = 2000;
    if value.chars().count() > MAX_LEN {
        let truncated: String = value.chars().take(MAX_LEN).collect();
        format!("{}...[truncated]", truncated)
    } else {
        value.to_string()
    }
}


#[tauri::command]
pub async fn opencode_health_check(port: u16) -> Result<HealthResponse, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_health_check")
        .with("port", port);
    trace.info("Checking OpenCode server health");

    let client = client();

    let response = client
        .get(format!("{}/global/health", base_url_for_port(port)))
        .send()
        .await
        .map_err(|e| {
            trace.error(
                "Health check request failed",
                TraceError::new(e.to_string(), "OPENCODE_HEALTH_REQUEST_FAILED"),
            );
            format!("Health check failed: {}", e)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        trace.error(
            "Health check returned non-success status",
            TraceError::new(body.clone(), "OPENCODE_HEALTH_STATUS"),
        );
        drop(trace);
        return Err(format!(
            "Health check returned status: {}",
            status
        ));
    }

    let health = response
        .json::<HealthResponse>()
        .await
        .map_err(|e| {
            trace.error(
                "Failed to parse health response",
                TraceError::new(e.to_string(), "OPENCODE_HEALTH_PARSE_FAILED"),
            );
            format!("Failed to parse health response: {}", e)
        })?;

    trace.info(&format!("Health check succeeded: {}", health.version));
    drop(trace);
    Ok(health)
}

#[tauri::command]
pub async fn opencode_create_session(
    port: u16,
    title: Option<String>,
) -> Result<CreateSessionResponse, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_create_session")
        .with("port", port)
        .with("has_title", title.is_some());

    trace.info("Creating OpenCode session");

    let client = client();

    let request = CreateSessionRequest { title };

    let response = client
        .post(format!("{}/session", base_url_for_port(port)))
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            trace.error(
                "Failed to create session",
                TraceError::new(e.to_string(), "OPENCODE_CREATE_SESSION_REQUEST_FAILED"),
            );
            format!("Failed to create session: {}", e)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        trace.error(
            "Create session returned non-success status",
            TraceError::new(body.clone(), "OPENCODE_CREATE_SESSION_FAILED"),
        );
        drop(trace);
        return Err(format!(
            "Create session failed with status {}: {}",
            status, body
        ));
    }

    let response_text = response.text().await.unwrap_or_default();
    #[derive(Debug, Deserialize)]
    struct CreateSessionWrappedResponse {
        data: CreateSessionResponse,
    }

    let parsed = serde_json::from_str::<CreateSessionResponse>(&response_text)
        .or_else(|direct_err| {
            serde_json::from_str::<CreateSessionWrappedResponse>(&response_text)
                .map(|wrapped| wrapped.data)
                .map_err(|wrapped_err| (direct_err, wrapped_err))
        })
        .map_err(|(direct_err, wrapped_err)| {
            trace.error(
                "Failed to parse create session response",
                TraceError::new(
                    format!(
                        "direct_error={} wrapped_error={} response={}",
                        direct_err,
                        wrapped_err,
                        truncate_for_trace(&response_text)
                    ),
                    "OPENCODE_CREATE_SESSION_PARSE_FAILED",
                ),
            );
            format!("Failed to parse create session response: {}", direct_err)
        })?;

    trace.info(&format!(
        "Create session succeeded: id={} projectId={} directory={}",
        parsed.id, parsed.project_id, parsed.directory
    ));
    tracing::info!(
        target: "tasks",
        session_id = %parsed.id,
        project_id = %parsed.project_id,
        directory = %parsed.directory,
        title = %parsed.title,
        "OpenCode session created"
    );
    drop(trace);

    Ok(parsed)
}

#[tauri::command]
pub async fn opencode_send_prompt(
    port: u16,
    session_id: String,
    prompt: String,
    agent: Option<String>,
    model: Option<ModelConfig>,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_send_prompt")
        .with("port", port)
        .with("session_id", session_id.clone())
        .with("prompt_length", prompt.len())
        .with("has_agent", agent.is_some())
        .with("has_model", model.is_some());

    trace.info("Sending prompt to OpenCode session");

    let client = client();

    let request = SendPromptRequest {
        parts: vec![MessagePart {
            part_type: "text".to_string(),
            text: prompt,
        }],
        model: Some(model.unwrap_or_default()),
        agent,
    };

    let response = client
        .post(format!(
            "{}/session/{}/prompt_async",
            base_url_for_port(port),
            session_id
        ))
        .json(&request)
        .send()
        .await
        .map_err(|e| {
            trace.error(
                "Failed to send prompt",
                TraceError::new(e.to_string(), "OPENCODE_SEND_PROMPT_FAILED"),
            );
            format!("Failed to send prompt: {}", e)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        trace.error(
            "Send prompt returned non-success status",
            TraceError::new(body.clone(), "OPENCODE_SEND_PROMPT_STATUS"),
        );
        drop(trace);
        return Err(format!(
            "Send prompt failed with status {}: {}",
            status, body
        ));
    }

    trace.info("Prompt sent successfully");
    drop(trace);
    Ok(())
}

#[tauri::command]
pub async fn opencode_poll_status(port: u16, session_id: String) -> Result<SessionStatus, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_poll_status")
        .with("port", port)
        .with("session_id", session_id.clone());
    trace.debug("Polling OpenCode session status");

    let client = client();

    let response = client
        .get(format!("{}/session/status", base_url_for_port(port)))
        .send()
        .await
        .map_err(|e| {
            trace.error(
                "Failed to poll session status",
                TraceError::new(e.to_string(), "OPENCODE_POLL_STATUS_FAILED"),
            );
            format!("Failed to poll status: {}", e)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        trace.error(
            "Poll status returned non-success status",
            TraceError::new(body.clone(), "OPENCODE_POLL_STATUS_STATUS"),
        );
        drop(trace);
        return Err(format!(
            "Poll status failed with status {}: {}",
            status, body
        ));
    }

    #[derive(Debug, Deserialize)]
    struct RawStatus {
        #[serde(rename = "type")]
        status_type: String,
        #[serde(default)]
        attempt: Option<u32>,
        #[serde(default)]
        message: Option<String>,
    }

    let statuses: HashMap<String, RawStatus> = response
        .json()
        .await
        .map_err(|e| {
            trace.error(
                "Failed to parse poll status response",
                TraceError::new(e.to_string(), "OPENCODE_POLL_STATUS_PARSE_FAILED"),
            );
            format!("Failed to parse status response: {}", e)
        })?;

    match statuses.get(&session_id) {
        Some(raw) => {
            trace.debug(&format!("Session status: {}", raw.status_type));
            drop(trace);
            Ok(SessionStatus {
                session_id: session_id.clone(),
                status: raw.status_type.clone(),
                attempt: raw.attempt,
                message: raw.message.clone(),
            })
        }
        None => {
            trace.debug("Session status not found, defaulting to idle");
            drop(trace);
            Ok(SessionStatus {
                session_id,
                status: "idle".to_string(),
                attempt: None,
                message: None,
            })
        }
    }
}

#[tauri::command]
pub async fn opencode_abort_session(port: u16, session_id: String) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_abort_session")
        .with("port", port)
        .with("session_id", session_id.clone());
    trace.info("Aborting OpenCode session");

    let client = client();

    let response = client
        .post(format!("{}/session/{}/abort", base_url_for_port(port), session_id))
        .send()
        .await
        .map_err(|e| {
            trace.error(
                "Failed to abort session",
                TraceError::new(e.to_string(), "OPENCODE_ABORT_FAILED"),
            );
            format!("Failed to abort session: {}", e)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        trace.error(
            "Abort session returned non-success status",
            TraceError::new(body.clone(), "OPENCODE_ABORT_STATUS"),
        );
        drop(trace);
        return Err(format!(
            "Abort session failed with status {}: {}",
            status, body
        ));
    }

    trace.info("Abort request accepted");
    drop(trace);
    Ok(())
}

const POLL_INTERVAL: Duration = Duration::from_millis(500);
const EXECUTION_TIMEOUT_SECS: u64 = 300;
const GENERATE_TIMEOUT_SECS: u64 = 120;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionResult {
    pub session_id: String,
    pub outcome: String,
    pub aborted: bool,
    pub error_message: Option<String>,
}

fn format_steps(steps: &[super::types::Step]) -> String {
    if steps.is_empty() {
        return "None".to_string();
    }
    steps
        .iter()
        .enumerate()
        .map(|(i, step)| {
            let status = if step.completed { "[x]" } else { "[ ]" };
            format!("  {}. {} {}", i + 1, status, step.text)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn get_category_rules(category: &super::types::SubtaskCategory) -> &'static str {
    use super::types::SubtaskCategory;
    match category {
        SubtaskCategory::Types => 
            "Focus on type definitions and interfaces. Ensure types are well-documented and cover edge cases. Do not implement business logic.",
        SubtaskCategory::Functional => 
            "Implement the feature following existing code patterns. Ensure the code is production-ready and follows project conventions.",
        SubtaskCategory::Fix => 
            "Fix the bug carefully. Verify you don't break other functionality. Add defensive checks if needed. Consider edge cases.",
        SubtaskCategory::Test => 
            "Write comprehensive tests. Cover happy path, edge cases, and error scenarios. Follow existing test patterns in the codebase.",
        SubtaskCategory::Refactor => 
            "Improve code structure WITHOUT changing behavior. If tests exist, they must still pass after your changes. Do not add new features.",
        SubtaskCategory::Cleanup => 
            "Remove dead code, unused imports, and obsolete comments. Do NOT add new functionality. Be conservative - only remove what is clearly unused.",
        SubtaskCategory::Docs => 
            "Update documentation only. Do NOT modify any code files except markdown, comments, or docstrings. Focus on clarity and accuracy.",
    }
}

fn get_category_name(category: &super::types::SubtaskCategory) -> &'static str {
    use super::types::SubtaskCategory;
    match category {
        SubtaskCategory::Types => "types",
        SubtaskCategory::Functional => "functional",
        SubtaskCategory::Fix => "fix",
        SubtaskCategory::Test => "test",
        SubtaskCategory::Refactor => "refactor",
        SubtaskCategory::Cleanup => "cleanup",
        SubtaskCategory::Docs => "docs",
    }
}

fn build_execution_prompt(
    task: &super::types::Task,
    subtask: &super::types::Subtask,
    task_file_path: &str,
) -> String {
    let category_name = get_category_name(&subtask.category);
    let category_rules = get_category_rules(&subtask.category);
    
    format!(
        r#"You are executing a single subtask for the Jubby Tasks plugin.

Rules:
- ONLY work on this subtask. Do not start other subtasks.
- You MUST edit the task file directly to record your changes and execution log.
- If shouldCommit = true, you MUST create a git commit for this subtask.
- After completion, update the subtask status in the task file:
  - "completed" if successful
  - "failed" if you could not complete or hit an error

Category-specific rules ({category_name}):
{category_rules}

Data source (single source of truth):
- Task file path: {task_file_path}

Task context:
- taskId: {task_id}
- subtaskId: {subtask_id}
- taskText: {task_text}
- taskDescription: {task_description}
- subtaskText: {subtask_text}
- subtaskCategory: {category_name}
- subtaskNotes: {subtask_notes}
- subtaskSteps:
{subtask_steps}
- shouldCommit: {should_commit}

What you must do:
1) Implement only this subtask, following the category-specific rules above.
2) Update the task file ({task_file_path}):
   - set the subtask status ("completed" or "failed")
   - append a new execution log entry under this subtask's executionLogs array:
     - id: generate a UUID
     - startedAt: current timestamp in milliseconds
     - completedAt: completion timestamp in milliseconds
     - duration: duration in milliseconds
     - outcome: "success" | "partial" | "failed" | "aborted"
     - summary: short summary of what was done
     - filesChanged: list of files you modified
     - learnings: {{ patterns: [], gotchas: [], context: [] }}
     - committed: true/false
     - commitHash: the commit hash (only if committed)
     - commitMessage: the commit message (only if committed)
     - errorMessage: error description (only if failed)
3) If shouldCommit = true, create a git commit for this subtask.

IMPORTANT: When you have fully completed all work for this subtask, you MUST end your final message with:
<promise>completed</promise>

This marker signals that you are truly done. Do NOT include this marker if you still have pending work or if you encountered an error that prevents completion.
"#,
        task_file_path = task_file_path,
        task_id = task.id,
        subtask_id = subtask.id,
        task_text = task.text,
        task_description = task.description,
        subtask_text = subtask.text,
        category_name = category_name,
        category_rules = category_rules,
        subtask_notes = subtask.notes,
        subtask_steps = format_steps(&subtask.steps),
        should_commit = subtask.should_commit,
    )
}

fn update_subtask_status(
    store: &super::TasksStore,
    task_id: &str,
    subtask_id: &str,
    status: super::types::TaskStatus,
    app_handle: Option<&AppHandle>,
) {
    tracing::info!(
        target: "tasks",
        task_id = %task_id,
        subtask_id = %subtask_id,
        status = ?status,
        "update_subtask_status called"
    );

    let mut data = store.write();

    // Get folder info first
    let (folder_filename, folder_id, task_exists) = {
        if let Some(task) = data.tasks.iter().find(|t| t.id == task_id) {
            let fid = task.folder_id.clone();
            if let Some(folder) = data.folders.iter().find(|f| f.id == fid) {
                (super::storage::get_folder_filename(folder), fid, true)
            } else {
                tracing::error!(target: "tasks", task_id = %task_id, folder_id = %fid, "Folder not found for task");
                (String::new(), String::new(), false)
            }
        } else {
            tracing::error!(target: "tasks", task_id = %task_id, "Task not found in store");
            (String::new(), String::new(), false)
        }
    };

    if !task_exists || folder_filename.is_empty() {
        tracing::error!(target: "tasks", "Task or folder not found for status update - aborting");
        return;
    }

    // Update the subtask status
    if let Some(task) = data.tasks.iter_mut().find(|t| t.id == task_id) {
        if let Some(subtask) = task.subtasks.iter_mut().find(|s| s.id == subtask_id) {
            tracing::info!(
                target: "tasks",
                subtask_id = %subtask_id,
                old_status = ?subtask.status,
                new_status = ?status,
                "Updating subtask status in memory"
            );
            subtask.status = status;
        } else {
            tracing::error!(target: "tasks", subtask_id = %subtask_id, "Subtask not found in task");
        }
    }

    // Save only this task's file
    if let Some(task) = data.tasks.iter().find(|t| t.id == task_id) {
        match super::storage::save_task(&folder_filename, task) {
            Ok(_) => {
                tracing::info!(
                    target: "tasks",
                    task_id = %task_id,
                    folder_filename = %folder_filename,
                    "Subtask status saved to disk"
                );
            }
            Err(e) => {
                tracing::error!(target: "tasks", "Failed to save subtask status update: {}", e);
            }
        }
    }

    // Emit event to notify frontend of the status change
    if let Some(handle) = app_handle {
        let payload = StorageUpdatedPayload {
            folder_id: folder_id.clone(),
            version: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0),
        };
        tracing::info!(
            target: "tasks",
            folder_id = %folder_id,
            "Emitting tasks:storage-updated event"
        );
        if let Err(e) = handle.emit("tasks:storage-updated", payload) {
            tracing::error!(target: "tasks", "Failed to emit storage updated event: {}", e);
        }
    } else {
        tracing::warn!(target: "tasks", "No app_handle provided, skipping event emit");
    }
}

#[tauri::command]
pub async fn tasks_execute_subtask(
    store: State<'_, super::TasksStore>,
    server_state: State<'_, OpenCodeServersState>,
    sessions: State<'_, ActiveSessions>,
    app_handle: AppHandle,
    task_id: String,
    subtask_id: String,
) -> Result<ExecutionResult, String> {
    let (task, subtask, working_directory, task_file_path) = {
        let data = store.read();
        let mut task = data
            .tasks
            .iter()
            .find(|t| t.id == task_id)
            .ok_or_else(|| format!("Task not found: {}", task_id))?
            .clone();

        let subtask = task
            .subtasks
            .iter()
            .find(|s| s.id == subtask_id)
            .ok_or_else(|| format!("Subtask not found: {}", subtask_id))?
            .clone();

        // Get folder for path computation and working directory fallback
        let folder = data
            .folders
            .iter()
            .find(|f| f.id == task.folder_id)
            .ok_or_else(|| format!("Folder not found: {}", task.folder_id))?;

        // Compute task file path
        let folder_filename = super::storage::get_folder_filename(folder);
        let task_filename = super::storage::get_task_filename(&task);
        let task_file_path = super::storage::get_task_file_path(&folder_filename, &task_filename)
            .to_string_lossy()
            .to_string();

        // Determine working directory: task > folder > error
        let working_directory = if !task.working_directory.is_empty() {
            task.working_directory.clone()
        } else if !folder.working_directory.is_empty() {
            tracing::info!(
                target: "tasks",
                task_id = %task_id,
                folder_id = %task.folder_id,
                folder_working_directory = %folder.working_directory,
                "Using folder's working_directory as fallback"
            );
            // Update task's working_directory for consistency in prompts
            task.working_directory = folder.working_directory.clone();
            folder.working_directory.clone()
        } else {
            String::new()
        };

        if working_directory.is_empty() {
            let trace = Trace::new()
                .with("plugin", "tasks")
                .with("action", "tasks_execute_subtask")
                .with("task_id", task_id.clone())
                .with("subtask_id", subtask_id.clone());
            trace.error(
                "Working directory missing for task execution (neither task nor folder has one)",
                TraceError::new("Neither task nor folder has working directory set", "WORKING_DIRECTORY_MISSING"),
            );
            drop(trace);
            return Err("Neither task nor folder has working directory set".to_string());
        }

        (task, subtask, working_directory, task_file_path)
    };

    // Create trace early to capture the full flow including server startup
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_execute_subtask")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone())
        .with("working_directory", working_directory.clone())
        .with("task_file_path", task_file_path.clone());

    trace.info("Starting subtask execution, ensuring OpenCode server");

    let port = match opencode_ensure_server_with_dir(server_state, Some(working_directory.clone())).await {
        Ok(p) => p,
        Err(e) => {
            trace.error(
                "Failed to ensure OpenCode server",
                TraceError::new(e.clone(), "OPENCODE_ENSURE_SERVER_FAILED"),
            );
            drop(trace);
            return Err(e);
        }
    };

    trace.info(&format!("OpenCode server ready for execution on port {}", port));

    let prompt = build_execution_prompt(&task, &subtask, &task_file_path);

    trace.info(&format!(
        "Executing subtask '{}' with prompt length: {}",
        subtask.text,
        prompt.len()
    ));

    trace.debug("Creating OpenCode session for subtask");

    let session = match opencode_create_session(port, Some(format!("{}: {}", task.text, subtask.text))).await {
        Ok(s) => s,
        Err(e) => {
            trace.error(
                "Failed to create OpenCode session",
                TraceError::new(e.clone(), "OPENCODE_CREATE_SESSION_FAILED"),
            );
            drop(trace);
            return Err(e);
        }
    };
    let session_id = session.id.clone();

    trace.info(&format!("Created session: {}", session_id));

    // Persist session with port and working_directory for abort routing
    let started_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    {
        let mut sessions_lock = sessions.0.write().map_err(|e| {
            trace.error(
                "Failed to lock active sessions",
                TraceError::new(e.to_string(), "SESSIONS_LOCK_FAILED"),
            );
            format!("Failed to lock active sessions: {}", e)
        })?;

        sessions_lock.insert(
            session_id.clone(),
            persistence::PersistedSession {
                session_id: session_id.clone(),
                task_id: task_id.clone(),
                subtask_id: Some(subtask_id.clone()),
                started_at,
                port,
                working_directory: working_directory.clone(),
            },
        );
    }

    trace.info(&format!(
        "Persisted session {} with port {} and working_directory {}",
        session_id, port, working_directory
    ));

    trace.debug("Sending prompt to OpenCode session");

    if let Err(e) = opencode_send_prompt(port, session_id.clone(), prompt, None, None).await {
        trace.error(
            "Failed to send prompt to OpenCode session",
            TraceError::new(e.clone(), "OPENCODE_SEND_PROMPT_FAILED"),
        );
        drop(trace);
        return Err(e);
    }

    trace.info(&format!("Sent prompt to session: {}", session_id));

    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(EXECUTION_TIMEOUT_SECS);
    let mut continue_attempts: u32 = 0;
    let mut marked_in_progress = false;

    trace.info("Polling for execution completion");

    loop {
        if start.elapsed() > timeout {
            trace.warn(&format!("Execution timeout for session: {}", session_id));
            let _ = opencode_abort_session(port, session_id.clone()).await;

            update_subtask_status(&store, &task_id, &subtask_id, super::types::TaskStatus::Failed, Some(&app_handle));

            // Clear persisted session
            if let Ok(mut sessions_lock) = sessions.0.write() {
                sessions_lock.remove(&session_id);
            }

            drop(trace);
            return Ok(ExecutionResult {
                session_id,
                outcome: "failed".to_string(),
                aborted: true,
                error_message: Some(format!("Execution timed out after {} seconds", EXECUTION_TIMEOUT_SECS)),
            });
        }

        tokio::time::sleep(POLL_INTERVAL).await;

        match opencode_poll_status(port, session_id.clone()).await {
            Ok(status) => {
                trace.debug(&format!("Session {} status: {}", session_id, status.status));

                match status.status.as_str() {
                    "idle" => {
                        // Check if the agent truly completed by looking for the promise marker
                        match check_session_completion(port, &session_id).await {
                            CompletionCheckResult::Completed(_) => {
                                // Marker found - agent completed successfully
                                trace.info(&format!(
                                    "Session {} completed with promise marker",
                                    session_id
                                ));

                                match super::storage::reload_from_disk() {
                                    Ok(new_data) => {
                                        let mut current_data = store.write();
                                        *current_data = new_data;
                                        trace.info("Reloaded tasks data from disk after AI edits");
                                    }
                                    Err(e) => {
                                        trace.warn(&format!("Failed to reload from disk: {}", e));
                                    }
                                }

                                update_subtask_status(&store, &task_id, &subtask_id, super::types::TaskStatus::Completed, Some(&app_handle));

                                // Clear persisted session
                                if let Ok(mut sessions_lock) = sessions.0.write() {
                                    sessions_lock.remove(&session_id);
                                }

                                drop(trace);
                                return Ok(ExecutionResult {
                                    session_id,
                                    outcome: "success".to_string(),
                                    aborted: false,
                                    error_message: None,
                                });
                            }
                            CompletionCheckResult::NotCompleted(_) => {
                                // Message exists but no marker - agent stopped prematurely
                                if continue_attempts < MAX_CONTINUE_ATTEMPTS {
                                    continue_attempts += 1;
                                    trace.info(&format!(
                                        "Session {} idle without promise marker, sending continue ({}/{})",
                                        session_id, continue_attempts, MAX_CONTINUE_ATTEMPTS
                                    ));

                                    if let Err(e) = send_continue(port, &session_id).await {
                                        trace.warn(&format!("Failed to send continue: {}", e));
                                    }
                                    continue;
                                }

                                // Max attempts reached - treat as completed anyway
                                trace.warn(&format!(
                                    "Session {} idle without promise marker after {} continue attempts, treating as completed",
                                    session_id, MAX_CONTINUE_ATTEMPTS
                                ));

                                match super::storage::reload_from_disk() {
                                    Ok(new_data) => {
                                        let mut current_data = store.write();
                                        *current_data = new_data;
                                        trace.info("Reloaded tasks data from disk after AI edits");
                                    }
                                    Err(e) => {
                                        trace.warn(&format!("Failed to reload from disk: {}", e));
                                    }
                                }

                                update_subtask_status(&store, &task_id, &subtask_id, super::types::TaskStatus::Completed, Some(&app_handle));

                                // Clear persisted session
                                if let Ok(mut sessions_lock) = sessions.0.write() {
                                    sessions_lock.remove(&session_id);
                                }

                                drop(trace);
                                return Ok(ExecutionResult {
                                    session_id,
                                    outcome: "success".to_string(),
                                    aborted: false,
                                    error_message: None,
                                });
                            }
                            CompletionCheckResult::MessageUnavailable => {
                                // Message not available yet - keep polling without sending continue
                                trace.debug(&format!(
                                    "Session {} idle but message not yet available, continuing to poll",
                                    session_id
                                ));
                                continue;
                            }
                        }
                    }
                    "busy" | "retry" => {
                        // Mark subtask as in_progress when agent starts working
                        if !marked_in_progress {
                            marked_in_progress = true;
                            trace.info(&format!(
                                "Session {} is now busy, marking subtask as in_progress",
                                session_id
                            ));
                            update_subtask_status(
                                &store,
                                &task_id,
                                &subtask_id,
                                super::types::TaskStatus::InProgress,
                                Some(&app_handle),
                            );
                        }
                        if status.status == "retry" {
                            trace.debug(&format!(
                                "Session {} is retrying (attempt: {:?})",
                                session_id, status.attempt
                            ));
                        }
                    }
                    other => {
                        trace.warn(&format!("Unexpected session status: {}", other));
                    }
                }
            }
            Err(e) => {
                trace.error(
                    "Failed to poll session status",
                    TraceError::new(e, "OPENCODE_POLL_FAILED"),
                );
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateSubtasksResult {
    pub session_id: String,
    pub message: String,
}

fn build_generate_prompt(task: &super::types::Task, task_file_path: &str) -> String {
    format!(
        r#"You are a Software Architect generating subtasks for the Jubby Tasks plugin.

Your role is to analyze the task, design the architecture, and break it down into atomic subtasks that an AI agent will execute sequentially.

## Phase 1: Architecture Analysis

First, thoroughly explore the codebase to understand:
- Existing patterns and conventions
- Files and modules that will be affected
- Dependencies and integration points
- Potential risks or edge cases

## Phase 2: Architecture Design

Create a Mermaid flowchart that visualizes:
- The flow of changes (which files/modules are affected and in what order)
- Dependencies between subtasks
- Decision points or branching logic (if any)

Example format:
```mermaid
flowchart TD
    A[types: Define new interfaces] --> B[functional: Implement core logic]
    B --> C[functional: Add UI component]
    C --> D[test: Write unit tests]
    D --> E[docs: Update README]
```

After creating the diagram, critically review it:
- Is the order correct? Are dependencies respected?
- Are there any missing steps?
- Can any subtasks be combined or should any be split further?
- Is this the most efficient approach?

## Phase 3: Subtask Generation

You are not here to be lazy. You are here to produce exceptional work.

Planning rules (NO EXCEPTIONS):
- If something is unclear, state a reasonable assumption and proceed. Do NOT use ambiguity as an excuse for vague subtasks.
- Keep the plan short and actionable. No fluff. No filler. No prose.

Subtask quality rules (VIOLATING THESE IS UNACCEPTABLE):
- Each subtask MUST be atomic. One file, one concern, one change. If you're touching multiple unrelated things, SPLIT IT.
- Each subtask MUST have a concrete, verifiable outcome. "Improve code" is garbage. "Add input validation to UserForm component" is acceptable.
- NEVER create subtasks that overlap in scope. If two subtasks touch the same code, you failed at architecture.
- ALWAYS include test subtasks when behavior changes. No tests = incomplete work.
- Order subtasks by dependency. If subtask B needs subtask A, A comes first. This is not optional.
- Use imperative verbs and specify the exact target (file/module/component). Vague subtasks are rejected.

Remember: An AI agent will execute these subtasks sequentially with NO human intervention. Ambiguity, gaps, or poor ordering will cause failures. Your architecture must be bulletproof.

## Rules

- Do NOT edit any file except the task file specified below.
- Do NOT implement code or change the repo.
- Do NOT return a JSON array in the response.
- You MUST edit the task file directly to append the subtasks.
- Keep subtasks atomic and ordered by dependency (prerequisites first).
- For ALL id fields, you MUST generate UUIDs using: uuidgen (run this command in bash for each id you need).
- NEVER manually type or invent UUID strings.

## Data source (single source of truth)

- Task file path: {task_file_path}

## Task context

- taskId: {task_id}
- taskText: {task_text}
- taskDescription: {task_description}
{brainstorm_section}{architecture_section}{review_section}
## Subtask schema (append to this task's subtasks array)

- id: run `uuidgen` to generate
- text: short 1-sentence description
- status: "waiting"
- order: next order number (count existing subtasks)
- category: one of the following (choose based on the subtask's purpose):
    - "types": defining or updating types, interfaces, contracts
    - "functional": implementing new features (production code)
    - "fix": bug fixes (careful changes to avoid breaking other code)
    - "test": writing or updating tests
    - "refactor": improving code structure without changing behavior
    - "cleanup": removing dead code, unused imports, obsolete comments
    - "docs": updating documentation only (no code changes)
- steps: array of steps, each {{ id: run `uuidgen`, text: string, completed: false }}
- shouldCommit: true if the subtask produces a distinct code change worth a commit
- notes: optional extra context (can be empty string)
- executionLogs: empty array []

## What you must do

1) Explore the codebase to understand context and existing patterns.
2) Create a Mermaid flowchart visualizing the architecture and subtask flow.
3) Critically review the diagram - identify improvements and adjust if needed.
4) Write the final plan (in your response).
5) Open the task file and read its current content.
6) For each subtask and step, run `uuidgen` to get a proper UUID for the id field.
7) Append new subtasks to the subtasks array following the schema above.
8) Save the updated task file.
9) Respond with the Mermaid diagram, your analysis, and a brief confirmation of how many subtasks were added.

IMPORTANT: When you have fully completed generating all subtasks and updated the task file, you MUST end your final message with:
<promise>completed</promise>

This marker signals that you are truly done. Do NOT include this marker if you still have pending work.
"#,
        task_file_path = task_file_path,
        task_id = task.id,
        task_text = task.text,
        task_description = task.description,
        brainstorm_section = task.brainstorm.as_ref().map_or(String::new(), |b| {
            format!("\n## Brainstorm Notes\n\n{}\n", b)
        }),
        architecture_section = task.architecture.as_ref().map_or(String::new(), |a| {
            format!("\n## Architecture Notes\n\n{}\n", a)
        }),
        review_section = task.review.as_ref().map_or(String::new(), |r| {
            format!("\n## Review Notes\n\n{}\n", r)
        }),
    )
}

fn parse_model_id(model_id: &str) -> Result<ModelConfig, String> {
    match model_id {
        "anthropic/claude-opus-4-5" => Ok(ModelConfig {
            provider_id: "anthropic".to_string(),
            model_id: "claude-opus-4-5".to_string(),
        }),
        "anthropic/claude-sonnet-4-5" => Ok(ModelConfig {
            provider_id: "anthropic".to_string(),
            model_id: "claude-sonnet-4-5".to_string(),
        }),
        "anthropic/claude-haiku-4-5" => Ok(ModelConfig {
            provider_id: "anthropic".to_string(),
            model_id: "claude-haiku-4-5".to_string(),
        }),
        "openai/gpt-5.2-codex" => Ok(ModelConfig {
            provider_id: "openai".to_string(),
            model_id: "gpt-5.2-codex".to_string(),
        }),
        _ => Err(format!("Invalid model ID: {}", model_id)),
    }
}

#[tauri::command]
pub async fn tasks_generate_subtasks(
    store: State<'_, super::TasksStore>,
    server_state: State<'_, OpenCodeServersState>,
    task_id: String,
    model_id: String,
) -> Result<GenerateSubtasksResult, String> {
    let model_config = parse_model_id(&model_id)?;

    let (task, working_directory, task_file_path, initial_subtask_count) = {
        let data = store.read();
        let mut task = data.tasks
            .iter()
            .find(|t| t.id == task_id)
            .ok_or_else(|| format!("Task not found: {}", task_id))?
            .clone();

        let initial_subtask_count = task.subtasks.len();

        // Get folder for path computation and working directory fallback
        let folder = data
            .folders
            .iter()
            .find(|f| f.id == task.folder_id)
            .ok_or_else(|| format!("Folder not found: {}", task.folder_id))?;

        // Compute task file path
        let folder_filename = super::storage::get_folder_filename(folder);
        let task_filename = super::storage::get_task_filename(&task);
        let task_file_path = super::storage::get_task_file_path(&folder_filename, &task_filename)
            .to_string_lossy()
            .to_string();

        // Determine working directory: task > folder > empty (generate doesn't require it strictly)
        let working_directory = if !task.working_directory.is_empty() {
            task.working_directory.clone()
        } else if !folder.working_directory.is_empty() {
            tracing::info!(
                target: "tasks",
                task_id = %task_id,
                folder_id = %task.folder_id,
                folder_working_directory = %folder.working_directory,
                "Using folder's working_directory as fallback for generation"
            );
            task.working_directory = folder.working_directory.clone();
            folder.working_directory.clone()
        } else {
            String::new()
        };

        (task, working_directory, task_file_path, initial_subtask_count)
    };

    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_generate_subtasks")
        .with("task_id", task_id.clone())
        .with("task_file_path", task_file_path.clone())
        .with("initial_subtask_count", initial_subtask_count)
        .with("model_id", model_id.clone());

    if task.description.trim().is_empty() {
        trace.error(
            "Task description is empty",
            TraceError::new("Please add a description first", "DESCRIPTION_EMPTY"),
        );
        drop(trace);
        return Err("Task description is empty. Please add a description first.".to_string());
    }

    trace.info("Starting subtask generation, ensuring OpenCode server");

    // Use working_directory if available (for better context), but don't require it for generation
    let server_dir = if working_directory.is_empty() { None } else { Some(working_directory.clone()) };
    let port = match opencode_ensure_server_with_dir(server_state, server_dir).await {
        Ok(p) => p,
        Err(e) => {
            trace.error(
                "Failed to ensure OpenCode server for generation",
                TraceError::new(e.clone(), "OPENCODE_ENSURE_SERVER_FAILED"),
            );
            drop(trace);
            return Err(e);
        }
    };

    trace.info(&format!("OpenCode server ready for subtask generation on port {}", port));

    let prompt = build_generate_prompt(&task, &task_file_path);

    trace.info(&format!(
        "Generating subtasks for task '{}' with prompt length: {}",
        task.text,
        prompt.len()
    ));

    trace.debug("Creating OpenCode session for generation");

    let session = match opencode_create_session(port, Some(format!("Generate subtasks: {}", task.text))).await {
        Ok(s) => s,
        Err(e) => {
            trace.error(
                "Failed to create OpenCode session for generation",
                TraceError::new(e.clone(), "OPENCODE_CREATE_SESSION_FAILED"),
            );
            drop(trace);
            return Err(e);
        }
    };
    let session_id = session.id.clone();

    trace.info(&format!("Created session for generation: {}", session_id));

    trace.debug("Sending prompt for subtask generation");

    if let Err(e) = opencode_send_prompt(port, session_id.clone(), prompt, None, Some(model_config)).await {
        trace.error(
            "Failed to send prompt for generation",
            TraceError::new(e.clone(), "OPENCODE_SEND_PROMPT_FAILED"),
        );
        drop(trace);
        return Err(e);
    }

    trace.info(&format!("Prompt sent for subtask generation with model: {}", model_id));

    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(GENERATE_TIMEOUT_SECS);
    let mut continue_attempts: u32 = 0;

    trace.info("Polling for generation completion");

    loop {
        if start.elapsed() > timeout {
            trace.warn(&format!("Generation timeout for session: {}", session_id));
            let _ = opencode_abort_session(port, session_id.clone()).await;
            drop(trace);
            return Err(format!(
                "Generation timed out after {} seconds",
                GENERATE_TIMEOUT_SECS
            ));
        }

        tokio::time::sleep(POLL_INTERVAL).await;

        match opencode_poll_status(port, session_id.clone()).await {
            Ok(status) => {
                trace.debug(&format!(
                    "Generation session {} status: {}",
                    session_id, status.status
                ));

                if status.status == "idle" {
                    // Check if the agent truly completed by looking for the promise marker
                    match check_session_completion(port, &session_id).await {
                        CompletionCheckResult::Completed(message) => {
                            // Marker found - agent completed successfully
                            trace.info(&format!(
                                "Generation session {} completed with promise marker",
                                session_id
                            ));

                            // Get the last message for the result (cleaner output)
                            let response = get_session_last_message(port, &session_id)
                                .await
                                .unwrap_or(message);

                            match super::storage::reload_from_disk() {
                                Ok(new_data) => {
                                    // Verify subtasks were actually created
                                    let new_subtask_count = new_data
                                        .tasks
                                        .iter()
                                        .find(|t| t.id == task_id)
                                        .map(|t| t.subtasks.len())
                                        .unwrap_or(0);

                                    if new_subtask_count <= initial_subtask_count {
                                        trace.error(
                                            "Generation completed but no subtasks were created",
                                            TraceError::new(
                                                format!(
                                                    "initial_count={}, new_count={}, task_file={}",
                                                    initial_subtask_count, new_subtask_count, task_file_path
                                                ),
                                                "GENERATION_NO_SUBTASKS_CREATED",
                                            ),
                                        );
                                        drop(trace);
                                        return Err(format!(
                                            "Generation completed but no subtasks were created. The AI may have edited the wrong file. Expected task file: {}",
                                            task_file_path
                                        ));
                                    }

                                    let mut current_data = store.write();
                                    *current_data = new_data;
                                    trace.info(&format!(
                                        "Reloaded tasks data from disk after AI edits (subtasks: {} -> {})",
                                        initial_subtask_count, new_subtask_count
                                    ));
                                }
                                Err(e) => {
                                    trace.warn(&format!("Failed to reload from disk: {}", e));
                                }
                            }

                            trace.info(&format!("Subtasks generated for task '{}'", task.text));

                            drop(trace);
                            return Ok(GenerateSubtasksResult {
                                session_id,
                                message: response,
                            });
                        }
                        CompletionCheckResult::NotCompleted(_) => {
                            // Message exists but no marker - agent stopped prematurely
                            if continue_attempts < MAX_CONTINUE_ATTEMPTS {
                                continue_attempts += 1;
                                trace.info(&format!(
                                    "Generation session {} idle without promise marker, sending continue ({}/{})",
                                    session_id, continue_attempts, MAX_CONTINUE_ATTEMPTS
                                ));

                                if let Err(e) = send_continue(port, &session_id).await {
                                    trace.warn(&format!("Failed to send continue: {}", e));
                                }
                                continue;
                            }

                            // Max attempts reached - treat as completed anyway
                            trace.warn(&format!(
                                "Generation session {} idle without promise marker after {} continue attempts, treating as completed",
                                session_id, MAX_CONTINUE_ATTEMPTS
                            ));

                            let response = get_session_last_message(port, &session_id)
                                .await
                                .unwrap_or_else(|e| {
                                    trace.warn(&format!(
                                        "Failed to get session last message: {}",
                                        e
                                    ));
                                    "Subtasks generated successfully".to_string()
                                });

                            match super::storage::reload_from_disk() {
                                Ok(new_data) => {
                                    // Verify subtasks were actually created
                                    let new_subtask_count = new_data
                                        .tasks
                                        .iter()
                                        .find(|t| t.id == task_id)
                                        .map(|t| t.subtasks.len())
                                        .unwrap_or(0);

                                    if new_subtask_count <= initial_subtask_count {
                                        trace.error(
                                            "Generation completed but no subtasks were created",
                                            TraceError::new(
                                                format!(
                                                    "initial_count={}, new_count={}, task_file={}",
                                                    initial_subtask_count, new_subtask_count, task_file_path
                                                ),
                                                "GENERATION_NO_SUBTASKS_CREATED",
                                            ),
                                        );
                                        drop(trace);
                                        return Err(format!(
                                            "Generation completed but no subtasks were created. The AI may have edited the wrong file. Expected task file: {}",
                                            task_file_path
                                        ));
                                    }

                                    let mut current_data = store.write();
                                    *current_data = new_data;
                                    trace.info(&format!(
                                        "Reloaded tasks data from disk after AI edits (subtasks: {} -> {})",
                                        initial_subtask_count, new_subtask_count
                                    ));
                                }
                                Err(e) => {
                                    trace.warn(&format!("Failed to reload from disk: {}", e));
                                }
                            }

                            trace.info(&format!("Subtasks generated for task '{}'", task.text));

                            drop(trace);
                            return Ok(GenerateSubtasksResult {
                                session_id,
                                message: response,
                            });
                        }
                        CompletionCheckResult::MessageUnavailable => {
                            // Message not available yet - keep polling without sending continue
                            trace.debug(&format!(
                                "Generation session {} idle but message not yet available, continuing to poll",
                                session_id
                            ));
                            continue;
                        }
                    }
                }
            }
            Err(e) => {
                trace.error(
                    "Failed to poll generation status",
                    TraceError::new(e, "OPENCODE_POLL_FAILED"),
                );
            }
        }
    }
}

/// Part of a session message (used for deserializing responses).
/// Distinct from `MessagePart` which is used for sending prompts.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionMessagePart {
    #[serde(rename = "type")]
    part_type: String,
    #[serde(default)]
    text: Option<String>,
    /// For subtask parts, the prompt field contains text
    #[serde(default)]
    prompt: Option<String>,
}

/// A message in a session (used for deserializing responses).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionMessage {
    role: String,
    parts: Vec<SessionMessagePart>,
}

/// Session data containing messages (used for deserializing responses).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionData {
    messages: Vec<SessionMessage>,
}

/// Extracts text from a session message part, handling different part types.
fn extract_text_from_part(part: &SessionMessagePart) -> Option<String> {
    // Handle text parts
    if part.part_type == "text" {
        return part.text.clone();
    }

    // Handle subtask parts (they have a prompt field)
    if part.part_type == "subtask" {
        return part.prompt.clone();
    }

    // For other part types, try the text field as fallback
    part.text.clone()
}

/// Result of fetching session messages text.
enum SessionTextResult {
    /// Successfully parsed and extracted text
    Parsed(String),
    /// Parse failed but we have the raw body (might still contain the marker)
    RawBody(String),
    /// Network or other fatal error
    Error(String),
}

/// Fetches session data and extracts ALL assistant message text.
/// Scans all assistant messages to find the promise marker, not just the last one.
/// If JSON parsing fails, returns the raw body so caller can search for marker directly.
async fn get_session_messages_text(port: u16, session_id: &str) -> SessionTextResult {
    let client = client();

    let response = match client
        .get(format!("{}/session/{}", base_url_for_port(port), session_id))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(target: "tasks", "get_session_messages_text: network error for session {}: {}", session_id, e);
            return SessionTextResult::Error(format!("Failed to get session messages: {}", e));
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        tracing::warn!(target: "tasks", "get_session_messages_text: HTTP {} for session {}: {}", status, session_id, truncate_for_trace(&body));
        return SessionTextResult::Error(format!(
            "Get session failed with status {}: {}",
            status, body
        ));
    }

    // Get the raw body first so we can fallback to it if parsing fails
    let body = match response.text().await {
        Ok(b) => b,
        Err(e) => {
            tracing::warn!(target: "tasks", "get_session_messages_text: failed to read body for session {}: {}", session_id, e);
            return SessionTextResult::Error(format!("Failed to read response body: {}", e));
        }
    };

    // Try to parse the JSON
    let session_data: SessionData = match serde_json::from_str(&body) {
        Ok(d) => d,
        Err(e) => {
            tracing::warn!(target: "tasks", "get_session_messages_text: JSON parse failed for session {}: {} (body_len={})", session_id, e, body.len());
            // Return raw body so caller can search for marker directly
            return SessionTextResult::RawBody(body);
        }
    };

    // Collect text from ALL assistant messages (the marker could be in any of them)
    let text: String = session_data
        .messages
        .iter()
        .filter(|m| m.role == "assistant")
        .flat_map(|m| m.parts.iter())
        .filter_map(extract_text_from_part)
        .collect::<Vec<_>>()
        .join("\n");

    if text.is_empty() {
        tracing::debug!(target: "tasks", "get_session_messages_text: no assistant text found for session {}, returning raw body", session_id);
        return SessionTextResult::RawBody(body);
    }

    SessionTextResult::Parsed(text)
}

/// Fetches the last assistant message from a session.
/// Used to return the final message content as a result.
async fn get_session_last_message(port: u16, session_id: &str) -> Result<String, String> {
    let client = client();

    let response = client
        .get(format!("{}/session/{}", base_url_for_port(port), session_id))
        .send()
        .await
        .map_err(|e| {
            tracing::warn!(target: "tasks", "get_session_last_message: network error for session {}: {}", session_id, e);
            format!("Failed to get session messages: {}", e)
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        tracing::warn!(target: "tasks", "get_session_last_message: HTTP {} for session {}: {}", status, session_id, truncate_for_trace(&body));
        return Err(format!(
            "Get session failed with status {}: {}",
            status, body
        ));
    }

    // Get raw body first for better error handling
    let body = response.text().await.map_err(|e| {
        tracing::warn!(target: "tasks", "get_session_last_message: failed to read body for session {}: {}", session_id, e);
        format!("Failed to read response body: {}", e)
    })?;

    let session_data: SessionData = serde_json::from_str(&body).map_err(|e| {
        tracing::warn!(target: "tasks", "get_session_last_message: JSON parse failed for session {}: {} (body_len={})", session_id, e, body.len());
        format!("Failed to parse session messages: {}", e)
    })?;

    let assistant_message = session_data
        .messages
        .iter()
        .rev()
        .find(|m| m.role == "assistant")
        .ok_or_else(|| {
            tracing::warn!(target: "tasks", "get_session_last_message: no assistant message found for session {}", session_id);
            "No assistant message found in session".to_string()
        })?;

    let text: String = assistant_message
        .parts
        .iter()
        .filter_map(extract_text_from_part)
        .collect::<Vec<_>>()
        .join("\n");

    if text.is_empty() {
        tracing::warn!(target: "tasks", "get_session_last_message: assistant message has no text content for session {}", session_id);
        return Err("Assistant message has no text content".to_string());
    }

    Ok(text)
}

/// Result of checking if a session has completed with the promise marker.
enum CompletionCheckResult {
    /// Message fetched successfully, marker found - work is done
    Completed(String),
    /// Message fetched successfully, marker NOT found - agent stopped without completing
    NotCompleted(String),
    /// Could not fetch message (transient error, should keep polling without sending continue)
    MessageUnavailable,
}

/// Checks for the promise marker in the session's assistant messages.
/// Returns a discriminated result so callers can handle each case appropriately:
/// - Completed: marker found, stop polling
/// - NotCompleted: marker not found, send continue
/// - MessageUnavailable: transient error, keep polling without sending continue
async fn check_session_completion(port: u16, session_id: &str) -> CompletionCheckResult {
    match get_session_messages_text(port, session_id).await {
        SessionTextResult::Parsed(text) => {
            if text.contains(PROMISE_COMPLETED_MARKER) {
                tracing::debug!(target: "tasks", "check_session_completion: marker found in parsed text for session {}", session_id);
                CompletionCheckResult::Completed(text)
            } else {
                tracing::debug!(target: "tasks", "check_session_completion: marker NOT found in parsed text for session {} (text_len={})", session_id, text.len());
                CompletionCheckResult::NotCompleted(text)
            }
        }
        SessionTextResult::RawBody(body) => {
            // JSON parsing failed but we have the raw body - search for marker directly
            if body.contains(PROMISE_COMPLETED_MARKER) {
                tracing::info!(target: "tasks", "check_session_completion: marker found in RAW body for session {} (parse failed but marker present)", session_id);
                CompletionCheckResult::Completed(body)
            } else {
                tracing::debug!(target: "tasks", "check_session_completion: marker NOT found in raw body for session {} (body_len={})", session_id, body.len());
                CompletionCheckResult::NotCompleted(body)
            }
        }
        SessionTextResult::Error(e) => {
            tracing::warn!(target: "tasks", "check_session_completion: error fetching session {}: {}", session_id, e);
            // Network or other error - keep polling but don't send continue
            CompletionCheckResult::MessageUnavailable
        }
    }
}

async fn send_continue(port: u16, session_id: &str) -> Result<(), String> {
    let client = client();

    let request = SendPromptRequest {
        parts: vec![MessagePart {
            part_type: "text".to_string(),
            text: "continue".to_string(),
        }],
        model: Some(ModelConfig::default()),
        agent: None,
    };

    let response = client
        .post(format!(
            "{}/session/{}/prompt_async",
            base_url_for_port(port),
            session_id
        ))
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to send continue: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Send continue failed with status {}: {}",
            status, body
        ));
    }

    Ok(())
}

// ============================================================================
// Terminal Integration - Open OpenCode in terminal with pre-filled prompt
// ============================================================================

/// Default terminals to try if JUBBY_TERMINAL and TERMINAL are not set.
const FALLBACK_TERMINALS: &[&str] = &[
    "ghostty",
    "kitty",
    "alacritty",
    "wezterm",
    "gnome-terminal",
    "konsole",
    "xfce4-terminal",
    "xterm",
];

/// Builds a prompt for OpenCode based on the selected mode.
///
/// For default mode (None): Creates a simple prompt in the format: "Task: {text} - {description}. Task file: {path}"
/// For specific modes: Creates detailed prompts with instructions for brainstorm, architecture, or review sessions.
pub fn build_terminal_prompt(task: &super::types::Task, task_file_path: &str, mode: Option<OpencodeMode>) -> String {
    let description = task.description.replace('\n', " ").replace('\r', "");

    match mode {
        None => {
            // Default mode: simple prompt
            let desc_part = if description.is_empty() {
                String::new()
            } else {
                format!(" - {}", description)
            };
            format!(
                "Task: {}{}. Task file: {}",
                task.text,
                desc_part,
                task_file_path
            )
        }
        Some(OpencodeMode::Brainstorm) => {
            format!(
                r#"Modo: BRAINSTORM CRIATIVO

Task: {} - {}
Task file: {}

REGRAS:
- NÃO busque código, NÃO explore o codebase
- Foco 100% em COMO deve funcionar, UX e DX
- Discussão criativa: pergunte, sugira, explore ideias
- Ignore limitações técnicas por enquanto

AO FINALIZAR:
Pergunte se devo salvar. Se sim, atualize o campo "brainstorm"
no JSON ({}) com um resumo conciso da discussão."#,
                task.text,
                description,
                task_file_path,
                task_file_path
            )
        }
        Some(OpencodeMode::Architecture) => {
            format!(
                r#"Modo: ARQUITETURA & IMPLEMENTAÇÃO

Task: {} - {}
Task file: {}

FOCO:
- Decisões arquiteturais e trade-offs
- Performance e manutenibilidade
- Como implementar na estrutura existente
- Explore o código livremente

AO FINALIZAR:
Pergunte se devo salvar. Se sim, atualize o campo "architecture"
no JSON ({}) com um resumo conciso das decisões."#,
                task.text,
                description,
                task_file_path,
                task_file_path
            )
        }
        Some(OpencodeMode::Review) => {
            format!(
                r#"Modo: CODE REVIEW

Task: {} - {}
Task file: {}

FORMATO DO REVIEW:
Score por categoria (0-100):
- Código: qualidade, legibilidade, patterns
- Arquitetura: decisões, separação, coesão
- Testes: cobertura, casos edge
- Performance: eficiência, otimizações
- Manutenibilidade: facilidade de manter/evoluir

Breakdown: conciso, sacrifique gramática por clareza.

AO FINALIZAR:
Pergunte se devo salvar. Se sim, atualize o campo "review"
no JSON ({}) com o resultado completo do review."#,
                task.text,
                description,
                task_file_path,
                task_file_path
            )
        }
    }
}

/// Tmux session name prefix for task-specific sessions.
pub const TMUX_SESSION_PREFIX: &str = "jubby-";

/// Mode for OpenCode terminal sessions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OpencodeMode {
    Brainstorm,
    Architecture,
    Review,
}

/// Gets the tmux session name for a task (used when spawning GUI terminals).
/// 
/// Uses the first 8 characters of the task ID for readability.
/// Example: task_id "e4a3e70e-4fe3-4c9c" -> "jubby-e4a3e70e"
pub fn get_tmux_session_name(task_id: &str) -> String {
    // Use first 8 chars of task ID for readability
    let short_id = if task_id.len() > 8 {
        &task_id[..8]
    } else {
        task_id
    };
    format!("{}{}", TMUX_SESSION_PREFIX, short_id)
}

/// Finds an available GUI terminal emulator.
fn find_gui_terminal() -> Option<String> {
    // Check JUBBY_TERMINAL first
    if let Ok(terminal) = std::env::var("JUBBY_TERMINAL") {
        if !terminal.is_empty() && which_terminal(&terminal).is_some() {
            return Some(terminal);
        }
    }

    // Check TERMINAL env var
    if let Ok(terminal) = std::env::var("TERMINAL") {
        if !terminal.is_empty() && which_terminal(&terminal).is_some() {
            return Some(terminal);
        }
    }

    // Try fallback terminals
    for terminal in FALLBACK_TERMINALS {
        if which_terminal(terminal).is_some() {
            return Some(terminal.to_string());
        }
    }

    None
}

/// Checks if a terminal command is available in PATH.
fn which_terminal(name: &str) -> Option<std::path::PathBuf> {
    std::env::var_os("PATH")
        .and_then(|paths| {
            std::env::split_paths(&paths)
                .filter_map(|dir| {
                    let full_path = dir.join(name);
                    if full_path.is_file() {
                        Some(full_path)
                    } else {
                        None
                    }
                })
                .next()
        })
}

/// Opens OpenCode in a GUI terminal emulator with a tmux session.
/// Uses `tmux new-session -A` to create or attach to a task-specific session.
fn open_in_gui_terminal(
    working_dir: &str,
    prompt: &str,
    terminal: &str,
    tmux_session: &str,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "open_in_gui_terminal")
        .with("terminal", terminal.to_string())
        .with("tmux_session", tmux_session.to_string());

    trace.info(&format!(
        "Opening opencode in GUI terminal: {} (tmux session: {})",
        terminal, tmux_session
    ));

    // Pass tmux arguments directly via argv - no shell escaping needed.
    // The OS handles spaces and special characters correctly when args are
    // passed as separate argv entries rather than shell-parsed strings.
    //
    // tmux flags:
    // -A: attach-if-exists or create new session (eliminates need for kill-session)
    // -s: session name
    // -c: starting directory

    // Detailed logging to debug argument passing
    trace.info(&format!("=== TERMINAL SPAWN DEBUG ==="));
    trace.info(&format!("terminal: '{}'", terminal));
    trace.info(&format!("working_dir: '{}'", working_dir));
    trace.info(&format!("working_dir len: {}", working_dir.len()));
    trace.info(&format!("tmux_session: '{}'", tmux_session));
    trace.info(&format!("prompt (first 100 chars): '{}'", &prompt.chars().take(100).collect::<String>()));
    trace.info(&format!("prompt len: {}", prompt.len()));

    // Log each byte of working_dir to detect any hidden characters
    trace.info(&format!("working_dir bytes: {:?}", working_dir.as_bytes()));

    // Different terminals have different ways to execute commands
    // Pass args directly to tmux without sh -c wrapper to avoid shell parsing issues
    // Extract basename for matching (TERMINAL env var may contain full path like /usr/bin/xdg-terminal-exec)
    let terminal_name = std::path::Path::new(terminal)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(terminal);

    let result = match terminal_name {
        "ghostty" => {
            // Ghostty: use -- to prevent Ghostty from interpreting tmux's -c flag
            // as its own --config-file flag
            let args = [
                "-e",
                "--",
                "tmux",
                "new-session",
                "-A",
                "-s",
                tmux_session,
                "-c",
                working_dir,
                "opencode",
                prompt,
            ];
            trace.info(&format!("Ghostty args: {:?}", args));
            // Log shell-escaped version for manual testing
            trace.info(&format!(
                "Manual test cmd: ghostty -e -- tmux new-session -A -s '{}' -c '{}' opencode '{}'",
                tmux_session,
                working_dir,
                prompt.replace('\'', "'\\''")
            ));
            std::process::Command::new(terminal)
                .args(args)
                .spawn()
        }
        "alacritty" | "konsole" => {
            // These terminals use -e to execute a command
            std::process::Command::new(terminal)
                .args([
                    "-e",
                    "tmux",
                    "new-session",
                    "-A",
                    "-s",
                    tmux_session,
                    "-c",
                    working_dir,
                    "opencode",
                    prompt,
                ])
                .spawn()
        }
        "xdg-terminal-exec" => {
            // xdg-terminal-exec uses --dir= and takes command directly after --
            let dir_arg = format!("--dir={}", working_dir);
            std::process::Command::new(terminal)
                .args([
                    dir_arg.as_str(),
                    "--",
                    "tmux",
                    "new-session",
                    "-A",
                    "-s",
                    tmux_session,
                    "-c",
                    working_dir,
                    "opencode",
                    "--prompt",
                    prompt,
                ])
                .spawn()
        }
        "kitty" => {
            // Kitty doesn't need -e flag
            std::process::Command::new(terminal)
                .args([
                    "tmux",
                    "new-session",
                    "-A",
                    "-s",
                    tmux_session,
                    "-c",
                    working_dir,
                    "opencode",
                    prompt,
                ])
                .spawn()
        }
        "wezterm" => {
            // Wezterm uses "start --" to execute commands
            std::process::Command::new(terminal)
                .args([
                    "start",
                    "--",
                    "tmux",
                    "new-session",
                    "-A",
                    "-s",
                    tmux_session,
                    "-c",
                    working_dir,
                    "opencode",
                    prompt,
                ])
                .spawn()
        }
        "gnome-terminal" => {
            // GNOME Terminal uses "--" to separate options from command
            std::process::Command::new(terminal)
                .args([
                    "--",
                    "tmux",
                    "new-session",
                    "-A",
                    "-s",
                    tmux_session,
                    "-c",
                    working_dir,
                    "opencode",
                    prompt,
                ])
                .spawn()
        }
        "xfce4-terminal" | "xterm" | _ => {
            // Fallback: these terminals may need sh -c wrapper
            // Use .arg() separately for the shell command to avoid argv splitting issues
            let shell_cmd = format!(
                "tmux new-session -A -s '{}' -c '{}' opencode '{}'",
                tmux_session.replace('\'', "'\\''"),
                working_dir.replace('\'', "'\\''"),
                prompt.replace('\'', "'\\''")
            );
            std::process::Command::new(terminal)
                .args(["-e", "sh", "-c"])
                .arg(&shell_cmd)
                .spawn()
        }
    };

    match result {
        Ok(_) => {
            trace.info("GUI terminal spawned successfully with tmux session");
            drop(trace);
            Ok(())
        }
        Err(e) => {
            trace.error(
                "Failed to spawn GUI terminal",
                TraceError::new(e.to_string(), "GUI_TERMINAL_SPAWN_FAILED"),
            );
            drop(trace);
            Err(format!("Failed to open terminal {}: {}", terminal, e))
        }
    }
}

#[tauri::command]
pub async fn tasks_open_opencode_terminal(
    store: State<'_, super::TasksStore>,
    task_id: String,
    mode: Option<OpencodeMode>,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_open_opencode_terminal")
        .with("task_id", task_id.clone())
        .with("mode", format!("{:?}", mode));

    trace.info(&format!("Opening OpenCode terminal for task with mode: {:?}", mode));

    // Resolve task, folder, and compute paths
    let (task, working_directory, task_file_path) = {
        let data = store.read();
        
        let task = data
            .tasks
            .iter()
            .find(|t| t.id == task_id)
            .ok_or_else(|| format!("Task not found: {}", task_id))?
            .clone();

        // Get folder for path computation and working directory fallback
        let folder = data
            .folders
            .iter()
            .find(|f| f.id == task.folder_id)
            .ok_or_else(|| format!("Folder not found: {}", task.folder_id))?;

        // Compute task file path
        let folder_filename = super::storage::get_folder_filename(folder);
        let task_filename = super::storage::get_task_filename(&task);
        let task_file_path = super::storage::get_task_file_path(&folder_filename, &task_filename)
            .to_string_lossy()
            .to_string();

        // Determine working directory: task > folder > current dir
        let working_directory = if !task.working_directory.is_empty() {
            task.working_directory.clone()
        } else if !folder.working_directory.is_empty() {
            tracing::info!(
                target: "tasks",
                task_id = %task_id,
                folder_id = %task.folder_id,
                folder_working_directory = %folder.working_directory,
                "Using folder's working_directory as fallback for terminal"
            );
            folder.working_directory.clone()
        } else {
            // Fallback to current directory
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| "/".to_string())
        };

        (task, working_directory, task_file_path)
    };

    // Build the prompt based on mode
    let prompt = build_terminal_prompt(&task, &task_file_path, mode);
    trace.info(&format!("Prompt built (len={}, mode={:?})", prompt.len(), mode));

    // Get tmux session name for this task
    let tmux_session = get_tmux_session_name(&task_id);
    trace.info(&format!("Using tmux session: {}", tmux_session));

    // Always spawn a new GUI terminal with a task-specific tmux session.
    // - Same task = attaches to existing session (tmux new-session -A)
    // - Different task = creates/attaches to a different session
    let terminal = find_gui_terminal().ok_or_else(|| {
        trace.error(
            "No terminal emulator found",
            TraceError::new(
                "Set JUBBY_TERMINAL or TERMINAL env var, or install a supported terminal",
                "NO_TERMINAL_FOUND",
            ),
        );
        "No terminal emulator found. Set JUBBY_TERMINAL or TERMINAL env var, or install a supported terminal (ghostty, kitty, alacritty, etc.)".to_string()
    })?;

    trace.info(&format!("Found GUI terminal: {}", terminal));

    let result = open_in_gui_terminal(&working_directory, &prompt, &terminal, &tmux_session);
    
    match &result {
        Ok(_) => trace.info("OpenCode opened in GUI terminal with tmux session"),
        Err(e) => trace.error(
            "Failed to open in GUI terminal",
            TraceError::new(e.clone(), "GUI_TERMINAL_OPEN_FAILED"),
        ),
    }

    drop(trace);
    result
}
