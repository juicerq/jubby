pub mod commands;
pub mod storage;
pub mod types;

use std::sync::RwLock;
use types::TodoData;

/// Thread-safe in-memory store with file persistence.
pub struct TodoStore(pub RwLock<TodoData>);

impl TodoStore {
    pub fn new(data: TodoData) -> Self {
        Self(RwLock::new(data))
    }

    pub fn read(&self) -> std::sync::RwLockReadGuard<'_, TodoData> {
        self.0.read().unwrap()
    }

    pub fn write(&self) -> std::sync::RwLockWriteGuard<'_, TodoData> {
        self.0.write().unwrap()
    }
}

/// Initialize the todo store, migrating from SQLite if needed.
pub fn init_todo_store() -> Result<TodoStore, Box<dyn std::error::Error>> {
    let data = storage::load_or_migrate()?;
    tracing::info!(
        target: "todo",
        "Todo store initialized: {} folders, {} todos, {} tags",
        data.folders.len(),
        data.todos.len(),
        data.tags.len()
    );
    Ok(TodoStore::new(data))
}
