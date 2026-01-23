use super::helpers::{
    find_folder, find_folder_mut, find_tag, find_task, with_step_mut, with_subtask_mut,
    with_tag_mut, with_task_mut,
};
use super::storage::{
    delete_folder_dir, delete_task_file, generate_unique_filename, generate_unique_task_filename,
    get_existing_task_filenames, get_folder_filename, get_task_filename, reload_from_disk,
    rename_folder_dir, rename_task_file, save_folders_index, save_task,
};
use super::types::*;
use super::TasksStore;
use crate::traces::{Trace, TraceError};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis() as i64
}

#[tauri::command]
pub fn folder_get_all(
    store: State<TasksStore>,
    force_reload: Option<bool>,
) -> Result<Vec<FolderWithPreview>, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "folder_get_all");

    if force_reload.unwrap_or(false) {
        match reload_from_disk() {
            Ok(new_data) => {
                let mut data = store.write();
                *data = new_data;
                trace.info("store reloaded from disk");
            }
            Err(e) => {
                trace.error(
                    "failed to reload tasks data",
                    TraceError::new(e.to_string(), "TASKS_RELOAD_FAILED"),
                );
                drop(trace);
                return Err(e.to_string());
            }
        }
    }

    let data = store.read();
    trace.info("store read acquired");

    let mut result: Vec<FolderWithPreview> = data
        .folders
        .iter()
        .map(|f| {
            let folder_tasks: Vec<&Task> =
                data.tasks.iter().filter(|t| t.folder_id == f.id).collect();

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
                working_directory: f.working_directory.clone(),
                task_count,
                recent_tasks,
            }
        })
        .collect();

    result.sort_by_key(|f| f.position);

    trace.info(&format!("returning {} folders", result.len()));
    drop(trace);

    Ok(result)
}

#[tauri::command]
pub fn folder_create(store: State<TasksStore>, name: String) -> Result<Folder, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "folder_create");
    trace.info("folder create requested");

    let name = name.trim().to_string();
    if name.is_empty() {
        trace.info("folder name empty");
        drop(trace);
        return Err("Folder name cannot be empty".to_string());
    }

    let mut data = store.write();

    let position = data.folders.iter().map(|f| f.position).max().unwrap_or(-1) + 1;

    // Generate unique kebab-case filename
    let existing_filenames: Vec<String> = data
        .folders
        .iter()
        .map(|f| get_folder_filename(f))
        .collect();
    let filename = generate_unique_filename(&name, &existing_filenames);

    let folder = Folder {
        id: Uuid::new_v4().to_string(),
        name,
        filename,
        position,
        created_at: now_ms(),
        working_directory: String::new(),
    };

    data.folders.push(folder.clone());

    // Save the folders index
    let index = FoldersIndex {
        folders: data.folders.clone(),
        tags: data.tags.clone(),
    };
    save_folders_index(&index).map_err(|e| e.to_string())?;

    trace.info("folder created");
    drop(trace);

    Ok(folder)
}

#[tauri::command]
pub fn folder_rename(store: State<TasksStore>, id: String, name: String) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "folder_rename")
        .with("folder_id", id.clone());
    trace.info("folder rename requested");

    let name = name.trim().to_string();
    if name.is_empty() {
        trace.info("folder name empty");
        drop(trace);
        return Err("Folder name cannot be empty".to_string());
    }

    let mut data = store.write();

    let folder = match find_folder_mut(&mut data, &id) {
        Some(f) => f,
        None => {
            trace.info("folder not found");
            drop(trace);
            return Err(format!("Folder not found: {}", id));
        }
    };

    let old_filename = get_folder_filename(folder);

    // Generate unique filename for the new name, excluding current folder
    let existing_filenames: Vec<String> = data
        .folders
        .iter()
        .filter(|f| f.id != id)
        .map(|f| get_folder_filename(f))
        .collect();
    let new_filename = generate_unique_filename(&name, &existing_filenames);

    // Get folder again after the borrow for existing_filenames ends
    let folder = find_folder_mut(&mut data, &id).expect("Folder should exist");
    folder.name = name;
    folder.filename = new_filename.clone();

    // Save the folders index
    let index = FoldersIndex {
        folders: data.folders.clone(),
        tags: data.tags.clone(),
    };
    save_folders_index(&index).map_err(|e| e.to_string())?;

    // Rename the directory on disk if the filename changed
    if old_filename != new_filename {
        rename_folder_dir(&old_filename, &new_filename).map_err(|e| e.to_string())?;
    }

    trace.info("folder renamed");
    drop(trace);

    Ok(())
}

#[tauri::command]
pub fn folder_delete(store: State<TasksStore>, id: String) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "folder_delete")
        .with("folder_id", id.clone());
    trace.info("folder delete requested");

    let mut data = store.write();

    let folder = match find_folder(&data, &id) {
        Some(f) => f,
        None => {
            trace.info("folder not found");
            drop(trace);
            return Err(format!("Folder not found: {}", id));
        }
    };

    // Get filename before removing folder from data
    let folder_filename = get_folder_filename(folder);

    // Cascade delete: remove tasks, tags, and the folder
    data.tasks.retain(|t| t.folder_id != id);
    data.tags.retain(|t| t.folder_id != id);
    data.folders.retain(|f| f.id != id);

    // Save the updated folders index (with tags)
    let index = FoldersIndex {
        folders: data.folders.clone(),
        tags: data.tags.clone(),
    };
    save_folders_index(&index).map_err(|e| e.to_string())?;

    // Delete the folder directory and all its task files
    delete_folder_dir(&folder_filename).map_err(|e| e.to_string())?;

    trace.info("folder deleted");
    drop(trace);

    Ok(())
}

