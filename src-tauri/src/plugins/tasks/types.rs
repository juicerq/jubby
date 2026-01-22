use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    #[default]
    Waiting,
    InProgress,
    Completed,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SubtaskCategory {
    #[default]
    Functional,
    Test,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionOutcome {
    Success,
    Partial,
    Failed,
    Aborted,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub id: String,
    pub text: String,
    pub completed: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Learnings {
    #[serde(default)]
    pub patterns: Vec<String>,
    #[serde(default)]
    pub gotchas: Vec<String>,
    #[serde(default)]
    pub context: Vec<String>,
}

impl Default for Learnings {
    fn default() -> Self {
        Self {
            patterns: Vec::new(),
            gotchas: Vec::new(),
            context: Vec::new(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionLog {
    pub id: String,
    pub started_at: i64,
    pub completed_at: Option<i64>,
    pub duration: Option<i64>,
    pub outcome: ExecutionOutcome,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub files_changed: Vec<String>,
    #[serde(default)]
    pub learnings: Learnings,
    #[serde(default)]
    pub committed: bool,
    pub commit_hash: Option<String>,
    pub commit_message: Option<String>,
    pub error_message: Option<String>,
}

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
pub struct Subtask {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub status: TaskStatus,
    #[serde(default)]
    pub order: u32,
    #[serde(default)]
    pub category: SubtaskCategory,
    #[serde(default)]
    pub steps: Vec<Step>,
    #[serde(default = "default_should_commit")]
    pub should_commit: bool,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub execution_logs: Vec<ExecutionLog>,
    // Legacy field for migration compatibility
    #[serde(default, skip_serializing)]
    pub completed: Option<bool>,
    #[serde(default, skip_serializing)]
    pub position: Option<i32>,
}

fn default_should_commit() -> bool {
    true
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    /// Folder ID - only used during migration from old tasks.json format.
    /// In per-folder storage, this field is implicit from the file path.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub folder_id: String,
    pub text: String,
    pub status: String,
    pub created_at: i64,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub working_directory: String,
    #[serde(default)]
    pub tag_ids: Vec<String>,
    #[serde(default)]
    pub subtasks: Vec<Subtask>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    /// Folder ID - only used during migration from old tasks.json format.
    /// In per-folder storage, this field is implicit from the file path.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub folder_id: String,
    pub name: String,
    pub color: String,
}

/// Legacy data structure - used during migration from single tasks.json file.
/// After migration, use FoldersIndex + FolderData instead.
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

/// Index of all folders - stored in folders.json
/// This is the entry point for the per-folder storage system.
#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FoldersIndex {
    #[serde(default)]
    pub folders: Vec<Folder>,
}

/// Data for a specific folder - stored in {folderId}.json
/// Contains all tasks and tags belonging to this folder.
#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FolderData {
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
    pub description: String,
    pub working_directory: String,
    pub tag_ids: Vec<String>,
    pub subtasks: Vec<Subtask>,
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
