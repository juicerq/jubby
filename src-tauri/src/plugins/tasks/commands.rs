use super::storage::save_to_json;
use super::types::*;
use super::TasksStore;
use tauri::State;
use uuid::Uuid;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis() as i64
}

#[tauri::command]
pub fn folder_get_all(store: State<TasksStore>) -> Result<Vec<FolderWithPreview>, String> {
    let data = store.read();

    let mut result: Vec<FolderWithPreview> = data
        .folders
        .iter()
        .map(|f| {
            let folder_tasks: Vec<&Task> = data
                .tasks
                .iter()
                .filter(|t| t.folder_id == f.id)
                .collect();

            let task_count = folder_tasks.len() as i32;

            let mut sorted_tasks = folder_tasks;
            sorted_tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));

            let recent_tasks: Vec<RecentTask> = sorted_tasks
                .iter()
                .take(2)
                .map(|t| RecentTask {
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
                task_count,
                recent_tasks,
            }
        })
        .collect();

    result.sort_by_key(|f| f.position);
    Ok(result)
}

#[tauri::command]
pub fn folder_create(store: State<TasksStore>, name: String) -> Result<Folder, String> {
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
pub fn folder_rename(store: State<TasksStore>, id: String, name: String) -> Result<(), String> {
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
pub fn folder_delete(store: State<TasksStore>, id: String) -> Result<(), String> {
    let mut data = store.write();

    let existed = data.folders.iter().any(|f| f.id == id);
    if !existed {
        return Err(format!("Folder not found: {}", id));
    }

    // Cascade delete: remove tasks, tags, and the folder
    data.tasks.retain(|t| t.folder_id != id);
    data.tags.retain(|t| t.folder_id != id);
    data.folders.retain(|f| f.id != id);

    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn folder_reorder(store: State<TasksStore>, folder_ids: Vec<String>) -> Result<(), String> {
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
pub fn tasks_get_by_folder(
    store: State<TasksStore>,
    folder_id: String,
) -> Result<TasksDataResponse, String> {
    let data = store.read();

    let mut folder_tasks: Vec<TaskWithTags> = data
        .tasks
        .iter()
        .filter(|t| t.folder_id == folder_id)
        .map(|t| TaskWithTags {
            id: t.id.clone(),
            text: t.text.clone(),
            status: t.status.clone(),
            created_at: t.created_at,
            description: t.description.clone(),
            working_directory: t.working_directory.clone(),
            tag_ids: t.tag_ids.clone(),
            subtasks: t.subtasks.clone(),
        })
        .collect();

    folder_tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));

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

    Ok(TasksDataResponse {
        tasks: folder_tasks,
        tags: folder_tags,
    })
}

#[tauri::command]
pub fn tasks_create(
    store: State<TasksStore>,
    folder_id: String,
    text: String,
    tag_ids: Option<Vec<String>>,
) -> Result<TaskWithTags, String> {
    let mut data = store.write();

    let task = Task {
        id: Uuid::new_v4().to_string(),
        folder_id,
        text: text.clone(),
        status: "pending".to_string(),
        created_at: now_ms(),
        description: String::new(),
        working_directory: String::new(),
        tag_ids: tag_ids.clone().unwrap_or_default(),
        subtasks: Vec::new(),
    };

    data.tasks.push(task.clone());
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(TaskWithTags {
        id: task.id,
        text: task.text,
        status: task.status,
        created_at: task.created_at,
        description: task.description,
        working_directory: task.working_directory,
        tag_ids: task.tag_ids,
        subtasks: task.subtasks,
    })
}

#[tauri::command]
pub fn tasks_update_status(store: State<TasksStore>, id: String, status: String) -> Result<(), String> {
    if !["pending", "in_progress", "completed"].contains(&status.as_str()) {
        return Err(format!("Invalid status: {}", status));
    }

    let mut data = store.write();

    let task = data
        .tasks
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("Task not found: {}", id))?;

    task.status = status.clone();

    // Cascade: when task is completed, mark all subtasks as completed
    if status == "completed" {
        for subtask in &mut task.subtasks {
            subtask.status = TaskStatus::Completed;
        }
    }

    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn tasks_update_text(store: State<TasksStore>, id: String, text: String) -> Result<(), String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("Task text cannot be empty".to_string());
    }

    let mut data = store.write();

    let task = data
        .tasks
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("Task not found: {}", id))?;

    task.text = text;
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn tasks_delete(store: State<TasksStore>, id: String) -> Result<(), String> {
    let mut data = store.write();

    let existed = data.tasks.iter().any(|t| t.id == id);
    if !existed {
        return Err(format!("Task not found: {}", id));
    }

    data.tasks.retain(|t| t.id != id);
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn tasks_set_tags(
    store: State<TasksStore>,
    task_id: String,
    tag_ids: Vec<String>,
) -> Result<(), String> {
    let mut data = store.write();

    let task = data
        .tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    task.tag_ids = tag_ids;
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn tag_create(
    store: State<TasksStore>,
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
    store: State<TasksStore>,
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
pub fn tag_delete(store: State<TasksStore>, id: String) -> Result<(), String> {
    let mut data = store.write();

    let existed = data.tags.iter().any(|t| t.id == id);
    if !existed {
        return Err(format!("Tag not found: {}", id));
    }

    for task in &mut data.tasks {
        task.tag_ids.retain(|tag_id| tag_id != &id);
    }

    data.tags.retain(|t| t.id != id);
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn subtasks_create(
    store: State<TasksStore>,
    task_id: String,
    text: String,
) -> Result<Subtask, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("Subtask text cannot be empty".to_string());
    }

    let mut data = store.write();

    let task = data
        .tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    let order = task
        .subtasks
        .iter()
        .map(|s| s.order)
        .max()
        .map(|max| max + 1)
        .unwrap_or(0);

    let subtask = Subtask {
        id: Uuid::new_v4().to_string(),
        text,
        status: TaskStatus::default(),
        order,
        category: SubtaskCategory::default(),
        steps: Vec::new(),
        should_commit: true,
        notes: String::new(),
        execution_logs: Vec::new(),
        completed: None,
        position: None,
    };

    task.subtasks.push(subtask.clone());
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(subtask)
}

#[tauri::command]
pub fn subtasks_toggle(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
) -> Result<bool, String> {
    let mut data = store.write();

    let task = data
        .tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    let subtask = task
        .subtasks
        .iter_mut()
        .find(|s| s.id == subtask_id)
        .ok_or_else(|| format!("Subtask not found: {}", subtask_id))?;

    subtask.status = match subtask.status {
        TaskStatus::Completed => TaskStatus::Waiting,
        _ => TaskStatus::Completed,
    };
    let new_state = matches!(subtask.status, TaskStatus::Completed);

    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(new_state)
}

#[tauri::command]
pub fn subtasks_delete(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
) -> Result<(), String> {
    let mut data = store.write();

    let task = data
        .tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    let existed = task.subtasks.iter().any(|s| s.id == subtask_id);
    if !existed {
        return Err(format!("Subtask not found: {}", subtask_id));
    }

    task.subtasks.retain(|s| s.id != subtask_id);
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn subtasks_reorder(
    store: State<TasksStore>,
    task_id: String,
    subtask_ids: Vec<String>,
) -> Result<(), String> {
    let mut data = store.write();

    let task = data
        .tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    for (index, subtask_id) in subtask_ids.iter().enumerate() {
        if let Some(subtask) = task.subtasks.iter_mut().find(|s| &s.id == subtask_id) {
            subtask.order = index as u32;
        }
    }

    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn subtasks_update_text(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
    text: String,
) -> Result<(), String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("Subtask text cannot be empty".to_string());
    }

    let mut data = store.write();

    let task = data
        .tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    let subtask = task
        .subtasks
        .iter_mut()
        .find(|s| s.id == subtask_id)
        .ok_or_else(|| format!("Subtask not found: {}", subtask_id))?;

    subtask.text = text;
    save_to_json(&data).map_err(|e| e.to_string())?;

    Ok(())
}
