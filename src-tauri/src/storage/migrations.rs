use rusqlite::Connection;
use serde::Deserialize;
use std::fs;
use std::path::Path;

/// Run database schema migrations
pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        -- Folders table (must be created first as todos and tags reference it)
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            position INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );

        -- Index for folder ordering
        CREATE INDEX IF NOT EXISTS idx_folders_position ON folders(position ASC);
        ",
    )?;

    // Check if folder_id column exists on todos table
    let todos_has_folder_id = conn
        .prepare("SELECT folder_id FROM todos LIMIT 1")
        .is_ok();

    if !todos_has_folder_id {
        // Check if todos table exists and has data
        let todos_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='todos'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map(|count| count > 0)
            .unwrap_or(false);

        if todos_exists {
            // Migrate existing schema: recreate tables with folder_id
            migrate_to_folders_schema(conn)?;
        } else {
            // Fresh install: create tables with folder_id from the start
            create_tables_with_folders(conn)?;
        }
    } else {
        // Tables already have folder_id, ensure all tables exist
        create_tables_with_folders(conn)?;
    }

    tracing::info!(target: "system", "Database schema migrations completed");
    Ok(())
}

/// Create tables with folder support (fresh install or after migration)
fn create_tables_with_folders(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        -- Todos table with folder support
        CREATE TABLE IF NOT EXISTS todos (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')),
            created_at INTEGER NOT NULL,
            folder_id TEXT NOT NULL,
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
        );

        -- Tags table with folder support (unique per folder)
        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            folder_id TEXT NOT NULL,
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
            UNIQUE(name, folder_id)
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
        CREATE INDEX IF NOT EXISTS idx_todos_folder_id ON todos(folder_id);
        CREATE INDEX IF NOT EXISTS idx_tags_folder_id ON tags(folder_id);
        ",
    )?;
    Ok(())
}

/// Migrate existing tables to include folder_id
fn migrate_to_folders_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    use std::time::{SystemTime, UNIX_EPOCH};
    use uuid::Uuid;

    tracing::info!(target: "system", "Migrating existing data to folder schema...");

    // Create default folder
    let default_folder_id = Uuid::new_v4().to_string();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis() as i64;

    conn.execute(
        "INSERT INTO folders (id, name, position, created_at) VALUES (?1, 'Default', 0, ?2)",
        rusqlite::params![&default_folder_id, now],
    )?;

    // Migrate todos: create new table, copy data, drop old, rename
    conn.execute_batch(&format!(
        "
        -- Create new todos table with folder_id
        CREATE TABLE todos_new (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')),
            created_at INTEGER NOT NULL,
            folder_id TEXT NOT NULL,
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
        );

        -- Copy existing todos with default folder
        INSERT INTO todos_new (id, text, status, created_at, folder_id)
        SELECT id, text, status, created_at, '{default_folder_id}' FROM todos;

        -- Drop old table and rename new
        DROP TABLE todos;
        ALTER TABLE todos_new RENAME TO todos;

        -- Recreate index
        CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_todos_folder_id ON todos(folder_id);
        "
    ))?;

    // Migrate tags: create new table, copy data, drop old, rename
    conn.execute_batch(&format!(
        "
        -- Create new tags table with folder_id
        CREATE TABLE tags_new (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            folder_id TEXT NOT NULL,
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
            UNIQUE(name, folder_id)
        );

        -- Copy existing tags with default folder
        INSERT INTO tags_new (id, name, color, folder_id)
        SELECT id, name, color, '{default_folder_id}' FROM tags;

        -- Drop old table and rename new
        DROP TABLE tags;
        ALTER TABLE tags_new RENAME TO tags;

        -- Create index
        CREATE INDEX IF NOT EXISTS idx_tags_folder_id ON tags(folder_id);
        "
    ))?;

    tracing::info!(target: "system", "Folder schema migration completed");
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
    use std::time::{SystemTime, UNIX_EPOCH};
    use uuid::Uuid;

    let json_path = storage_dir.join("todo.json");

    if !json_path.exists() {
        return Ok(());
    }

    tracing::info!(target: "system", "Found legacy todo.json, starting migration...");

    // Read and parse JSON
    let json_content = fs::read_to_string(&json_path)?;
    let legacy_data: LegacyTodoStorage = serde_json::from_str(&json_content)?;

    // Check if we already have data (avoid duplicate migration)
    let existing_count: i64 = conn.query_row("SELECT COUNT(*) FROM todos", [], |row| row.get(0))?;
    if existing_count > 0 {
        tracing::info!(target: "system", "Database already has data, skipping migration");
        // Rename the file anyway to avoid repeated attempts
        let backup_path = storage_dir.join("todo.json.bak");
        fs::rename(&json_path, &backup_path)?;
        return Ok(());
    }

    // Ensure we have a default folder for legacy data
    let default_folder_id: String = conn
        .query_row(
            "SELECT id FROM folders WHERE name = 'Default' LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| {
            // Create default folder if it doesn't exist
            let id = Uuid::new_v4().to_string();
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("Time went backwards")
                .as_millis() as i64;

            conn.execute(
                "INSERT INTO folders (id, name, position, created_at) VALUES (?1, 'Default', 0, ?2)",
                rusqlite::params![&id, now],
            )
            .expect("Failed to create default folder");

            id
        });

    // Insert tags with folder_id
    for tag in &legacy_data.tags {
        conn.execute(
            "INSERT OR IGNORE INTO tags (id, name, color, folder_id) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![&tag.id, &tag.name, &tag.color, &default_folder_id],
        )?;
    }

    // Insert todos with folder_id
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
            "INSERT OR IGNORE INTO todos (id, text, status, created_at, folder_id) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![&todo.id, &todo.text, &status, todo.created_at, &default_folder_id],
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

    tracing::info!(
        target: "system",
        "Legacy JSON migration completed: {} todos, {} tags migrated",
        legacy_data.todos.len(),
        legacy_data.tags.len()
    );

    Ok(())
}
