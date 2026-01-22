use super::types::{Folder, FolderData, FoldersIndex, Tag, Task, TaskStatus, TasksData};
use crate::shared::paths::{ensure_dir, get_plugin_dir};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

// ============================================================================
// Write Suppression Registry
// ============================================================================

/// Duration to suppress watcher events after an internal write.
const WRITE_SUPPRESSION_WINDOW_MS: u64 = 300;

/// Global registry of recent internal writes (file path -> last write timestamp).
static WRITE_REGISTRY: once_cell::sync::Lazy<Mutex<HashMap<PathBuf, Instant>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

/// Records an internal write for a file path.
/// Called after saving to prevent the watcher from reacting to our own writes.
pub fn record_internal_write(path: &PathBuf) {
    if let Ok(mut registry) = WRITE_REGISTRY.lock() {
        registry.insert(path.clone(), Instant::now());
        tracing::trace!(
            target: "tasks::storage",
            path = %path.display(),
            "Recorded internal write"
        );
    }
}

/// Checks if a file path was recently written by the app (within suppression window).
/// Returns true if the event should be suppressed, false if it should be processed.
pub fn should_suppress_event(path: &PathBuf) -> bool {
    let suppression_window = Duration::from_millis(WRITE_SUPPRESSION_WINDOW_MS);

    if let Ok(mut registry) = WRITE_REGISTRY.lock() {
        if let Some(write_time) = registry.get(path) {
            let elapsed = write_time.elapsed();
            if elapsed < suppression_window {
                tracing::debug!(
                    target: "tasks::storage",
                    path = %path.display(),
                    elapsed_ms = elapsed.as_millis(),
                    window_ms = WRITE_SUPPRESSION_WINDOW_MS,
                    "Suppressing event for self-write"
                );
                return true;
            } else {
                // Expired entry, remove it
                registry.remove(path);
                tracing::trace!(
                    target: "tasks::storage",
                    path = %path.display(),
                    "Write record expired, allowing event"
                );
            }
        }
    }
    false
}

/// Cleans up expired entries from the write registry.
/// Call periodically to prevent memory buildup.
pub fn cleanup_write_registry() {
    let suppression_window = Duration::from_millis(WRITE_SUPPRESSION_WINDOW_MS);

    if let Ok(mut registry) = WRITE_REGISTRY.lock() {
        let before = registry.len();
        registry.retain(|_, write_time| write_time.elapsed() < suppression_window);
        let removed = before - registry.len();
        if removed > 0 {
            tracing::trace!(
                target: "tasks::storage",
                removed = removed,
                "Cleaned up expired write records"
            );
        }
    }
}

// ============================================================================
// Filename Utilities
// ============================================================================

use unicode_normalization::UnicodeNormalization;

/// Converts a string to a valid kebab-case filename.
///
/// This function:
/// - Normalizes Unicode using NFD and removes combining marks (accents)
/// - Converts to lowercase
/// - Replaces spaces and underscores with hyphens
/// - Removes invalid filename characters
/// - Collapses multiple consecutive hyphens
/// - Trims leading/trailing hyphens
/// - Returns "unnamed" for empty or whitespace-only input
///
/// The output is safe for Linux, macOS, and Windows filenames.
pub fn to_kebab_case(input: &str) -> String {
    if input.trim().is_empty() {
        return "unnamed".to_string();
    }

    let normalized: String = input
        .nfd() // Decompose Unicode characters
        .filter(|c| !c.is_ascii() || c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_')
        .filter(|c| {
            // Remove combining diacritical marks (accents)
            !('\u{0300}'..='\u{036f}').contains(c)
        })
        .collect();

    let result: String = normalized
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c
            } else if c == ' ' || c == '_' || c == '-' {
                '-'
            } else {
                // Skip invalid filename characters: < > : " / \ | ? *
                '\0'
            }
        })
        .filter(|c| *c != '\0')
        .collect();

    // Collapse multiple consecutive hyphens and trim
    let mut collapsed = String::with_capacity(result.len());
    let mut prev_hyphen = false;

    for c in result.chars() {
        if c == '-' {
            if !prev_hyphen {
                collapsed.push('-');
            }
            prev_hyphen = true;
        } else {
            collapsed.push(c);
            prev_hyphen = false;
        }
    }

    let trimmed = collapsed.trim_matches('-').to_string();

    if trimmed.is_empty() {
        "unnamed".to_string()
    } else {
        trimmed
    }
}

// ============================================================================
// Path Helpers
// ============================================================================