#[tauri::command]
pub fn folder_reorder(store: State<TasksStore>, folder_ids: Vec<String>) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "folder_reorder");
    trace.info("folder reorder requested");

    let mut data = store.write();

    for (index, folder_id) in folder_ids.iter().enumerate() {
        if let Some(folder) = find_folder_mut(&mut data, folder_id) {
            folder.position = index as i32;
        }
    }

    // Save the folders index
    let index = FoldersIndex {
        folders: data.folders.clone(),
        tags: data.tags.clone(),
    };
    save_folders_index(&index).map_err(|e| e.to_string())?;

    trace.info("folder reorder complete");
    drop(trace);

    Ok(())
}

#[tauri::command]
pub fn folder_update_working_directory(
    store: State<TasksStore>,
    id: String,
    working_directory: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "folder_update_working_directory")
        .with("folder_id", id.clone());
    trace.info("folder working directory update requested");

    let working_directory = working_directory.trim().to_string();

    if !working_directory.is_empty() {
        let path = std::path::Path::new(&working_directory);
        if !path.exists() {
            let message = format!("Path does not exist: {}", working_directory);
            trace.error(
                "Working directory update failed",
                TraceError::new(message.clone(), "WORKING_DIRECTORY_NOT_FOUND"),
            );
            drop(trace);
            return Err(message);
        }
        if !path.is_dir() {
            let message = format!("Path is not a directory: {}", working_directory);
            trace.error(
                "Working directory update failed",
                TraceError::new(message.clone(), "WORKING_DIRECTORY_NOT_DIR"),
            );
            drop(trace);
            return Err(message);
        }
    }

    let mut data = store.write();

    let folder = match find_folder_mut(&mut data, &id) {
        Some(f) => f,
        None => {
            trace.info("folder not found");
            drop(trace);
            return Err(format!("Folder not found: {}", id));
        }
    };

    folder.working_directory = working_directory;

    // Save the folders index
    let index = FoldersIndex {
        folders: data.folders.clone(),
        tags: data.tags.clone(),
    };
    save_folders_index(&index).map_err(|e| e.to_string())?;

    trace.info("folder working directory updated");
    drop(trace);

    Ok(())
}

#[tauri::command]
pub fn tasks_get_by_folder(
    store: State<TasksStore>,
    folder_id: String,
    force_reload: Option<bool>,
) -> Result<TasksDataResponse, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_get_by_folder")
        .with("folder_id", folder_id.clone());
    trace.info("tasks get by folder requested");

    if force_reload.unwrap_or(false) {
        match reload_from_disk() {
            Ok(new_data) => {
                let mut data = store.write();
                *data = new_data;
                trace.info("store reloaded from disk");
            }
            Err(e) => {
                trace.error(
                    "failed to reload tasks data",
                    TraceError::new(e.to_string(), "TASKS_RELOAD_FAILED"),
                );
                drop(trace);
                return Err(e.to_string());
            }
        }
    }

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

    let response = TasksDataResponse {
        tasks: folder_tasks,
        tags: folder_tags,
    };

    trace.info(&format!(
        "returning {} tasks and {} tags",
        response.tasks.len(),
        response.tags.len()
    ));
    drop(trace);

    Ok(response)
}

