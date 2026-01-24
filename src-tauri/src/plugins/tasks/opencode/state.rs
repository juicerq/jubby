use std::collections::HashMap;
use std::sync::RwLock;

/// Information about a running OpenCode server instance for a specific directory.
#[derive(Debug, Clone)]
pub struct ServerInfo {
    /// Process ID of the OpenCode server
    pub pid: u32,
    /// Port the server is listening on
    pub port: u16,
    /// Canonical working directory this server is running in
    pub working_directory: String,
}

impl ServerInfo {
    pub fn new(pid: u32, port: u16, working_directory: String) -> Self {
        Self {
            pid,
            port,
            working_directory,
        }
    }
}

/// State for managing multiple OpenCode servers, one per working directory.
///
/// This allows running tasks in different directories concurrently without
/// conflicts, since each directory has its own git repository and codebase.
pub struct OpenCodeServersState {
    /// Map from canonical working directory to server info
    servers: RwLock<HashMap<String, ServerInfo>>,
}

impl OpenCodeServersState {
    pub fn new() -> Self {
        Self {
            servers: RwLock::new(HashMap::new()),
        }
    }

    /// Get server info for a specific directory, if one is running.
    pub fn get_server_for_dir(&self, working_directory: &str) -> Option<ServerInfo> {
        self.servers
            .read()
            .expect("servers lock poisoned")
            .get(working_directory)
            .cloned()
    }

    /// Register a server for a specific directory.
    pub fn set_server_for_dir(&self, working_directory: String, info: ServerInfo) {
        self.servers
            .write()
            .expect("servers lock poisoned")
            .insert(working_directory, info);
    }

    /// Remove the server registration for a directory.
    /// Returns the removed ServerInfo if one existed.
    pub fn remove_server_for_dir(&self, working_directory: &str) -> Option<ServerInfo> {
        self.servers
            .write()
            .expect("servers lock poisoned")
            .remove(working_directory)
    }

    /// Get all registered servers.
    pub fn get_all_servers(&self) -> Vec<ServerInfo> {
        self.servers
            .read()
            .expect("servers lock poisoned")
            .values()
            .cloned()
            .collect()
    }

    /// Check if a port is already in use by any server.
    pub fn is_port_in_use(&self, port: u16) -> bool {
        self.servers
            .read()
            .expect("servers lock poisoned")
            .values()
            .any(|info| info.port == port)
    }
}

impl Default for OpenCodeServersState {
    fn default() -> Self {
        Self::new()
    }
}
