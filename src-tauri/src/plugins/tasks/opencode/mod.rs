pub mod server;
pub mod persistence;
mod state;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tauri::State;

use crate::traces::{Trace, TraceError};

pub use server::opencode_ensure_server_with_dir;
pub use persistence::ActiveSessions;
pub use state::OpenCodeServerState;

const OPENCODE_PORT: u16 = 4096;
const OPENCODE_HOST: &str = "127.0.0.1";
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

fn base_url() -> String {
    format!("http://{}:{}", OPENCODE_HOST, OPENCODE_PORT)
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
pub async fn opencode_health_check() -> Result<HealthResponse, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_health_check");
    trace.info("Checking OpenCode server health");

    let client = client();

    let response = client
        .get(format!("{}/global/health", base_url()))
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
    title: Option<String>,
) -> Result<CreateSessionResponse, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_create_session")
        .with("has_title", title.is_some());

    trace.info("Creating OpenCode session");

    let client = client();

    let request = CreateSessionRequest { title };

    let response = client
        .post(format!("{}/session", base_url()))
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

    trace.info(&format!("Create session succeeded: {}", parsed.id));
    drop(trace);

    Ok(parsed)
}

#[tauri::command]
pub async fn opencode_send_prompt(
    session_id: String,
    prompt: String,
    agent: Option<String>,
    model: Option<ModelConfig>,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_send_prompt")
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
            base_url(),
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
pub async fn opencode_poll_status(session_id: String) -> Result<SessionStatus, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_poll_status")
        .with("session_id", session_id.clone());
    trace.debug("Polling OpenCode session status");

    let client = client();

    let response = client
        .get(format!("{}/session/status", base_url()))
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
pub async fn opencode_abort_session(session_id: String) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_abort_session")
        .with("session_id", session_id.clone());
    trace.info("Aborting OpenCode session");

    let client = client();

    let response = client
        .post(format!("{}/session/{}/abort", base_url(), session_id))
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

fn get_tasks_json_path() -> String {
    crate::shared::paths::get_plugin_dir("tasks")
        .join("tasks.json")
        .to_string_lossy()
        .to_string()
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

fn build_execution_prompt(
    task: &super::types::Task,
    subtask: &super::types::Subtask,
) -> String {
    let tasks_json_path = get_tasks_json_path();

    format!(
        r#"You are executing a single subtask for the Jubby Tasks plugin.

Rules:
- ONLY work on this subtask. Do not start other subtasks.
- You MUST edit the tasks.json file directly to record your changes and execution log.
- If shouldCommit = true, you MUST create a git commit for this subtask.
- After completion, update the subtask status in tasks.json:
  - "completed" if successful
  - "failed" if you could not complete or hit an error

Data source (single source of truth):
- tasks.json path: {tasks_json_path}

Task context:
- taskId: {task_id}
- subtaskId: {subtask_id}
- taskText: {task_text}
- taskDescription: {task_description}
- subtaskText: {subtask_text}
- subtaskNotes: {subtask_notes}
- subtaskSteps:
{subtask_steps}
- shouldCommit: {should_commit}

What you must do:
1) Implement only this subtask.
2) Update tasks.json:
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
        tasks_json_path = tasks_json_path,
        task_id = task.id,
        subtask_id = subtask.id,
        task_text = task.text,
        task_description = task.description,
        subtask_text = subtask.text,
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
) {
    let mut data = store.write();
    if let Some(task) = data.tasks.iter_mut().find(|t| t.id == task_id) {
        if let Some(subtask) = task.subtasks.iter_mut().find(|s| s.id == subtask_id) {
            subtask.status = status;
        }
    }
    if let Err(e) = super::storage::save_to_json(&data) {
        tracing::error!(target: "tasks", "Failed to save subtask status update: {}", e);
    }
}

#[tauri::command]
pub async fn tasks_execute_subtask(
    store: State<'_, super::TasksStore>,
    server_state: State<'_, OpenCodeServerState>,
    task_id: String,
    subtask_id: String,
) -> Result<ExecutionResult, String> {
    let (task, subtask) = {
        let data = store.read();
        let task = data
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

        if task.working_directory.is_empty() {
            let trace = Trace::new()
                .with("plugin", "tasks")
                .with("action", "tasks_execute_subtask")
                .with("task_id", task_id.clone())
                .with("subtask_id", subtask_id.clone());
            trace.error(
                "Working directory missing for task execution",
                TraceError::new("Task working directory is not set", "WORKING_DIRECTORY_MISSING"),
            );
            drop(trace);
            return Err("Task working directory is not set".to_string());
        }

        (task, subtask)
    };

    opencode_ensure_server_with_dir(server_state, Some(task.working_directory.clone())).await?;

    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_execute_subtask")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone())
        .with("working_directory", task.working_directory.clone());

    trace.info("OpenCode server ready for execution");

    let prompt = build_execution_prompt(&task, &subtask);

    trace.info(&format!(
        "Executing subtask '{}' with prompt length: {}",
        subtask.text,
        prompt.len()
    ));

    let session = opencode_create_session(Some(format!("{}: {}", task.text, subtask.text))).await?;
    let session_id = session.id.clone();

    trace.info(&format!("Created session: {}", session_id));

    opencode_send_prompt(session_id.clone(), prompt, None, None).await?;

    trace.info(&format!("Sent prompt to session: {}", session_id));

    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(EXECUTION_TIMEOUT_SECS);
    let mut continue_attempts: u32 = 0;

    trace.info("Polling for execution completion");

    loop {
        if start.elapsed() > timeout {
            trace.warn(&format!("Execution timeout for session: {}", session_id));
            let _ = opencode_abort_session(session_id.clone()).await;

            update_subtask_status(&store, &task_id, &subtask_id, super::types::TaskStatus::Failed);

            drop(trace);
            return Ok(ExecutionResult {
                session_id,
                outcome: "failed".to_string(),
                aborted: true,
                error_message: Some(format!("Execution timed out after {} seconds", EXECUTION_TIMEOUT_SECS)),
            });
        }

        tokio::time::sleep(POLL_INTERVAL).await;

        match opencode_poll_status(session_id.clone()).await {
            Ok(status) => {
                trace.debug(&format!("Session {} status: {}", session_id, status.status));

                match status.status.as_str() {
                    "idle" => {
                        // Check if the agent truly completed by looking for the promise marker
                        let has_promise = match check_session_has_promise(&session_id).await {
                            Ok(has) => has,
                            Err(e) => {
                                trace.warn(&format!("Failed to check promise marker: {}", e));
                                // Assume completed if we can't check
                                true
                            }
                        };

                        if !has_promise && continue_attempts < MAX_CONTINUE_ATTEMPTS {
                            continue_attempts += 1;
                            trace.info(&format!(
                                "Session {} idle without promise marker, sending continue ({}/{})",
                                session_id, continue_attempts, MAX_CONTINUE_ATTEMPTS
                            ));

                            if let Err(e) = send_continue(&session_id).await {
                                trace.warn(&format!("Failed to send continue: {}", e));
                            }
                            // Continue polling
                            continue;
                        }

                        if !has_promise {
                            trace.warn(&format!(
                                "Session {} idle without promise marker after {} continue attempts, treating as completed",
                                session_id, MAX_CONTINUE_ATTEMPTS
                            ));
                        }

                        trace.info(&format!(
                            "Session {} completed successfully",
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

                        update_subtask_status(&store, &task_id, &subtask_id, super::types::TaskStatus::Completed);

                        drop(trace);
                        return Ok(ExecutionResult {
                            session_id,
                            outcome: "success".to_string(),
                            aborted: false,
                            error_message: None,
                        });
                    }
                    "busy" => {}
                    "retry" => {
                        trace.debug(&format!(
                            "Session {} is retrying (attempt: {:?})",
                            session_id, status.attempt
                        ));
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

fn build_generate_prompt(task: &super::types::Task) -> String {
    let tasks_json_path = get_tasks_json_path();

    format!(
        r#"You are generating subtasks for the Jubby Tasks plugin.

Rules:
- Create a full plan BEFORE updating tasks.json (keep it short).
- Do NOT edit any file except tasks.json.
- Do NOT implement code or change the repo.
- Do NOT return a JSON array in the response.
- You MUST edit the tasks.json file directly to append the subtasks.
- Keep subtasks atomic and ordered by dependency (prerequisites first).
- For ALL id fields, you MUST generate UUIDs using: uuidgen (run this command in bash for each id you need)
- NEVER manually type or invent UUID strings - always use the uuidgen command.

Data source (single source of truth):
- tasks.json path: {tasks_json_path}

Task context:
- taskId: {task_id}
- taskText: {task_text}
- taskDescription: {task_description}

Subtask schema (append to this task's subtasks array):
- id: run `uuidgen` to generate
- text: short 1-sentence description
- status: "waiting"
- order: next order number (count existing subtasks)
- category: "functional" or "test"
- steps: array of steps, each {{ id: run `uuidgen`, text: string, completed: false }}
- shouldCommit: true/false
- notes: optional extra context (can be empty string)
- executionLogs: empty array []

What you must do:
1) Create a full plan for the task (written in your response).
2) Open tasks.json and locate the task by taskId.
3) For each subtask and step, run `uuidgen` to get a proper UUID for the id field.
4) Append new subtasks to task.subtasks following the schema above.
5) Do NOT modify other tasks.
6) Do NOT return JSON. Respond with a brief confirmation and how many subtasks were added.

IMPORTANT: When you have fully completed generating all subtasks and updated tasks.json, you MUST end your final message with:
<promise>completed</promise>

This marker signals that you are truly done. Do NOT include this marker if you still have pending work.
"#,
        tasks_json_path = tasks_json_path,
        task_id = task.id,
        task_text = task.text,
        task_description = task.description,
    )
}

#[tauri::command]
pub async fn tasks_generate_subtasks(
    store: State<'_, super::TasksStore>,
    server_state: State<'_, OpenCodeServerState>,
    task_id: String,
) -> Result<GenerateSubtasksResult, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_generate_subtasks")
        .with("task_id", task_id.clone());

    let task = {
        let data = store.read();
        data.tasks
            .iter()
            .find(|t| t.id == task_id)
            .ok_or_else(|| format!("Task not found: {}", task_id))?
            .clone()
    };

    if task.description.trim().is_empty() {
        trace.error(
            "Task description is empty",
            TraceError::new("Please add a description first", "DESCRIPTION_EMPTY"),
        );
        drop(trace);
        return Err("Task description is empty. Please add a description first.".to_string());
    }

    opencode_ensure_server_with_dir(server_state, Some(task.working_directory.clone())).await?;

    trace.info("OpenCode server ready for subtask generation");

    let prompt = build_generate_prompt(&task);

    trace.info(&format!(
        "Generating subtasks for task '{}' with prompt length: {}",
        task.text,
        prompt.len()
    ));

    let session = opencode_create_session(Some(format!("Generate subtasks: {}", task.text))).await?;
    let session_id = session.id.clone();

    trace.info(&format!("Created session for generation: {}", session_id));

    opencode_send_prompt(session_id.clone(), prompt, None, None).await?;

    trace.info("Prompt sent for subtask generation");

    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(GENERATE_TIMEOUT_SECS);
    let mut continue_attempts: u32 = 0;

    trace.info("Polling for generation completion");

    loop {
        if start.elapsed() > timeout {
            trace.warn(&format!("Generation timeout for session: {}", session_id));
            let _ = opencode_abort_session(session_id.clone()).await;
            drop(trace);
            return Err(format!(
                "Generation timed out after {} seconds",
                GENERATE_TIMEOUT_SECS
            ));
        }

        tokio::time::sleep(POLL_INTERVAL).await;

        match opencode_poll_status(session_id.clone()).await {
            Ok(status) => {
                trace.debug(&format!(
                    "Generation session {} status: {}",
                    session_id, status.status
                ));

                if status.status == "idle" {
                    // Check if the agent truly completed by looking for the promise marker
                    let has_promise = match check_session_has_promise(&session_id).await {
                        Ok(has) => has,
                        Err(e) => {
                            trace.warn(&format!("Failed to check promise marker: {}", e));
                            // Assume completed if we can't check
                            true
                        }
                    };

                    if !has_promise && continue_attempts < MAX_CONTINUE_ATTEMPTS {
                        continue_attempts += 1;
                        trace.info(&format!(
                            "Generation session {} idle without promise marker, sending continue ({}/{})",
                            session_id, continue_attempts, MAX_CONTINUE_ATTEMPTS
                        ));

                        if let Err(e) = send_continue(&session_id).await {
                            trace.warn(&format!("Failed to send continue: {}", e));
                        }
                        // Continue polling
                        continue;
                    }

                    if !has_promise {
                        trace.warn(&format!(
                            "Generation session {} idle without promise marker after {} continue attempts, treating as completed",
                            session_id, MAX_CONTINUE_ATTEMPTS
                        ));
                    }

                    trace.info(&format!("Generation session {} completed", session_id));

                    let response = get_session_last_message(&session_id).await?;

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

                    trace.info(&format!("Subtasks generated for task '{}'", task.text));

                    drop(trace);
                    return Ok(GenerateSubtasksResult {
                        session_id,
                        message: response,
                    });
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

async fn get_session_last_message(session_id: &str) -> Result<String, String> {
    let client = client();

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct MessagePart {
        #[serde(rename = "type")]
        part_type: String,
        #[serde(default)]
        text: Option<String>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Message {
        role: String,
        parts: Vec<MessagePart>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SessionMessages {
        messages: Vec<Message>,
    }

    let response = client
        .get(format!("{}/session/{}", base_url(), session_id))
        .send()
        .await
        .map_err(|e| format!("Failed to get session messages: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Get session failed with status {}: {}",
            status, body
        ));
    }

    let session_data: SessionMessages = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse session messages: {}", e))?;

    let assistant_message = session_data
        .messages
        .iter()
        .rev()
        .find(|m| m.role == "assistant")
        .ok_or("No assistant message found in session")?;

    let text = assistant_message
        .parts
        .iter()
        .filter_map(|p| {
            if p.part_type == "text" {
                p.text.clone()
            } else {
                None
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    if text.is_empty() {
        return Err("Assistant message has no text content".to_string());
    }

    Ok(text)
}

async fn check_session_has_promise(session_id: &str) -> Result<bool, String> {
    let last_message = get_session_last_message(session_id).await?;
    Ok(last_message.contains(PROMISE_COMPLETED_MARKER))
}

async fn send_continue(session_id: &str) -> Result<(), String> {
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
            base_url(),
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