#[tauri::command]
pub fn tasks_create(
    store: State<TasksStore>,
    folder_id: String,
    text: String,
    tag_ids: Option<Vec<String>>,
    description: Option<String>,
    working_directory: Option<String>,
) -> Result<TaskWithTags, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_create")
        .with("folder_id", folder_id.clone());
    trace.info("task create requested");

    let mut data = store.write();

    // Find the folder to get its filename
    let folder =
        find_folder(&data, &folder_id).ok_or_else(|| format!("Folder not found: {}", folder_id))?;
    let folder_filename = get_folder_filename(folder);

    // Generate unique task filename
    let existing_filenames = get_existing_task_filenames(&folder_filename);
    let task_filename = generate_unique_task_filename(&text, &existing_filenames);

    let task = Task {
        id: Uuid::new_v4().to_string(),
        folder_id,
        filename: task_filename,
        text: text.clone(),
        status: "pending".to_string(),
        created_at: now_ms(),
        description: description.unwrap_or_default(),
        working_directory: working_directory.unwrap_or_default(),
        tag_ids: tag_ids.clone().unwrap_or_default(),
        subtasks: Vec::new(),
    };

    // Save the task to its own file
    save_task(&folder_filename, &task).map_err(|e| e.to_string())?;

    // Add to in-memory store
    data.tasks.push(task.clone());

    trace.info("task created");
    drop(trace);

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
pub fn tasks_update_status(
    store: State<TasksStore>,
    id: String,
    status: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_update_status")
        .with("task_id", id.clone());
    trace.info("task status update requested");

    if !["pending", "in_progress", "completed"].contains(&status.as_str()) {
        trace.info("invalid status provided");
        drop(trace);
        return Err(format!("Invalid status: {}", status));
    }

    let result = with_task_mut(store.inner(), &id, |task| {
        task.status = status.clone();

        // Cascade: when task is completed, mark all subtasks as completed
        if status == "completed" {
            for subtask in &mut task.subtasks {
                subtask.status = TaskStatus::Completed;
            }
        }

        Ok(())
    });

    match &result {
        Ok(_) => trace.info("task status updated"),
        Err(_) => trace.info("task status update failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn tasks_update_text(store: State<TasksStore>, id: String, text: String) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_update_text")
        .with("task_id", id.clone());
    trace.info("task text update requested");

    let text = text.trim().to_string();
    if text.is_empty() {
        trace.info("task text empty");
        drop(trace);
        return Err("Task text cannot be empty".to_string());
    }

    let mut data = store.write();

    // Find the task to get current info
    let task = find_task(&data, &id).ok_or_else(|| {
        trace.info("task not found");
        format!("Task not found: {}", id)
    })?;

    let folder_id = task.folder_id.clone();
    let old_filename = get_task_filename(task);

    let folder =
        find_folder(&data, &folder_id).ok_or_else(|| format!("Folder not found: {}", folder_id))?;
    let folder_filename = get_folder_filename(folder);

    // Generate new filename for the new text
    let existing_filenames: Vec<String> = get_existing_task_filenames(&folder_filename)
        .into_iter()
        .filter(|f| f != &old_filename) // Exclude current filename
        .collect();
    let new_filename = generate_unique_task_filename(&text, &existing_filenames);

    // Rename the file if filename changed
    if old_filename != new_filename {
        rename_task_file(&folder_filename, &old_filename, &new_filename)
            .map_err(|e| e.to_string())?;
    }

    // Update the task in memory
    let task = data
        .tasks
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("Task not found: {}", id))?;
    task.text = text;
    task.filename = new_filename;

    // Save the updated task
    save_task(&folder_filename, task).map_err(|e| e.to_string())?;

    trace.info("task text updated");
    drop(trace);

    Ok(())
}

#[tauri::command]
pub fn tasks_delete(store: State<TasksStore>, id: String) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_delete")
        .with("task_id", id.clone());
    trace.info("task delete requested");

    let mut data = store.write();

    // Find the task to get folder and filename info
    let task = find_task(&data, &id).ok_or_else(|| {
        trace.info("task not found");
        format!("Task not found: {}", id)
    })?;

    let folder_id = task.folder_id.clone();
    let task_filename = get_task_filename(task);

    let folder =
        find_folder(&data, &folder_id).ok_or_else(|| format!("Folder not found: {}", folder_id))?;
    let folder_filename = get_folder_filename(folder);

    // Delete the task file
    delete_task_file(&folder_filename, &task_filename).map_err(|e| e.to_string())?;

    // Remove from in-memory store
    data.tasks.retain(|t| t.id != id);

    trace.info("task deleted");
    drop(trace);

    Ok(())
}