pub fn get_tasks_dir() -> PathBuf {
    get_plugin_dir("tasks")
}

fn get_old_todo_dir() -> PathBuf {
    get_plugin_dir("todo")
}

fn get_folders_index_path() -> PathBuf {
    get_tasks_dir().join("folders.json")
}

fn get_folder_data_path(filename: &str) -> PathBuf {
    get_tasks_dir().join(format!("{}.json", filename))
}

/// Generates a unique kebab-case filename for a folder.
/// If the base name already exists, appends a numeric suffix (-1, -2, etc.).
pub fn generate_unique_filename(name: &str, existing_filenames: &[String]) -> String {
    let base = to_kebab_case(name);

    if !existing_filenames.contains(&base) {
        return base;
    }

    let mut counter = 1;
    loop {
        let candidate = format!("{}-{}", base, counter);
        if !existing_filenames.contains(&candidate) {
            return candidate;
        }
        counter += 1;
    }
}

/// Gets the effective filename for a folder.
/// Returns the filename field if set, otherwise falls back to the folder id.
/// This provides backward compatibility with folders created before the filename field existed.
pub fn get_folder_filename(folder: &Folder) -> String {
    if folder.filename.is_empty() {
        folder.id.clone()
    } else {
        folder.filename.clone()
    }
}

fn get_legacy_data_path() -> PathBuf {
    get_tasks_dir().join("tasks.json")
}

fn get_old_data_path() -> PathBuf {
    get_old_todo_dir().join("todo.json")
}

fn get_sqlite_path() -> PathBuf {
    crate::shared::paths::get_storage_dir().join("jubby.db")
}

fn get_sqlite_backup_path() -> PathBuf {
    crate::shared::paths::get_storage_dir().join("jubby.db.bak")
}

pub fn load_or_migrate() -> Result<TasksData, Box<dyn std::error::Error>> {
    let folders_index_path = get_folders_index_path();
    let json_path = get_legacy_data_path();
    let old_json_path = get_old_data_path();
    let sqlite_path = get_sqlite_path();

    if folders_index_path.exists() {
        return load_from_storage();
    }

    if json_path.exists() {
        let mut data = load_from_json(&json_path)?;
        if migrate_subtask_data(&mut data) {
            tracing::info!(target: "tasks", "Migrated subtask data to new format");
        }
        save_to_storage(&data)?;
        return Ok(data);
    }

    if old_json_path.exists() {
        tracing::info!(target: "tasks", "Found old todo/todo.json, migrating to tasks storage...");
        let mut data = load_from_json(&old_json_path)?;
        migrate_subtask_data(&mut data);
        save_to_storage(&data)?;

        if let Err(e) = std::fs::remove_dir_all(get_old_todo_dir()) {
            tracing::warn!(target: "tasks", "Could not remove old todo directory: {}", e);
        } else {
            tracing::info!(target: "tasks", "Old todo directory removed");
        }

        return Ok(data);
    }

    if sqlite_path.exists() {
        tracing::info!(target: "tasks", "Found SQLite database, migrating to storage...");
        let data = migrate_from_sqlite(&sqlite_path)?;
        save_to_storage(&data)?;

        let backup_path = get_sqlite_backup_path();
        std::fs::rename(&sqlite_path, &backup_path)?;
        tracing::info!(target: "tasks", "SQLite database backed up to {:?}", backup_path);

        return Ok(data);
    }

    Ok(TasksData::default())
}

fn load_from_json(path: &PathBuf) -> Result<TasksData, Box<dyn std::error::Error>> {
    let content = std::fs::read_to_string(path)?;
    let data: TasksData = serde_json::from_str(&content)?;
    Ok(data)
}

fn load_from_storage() -> Result<TasksData, Box<dyn std::error::Error>> {
    let index = load_folders_index()?;
    let mut tasks = Vec::new();
    let mut tags = Vec::new();

    for folder in &index.folders {
        let filename = get_folder_filename(folder);
        let folder_data = load_folder_data(&filename, &folder.id)?;
        tasks.extend(folder_data.tasks);
        tags.extend(folder_data.tags);
    }

    Ok(TasksData {
        folders: index.folders,
        tasks,
        tags,
    })
}

fn migrate_subtask_data(data: &mut TasksData) -> bool {
    let mut migrated = false;

    for task in &mut data.tasks {
        for (index, subtask) in task.subtasks.iter_mut().enumerate() {
            if let Some(completed) = subtask.completed.take() {
                subtask.status = if completed {
                    TaskStatus::Completed
                } else {
                    TaskStatus::Waiting
                };
                migrated = true;
            }

            if let Some(position) = subtask.position.take() {
                subtask.order = position as u32;
                migrated = true;
            } else if subtask.order == 0 && index > 0 {
                subtask.order = index as u32;
                migrated = true;
            }
        }
    }

    migrated
}

