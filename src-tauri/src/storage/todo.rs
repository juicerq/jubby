use super::Database;
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

// Response types

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoWithTags {
    pub id: String,
    pub text: String,
    pub status: String,
    pub created_at: i64,
    pub tag_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Serialize)]
pub struct TodoData {
    pub todos: Vec<TodoWithTags>,
    pub tags: Vec<Tag>,
}

// Commands

/// Get all todos and tags
#[tauri::command]
pub fn todo_get_all(db: State<Database>) -> Result<TodoData, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Get all tags
    let mut tag_stmt = conn
        .prepare("SELECT id, name, color FROM tags ORDER BY name")
        .map_err(|e| e.to_string())?;

    let tags: Vec<Tag> = tag_stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Get all todos
    let mut todo_stmt = conn
        .prepare("SELECT id, text, status, created_at FROM todos ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let todos_raw: Vec<(String, String, String, i64)> = todo_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Get tag IDs for each todo
    let mut todos: Vec<TodoWithTags> = Vec::new();
    for (id, text, status, created_at) in todos_raw {
        let mut tag_stmt = conn
            .prepare("SELECT tag_id FROM todo_tags WHERE todo_id = ?1")
            .map_err(|e| e.to_string())?;

        let tag_ids: Vec<String> = tag_stmt
            .query_map([&id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        todos.push(TodoWithTags {
            id,
            text,
            status,
            created_at,
            tag_ids,
        });
    }

    Ok(TodoData { todos, tags })
}

/// Create a new todo
#[tauri::command]
pub fn todo_create(
    db: State<Database>,
    text: String,
    tag_ids: Option<Vec<String>>,
) -> Result<TodoWithTags, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    conn.execute(
        "INSERT INTO todos (id, text, status, created_at) VALUES (?1, ?2, 'pending', ?3)",
        rusqlite::params![&id, &text, created_at],
    )
    .map_err(|e| e.to_string())?;

    let tag_ids = tag_ids.unwrap_or_default();

    // Insert tag relations
    for tag_id in &tag_ids {
        conn.execute(
            "INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?1, ?2)",
            [&id, tag_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(TodoWithTags {
        id,
        text,
        status: "pending".to_string(),
        created_at,
        tag_ids,
    })
}

/// Update todo status
#[tauri::command]
pub fn todo_update_status(db: State<Database>, id: String, status: String) -> Result<(), String> {
    // Validate status
    if !["pending", "in_progress", "completed"].contains(&status.as_str()) {
        return Err(format!("Invalid status: {}", status));
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let rows_affected = conn
        .execute(
            "UPDATE todos SET status = ?1 WHERE id = ?2",
            [&status, &id],
        )
        .map_err(|e| e.to_string())?;

    if rows_affected == 0 {
        return Err(format!("Todo not found: {}", id));
    }

    Ok(())
}

/// Delete a todo
#[tauri::command]
pub fn todo_delete(db: State<Database>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let rows_affected = conn
        .execute("DELETE FROM todos WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    if rows_affected == 0 {
        return Err(format!("Todo not found: {}", id));
    }

    Ok(())
}

/// Set tags for a todo (replaces existing tags)
#[tauri::command]
pub fn todo_set_tags(
    db: State<Database>,
    todo_id: String,
    tag_ids: Vec<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Remove existing tags
    conn.execute("DELETE FROM todo_tags WHERE todo_id = ?1", [&todo_id])
        .map_err(|e| e.to_string())?;

    // Insert new tags
    for tag_id in &tag_ids {
        conn.execute(
            "INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?1, ?2)",
            [&todo_id, tag_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Create a new tag
#[tauri::command]
pub fn tag_create(db: State<Database>, name: String, color: String) -> Result<Tag, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)",
        [&id, &name, &color],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE constraint failed") {
            "Tag name already exists".to_string()
        } else {
            e.to_string()
        }
    })?;

    Ok(Tag { id, name, color })
}

/// Update a tag
#[tauri::command]
pub fn tag_update(
    db: State<Database>,
    id: String,
    name: String,
    color: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let rows_affected = conn
        .execute(
            "UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3",
            [&name, &color, &id],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE constraint failed") {
                "Tag name already exists".to_string()
            } else {
                e.to_string()
            }
        })?;

    if rows_affected == 0 {
        return Err(format!("Tag not found: {}", id));
    }

    Ok(())
}

/// Delete a tag
#[tauri::command]
pub fn tag_delete(db: State<Database>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let rows_affected = conn
        .execute("DELETE FROM tags WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    if rows_affected == 0 {
        return Err(format!("Tag not found: {}", id));
    }

    Ok(())
}
