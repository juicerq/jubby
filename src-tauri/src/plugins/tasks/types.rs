use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub position: i32,
    pub created_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub folder_id: String,
    pub text: String,
    pub status: String,
    pub created_at: i64,
    #[serde(default)]
    pub tag_ids: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub folder_id: String,
    pub name: String,
    pub color: String,
}

#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TasksData {
    #[serde(default)]
    pub folders: Vec<Folder>,
    #[serde(default)]
    pub tasks: Vec<Task>,
    #[serde(default)]
    pub tags: Vec<Tag>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentTask {
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
    pub task_count: i32,
    pub recent_tasks: Vec<RecentTask>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskWithTags {
    pub id: String,
    pub text: String,
    pub status: String,
    pub created_at: i64,
    pub tag_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct TagResponse {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Serialize)]
pub struct TasksDataResponse {
    pub tasks: Vec<TaskWithTags>,
    pub tags: Vec<TagResponse>,
}
