pub mod migrations;
pub mod todo;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::App;

/// Database wrapper with thread-safe connection
pub struct Database(pub Mutex<Connection>);

/// Get the storage directory path (~/.local/share/jubby/)
fn get_storage_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home)
        .join(".local")
        .join("share")
        .join("jubby")
}

/// Initialize the database, run migrations, and migrate legacy JSON data
pub fn init_database(_app: &App) -> Result<Database, Box<dyn std::error::Error>> {
    let storage_dir = get_storage_dir();

    // Create directory if it doesn't exist
    if !storage_dir.exists() {
        std::fs::create_dir_all(&storage_dir)?;
    }

    let db_path = storage_dir.join("jubby.db");
    let conn = Connection::open(&db_path)?;

    // Enable foreign keys
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    // Run schema migrations
    migrations::run_migrations(&conn)?;

    // Migrate legacy JSON data if exists
    if let Err(e) = migrations::migrate_legacy_json(&conn, &storage_dir) {
        eprintln!("[JUBBY] Warning: Failed to migrate legacy data: {}", e);
    }

    eprintln!("[JUBBY] Database initialized at {:?}", db_path);

    Ok(Database(Mutex::new(conn)))
}
