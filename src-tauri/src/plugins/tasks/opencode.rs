use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;
use std::time::Duration;
use tauri::State;
use tokio::process::Command;

const OPENCODE_PORT: u16 = 4096;
const OPENCODE_HOST: &str = "127.0.0.1";
const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

pub struct OpenCodeServerState {
    pid: RwLock<Option<u32>>,
}

impl OpenCodeServerState {
    pub fn new() -> Self {
        Self {
            pid: RwLock::new(None),
        }
    }

    pub fn set_pid(&self, pid: Option<u32>) {
        *self.pid.write().unwrap() = pid;
    }

    pub fn get_pid(&self) -> Option<u32> {
        *self.pid.read().unwrap()
    }
}

impl Default for OpenCodeServerState {
    fn default() -> Self {
        Self::new()
    }
}

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
    pub summary: SessionSummary,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePart {
    #[serde(rename = "type")]
    pub part_type: String,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendPromptRequest {
    pub parts: Vec<MessagePart>,
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

async fn check_server_running() -> bool {
    let client = reqwest::Client::builder()
        .timeout(HEALTH_TIMEOUT)
        .build()
        .unwrap_or_default();

    match client
        .get(format!("{}/global/health", base_url()))
        .send()
        .await
    {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

#[tauri::command]
pub async fn opencode_ensure_server(state: State<'_, OpenCodeServerState>) -> Result<bool, String> {
    if check_server_running().await {
        tracing::debug!(target: "tasks", "OpenCode server already running on port {}", OPENCODE_PORT);
        return Ok(true);
    }

    tracing::info!(target: "tasks", "Starting OpenCode server on port {}", OPENCODE_PORT);

    let child = Command::new("opencode")
        .args(["serve", "--port", &OPENCODE_PORT.to_string()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn opencode server: {}", e))?;

    let pid = child.id();
    state.set_pid(pid);
    tracing::info!(target: "tasks", "OpenCode server process started with PID: {:?}", pid);

    let start = std::time::Instant::now();
    let max_wait = Duration::from_secs(10);

    while start.elapsed() < max_wait {
        tokio::time::sleep(Duration::from_millis(200)).await;

        if check_server_running().await {
            tracing::info!(target: "tasks", "OpenCode server is ready after {:?}", start.elapsed());
            return Ok(true);
        }
    }

    tracing::error!(target: "tasks", "OpenCode server failed to start within {:?}", max_wait);
    Err("OpenCode server failed to start in time".to_string())
}

#[tauri::command]
pub async fn opencode_health_check() -> Result<HealthResponse, String> {
    let client = client();

    let response = client
        .get(format!("{}/global/health", base_url()))
        .send()
        .await
        .map_err(|e| format!("Health check failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Health check returned status: {}",
            response.status()
        ));
    }

    response
        .json::<HealthResponse>()
        .await
        .map_err(|e| format!("Failed to parse health response: {}", e))
}

#[tauri::command]
pub async fn opencode_create_session(
    title: Option<String>,
) -> Result<CreateSessionResponse, String> {
    let client = client();

    let request = CreateSessionRequest { title };

    let response = client
        .post(format!("{}/session", base_url()))
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to create session: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Create session failed with status {}: {}",
            status, body
        ));
    }

    response
        .json::<CreateSessionResponse>()
        .await
        .map_err(|e| format!("Failed to parse create session response: {}", e))
}

#[tauri::command]
pub async fn opencode_send_prompt(
    session_id: String,
    prompt: String,
    agent: Option<String>,
) -> Result<(), String> {
    let client = client();

    let request = SendPromptRequest {
        parts: vec![MessagePart {
            part_type: "text".to_string(),
            text: prompt,
        }],
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
        .map_err(|e| format!("Failed to send prompt: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Send prompt failed with status {}: {}",
            status, body
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn opencode_poll_status(session_id: String) -> Result<SessionStatus, String> {
    let client = client();

    let response = client
        .get(format!("{}/session/status", base_url()))
        .send()
        .await
        .map_err(|e| format!("Failed to poll status: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
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
        .map_err(|e| format!("Failed to parse status response: {}", e))?;

    match statuses.get(&session_id) {
        Some(raw) => Ok(SessionStatus {
            session_id: session_id.clone(),
            status: raw.status_type.clone(),
            attempt: raw.attempt,
            message: raw.message.clone(),
        }),
        None => Ok(SessionStatus {
            session_id,
            status: "idle".to_string(),
            attempt: None,
            message: None,
        }),
    }
}

#[tauri::command]
pub async fn opencode_abort_session(session_id: String) -> Result<(), String> {
    let client = client();

    let response = client
        .post(format!("{}/session/{}/abort", base_url(), session_id))
        .send()
        .await
        .map_err(|e| format!("Failed to abort session: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Abort session failed with status {}: {}",
            status, body
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn opencode_stop_server(state: State<'_, OpenCodeServerState>) -> Result<(), String> {
    if let Some(pid) = state.get_pid() {
        tracing::info!(target: "tasks", "Stopping OpenCode server with PID: {}", pid);

        #[cfg(unix)]
        {
            let _ = std::process::Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .status();
        }

        state.set_pid(None);
    }
    Ok(())
}

const POLL_INTERVAL: Duration = Duration::from_millis(500);
const EXECUTION_TIMEOUT_SECS: u64 = 300;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionResult {
    pub session_id: String,
    pub outcome: String,
    pub aborted: bool,
    pub error_message: Option<String>,
}

fn build_execution_prompt(task: &super::types::Task) -> String {
    format!(
        "@{}/prd.json @{}/progress.txt\n\
1. Decide which task to work on next.\n\
This should be the one YOU decide has the highest priority,\n\
- not necessarily the first in the list.\n\
2. Check any feedback loops, such as types and tests.\n\
3. Append your progress to the progress.txt file in this structure:\n\
## [Date/Time] - [Story ID]\n\
- What was implemented\n\
- Files changed\n\
- **Learnings for future iterations:**\n\
  - Patterns discovered (e.g., \"this codebase uses X for Y\")\n\
  - Gotchas encountered (e.g., \"don't forget to update Z when changing W\")\n\
  - Useful context (e.g., \"the evaluation panel is in component X\")\n\
4. Make a git commit of that feature if the shouldCommit field is true.\n\
ONLY WORK ON A SINGLE FEATURE.\n\
If, while implementing the feature, you notice that all work\n\
is complete, output <promise>COMPLETE</promise>.\n",
        task.working_directory, task.working_directory
    )
}

#[tauri::command]
pub async fn tasks_execute_subtask(
    store: State<'_, super::TasksStore>,
    server_state: State<'_, OpenCodeServerState>,
    task_id: String,
    subtask_id: String,
) -> Result<ExecutionResult, String> {
    opencode_ensure_server(server_state).await?;

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
            return Err("Task working directory is not set".to_string());
        }

        (task, subtask)
    };

    let prompt = build_execution_prompt(&task);

    tracing::info!(target: "tasks", "Executing subtask '{}' with prompt length: {}", subtask.text, prompt.len());

    let session = opencode_create_session(Some(format!("{}: {}", task.text, subtask.text))).await?;
    let session_id = session.id.clone();

    tracing::info!(target: "tasks", "Created session: {}", session_id);

    opencode_send_prompt(session_id.clone(), prompt, None).await?;

    tracing::info!(target: "tasks", "Sent prompt to session: {}", session_id);

    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(EXECUTION_TIMEOUT_SECS);

    loop {
        if start.elapsed() > timeout {
            tracing::warn!(target: "tasks", "Execution timeout for session: {}", session_id);
            let _ = opencode_abort_session(session_id.clone()).await;
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
                tracing::debug!(target: "tasks", "Session {} status: {}", session_id, status.status);

                match status.status.as_str() {
                    "idle" => {
                        tracing::info!(target: "tasks", "Session {} completed successfully", session_id);
                        return Ok(ExecutionResult {
                            session_id,
                            outcome: "success".to_string(),
                            aborted: false,
                            error_message: None,
                        });
                    }
                    "busy" => {}
                    "retry" => {
                        tracing::debug!(target: "tasks", "Session {} is retrying (attempt: {:?})", session_id, status.attempt);
                    }
                    other => {
                        tracing::warn!(target: "tasks", "Unexpected session status: {}", other);
                    }
                }
            }
            Err(e) => {
                tracing::error!(target: "tasks", "Failed to poll session status: {}", e);
            }
        }
    }
}
