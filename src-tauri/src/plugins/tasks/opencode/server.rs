use std::time::Duration;

use tauri::State;
use tokio::process::Command;

use crate::traces::{Trace, TraceError};

use super::{
    allocate_port, base_url_for_port, OpenCodeServersState, ServerInfo, HEALTH_TIMEOUT,
    OPENCODE_PERMISSIONS,
};

/// Check if a server is running on the given port by hitting the health endpoint.
async fn check_server_running_on_port(port: u16) -> bool {
    let client = reqwest::Client::builder()
        .timeout(HEALTH_TIMEOUT)
        .build()
        .unwrap_or_default();

    match client
        .get(format!("{}/global/health", base_url_for_port(port)))
        .send()
        .await
    {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

/// Stop a server by PID and/or port.
///
/// This function:
/// 1. Kills the process by PID if provided
/// 2. Kills any process on the given port (handles orphaned servers)
/// 3. Waits briefly for cleanup
async fn stop_server_internal(pid: Option<u32>, port: u16) {
    // First, try to stop via stored PID
    if let Some(pid) = pid {
        tracing::info!(target: "tasks", "Stopping OpenCode server with PID: {}", pid);

        #[cfg(unix)]
        {
            let _ = std::process::Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .status();
        }
    }

    // Also kill any process listening on the port (handles orphaned servers from previous Jubby sessions)
    #[cfg(unix)]
    {
        let port_str = port.to_string();
        if let Ok(output) = std::process::Command::new("fuser")
            .args(["-k", &format!("{}/tcp", port_str)])
            .output()
        {
            if output.status.success() {
                tracing::info!(target: "tasks", "Killed process on port {} via fuser", port);
            }
        }
    }

    tokio::time::sleep(Duration::from_millis(500)).await;
}

/// Stop the server running for a specific directory.
///
/// Looks up the server info from state, stops it, and removes the registration.
/// Returns the port that was freed, if any.
pub async fn stop_server_for_directory(
    state: &OpenCodeServersState,
    working_directory: &str,
) -> Option<u16> {
    if let Some(server_info) = state.remove_server_for_dir(working_directory) {
        tracing::info!(
            target: "tasks",
            "Stopping OpenCode server for directory {} (port: {}, pid: {})",
            working_directory,
            server_info.port,
            server_info.pid
        );
        stop_server_internal(Some(server_info.pid), server_info.port).await;
        Some(server_info.port)
    } else {
        tracing::debug!(
            target: "tasks",
            "No server registered for directory: {}",
            working_directory
        );
        None
    }
}

/// Ensure an OpenCode server is running for the given directory.
///
/// This function manages per-directory servers:
/// - If a server is already running for the directory, returns its port
/// - If no server exists, allocates a new port and starts a new server
/// - Each directory gets its own server on a unique port
///
/// Returns the port the server is running on.
pub async fn opencode_ensure_server_with_dir(
    state: State<'_, OpenCodeServersState>,
    working_directory: Option<String>,
) -> Result<u16, String> {
    let working_directory = working_directory.ok_or_else(|| {
        "working_directory is required for per-directory server management".to_string()
    })?;

    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_ensure_server")
        .with("working_directory", working_directory.clone());

    trace.info("Ensuring OpenCode server is running for directory");

    // Check if we already have a server running for this directory
    if let Some(server_info) = state.get_server_for_dir(&working_directory) {
        let port = server_info.port;
        tracing::debug!(
            target: "tasks",
            "Found existing server registration for {} on port {}",
            working_directory,
            port
        );

        // Verify it's actually still running
        if check_server_running_on_port(port).await {
            tracing::debug!(
                target: "tasks",
                "OpenCode server already running for {} on port {}",
                working_directory,
                port
            );
            trace.info(&format!("OpenCode server already running on port {}", port));
            drop(trace);
            return Ok(port);
        }

        // Server registration exists but server is not responding - clean up and restart
        tracing::info!(
            target: "tasks",
            "Server for {} was registered on port {} but not responding, restarting",
            working_directory,
            port
        );
        state.remove_server_for_dir(&working_directory);
    }

    // Allocate a new port for this directory
    let port = allocate_port(&state).ok_or_else(|| {
        trace.error(
            "No available ports in range",
            TraceError::new(
                format!("All ports in range {}:{} are in use", super::OPENCODE_PORT_START, super::OPENCODE_PORT_END),
                "OPENCODE_NO_PORT_AVAILABLE",
            ),
        );
        "No available ports for OpenCode server".to_string()
    })?;

    trace.info(&format!("Starting OpenCode server on port {}", port));
    tracing::info!(
        target: "tasks",
        "Starting OpenCode server for {} on port {}",
        working_directory,
        port
    );

    let mut cmd = Command::new("opencode");
    cmd.args(["serve", "--port", &port.to_string()])
        .env("OPENCODE_PERMISSION", OPENCODE_PERMISSIONS)
        .env(
            "RIPGREP_CONFIG_PATH",
            dirs::config_dir()
                .map(|p| p.join("ripgrep/config"))
                .unwrap_or_default(),
        )
        .current_dir(&working_directory)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    tracing::info!(
        target: "tasks",
        "OpenCode server will use permissions: {} in directory: {}",
        OPENCODE_PERMISSIONS,
        working_directory
    );

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

    let pid = child.id().ok_or_else(|| {
        trace.error(
            "Failed to get PID of spawned process",
            TraceError::new("child.id() returned None".to_string(), "OPENCODE_NO_PID"),
        );
        "Failed to get PID of OpenCode server".to_string()
    })?;

    // Register the server in state
    let server_info = ServerInfo::new(pid, port, working_directory.clone());
    state.set_server_for_dir(working_directory.clone(), server_info);

    tracing::info!(
        target: "tasks",
        "OpenCode server process started with PID: {} for directory: {}",
        pid,
        working_directory
    );

    // Wait for server to become ready
    let start = std::time::Instant::now();
    let max_wait = Duration::from_secs(10);

    while start.elapsed() < max_wait {
        tokio::time::sleep(Duration::from_millis(200)).await;

        if check_server_running_on_port(port).await {
            tracing::info!(
                target: "tasks",
                "OpenCode server for {} is ready on port {} after {:?}",
                working_directory,
                port,
                start.elapsed()
            );
            trace.info(&format!("OpenCode server is ready on port {}", port));
            drop(trace);
            return Ok(port);
        }
    }

    // Server failed to start - clean up registration
    state.remove_server_for_dir(&working_directory);

    tracing::error!(
        target: "tasks",
        "OpenCode server for {} failed to start on port {} within {:?}",
        working_directory,
        port,
        max_wait
    );
    trace.error(
        "OpenCode server failed to start within timeout",
        TraceError::new(max_wait.as_secs().to_string(), "OPENCODE_START_TIMEOUT"),
    );
    drop(trace);
    Err("OpenCode server failed to start in time".to_string())
}

/// Stop the OpenCode server for a specific directory.
#[tauri::command]
pub async fn opencode_stop_server(
    state: State<'_, OpenCodeServersState>,
    working_directory: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_stop_server")
        .with("working_directory", working_directory.clone());
    trace.info("Stopping OpenCode server for directory");

    if let Some(port) = stop_server_for_directory(&state, &working_directory).await {
        trace.info(&format!("OpenCode server stopped (port {} freed)", port));
    } else {
        trace.info("No server was running for this directory");
    }

    drop(trace);
    Ok(())
}

/// Stop all running OpenCode servers.
/// Useful for cleanup on application exit.
#[tauri::command]
pub async fn opencode_stop_all_servers(state: State<'_, OpenCodeServersState>) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "opencode_stop_all_servers");
    trace.info("Stopping all OpenCode servers");

    let servers = state.get_all_servers();
    let count = servers.len();

    for server_info in servers {
        tracing::info!(
            target: "tasks",
            "Stopping server for {} (port: {}, pid: {})",
            server_info.working_directory,
            server_info.port,
            server_info.pid
        );
        stop_server_internal(Some(server_info.pid), server_info.port).await;
        state.remove_server_for_dir(&server_info.working_directory);
    }

    trace.info(&format!("Stopped {} servers", count));
    drop(trace);
    Ok(())
}

// ============================================================================
// DEPRECATED: Temporary backward-compatible wrappers during migration.
// These will be removed once all callers are updated to use OpenCodeServersState.
// ============================================================================

use super::OpenCodeServerState;

/// Deprecated: Use opencode_ensure_server_with_dir with OpenCodeServersState instead.
///
/// This wrapper maintains backward compatibility during the migration to per-directory
/// server management. It will be removed once all callers are updated.
#[deprecated(note = "Use opencode_ensure_server_with_dir with OpenCodeServersState instead")]
pub async fn opencode_ensure_server_with_dir_compat(
    _old_state: State<'_, OpenCodeServerState>,
    servers_state: State<'_, OpenCodeServersState>,
    working_directory: Option<String>,
) -> Result<u16, String> {
    opencode_ensure_server_with_dir(servers_state, working_directory).await
}

/// Deprecated: Simple wrapper for backward compatibility.
/// The old command expected no directory parameter and used a fixed port.
#[tauri::command]
#[deprecated(note = "Use opencode_ensure_server_with_dir with a specific directory instead")]
pub async fn opencode_ensure_server(
    servers_state: State<'_, OpenCodeServersState>,
) -> Result<bool, String> {
    // For backward compatibility, we can't start a server without a directory
    // in the new model. Return an error indicating the API has changed.
    tracing::warn!(
        target: "tasks",
        "opencode_ensure_server called without directory - this API is deprecated"
    );
    Err("opencode_ensure_server is deprecated. Use opencode_ensure_server_with_dir with a working_directory.".to_string())
}
