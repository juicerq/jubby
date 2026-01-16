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

    // Query 1: Get folders with todo counts using LEFT JOIN + GROUP BY
    let mut folder_stmt = conn
        .prepare(
            "SELECT f.id, f.name, f.position, f.created_at, COUNT(t.id) as todo_count
             FROM folders f
             LEFT JOIN todos t ON t.folder_id = f.id
             GROUP BY f.id, f.name, f.position, f.created_at
             ORDER BY f.position ASC",
        )
        .map_err(|e| e.to_string())?;

    let folders_raw: Vec<(String, String, i32, i64, i32)> = folder_stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Query 2: Get 2 most recent todos per folder using window function
    let mut recent_stmt = conn
        .prepare(
            "SELECT folder_id, id, text, status FROM (
                SELECT folder_id, id, text, status,
                       ROW_NUMBER() OVER (PARTITION BY folder_id ORDER BY created_at DESC) as rn
                FROM todos
             ) WHERE rn <= 2",
        )
        .map_err(|e| e.to_string())?;

    // Build a map of folder_id -> recent_todos
    let mut recent_todos_map: std::collections::HashMap<String, Vec<RecentTodo>> =
        std::collections::HashMap::new();

    let recent_rows = recent_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?, // folder_id
                RecentTodo {
                    id: row.get(1)?,
                    text: row.get(2)?,
                    status: row.get(3)?,
                },
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in recent_rows {
        if let Ok((folder_id, todo)) = row {
            recent_todos_map.entry(folder_id).or_default().push(todo);
        }
    }

    // Build the result
    let folders: Vec<FolderWithPreview> = folders_raw
        .into_iter()
        .map(|(id, name, position, created_at, todo_count)| {
            let recent_todos = recent_todos_map.remove(&id).unwrap_or_default();
            FolderWithPreview {
                id,
                name,
                position,
                created_at,
                todo_count,
                recent_todos,
            }
        })
        .collect();

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
        .map_err(|e| format!("System time error: {}", e))?
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
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Update position for each folder based on its index in the array
    for (index, folder_id) in folder_ids.iter().enumerate() {
        tx.execute(
            "UPDATE folders SET position = ?1 WHERE id = ?2",
            rusqlite::params![index as i32, folder_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}
