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
pub struct Todo {
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
pub struct TodoData {
    #[serde(default)]
    pub folders: Vec<Folder>,
    #[serde(default)]
    pub todos: Vec<Todo>,
    #[serde(default)]
    pub tags: Vec<Tag>,
}

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
pub struct TodoWithTags {
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
pub struct TodoDataResponse {
    pub todos: Vec<TodoWithTags>,
    pub tags: Vec<TagResponse>,
}
