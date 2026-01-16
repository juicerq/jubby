use super::Database;
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

// Response types

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentTodo {
    pub id: String,
    pub text: String,
    pub status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderWithPreview {
    pub id: String,
    pub name: String,
    pub position: i32,
    pub created_at: i64,
    pub todo_count: i32,
    pub recent_todos: Vec<RecentTodo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub position: i32,
    pub created_at: i64,
}

// Commands

/// Get all folders with todo count and recent todos preview
#[tauri::command]
pub fn folder_get_all(db: State<Database>) -> Result<Vec<FolderWithPreview>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Get all folders ordered by position
    let mut folder_stmt = conn
        .prepare("SELECT id, name, position, created_at FROM folders ORDER BY position ASC")
        .map_err(|e| e.to_string())?;

    let folders_raw: Vec<(String, String, i32, i64)> = folder_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut folders: Vec<FolderWithPreview> = Vec::new();

    for (id, name, position, created_at) in folders_raw {
        // Get todo count for this folder
        let todo_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM todos WHERE folder_id = ?1",
                [&id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        // Get 2 most recent todos for preview
        let mut recent_stmt = conn
            .prepare(
                "SELECT id, text, status FROM todos WHERE folder_id = ?1 ORDER BY created_at DESC LIMIT 2",
            )
            .map_err(|e| e.to_string())?;

        let recent_todos: Vec<RecentTodo> = recent_stmt
            .query_map([&id], |row| {
                Ok(RecentTodo {
                    id: row.get(0)?,
                    text: row.get(1)?,
                    status: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        folders.push(FolderWithPreview {
            id,
            name,
            position,
            created_at,
            todo_count,
            recent_todos,
        });
    }

    Ok(folders)
}

/// Create a new folder
#[tauri::command]
pub fn folder_create(db: State<Database>, name: String) -> Result<Folder, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis() as i64;

    // Get the next position (max + 1)
    let position: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM folders",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO folders (id, name, position, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![&id, &name, position, created_at],
    )
    .map_err(|e| e.to_string())?;

    Ok(Folder {
        id,
        name,
        position,
        created_at,
    })
}

/// Rename a folder
#[tauri::command]
pub fn folder_rename(db: State<Database>, id: String, name: String) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let rows_affected = conn
        .execute(
            "UPDATE folders SET name = ?1 WHERE id = ?2",
            [&name, &id],
        )
        .map_err(|e| e.to_string())?;

    if rows_affected == 0 {
        return Err(format!("Folder not found: {}", id));
    }

    Ok(())
}

/// Delete a folder (cascade deletes todos and tags)
#[tauri::command]
pub fn folder_delete(db: State<Database>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let rows_affected = conn
        .execute("DELETE FROM folders WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    if rows_affected == 0 {
        return Err(format!("Folder not found: {}", id));
    }

    Ok(())
}

/// Reorder folders by accepting an ordered list of folder IDs
#[tauri::command]
pub fn folder_reorder(db: State<Database>, folder_ids: Vec<String>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Update position for each folder based on its index in the array
    for (index, folder_id) in folder_ids.iter().enumerate() {
        conn.execute(
            "UPDATE folders SET position = ?1 WHERE id = ?2",
            rusqlite::params![index as i32, folder_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