fn save_to_storage(data: &TasksData) -> Result<(), Box<dyn std::error::Error>> {
    let index = FoldersIndex {
        folders: data.folders.clone(),
    };

    save_folders_index(&index)?;

    for folder in &data.folders {
        let filename = get_folder_filename(folder);
        let folder_data = FolderData {
            tasks: data
                .tasks
                .iter()
                .filter(|task| task.folder_id == folder.id)
                .cloned()
                .collect(),
            tags: data
                .tags
                .iter()
                .filter(|tag| tag.folder_id == folder.id)
                .cloned()
                .collect(),
        };
        save_folder_data(&filename, &folder_data)?;
    }

    Ok(())
}

/// Compatibility function that saves TasksData using the multi-file storage.
/// This function is used by commands.rs and opencode.rs.
pub fn save_to_json(data: &TasksData) -> Result<(), Box<dyn std::error::Error>> {
    save_to_storage(data)
}

pub fn reload_from_disk() -> Result<TasksData, Box<dyn std::error::Error>> {
    let folders_index_path = get_folders_index_path();
    if folders_index_path.exists() {
        load_from_storage()
    } else {
        Ok(TasksData::default())
    }
}

pub fn load_folders_index() -> Result<FoldersIndex, Box<dyn std::error::Error>> {
    let path = get_folders_index_path();
    if !path.exists() {
        return Ok(FoldersIndex::default());
    }

    let content = std::fs::read_to_string(&path)?;
    let data: FoldersIndex = serde_json::from_str(&content)?;
    Ok(data)
}

pub fn save_folders_index(data: &FoldersIndex) -> Result<(), Box<dyn std::error::Error>> {
    let dir = get_tasks_dir();
    ensure_dir(&dir)?;

    let path = get_folders_index_path();
    let content = serde_json::to_string_pretty(data)?;
    std::fs::write(&path, &content)?;
    record_internal_write(&path);
    Ok(())
}

/// Loads folder data from disk.
///
/// # Arguments
/// * `filename` - The kebab-case filename (without .json extension)
/// * `folder_id` - The folder's UUID, used to set folder_id on tasks/tags
pub fn load_folder_data(
    filename: &str,
    folder_id: &str,
) -> Result<FolderData, Box<dyn std::error::Error>> {
    let path = get_folder_data_path(filename);
    if !path.exists() {
        return Ok(FolderData::default());
    }

    let content = std::fs::read_to_string(&path)?;
    let mut data: FolderData = serde_json::from_str(&content)?;
    for task in &mut data.tasks {
        task.folder_id = folder_id.to_string();
    }
    for tag in &mut data.tags {
        tag.folder_id = folder_id.to_string();
    }
    Ok(data)
}

/// Saves folder data to disk.
///
/// # Arguments
/// * `filename` - The kebab-case filename (without .json extension)
/// * `data` - The folder data to save
pub fn save_folder_data(
    filename: &str,
    data: &FolderData,
) -> Result<(), Box<dyn std::error::Error>> {
    let dir = get_tasks_dir();
    ensure_dir(&dir)?;

    let data = FolderData {
        tasks: data
            .tasks
            .iter()
            .cloned()
            .map(|mut task| {
                task.folder_id = String::new();
                task
            })
            .collect(),
        tags: data
            .tags
            .iter()
            .cloned()
            .map(|mut tag| {
                tag.folder_id = String::new();
                tag
            })
            .collect(),
    };

    let path = get_folder_data_path(filename);
    let content = serde_json::to_string_pretty(&data)?;
    std::fs::write(&path, &content)?;
    record_internal_write(&path);
    Ok(())
}

