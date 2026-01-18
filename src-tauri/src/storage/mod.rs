pub mod folder;
pub mod migrations;
pub mod todo;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::App;

/// Database wrapper with thread-safe connection
pub struct Database(pub Mutex<Connection>);

/// Get the storage directory path following XDG Base Directory Specification
fn get_storage_dir() -> PathBuf {
    // Prioridade: XDG_DATA_HOME > ~/.local/share (fallback padrão XDG)
    if let Ok(xdg_data) = std::env::var("XDG_DATA_HOME") {
        return PathBuf::from(xdg_data).join("jubby");
    }

    // Fallback: ~/.local/share/jubby (padrão XDG quando XDG_DATA_HOME não está definido)
    let home = std::env::var("HOME").expect("HOME environment variable must be set");
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
        tracing::warn!(target: "system", "Failed to migrate legacy data: {}", e);
    }

    tracing::info!(target: "system", "Database initialized at {:?}", db_path);

    Ok(Database(Mutex::new(conn)))
}
