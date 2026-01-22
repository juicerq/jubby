use std::time::Duration;

use tauri::State;
use tokio::process::Command;

use crate::traces::{Trace, TraceError};

use super::{base_url, OpenCodeServerState, OPENCODE_PERMISSIONS, OPENCODE_PORT, HEALTH_TIMEOUT};

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

async fn stop_server_internal(state: &OpenCodeServerState) {
    if let Some(pid) = state.get_pid() {
        tracing::info!(target: "tasks", "Stopping OpenCode server with PID: {}", pid);

        #[cfg(unix)]
        {
            let _ = std::process::Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .status();
        }

        state.set_pid(None);
        state.set_directory(None);

        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

#[tauri::command]
pub async fn opencode_ensure_server(state: State<'_, OpenCodeServerState>) -> Result<bool, String> {
    opencode_ensure_server_with_dir(state, None).await
}

pub async fn opencode_ensure_server_with_dir(
    state: State<'_, OpenCodeServerState>,
    working_directory: Option<String>,
) -> Result<bool, String> {
    let trace = if let Some(ref dir) = working_directory {
        Trace::new()
            .with("plugin", "tasks")
            .with("action", "opencode_ensure_server")
            .with("has_working_directory", true)
            .with("working_directory", dir.clone())
    } else {
        Trace::new()
            .with("plugin", "tasks")
            .with("action", "opencode_ensure_server")
            .with("has_working_directory", false)
    };

    trace.info("Ensuring OpenCode server is running");

    let current_dir = state.get_directory();
    let needs_restart = match (&current_dir, &working_directory) {
        (Some(current), Some(new)) if current != new => {
            tracing::info!(target: "tasks", "Working directory changed from {} to {}, restarting server", current, new);
            true
        }
        _ => false,
    };

    if needs_restart {
        trace.info("Working directory changed, restarting server");
        stop_server_internal(&state).await;
    }

    if check_server_running().await && !needs_restart {
        tracing::debug!(target: "tasks", "OpenCode server already running on port {}", OPENCODE_PORT);
        trace.info("OpenCode server already running");
        drop(trace);
        return Ok(true);
    }

    trace.info("Starting OpenCode server");
    tracing::info!(target: "tasks", "Starting OpenCode server on port {}", OPENCODE_PORT);

    let mut cmd = Command::new("opencode");
    cmd.args(["serve", "--port", &OPENCODE_PORT.to_string()])
        .env("OPENCODE_PERMISSION", OPENCODE_PERMISSIONS)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    tracing::info!(target: "tasks", "OpenCode server will use permissions: {}", OPENCODE_PERMISSIONS);

    if let Some(ref dir) = working_directory {
        cmd.current_dir(dir);
        tracing::info!(target: "tasks", "OpenCode server will run in directory: {}", dir);
    }

    let child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            trace.error(
                "Failed to spawn OpenCode server",
                TraceError::new(e.to_string(), "OPENCODE_SPAWN_FAILED"),
            );
            drop(trace);
            return Err(format!("Failed to spawn opencode server: {}", e));
        }
    };

    let pid = child.id();
    state.set_pid(pid);
    state.set_directory(working_directory);
    tracing::info!(target: "tasks", "OpenCode server process started with PID: {:?}", pid);

    let start = std::time::Instant::now();
    let max_wait = Duration::from_secs(10);

    while start.elapsed() < max_wait {
        tokio::time::sleep(Duration::from_millis(200)).await;

        if check_server_running().await {
            tracing::info!(target: "tasks", "OpenCode server is ready after {:?}", start.elapsed());
            trace.info("OpenCode server is ready");
            drop(trace);
            return Ok(true);
        }
    }

    tracing::error!(target: "tasks", "OpenCode server failed to start within {:?}", max_wait);
    trace.error(
        "OpenCode server failed to start within timeout",
        TraceError::new(max_wait.as_secs().to_string(), "OPENCODE_START_TIMEOUT"),
    );
    drop(trace);
    Err("OpenCode server failed to start in time".to_string())
}

#[tauri::command]
pub async fn opencode_stop_server(state: State<'_, OpenCodeServerState>) -> Result<(), String> {
    let pid = state.get_pid();
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_stop_server")
        .with("had_pid", pid.is_some());
    trace.info("Stopping OpenCode server");
    stop_server_internal(&state).await;
    trace.info("OpenCode server stopped");
    drop(trace);
    Ok(())
}