#[tauri::command]
pub fn tasks_set_tags(
    store: State<TasksStore>,
    task_id: String,
    tag_ids: Vec<String>,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_set_tags")
        .with("task_id", task_id.clone());
    trace.info("task tags update requested");

    let tag_count = tag_ids.len();
    let result = with_task_mut(store.inner(), &task_id, |task| {
        task.tag_ids = tag_ids;
        Ok(())
    });

    match &result {
        Ok(_) => trace.info(&format!("task tags updated ({})", tag_count)),
        Err(_) => trace.info("task tags update failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn tag_create(
    store: State<TasksStore>,
    folder_id: String,
    name: String,
    color: String,
) -> Result<TagResponse, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tag_create")
        .with("folder_id", folder_id.clone());
    trace.info("tag create requested");

    let mut data = store.write();

    // Check for duplicate name in folder
    let exists = data
        .tags
        .iter()
        .any(|t| t.folder_id == folder_id && t.name == name);

    if exists {
        trace.info("tag name duplicate");
        drop(trace);
        return Err("Tag name already exists in this folder".to_string());
    }

    let tag = Tag {
        id: Uuid::new_v4().to_string(),
        folder_id,
        name: name.clone(),
        color: color.clone(),
    };

    data.tags.push(tag.clone());

    // Save the folders index (tags are stored there now)
    let index = FoldersIndex {
        folders: data.folders.clone(),
        tags: data.tags.clone(),
    };
    if let Err(error) = save_folders_index(&index) {
        trace.info("tag create save failed");
        drop(trace);
        return Err(error.to_string());
    }

    trace.info("tag created");
    drop(trace);

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
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tag_update")
        .with("tag_id", id.clone());
    trace.info("tag update requested");

    let data = store.read();
    let tag = match find_tag(&data, &id) {
        Some(tag) => tag,
        None => {
            trace.info("tag not found");
            drop(trace);
            return Err(format!("Tag not found: {}", id));
        }
    };

    // Check for duplicate name in folder (excluding self)
    let exists = data
        .tags
        .iter()
        .any(|t| t.folder_id == tag.folder_id && t.name == name && t.id != id);

    if exists {
        trace.info("tag name duplicate");
        drop(trace);
        return Err("Tag name already exists in this folder".to_string());
    }

    drop(data);

    let result = with_tag_mut(store.inner(), &id, |tag| {
        tag.name = name;
        tag.color = color;
        Ok(())
    });

    match &result {
        Ok(_) => trace.info("tag updated"),
        Err(_) => trace.info("tag update failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn tag_delete(store: State<TasksStore>, id: String) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tag_delete")
        .with("tag_id", id.clone());
    trace.info("tag delete requested");

    let mut data = store.write();

    let existed = data.tags.iter().any(|t| t.id == id);
    if !existed {
        trace.info("tag not found");
        drop(trace);
        return Err(format!("Tag not found: {}", id));
    }

    // Collect tasks that have this tag, so we can save them
    let tasks_with_tag: Vec<String> = data
        .tasks
        .iter()
        .filter(|t| t.tag_ids.contains(&id))
        .map(|t| t.id.clone())
        .collect();

    // Remove tag from all tasks
    for task in &mut data.tasks {
        task.tag_ids.retain(|tag_id| tag_id != &id);
    }

    // Save affected tasks
    for task_id in &tasks_with_tag {
        if let Some(task) = find_task(&data, task_id) {
            let folder_id = task.folder_id.clone();
            if let Some(folder) = find_folder(&data, &folder_id) {
                let folder_filename = get_folder_filename(folder);
                if let Err(e) = save_task(&folder_filename, task) {
                    tracing::warn!(
                        target: "tasks::commands",
                        task_id = %task_id,
                        error = %e,
                        "Failed to save task after tag removal"
                    );
                }
            }
        }
    }

    // Remove the tag from the list
    data.tags.retain(|t| t.id != id);

    // Save the folders index (tags are stored there)
    let index = FoldersIndex {
        folders: data.folders.clone(),
        tags: data.tags.clone(),
    };
    if let Err(error) = save_folders_index(&index) {
        trace.info("tag delete save failed");
        drop(trace);
        return Err(error.to_string());
    }

    trace.info("tag deleted");
    drop(trace);

    Ok(())
}

#[tauri::command]
pub fn subtasks_create(
    store: State<TasksStore>,
    task_id: String,
    text: String,
) -> Result<Subtask, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "subtasks_create")
        .with("task_id", task_id.clone());
    trace.info("subtask create requested");

    let text = text.trim().to_string();
    if text.is_empty() {
        trace.info("subtask text empty");
        drop(trace);
        return Err("Subtask text cannot be empty".to_string());
    }

    let mut data = store.write();

    // Get folder info first
    let task = find_task(&data, &task_id).ok_or_else(|| {
        trace.info("task not found");
        format!("Task not found: {}", task_id)
    })?;
    let folder_id = task.folder_id.clone();
    let folder =
        find_folder(&data, &folder_id).ok_or_else(|| format!("Folder not found: {}", folder_id))?;
    let folder_filename = get_folder_filename(folder);

    // Now get mutable reference
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

    // Save only this task's file
    let task = find_task(&data, &task_id).expect("Task should exist");
    save_task(&folder_filename, task).map_err(|e| e.to_string())?;

    trace.info("subtask created");
    drop(trace);

    Ok(subtask)
}

