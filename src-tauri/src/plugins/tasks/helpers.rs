use super::storage::save_to_json;
use super::types::{Folder, Step, Subtask, Tag, Task, TasksData};
use super::TasksStore;

pub fn find_folder<'a>(data: &'a TasksData, id: &str) -> Option<&'a Folder> {
    data.folders.iter().find(|folder| folder.id == id)
}

pub fn find_folder_mut<'a>(data: &'a mut TasksData, id: &str) -> Option<&'a mut Folder> {
    data.folders.iter_mut().find(|folder| folder.id == id)
}

pub fn find_task<'a>(data: &'a TasksData, id: &str) -> Option<&'a Task> {
    data.tasks.iter().find(|task| task.id == id)
}

pub fn find_task_mut<'a>(data: &'a mut TasksData, id: &str) -> Option<&'a mut Task> {
    data.tasks.iter_mut().find(|task| task.id == id)
}

pub fn find_subtask<'a>(task: &'a Task, id: &str) -> Option<&'a Subtask> {
    task.subtasks.iter().find(|subtask| subtask.id == id)
}

pub fn find_subtask_mut<'a>(task: &'a mut Task, id: &str) -> Option<&'a mut Subtask> {
    task.subtasks.iter_mut().find(|subtask| subtask.id == id)
}

pub fn find_step<'a>(subtask: &'a Subtask, id: &str) -> Option<&'a Step> {
    subtask.steps.iter().find(|step| step.id == id)
}

pub fn find_step_mut<'a>(subtask: &'a mut Subtask, id: &str) -> Option<&'a mut Step> {
    subtask.steps.iter_mut().find(|step| step.id == id)
}

pub fn find_tag<'a>(data: &'a TasksData, id: &str) -> Option<&'a Tag> {
    data.tags.iter().find(|tag| tag.id == id)
}

pub fn find_tag_mut<'a>(data: &'a mut TasksData, id: &str) -> Option<&'a mut Tag> {
    data.tags.iter_mut().find(|tag| tag.id == id)
}

pub fn with_folder_mut<F, R>(store: &TasksStore, id: &str, f: F) -> Result<R, String>
where
    F: FnOnce(&mut Folder) -> Result<R, String>,
{
    let mut data = store.write();
    let folder =
        find_folder_mut(&mut data, id).ok_or_else(|| format!("Folder not found: {}", id))?;
    let result = f(folder)?;
    save_to_json(&data).map_err(|e| e.to_string())?;
    Ok(result)
}

pub fn with_task_mut<F, R>(store: &TasksStore, id: &str, f: F) -> Result<R, String>
where
    F: FnOnce(&mut Task) -> Result<R, String>,
{
    let mut data = store.write();
    let task = find_task_mut(&mut data, id).ok_or_else(|| format!("Task not found: {}", id))?;
    let result = f(task)?;
    save_to_json(&data).map_err(|e| e.to_string())?;
    Ok(result)
}

pub fn with_subtask_mut<F, R>(
    store: &TasksStore,
    task_id: &str,
    subtask_id: &str,
    f: F,
) -> Result<R, String>
where
    F: FnOnce(&mut Subtask) -> Result<R, String>,
{
    let mut data = store.write();
    let task =
        find_task_mut(&mut data, task_id).ok_or_else(|| format!("Task not found: {}", task_id))?;
    let subtask = find_subtask_mut(task, subtask_id)
        .ok_or_else(|| format!("Subtask not found: {}", subtask_id))?;
    let result = f(subtask)?;
    save_to_json(&data).map_err(|e| e.to_string())?;
    Ok(result)
}

pub fn with_step_mut<F, R>(
    store: &TasksStore,
    task_id: &str,
    subtask_id: &str,
    step_id: &str,
    f: F,
) -> Result<R, String>
where
    F: FnOnce(&mut Step) -> Result<R, String>,
{
    let mut data = store.write();
    let task =
        find_task_mut(&mut data, task_id).ok_or_else(|| format!("Task not found: {}", task_id))?;
    let subtask = find_subtask_mut(task, subtask_id)
        .ok_or_else(|| format!("Subtask not found: {}", subtask_id))?;
    let step =
        find_step_mut(subtask, step_id).ok_or_else(|| format!("Step not found: {}", step_id))?;
    let result = f(step)?;
    save_to_json(&data).map_err(|e| e.to_string())?;
    Ok(result)
}

pub fn with_tag_mut<F, R>(store: &TasksStore, id: &str, f: F) -> Result<R, String>
where
    F: FnOnce(&mut Tag) -> Result<R, String>,
{
    let mut data = store.write();
    let tag = find_tag_mut(&mut data, id).ok_or_else(|| format!("Tag not found: {}", id))?;
    let result = f(tag)?;
    save_to_json(&data).map_err(|e| e.to_string())?;
    Ok(result)
}