/// Deletes the folder data file from disk.
///
/// # Arguments
/// * `filename` - The kebab-case filename (without .json extension)
pub fn delete_folder_file(filename: &str) -> Result<(), Box<dyn std::error::Error>> {
    let path = get_folder_data_path(filename);
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

fn migrate_from_sqlite(path: &PathBuf) -> Result<TasksData, Box<dyn std::error::Error>> {
    use rusqlite::Connection;

    let conn = Connection::open(path)?;

    let mut folders = Vec::new();
    let mut existing_filenames: Vec<String> = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT id, name, position, created_at FROM folders ORDER BY position ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i32>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?;
        for row in rows {
            let (id, name, position, created_at) = row?;
            let filename = generate_unique_filename(&name, &existing_filenames);
            existing_filenames.push(filename.clone());
            folders.push(Folder {
                id,
                name,
                filename,
                position,
                created_at,
            });
        }
    }

    let mut tasks = Vec::new();
    {
        let mut stmt = conn.prepare("SELECT id, folder_id, text, status, created_at FROM todos")?;
        let rows = stmt.query_map([], |row| {
            Ok(Task {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                text: row.get(2)?,
                status: row.get(3)?,
                created_at: row.get(4)?,
                description: String::new(),
                working_directory: String::new(),
                tag_ids: Vec::new(),
                subtasks: Vec::new(),
            })
        })?;
        for row in rows {
            tasks.push(row?);
        }
    }

    {
        let mut stmt = conn.prepare("SELECT todo_id, tag_id FROM todo_tags")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (task_id, tag_id) = row?;
            if let Some(task) = tasks.iter_mut().find(|t| t.id == task_id) {
                task.tag_ids.push(tag_id);
            }
        }
    }

    let mut tags = Vec::new();
    {
        let mut stmt = conn.prepare("SELECT id, folder_id, name, color FROM tags")?;
        let rows = stmt.query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                name: row.get(2)?,
                color: row.get(3)?,
            })
        })?;
        for row in rows {
            tags.push(row?);
        }
    }

    tracing::info!(
        target: "tasks",
        "Migrated {} folders, {} tasks, {} tags from SQLite",
        folders.len(),
        tasks.len(),
        tags.len()
    );

    Ok(TasksData {
        folders,
        tasks,
        tags,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_kebab_case_basic() {
        assert_eq!(to_kebab_case("Hello World"), "hello-world");
        assert_eq!(to_kebab_case("My Folder Name"), "my-folder-name");
        assert_eq!(to_kebab_case("simple"), "simple");
    }

    #[test]
    fn test_to_kebab_case_accents() {
        assert_eq!(to_kebab_case("Tarefas Básicas"), "tarefas-basicas");
        assert_eq!(to_kebab_case("Café com Leite"), "cafe-com-leite");
        assert_eq!(to_kebab_case("Ação Rápida"), "acao-rapida");
        assert_eq!(to_kebab_case("über"), "uber");
        assert_eq!(to_kebab_case("naïve"), "naive");
        assert_eq!(to_kebab_case("résumé"), "resume");
    }

    #[test]
    fn test_to_kebab_case_special_characters() {
        assert_eq!(to_kebab_case("Hello: World!"), "hello-world");
        assert_eq!(to_kebab_case("File<Name>Test"), "filenametest");
        assert_eq!(to_kebab_case("Path/To/File"), "pathtofile");
        assert_eq!(to_kebab_case("Question?"), "question");
        assert_eq!(to_kebab_case("Star*Test"), "startest");
    }

    #[test]
    fn test_to_kebab_case_multiple_spaces_and_hyphens() {
        assert_eq!(to_kebab_case("Hello   World"), "hello-world");
        assert_eq!(to_kebab_case("Hello---World"), "hello-world");
        assert_eq!(to_kebab_case("Hello - - - World"), "hello-world");
        assert_eq!(
            to_kebab_case("  Leading and Trailing  "),
            "leading-and-trailing"
        );
    }

    #[test]
    fn test_to_kebab_case_underscores() {
        assert_eq!(to_kebab_case("snake_case_name"), "snake-case-name");
        assert_eq!(to_kebab_case("mixed_Case Name"), "mixed-case-name");
    }

    #[test]
    fn test_to_kebab_case_empty_and_whitespace() {
        assert_eq!(to_kebab_case(""), "unnamed");
        assert_eq!(to_kebab_case("   "), "unnamed");
        assert_eq!(to_kebab_case("---"), "unnamed");
        assert_eq!(to_kebab_case("!@#$%"), "unnamed");
    }

    #[test]
    fn test_to_kebab_case_numbers() {
        assert_eq!(to_kebab_case("Project 2024"), "project-2024");
        assert_eq!(to_kebab_case("123 Test"), "123-test");
        assert_eq!(to_kebab_case("v1.0.0"), "v100");
    }

    #[test]
    fn test_to_kebab_case_mixed_unicode() {
        // Non-Latin characters are preserved (they pass is_alphanumeric)
        assert_eq!(to_kebab_case("日本語 Test"), "日本語-test");
        // Pure non-Latin should still work
        assert_eq!(to_kebab_case("日本語"), "日本語");
    }
}