#[tauri::command]
pub fn subtasks_toggle(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
) -> Result<bool, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "subtasks_toggle")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone());
    trace.info("subtask toggle requested");

    let result = with_subtask_mut(store.inner(), &task_id, &subtask_id, |subtask| {
        subtask.status = match subtask.status {
            TaskStatus::Completed => TaskStatus::Waiting,
            _ => TaskStatus::Completed,
        };

        Ok(matches!(subtask.status, TaskStatus::Completed))
    });

    match &result {
        Ok(_) => trace.info("subtask toggled"),
        Err(_) => trace.info("subtask toggle failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn subtasks_delete(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "subtasks_delete")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone());
    trace.info("subtask delete requested");

    let result = with_task_mut(store.inner(), &task_id, |task| {
        let existed = task.subtasks.iter().any(|s| s.id == subtask_id);
        if !existed {
            return Err(format!("Subtask not found: {}", subtask_id));
        }

        task.subtasks.retain(|s| s.id != subtask_id);
        Ok(())
    });

    match &result {
        Ok(_) => trace.info("subtask deleted"),
        Err(_) => trace.info("subtask delete failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn subtasks_reorder(
    store: State<TasksStore>,
    task_id: String,
    subtask_ids: Vec<String>,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "subtasks_reorder")
        .with("task_id", task_id.clone());
    trace.info("subtask reorder requested");

    let mut data = store.write();

    // Get folder info first
    let task = find_task(&data, &task_id).ok_or_else(|| {
        trace.info("task not found");
        format!("Task not found: {}", task_id)
    })?;
    let folder_id = task.folder_id.clone();
    let folder =
        find_folder(&data, &folder_id).ok_or_else(|| format!("Folder not found: {}", folder_id))?;
    let folder_filename = get_folder_filename(folder);

    // Now get mutable reference
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

    // Save only this task's file
    let task = find_task(&data, &task_id).expect("Task should exist");
    save_task(&folder_filename, task).map_err(|e| e.to_string())?;

    trace.info("subtask reorder complete");
    drop(trace);

    Ok(())
}

#[tauri::command]
pub fn subtasks_update_text(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
    text: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "subtasks_update_text")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone());
    trace.info("subtask text update requested");

    let text = text.trim().to_string();
    if text.is_empty() {
        trace.info("subtask text empty");
        drop(trace);
        return Err("Subtask text cannot be empty".to_string());
    }

    let result = with_subtask_mut(store.inner(), &task_id, &subtask_id, |subtask| {
        subtask.text = text;
        Ok(())
    });

    match &result {
        Ok(_) => trace.info("subtask text updated"),
        Err(_) => trace.info("subtask text update failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn tasks_update_description(
    store: State<TasksStore>,
    id: String,
    description: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_update_description")
        .with("task_id", id.clone());
    trace.info("task description update requested");

    let result = with_task_mut(store.inner(), &id, |task| {
        task.description = description;
        Ok(())
    });

    match &result {
        Ok(_) => trace.info("task description updated"),
        Err(_) => trace.info("task description update failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn tasks_update_working_directory(
    store: State<TasksStore>,
    id: String,
    working_directory: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_update_working_directory")
        .with("task_id", id.clone());
    trace.info("working directory update requested");

    let working_directory = working_directory.trim().to_string();

    if !working_directory.is_empty() {
        let path = std::path::Path::new(&working_directory);
        if !path.exists() {
            let message = format!("Path does not exist: {}", working_directory);
            trace.error(
                "Working directory update failed",
                TraceError::new(message.clone(), "WORKING_DIRECTORY_NOT_FOUND"),
            );
            drop(trace);
            return Err(message);
        }
        if !path.is_dir() {
            let message = format!("Path is not a directory: {}", working_directory);
            trace.error(
                "Working directory update failed",
                TraceError::new(message.clone(), "WORKING_DIRECTORY_NOT_DIR"),
            );
            drop(trace);
            return Err(message);
        }
    }

    with_task_mut(store.inner(), &id, |task| {
        task.working_directory = working_directory.clone();
        Ok(())
    })?;

    trace.info("working directory updated");
    drop(trace);

    Ok(())
}

#[tauri::command]
pub fn subtasks_update_status(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
    status: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "subtasks_update_status")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone());
    trace.info("subtask status update requested");

    let status = match status.as_str() {
        "waiting" => TaskStatus::Waiting,
        "in_progress" => TaskStatus::InProgress,
        "completed" => TaskStatus::Completed,
        _ => {
            trace.info("invalid status provided");
            drop(trace);
            return Err(format!("Invalid status: {}", status));
        }
    };

    let result = with_subtask_mut(store.inner(), &task_id, &subtask_id, |subtask| {
        subtask.status = status;
        Ok(())
    });

    match &result {
        Ok(_) => trace.info("subtask status updated"),
        Err(_) => trace.info("subtask status update failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn subtasks_update_order(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
    order: u32,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "subtasks_update_order")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone());
    trace.info("subtask order update requested");

    let result = with_subtask_mut(store.inner(), &task_id, &subtask_id, |subtask| {
        subtask.order = order;
        Ok(())
    });

    match &result {
        Ok(_) => trace.info("subtask order updated"),
        Err(_) => trace.info("subtask order update failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn subtasks_update_category(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
    category: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "subtasks_update_category")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone());
    trace.info("subtask category update requested");

    let category = match category.as_str() {
        "functional" => SubtaskCategory::Functional,
        "test" => SubtaskCategory::Test,
        _ => {
            trace.info("invalid category provided");
            drop(trace);
            return Err(format!("Invalid category: {}", category));
        }
    };

    let result = with_subtask_mut(store.inner(), &task_id, &subtask_id, |subtask| {
        subtask.category = category;
        Ok(())
    });

    match &result {
        Ok(_) => trace.info("subtask category updated"),
        Err(_) => trace.info("subtask category update failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn subtasks_update_notes(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
    notes: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "subtasks_update_notes")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone());
    trace.info("subtask notes update requested");

    let result = with_subtask_mut(store.inner(), &task_id, &subtask_id, |subtask| {
        subtask.notes = notes;
        Ok(())
    });

    match &result {
        Ok(_) => trace.info("subtask notes updated"),
        Err(_) => trace.info("subtask notes update failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn subtasks_update_should_commit(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
    should_commit: bool,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "subtasks_update_should_commit")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone());
    trace.info("subtask should_commit update requested");

    let result = with_subtask_mut(store.inner(), &task_id, &subtask_id, |subtask| {
        subtask.should_commit = should_commit;
        Ok(())
    });

    match &result {
        Ok(_) => trace.info("subtask should_commit updated"),
        Err(_) => trace.info("subtask should_commit update failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn steps_create(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
    text: String,
) -> Result<Step, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "steps_create")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone());
    trace.info("step create requested");

    let text = text.trim().to_string();
    if text.is_empty() {
        trace.info("step text empty");
        drop(trace);
        return Err("Step text cannot be empty".to_string());
    }

    let mut data = store.write();

    // Get folder info first
    let task = find_task(&data, &task_id).ok_or_else(|| {
        trace.info("task not found");
        format!("Task not found: {}", task_id)
    })?;
    let folder_id = task.folder_id.clone();
    let folder =
        find_folder(&data, &folder_id).ok_or_else(|| format!("Folder not found: {}", folder_id))?;
    let folder_filename = get_folder_filename(folder);

    // Now get mutable references
    let task = data
        .tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    let subtask = task
        .subtasks
        .iter_mut()
        .find(|s| s.id == subtask_id)
        .ok_or_else(|| {
            trace.info("subtask not found");
            format!("Subtask not found: {}", subtask_id)
        })?;

    let step = Step {
        id: Uuid::new_v4().to_string(),
        text,
        completed: false,
    };

    subtask.steps.push(step.clone());

    // Save only this task's file
    let task = find_task(&data, &task_id).expect("Task should exist");
    save_task(&folder_filename, task).map_err(|e| e.to_string())?;

    trace.info("step created");
    drop(trace);

    Ok(step)
}

#[tauri::command]
pub fn steps_toggle(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
    step_id: String,
) -> Result<bool, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "steps_toggle")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone())
        .with("step_id", step_id.clone());
    trace.info("step toggle requested");

    let result = with_step_mut(store.inner(), &task_id, &subtask_id, &step_id, |step| {
        step.completed = !step.completed;
        Ok(step.completed)
    });

    match &result {
        Ok(_) => trace.info("step toggled"),
        Err(_) => trace.info("step toggle failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn steps_delete(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
    step_id: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "steps_delete")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone())
        .with("step_id", step_id.clone());
    trace.info("step delete requested");

    let mut data = store.write();

    // Get folder info first
    let task = find_task(&data, &task_id).ok_or_else(|| {
        trace.info("task not found");
        format!("Task not found: {}", task_id)
    })?;
    let folder_id = task.folder_id.clone();
    let folder =
        find_folder(&data, &folder_id).ok_or_else(|| format!("Folder not found: {}", folder_id))?;
    let folder_filename = get_folder_filename(folder);

    // Now get mutable references
    let task = data
        .tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    let subtask = task
        .subtasks
        .iter_mut()
        .find(|s| s.id == subtask_id)
        .ok_or_else(|| {
            trace.info("subtask not found");
            format!("Subtask not found: {}", subtask_id)
        })?;

    let existed = subtask.steps.iter().any(|s| s.id == step_id);
    if !existed {
        trace.info("step not found");
        drop(trace);
        return Err(format!("Step not found: {}", step_id));
    }

    subtask.steps.retain(|s| s.id != step_id);

    // Save only this task's file
    let task = find_task(&data, &task_id).expect("Task should exist");
    save_task(&folder_filename, task).map_err(|e| e.to_string())?;

    trace.info("step deleted");
    drop(trace);

    Ok(())
}

