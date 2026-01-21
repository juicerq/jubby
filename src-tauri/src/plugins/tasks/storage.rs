use crate::shared::paths::{ensure_dir, get_plugin_dir};
use super::types::{Folder, Tag, Task, TasksData, TaskStatus};
use std::path::PathBuf;

fn get_tasks_dir() -> PathBuf {
    get_plugin_dir("tasks")
}

fn get_old_todo_dir() -> PathBuf {
    get_plugin_dir("todo")
}

fn get_data_path() -> PathBuf {
    get_tasks_dir().join("tasks.json")
}

fn get_old_data_path() -> PathBuf {
    get_old_todo_dir().join("todo.json")
}

fn get_sqlite_path() -> PathBuf {
    crate::shared::paths::get_storage_dir().join("jubby.db")
}

fn get_sqlite_backup_path() -> PathBuf {
    crate::shared::paths::get_storage_dir().join("jubby.db.bak")
}

pub fn load_or_migrate() -> Result<TasksData, Box<dyn std::error::Error>> {
    let json_path = get_data_path();
    let old_json_path = get_old_data_path();
    let sqlite_path = get_sqlite_path();

    if json_path.exists() {
        let mut data = load_from_json(&json_path)?;
        if migrate_subtask_data(&mut data) {
            tracing::info!(target: "tasks", "Migrated subtask data to new format");
            save_to_json(&data)?;
        }
        return Ok(data);
    }

    if old_json_path.exists() {
        tracing::info!(target: "tasks", "Found old todo/todo.json, migrating to tasks/tasks.json...");
        let mut data = load_from_json(&old_json_path)?;
        migrate_subtask_data(&mut data);
        save_to_json(&data)?;

        if let Err(e) = std::fs::remove_dir_all(get_old_todo_dir()) {
            tracing::warn!(target: "tasks", "Could not remove old todo directory: {}", e);
        } else {
            tracing::info!(target: "tasks", "Old todo directory removed");
        }

        return Ok(data);
    }

    if sqlite_path.exists() {
        tracing::info!(target: "tasks", "Found SQLite database, migrating to JSON...");
        let data = migrate_from_sqlite(&sqlite_path)?;
        save_to_json(&data)?;

        let backup_path = get_sqlite_backup_path();
        std::fs::rename(&sqlite_path, &backup_path)?;
        tracing::info!(target: "tasks", "SQLite database backed up to {:?}", backup_path);

        return Ok(data);
    }

    Ok(TasksData::default())
}

fn load_from_json(path: &PathBuf) -> Result<TasksData, Box<dyn std::error::Error>> {
    let content = std::fs::read_to_string(path)?;
    let data: TasksData = serde_json::from_str(&content)?;
    Ok(data)
}

fn migrate_subtask_data(data: &mut TasksData) -> bool {
    let mut migrated = false;
    
    for task in &mut data.tasks {
        for (index, subtask) in task.subtasks.iter_mut().enumerate() {
            if let Some(completed) = subtask.completed.take() {
                subtask.status = if completed {
                    TaskStatus::Completed
                } else {
                    TaskStatus::Waiting
                };
                migrated = true;
            }
            
            if let Some(position) = subtask.position.take() {
                subtask.order = position as u32;
                migrated = true;
            } else if subtask.order == 0 && index > 0 {
                subtask.order = index as u32;
                migrated = true;
            }
        }
    }
    
    migrated
}

pub fn save_to_json(data: &TasksData) -> Result<(), Box<dyn std::error::Error>> {
    let dir = get_tasks_dir();
    ensure_dir(&dir)?;

    let path = get_data_path();
    let content = serde_json::to_string_pretty(data)?;
    std::fs::write(&path, content)?;
    Ok(())
}

fn migrate_from_sqlite(path: &PathBuf) -> Result<TasksData, Box<dyn std::error::Error>> {
    use rusqlite::Connection;

    let conn = Connection::open(path)?;

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

    let mut tasks = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT id, folder_id, text, status, created_at FROM todos",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Task {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                text: row.get(2)?,
                status: row.get(3)?,
                created_at: row.get(4)?,
                description: String::new(),
                working_directory: String::new(),
                tag_ids: Vec::new(),
                subtasks: Vec::new(),
            })
        })?;
        for row in rows {
            tasks.push(row?);
        }
    }

    {
        let mut stmt = conn.prepare("SELECT todo_id, tag_id FROM todo_tags")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (task_id, tag_id) = row?;
            if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
                task.tag_ids.push(tag_id);
            }
        }
    }

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
        target: "tasks",
        "Migrated {} folders, {} tasks, {} tags from SQLite",
        folders.len(),
        tasks.len(),
        tags.len()
    );

    Ok(TasksData { folders, tasks, tags })
}
