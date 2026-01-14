use rusqlite::Connection;
use serde::Deserialize;
use std::fs;
use std::path::Path;

/// Run database schema migrations
pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        -- Todos table
        CREATE TABLE IF NOT EXISTS todos (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')),
            created_at INTEGER NOT NULL
        );

        -- Tags table
        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL
        );

        -- Todo-Tags relation (N:N)
        CREATE TABLE IF NOT EXISTS todo_tags (
            todo_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (todo_id, tag_id),
            FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        -- Index for faster queries
        CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at DESC);
        ",
    )?;

    eprintln!("[JUBBY] Database schema migrations completed");
    Ok(())
}

// Legacy data structures for migration

#[derive(Deserialize)]
struct LegacyTodoStorage {
    todos: Vec<LegacyTodo>,
    #[serde(default)]
    tags: Vec<LegacyTag>,
}

#[derive(Deserialize)]
struct LegacyTodo {
    id: String,
    text: String,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    completed: Option<bool>,
    #[serde(rename = "createdAt")]
    created_at: i64,
    #[serde(default, rename = "tagIds")]
    tag_ids: Vec<String>,
}

#[derive(Deserialize)]
struct LegacyTag {
    id: String,
    name: String,
    color: String,
}

/// Migrate legacy JSON data to SQLite
pub fn migrate_legacy_json(
    conn: &Connection,
    storage_dir: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let json_path = storage_dir.join("todo.json");

    if !json_path.exists() {
        return Ok(());
    }

    eprintln!("[JUBBY] Found legacy todo.json, starting migration...");

    // Read and parse JSON
    let json_content = fs::read_to_string(&json_path)?;
    let legacy_data: LegacyTodoStorage = serde_json::from_str(&json_content)?;

    // Check if we already have data (avoid duplicate migration)
    let existing_count: i64 = conn.query_row("SELECT COUNT(*) FROM todos", [], |row| row.get(0))?;
    if existing_count > 0 {
        eprintln!("[JUBBY] Database already has data, skipping migration");
        // Rename the file anyway to avoid repeated attempts
        let backup_path = storage_dir.join("todo.json.bak");
        fs::rename(&json_path, &backup_path)?;
        return Ok(());
    }

    // Insert tags
    for tag in &legacy_data.tags {
        conn.execute(
            "INSERT OR IGNORE INTO tags (id, name, color) VALUES (?1, ?2, ?3)",
            [&tag.id, &tag.name, &tag.color],
        )?;
    }

    // Insert todos
    for todo in &legacy_data.todos {
        // Handle legacy `completed` field migration to `status`
        let status = match &todo.status {
            Some(s) => s.clone(),
            None => {
                if todo.completed.unwrap_or(false) {
                    "completed".to_string()
                } else {
                    "pending".to_string()
                }
            }
        };

        conn.execute(
            "INSERT OR IGNORE INTO todos (id, text, status, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![&todo.id, &todo.text, &status, todo.created_at],
        )?;

        // Insert todo-tag relations
        for tag_id in &todo.tag_ids {
            conn.execute(
                "INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?1, ?2)",
                [&todo.id, tag_id],
            )?;
        }
    }

    // Backup the JSON file
    let backup_path = storage_dir.join("todo.json.bak");
    fs::rename(&json_path, &backup_path)?;

    eprintln!(
        "[JUBBY] Migration completed: {} todos, {} tags migrated",
        legacy_data.todos.len(),
        legacy_data.tags.len()
    );

    Ok(())
}
