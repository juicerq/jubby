pub mod commands;
pub mod helpers;
pub mod opencode;
pub mod storage;
pub mod types;

use std::sync::RwLock;
use types::TasksData;

/// Thread-safe in-memory store with file persistence.
pub struct TasksStore(pub RwLock<TasksData>);

impl TasksStore {
    pub fn new(data: TasksData) -> Self {
        Self(RwLock::new(data))
    }

    pub fn read(&self) -> std::sync::RwLockReadGuard<'_, TasksData> {
        self.0.read().unwrap()
    }

    pub fn write(&self) -> std::sync::RwLockWriteGuard<'_, TasksData> {
        self.0.write().unwrap()
    }
}

/// Initialize the tasks store, migrating from SQLite or old todo directory if needed.
pub fn init_tasks_store() -> Result<TasksStore, Box<dyn std::error::Error>> {
    let data = storage::load_or_migrate()?;
    tracing::info!(
        target: "tasks",
        "Tasks store initialized: {} folders, {} tasks, {} tags",
        data.folders.len(),
        data.tasks.len(),
        data.tags.len()
    );
    Ok(TasksStore::new(data))
}