#[tauri::command]
pub fn steps_update_text(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
    step_id: String,
    text: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "steps_update_text")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone())
        .with("step_id", step_id.clone());
    trace.info("step text update requested");

    let text = text.trim().to_string();
    if text.is_empty() {
        trace.info("step text empty");
        drop(trace);
        return Err("Step text cannot be empty".to_string());
    }

    let result = with_step_mut(store.inner(), &task_id, &subtask_id, &step_id, |step| {
        step.text = text;
        Ok(())
    });

    match &result {
        Ok(_) => trace.info("step text updated"),
        Err(_) => trace.info("step text update failed"),
    }
    drop(trace);

    result
}

#[tauri::command]
pub fn execution_logs_create(
    store: State<TasksStore>,
    task_id: String,
    subtask_id: String,
    outcome: String,
    summary: String,
    files_changed: Vec<String>,
    learnings_patterns: Vec<String>,
    learnings_gotchas: Vec<String>,
    learnings_context: Vec<String>,
    committed: bool,
    commit_hash: Option<String>,
    commit_message: Option<String>,
    error_message: Option<String>,
) -> Result<ExecutionLog, String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "execution_logs_create")
        .with("task_id", task_id.clone())
        .with("subtask_id", subtask_id.clone());
    trace.info("execution log create requested");

    let outcome = match outcome.as_str() {
        "success" => ExecutionOutcome::Success,
        "partial" => ExecutionOutcome::Partial,
        "failed" => ExecutionOutcome::Failed,
        "aborted" => ExecutionOutcome::Aborted,
        _ => {
            trace.info("invalid execution outcome");
            drop(trace);
            return Err(format!("Invalid outcome: {}", outcome));
        }
    };

    let mut data = store.write();

    // Get folder info first
    let task = find_task(&data, &task_id).ok_or_else(|| {
        trace.info("task not found");
        format!("Task not found: {}", task_id)
    })?;
    let folder_id = task.folder_id.clone();
    let folder =
        find_folder(&data, &folder_id).ok_or_else(|| format!("Folder not found: {}", folder_id))?;
    let folder_filename = get_folder_filename(folder);

    // Now get mutable references
    let task = data
        .tasks
        .iter_mut()
        .find(|t| t.id == task_id)
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    let subtask = task
        .subtasks
        .iter_mut()
        .find(|s| s.id == subtask_id)
        .ok_or_else(|| {
            trace.info("subtask not found");
            format!("Subtask not found: {}", subtask_id)
        })?;

    let now = now_ms();
    let log = ExecutionLog {
        id: Uuid::new_v4().to_string(),
        started_at: now,
        completed_at: Some(now),
        duration: Some(0),
        outcome,
        summary,
        files_changed,
        learnings: Learnings {
            patterns: learnings_patterns,
            gotchas: learnings_gotchas,
            context: learnings_context,
        },
        committed,
        commit_hash,
        commit_message,
        error_message,
    };

    subtask.execution_logs.push(log.clone());

    // Save only this task's file
    let task = find_task(&data, &task_id).expect("Task should exist");
    if let Err(error) = save_task(&folder_filename, task) {
        trace.info("execution log save failed");
        drop(trace);
        return Err(error.to_string());
    }

    trace.info("execution log created");
    drop(trace);

    Ok(log)
}

