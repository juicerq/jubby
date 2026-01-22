use std::sync::RwLock;

pub struct OpenCodeServerState {
    pid: RwLock<Option<u32>>,
    current_directory: RwLock<Option<String>>,
}

impl OpenCodeServerState {
    pub fn new() -> Self {
        Self {
            pid: RwLock::new(None),
            current_directory: RwLock::new(None),
        }
    }

    pub fn set_pid(&self, pid: Option<u32>) {
        *self.pid.write().unwrap() = pid;
    }

    pub fn get_pid(&self) -> Option<u32> {
        *self.pid.read().unwrap()
    }

    pub fn set_directory(&self, dir: Option<String>) {
        *self.current_directory.write().unwrap() = dir;
    }

    pub fn get_directory(&self) -> Option<String> {
        self.current_directory.read().unwrap().clone()
    }
}

impl Default for OpenCodeServerState {
    fn default() -> Self {
        Self::new()
    }
}
