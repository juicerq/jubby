use crate::shared::paths::{ensure_dir, get_plugin_dir};
use super::types::{Folder, Tag, Todo, TodoData};
use std::path::PathBuf;

fn get_todo_dir() -> PathBuf {
    get_plugin_dir("todo")
}

fn get_data_path() -> PathBuf {
    get_todo_dir().join("todo.json")
}

fn get_sqlite_path() -> PathBuf {
    crate::shared::paths::get_storage_dir().join("jubby.db")
}

fn get_sqlite_backup_path() -> PathBuf {
    crate::shared::paths::get_storage_dir().join("jubby.db.bak")
}

/// Load todo data from JSON or migrate from SQLite if needed.
pub fn load_or_migrate() -> Result<TodoData, Box<dyn std::error::Error>> {
    let json_path = get_data_path();
    let sqlite_path = get_sqlite_path();

    // If JSON exists, load it
    if json_path.exists() {
        return load_from_json(&json_path);
    }

    // If SQLite exists, migrate it
    if sqlite_path.exists() {
        tracing::info!(target: "todo", "Found SQLite database, migrating to JSON...");
        let data = migrate_from_sqlite(&sqlite_path)?;
        save_to_json(&data)?;

        // Backup SQLite file
        let backup_path = get_sqlite_backup_path();
        std::fs::rename(&sqlite_path, &backup_path)?;
        tracing::info!(target: "todo", "SQLite database backed up to {:?}", backup_path);

        return Ok(data);
    }

    // Fresh install
    Ok(TodoData::default())
}

fn load_from_json(path: &PathBuf) -> Result<TodoData, Box<dyn std::error::Error>> {
    let content = std::fs::read_to_string(path)?;
    let data: TodoData = serde_json::from_str(&content)?;
    Ok(data)
}

pub fn save_to_json(data: &TodoData) -> Result<(), Box<dyn std::error::Error>> {
    let dir = get_todo_dir();
    ensure_dir(&dir)?;

    let path = get_data_path();
    let content = serde_json::to_string_pretty(data)?;
    std::fs::write(&path, content)?;
    Ok(())
}

fn migrate_from_sqlite(path: &PathBuf) -> Result<TodoData, Box<dyn std::error::Error>> {
    use rusqlite::Connection;

    let conn = Connection::open(path)?;

    // Load folders
    let mut folders = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT id, name, position, created_at FROM folders ORDER BY position ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Folder {
                id: row.get(0)?,
                name: row.get(1)?,
                position: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        for row in rows {
            folders.push(row?);
        }
    }

    // Load todos
    let mut todos = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT id, folder_id, text, status, created_at FROM todos",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Todo {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                text: row.get(2)?,
                status: row.get(3)?,
                created_at: row.get(4)?,
                tag_ids: Vec::new(),
            })
        })?;
        for row in rows {
            todos.push(row?);
        }
    }

    // Load todo-tag relations
    {
        let mut stmt = conn.prepare("SELECT todo_id, tag_id FROM todo_tags")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (todo_id, tag_id) = row?;
            if let Some(todo) = todos.iter_mut().find(|t| t.id == todo_id) {
                todo.tag_ids.push(tag_id);
            }
        }
    }

    // Load tags
    let mut tags = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT id, folder_id, name, color FROM tags",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                name: row.get(2)?,
                color: row.get(3)?,
            })
        })?;
        for row in rows {
            tags.push(row?);
        }
    }

    tracing::info!(
        target: "todo",
        "Migrated {} folders, {} todos, {} tags from SQLite",
        folders.len(),
        todos.len(),
        tags.len()
    );

    Ok(TodoData { folders, todos, tags })
}
