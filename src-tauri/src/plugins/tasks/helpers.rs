use super::types::{Folder, Step, Subtask, Tag, Task, TasksData};

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