/// Fire-and-forget command to auto-tag a task using AI.
/// Spawns a background task that calls OpenCode to suggest tags based on task text/description.
/// Emits a `tasks:tags-updated` event when tags are applied.
#[tauri::command]
pub async fn tasks_auto_tag(
    store: State<'_, TasksStore>,
    app_handle: AppHandle,
    task_id: String,
    folder_id: String,
) -> Result<(), String> {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_auto_tag")
        .with("task_id", task_id.clone())
        .with("folder_id", folder_id.clone());
    trace.info("auto-tag requested");

    // Gather task and tags info while holding the lock briefly
    let (task_text, task_description, available_tags) = {
        let data = store.read();

        let task = match data.tasks.iter().find(|t| t.id == task_id) {
            Some(t) => t,
            None => {
                trace.info("task not found");
                drop(trace);
                return Ok(()); // Fire-forget: don't error, just return
            }
        };

        let tags: Vec<(String, String)> = data
            .tags
            .iter()
            .filter(|t| t.folder_id == folder_id)
            .map(|t| (t.id.clone(), t.name.clone()))
            .collect();

        if tags.is_empty() {
            trace.info("no tags available in folder, skipping auto-tag");
            drop(trace);
            return Ok(());
        }

        (task.text.clone(), task.description.clone(), tags)
    };

    trace.info("spawning background auto-tag task");
    drop(trace);

    // Spawn background task - fire and forget
    // Use app_handle.state() to access store from within the spawned task
    tokio::spawn(async move {
        run_auto_tag_background(
            app_handle,
            task_id,
            folder_id,
            task_text,
            task_description,
            available_tags,
        )
        .await;
    });

    Ok(())
}

