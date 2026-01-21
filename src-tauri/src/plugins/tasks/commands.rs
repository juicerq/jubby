use super::storage::save_to_json;
use super::types::*;
use super::TodoStore;
use tauri::State;
use uuid::Uuid;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis() as i64
}

#[tauri::command]
pub fn folder_get_all(store: State<TodoStore>) -> Result<Vec<FolderWithPreview>, String> {
    let data = store.read();

    let mut result: Vec<FolderWithPreview> = data
        .folders
        .iter()
        .map(|f| {
            let folder_todos: Vec<&Todo> = data
                .todos
                .iter()
                .filter(|t| t.folder_id == f.id)
                .collect();

            let todo_count = folder_todos.len() as i32;

            let mut sorted_todos = folder_todos;
            sorted_todos.sort_by(|a, b| b.created_at.cmp(&a.created_at));

            let recent_todos: Vec<RecentTodo> = sorted_todos
                .iter()
                .take(2)
                .map(|t| RecentTodo {
                    id: t.id.clone(),
                    text: t.text.clone(),
                    status: t.status.clone(),
                })
                .collect();

            FolderWithPreview {
                id: f.id.clone(),
                name: f.name.clone(),
                position: f.position,
                created_at: f.created_at,
                todo_count,
                recent_todos,
            }
        })
        .collect();

    result.sort_by_key(|f| f.position);
    Ok(result)
}

#[tauri::command]
pub fn folder_create(store: State<TodoStore>, name: String) -> Result<Folder, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }

    let mut data = store.write();

    let position = data.folders.iter().map(|f| f.position).max().unwrap_or(-1) + 1;

    let folder = Folder {
        id: Uuid::new_v4().to_string(),
        name,
        position,
        created_at: now_ms(),
    };

    data.folders.push(folder.clone());
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(folder)
}

#[tauri::command]
pub fn folder_rename(store: State<TodoStore>, id: String, name: String) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }

    let mut data = store.write();

    let folder = data
        .folders
        .iter_mut()
        .find(|f| f.id == id)
        .ok_or_else(|| format!("Folder not found: {}", id))?;

    folder.name = name;
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn folder_delete(store: State<TodoStore>, id: String) -> Result<(), String> {
    let mut data = store.write();

    let existed = data.folders.iter().any(|f| f.id == id);
    if !existed {
        return Err(format!("Folder not found: {}", id));
    }

    // Cascade delete: remove todos, tags, and the folder
    data.todos.retain(|t| t.folder_id != id);
    data.tags.retain(|t| t.folder_id != id);
    data.folders.retain(|f| f.id != id);

    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn folder_reorder(store: State<TodoStore>, folder_ids: Vec<String>) -> Result<(), String> {
    let mut data = store.write();

    for (index, folder_id) in folder_ids.iter().enumerate() {
        if let Some(folder) = data.folders.iter_mut().find(|f| &f.id == folder_id) {
            folder.position = index as i32;
        }
    }

    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn todo_get_by_folder(
    store: State<TodoStore>,
    folder_id: String,
) -> Result<TodoDataResponse, String> {
    let data = store.read();

    let mut folder_todos: Vec<TodoWithTags> = data
        .todos
        .iter()
        .filter(|t| t.folder_id == folder_id)
        .map(|t| TodoWithTags {
            id: t.id.clone(),
            text: t.text.clone(),
            status: t.status.clone(),
            created_at: t.created_at,
            tag_ids: t.tag_ids.clone(),
        })
        .collect();

    folder_todos.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    let folder_tags: Vec<TagResponse> = data
        .tags
        .iter()
        .filter(|t| t.folder_id == folder_id)
        .map(|t| TagResponse {
            id: t.id.clone(),
            name: t.name.clone(),
            color: t.color.clone(),
        })
        .collect();

    Ok(TodoDataResponse {
        todos: folder_todos,
        tags: folder_tags,
    })
}

#[tauri::command]
pub fn todo_create(
    store: State<TodoStore>,
    folder_id: String,
    text: String,
    tag_ids: Option<Vec<String>>,
) -> Result<TodoWithTags, String> {
    let mut data = store.write();

    let todo = Todo {
        id: Uuid::new_v4().to_string(),
        folder_id,
        text: text.clone(),
        status: "pending".to_string(),
        created_at: now_ms(),
        tag_ids: tag_ids.clone().unwrap_or_default(),
    };

    data.todos.push(todo.clone());
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(TodoWithTags {
        id: todo.id,
        text: todo.text,
        status: todo.status,
        created_at: todo.created_at,
        tag_ids: todo.tag_ids,
    })
}

#[tauri::command]
pub fn todo_update_status(store: State<TodoStore>, id: String, status: String) -> Result<(), String> {
    if !["pending", "in_progress", "completed"].contains(&status.as_str()) {
        return Err(format!("Invalid status: {}", status));
    }

    let mut data = store.write();

    let todo = data
        .todos
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("Todo not found: {}", id))?;

    todo.status = status;
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn todo_delete(store: State<TodoStore>, id: String) -> Result<(), String> {
    let mut data = store.write();

    let existed = data.todos.iter().any(|t| t.id == id);
    if !existed {
        return Err(format!("Todo not found: {}", id));
    }

    data.todos.retain(|t| t.id != id);
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn todo_set_tags(
    store: State<TodoStore>,
    todo_id: String,
    tag_ids: Vec<String>,
) -> Result<(), String> {
    let mut data = store.write();

    let todo = data
        .todos
        .iter_mut()
        .find(|t| t.id == todo_id)
        .ok_or_else(|| format!("Todo not found: {}", todo_id))?;

    todo.tag_ids = tag_ids;
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn tag_create(
    store: State<TodoStore>,
    folder_id: String,
    name: String,
    color: String,
) -> Result<TagResponse, String> {
    let mut data = store.write();

    // Check for duplicate name in folder
    let exists = data
        .tags
        .iter()
        .any(|t| t.folder_id == folder_id && t.name == name);

    if exists {
        return Err("Tag name already exists in this folder".to_string());
    }

    let tag = Tag {
        id: Uuid::new_v4().to_string(),
        folder_id,
        name: name.clone(),
        color: color.clone(),
    };

    data.tags.push(tag.clone());
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(TagResponse {
        id: tag.id,
        name: tag.name,
        color: tag.color,
    })
}

#[tauri::command]
pub fn tag_update(
    store: State<TodoStore>,
    id: String,
    name: String,
    color: String,
) -> Result<(), String> {
    let mut data = store.write();

    let tag = data
        .tags
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("Tag not found: {}", id))?;

    // Check for duplicate name in folder (excluding self)
    let folder_id = tag.folder_id.clone();
    let exists = data
        .tags
        .iter()
        .any(|t| t.folder_id == folder_id && t.name == name && t.id != id);

    if exists {
        return Err("Tag name already exists in this folder".to_string());
    }

    let tag = data.tags.iter_mut().find(|t| t.id == id).unwrap();
    tag.name = name;
    tag.color = color;

    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn tag_delete(store: State<TodoStore>, id: String) -> Result<(), String> {
    let mut data = store.write();

    let existed = data.tags.iter().any(|t| t.id == id);
    if !existed {
        return Err(format!("Tag not found: {}", id));
    }

    // Remove tag from all todos
    for todo in &mut data.todos {
        todo.tag_ids.retain(|tag_id| tag_id != &id);
    }

    data.tags.retain(|t| t.id != id);
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}