async fn run_auto_tag_background(
    app_handle: AppHandle,
    task_id: String,
    folder_id: String,
    task_text: String,
    task_description: String,
    available_tags: Vec<(String, String)>,
) {
    let trace = Trace::new()
        .with("plugin", "tasks")
        .with("action", "tasks_auto_tag_background")
        .with("task_id", task_id.clone());

    // Check if OpenCode server is running via health check
    if super::opencode::opencode_health_check().await.is_err() {
        trace.warn("OpenCode server not running, skipping auto-tag");
        drop(trace);
        return;
    }

    // Build the prompt for tag suggestion
    let tags_list = available_tags
        .iter()
        .map(|(id, name)| format!("- id: \"{}\", name: \"{}\"", id, name))
        .collect::<Vec<_>>()
        .join("\n");

    let prompt = format!(
        r#"You are a task tagger. Analyze the task and suggest which tags apply.

Task title: {}
Task description: {}

Available tags:
{}

Rules:
- Return ONLY a JSON array of tag IDs that apply to this task
- Return an empty array [] if no tags apply
- Do NOT explain or add any other text
- Maximum 3 tags

Example response: ["tag-id-1", "tag-id-2"]"#,
        task_text,
        if task_description.is_empty() {
            "(no description)"
        } else {
            &task_description
        },
        tags_list
    );

    trace.info("creating OpenCode session for auto-tag");

    // Create session
    let session = match super::opencode::opencode_create_session(Some(format!(
        "Auto-tag: {}",
        task_text
    )))
    .await
    {
        Ok(s) => s,
        Err(e) => {
            trace.warn(&format!("Failed to create session: {}", e));
            drop(trace);
            return;
        }
    };

    let session_id = session.id.clone();

    // Use a faster model for this simple task
    let model = super::opencode::ModelConfig {
        provider_id: "anthropic".to_string(),
        model_id: "claude-sonnet-4-20250514".to_string(),
    };

    // Send prompt
    if let Err(e) =
        super::opencode::opencode_send_prompt(session_id.clone(), prompt, None, Some(model)).await
    {
        trace.warn(&format!("Failed to send prompt: {}", e));
        drop(trace);
        return;
    }

    trace.info("polling for auto-tag completion");

    // Poll for completion with timeout
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(30);
    let poll_interval = std::time::Duration::from_millis(500);

    loop {
        if start.elapsed() > timeout {
            trace.warn("auto-tag timed out");
            let _ = super::opencode::opencode_abort_session(session_id.clone()).await;
            drop(trace);
            return;
        }

        tokio::time::sleep(poll_interval).await;

        match super::opencode::opencode_poll_status(session_id.clone()).await {
            Ok(status) if status.status == "idle" => {
                trace.info("auto-tag session completed");
                break;
            }
            Ok(_) => continue,
            Err(e) => {
                trace.warn(&format!("Failed to poll status: {}", e));
                continue;
            }
        }
    }

    // Get the response
    let response = match get_auto_tag_response(&session_id).await {
        Ok(r) => r,
        Err(e) => {
            trace.warn(&format!("Failed to get response: {}", e));
            drop(trace);
            return;
        }
    };

    // Parse the JSON array of tag IDs
    let tag_ids: Vec<String> = match parse_tag_ids(&response, &available_tags) {
        Ok(ids) => ids,
        Err(e) => {
            trace.warn(&format!("Failed to parse tag IDs: {}", e));
            drop(trace);
            return;
        }
    };

    if tag_ids.is_empty() {
        trace.info("no tags suggested by AI");
        drop(trace);
        return;
    }

    trace.info(&format!("AI suggested {} tags", tag_ids.len()));

    // Apply tags to the task using app_handle.state()
    let store: State<'_, TasksStore> = app_handle.state();
    {
        let mut data = store.write();

        // Get folder info first
        let folder_filename = {
            if let Some(task) = data.tasks.iter().find(|t| t.id == task_id) {
                if let Some(folder) = data.folders.iter().find(|f| f.id == task.folder_id) {
                    get_folder_filename(folder)
                } else {
                    trace.warn("folder not found");
                    drop(trace);
                    return;
                }
            } else {
                trace.warn("task not found when applying tags");
                drop(trace);
                return;
            }
        };

        // Update task tags
        if let Some(task) = data.tasks.iter_mut().find(|t| t.id == task_id) {
            // Merge with existing tags, avoiding duplicates
            for tag_id in &tag_ids {
                if !task.tag_ids.contains(tag_id) {
                    task.tag_ids.push(tag_id.clone());
                }
            }

            // Save the task
            if let Err(e) = save_task(&folder_filename, task) {
                trace.warn(&format!("Failed to save task with new tags: {}", e));
                drop(trace);
                return;
            }
        }
    }

    trace.info(&format!(
        "auto-tag completed, applied {} tags",
        tag_ids.len()
    ));

    // Emit event to notify frontend
    #[derive(serde::Serialize, Clone)]
    struct TagsUpdatedPayload {
        task_id: String,
        folder_id: String,
        tag_ids: Vec<String>,
    }

    if let Err(e) = app_handle.emit(
        "tasks:tags-updated",
        TagsUpdatedPayload {
            task_id,
            folder_id,
            tag_ids,
        },
    ) {
        trace.warn(&format!("Failed to emit tags-updated event: {}", e));
    }

    drop(trace);
}

async fn get_auto_tag_response(session_id: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    #[derive(serde::Deserialize)]
    struct MessagePart {
        #[serde(rename = "type")]
        part_type: String,
        #[serde(default)]
        text: Option<String>,
    }

    #[derive(serde::Deserialize)]
    struct Message {
        role: String,
        parts: Vec<MessagePart>,
    }

    #[derive(serde::Deserialize)]
    struct SessionMessages {
        messages: Vec<Message>,
    }

    let base_url = format!("http://127.0.0.1:4096");

    let response = client
        .get(format!("{}/session/{}", base_url, session_id))
        .send()
        .await
        .map_err(|e| format!("Failed to get session: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Get session failed: {}", response.status()));
    }

    let session_data: SessionMessages = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse session: {}", e))?;

    let assistant_message = session_data
        .messages
        .iter()
        .rev()
        .find(|m| m.role == "assistant")
        .ok_or("No assistant message found")?;

    let text = assistant_message
        .parts
        .iter()
        .filter_map(|p| {
            if p.part_type == "text" {
                p.text.clone()
            } else {
                None
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    Ok(text)
}

fn parse_tag_ids(response: &str, available_tags: &[(String, String)]) -> Result<Vec<String>, String> {
    // Try to find a JSON array in the response
    let trimmed = response.trim();

    // Look for array pattern
    let start = trimmed.find('[').ok_or("No JSON array found")?;
    let end = trimmed.rfind(']').ok_or("No closing bracket found")?;

    if end <= start {
        return Err("Invalid JSON array".to_string());
    }

    let json_str = &trimmed[start..=end];

    let parsed: Vec<String> = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    // Validate that all IDs exist in available tags
    let valid_ids: Vec<String> = parsed
        .into_iter()
        .filter(|id| available_tags.iter().any(|(tag_id, _)| tag_id == id))
        .take(3) // Limit to 3 tags
        .collect();

    Ok(valid_ids)
}
