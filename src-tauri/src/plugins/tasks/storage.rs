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
// UUID-to-Kebab Migration
// ============================================================================

/// Migrates folder data files from UUID-based names to kebab-case names.
///
/// This migration is idempotent - safe to run multiple times:
/// - Skips folders that already have a non-empty `filename` field
/// - Only renames files that still use UUID naming
/// - Handles errors gracefully without aborting the entire migration
///
/// The migration:
/// 1. Loads the folders index
/// 2. For each folder with empty `filename`, checks if a UUID-named file exists
/// 3. Generates a unique kebab-case filename from the folder name
/// 4. Renames the file and updates the folder's `filename` field
/// 5. Saves the updated folders index
fn migrate_uuid_filenames_to_kebab() -> Result<(), Box<dyn std::error::Error>> {
    let mut index = load_folders_index()?;

    // Collect existing filenames to avoid collisions
    let mut existing_filenames: Vec<String> = index
        .folders
        .iter()
        .filter(|f| !f.filename.is_empty())
        .map(|f| f.filename.clone())
        .collect();

    // Find folders that need migration (empty filename field)
    let folders_to_migrate: Vec<(usize, String, String)> = index
        .folders
        .iter()
        .enumerate()
        .filter(|(_, folder)| folder.filename.is_empty())
        .map(|(idx, folder)| (idx, folder.id.clone(), folder.name.clone()))
        .collect();

    if folders_to_migrate.is_empty() {
        tracing::debug!(
            target: "tasks::migration",
            "No folders need UUID-to-kebab filename migration"
        );
        return Ok(());
    }

    tracing::info!(
        target: "tasks::migration",
        "Starting UUID-to-kebab filename migration for {} folders",
        folders_to_migrate.len()
    );

    let tasks_dir = get_tasks_dir();
    let mut migrated_count = 0;
    let mut skipped_count = 0;
    let mut error_count = 0;

    for (idx, folder_id, folder_name) in folders_to_migrate {
        let old_path = tasks_dir.join(format!("{}.json", folder_id));

        // Check if the UUID-named file exists
        if !old_path.exists() {
            tracing::debug!(
                target: "tasks::migration",
                folder_id = %folder_id,
                folder_name = %folder_name,
                "UUID file does not exist, skipping (may already be migrated or new folder)"
            );
            skipped_count += 1;
            continue;
        }

        // Generate unique kebab-case filename
        let new_filename = generate_unique_filename(&folder_name, &existing_filenames);
        let new_path = tasks_dir.join(format!("{}.json", new_filename));

        tracing::info!(
            target: "tasks::migration",
            folder_id = %folder_id,
            folder_name = %folder_name,
            old_file = %old_path.display(),
            new_file = %new_path.display(),
            "Migrating folder file from UUID to kebab-case"
        );

        // Rename the file
        match std::fs::rename(&old_path, &new_path) {
            Ok(_) => {
                // Update the folder's filename in the index
                index.folders[idx].filename = new_filename.clone();
                existing_filenames.push(new_filename.clone());
                record_internal_write(&new_path);
                migrated_count += 1;

                tracing::info!(
                    target: "tasks::migration",
                    folder_id = %folder_id,
                    new_filename = %new_filename,
                    "Successfully migrated folder file"
                );
            }
            Err(e) => {
                tracing::error!(
                    target: "tasks::migration",
                    folder_id = %folder_id,
                    error = %e,
                    "Failed to rename folder file, keeping UUID-based name"
                );
                error_count += 1;
                // Don't fail the entire migration - the folder will still work with UUID name
            }
        }
    }

    // Save the updated index if any folders were migrated
    if migrated_count > 0 {
        save_folders_index(&index)?;
        tracing::info!(
            target: "tasks::migration",
            migrated = migrated_count,
            skipped = skipped_count,
            errors = error_count,
            "UUID-to-kebab filename migration completed"
        );
    } else if error_count > 0 {
        tracing::warn!(
            target: "tasks::migration",
            skipped = skipped_count,
            errors = error_count,
            "UUID-to-kebab filename migration completed with errors"
        );
    }

    Ok(())
}

// ============================================================================
// Per-Folder to Per-Task Migration
// ============================================================================

/// Checks if the storage uses the old per-folder format (single JSON per folder)
/// vs the new per-task format (directory per folder with individual task files).
fn is_using_per_folder_format() -> bool {
    let tasks_dir = get_tasks_dir();
    let index = match load_folders_index() {
        Ok(idx) => idx,
        Err(_) => return false,
    };

    // Check if any folder has a .json file instead of a directory
    for folder in &index.folders {
        let folder_filename = get_folder_filename(folder);
        let legacy_file = tasks_dir.join(format!("{}.json", folder_filename));
        let folder_dir = tasks_dir.join(&folder_filename);

        // If the legacy file exists and it's not a directory, we're in old format
        if legacy_file.exists() && legacy_file.is_file() && !folder_dir.exists() {
            return true;
        }
    }

    false
}

/// Migrates from per-folder JSON files to per-task JSON files.
///
/// Old format:
/// ```
/// ~/.local/share/jubby/tasks/
/// ├── folders.json
/// ├── my-folder.json      (contains all tasks and tags)
/// └── work.json
/// ```
///
/// New format:
/// ```
/// ~/.local/share/jubby/tasks/
/// ├── folders.json        (now includes tags)
/// ├── my-folder/
/// │   ├── task-one.json
/// │   └── task-two.json
/// └── work/
///     └── fix-bug.json
/// ```
fn migrate_per_folder_to_per_task() -> Result<(), Box<dyn std::error::Error>> {
    if !is_using_per_folder_format() {
        tracing::debug!(
            target: "tasks::migration",
            "No per-folder to per-task migration needed"
        );
        return Ok(());
    }

    tracing::info!(
        target: "tasks::migration",
        "Starting per-folder to per-task migration"
    );

    let tasks_dir = get_tasks_dir();
    let mut index = load_folders_index()?;
    let mut all_tags: Vec<Tag> = Vec::new();
    let mut migrated_folders = 0;
    let mut migrated_tasks = 0;

    for folder in &index.folders {
        let folder_filename = get_folder_filename(folder);
        let legacy_file = tasks_dir.join(format!("{}.json", folder_filename));

        if !legacy_file.exists() || !legacy_file.is_file() {
            continue;
        }

        tracing::info!(
            target: "tasks::migration",
            folder_id = %folder.id,
            folder_name = %folder.name,
            "Migrating folder to per-task format"
        );

        // Load the legacy folder data
        let folder_data = match load_legacy_folder_data(&folder_filename, &folder.id) {
            Ok(data) => data,
            Err(e) => {
                tracing::error!(
                    target: "tasks::migration",
                    folder_id = %folder.id,
                    error = %e,
                    "Failed to load legacy folder data, skipping"
                );
                continue;
            }
        };

        // Create folder directory
        let folder_dir = get_folder_dir(&folder_filename);
        if let Err(e) = ensure_dir(&folder_dir) {
            tracing::error!(
                target: "tasks::migration",
                folder_id = %folder.id,
                error = %e,
                "Failed to create folder directory, skipping"
            );
            continue;
        }

        // Generate unique filenames for tasks and save each one
        let mut existing_filenames: Vec<String> = Vec::new();

        for task in &folder_data.tasks {
            let task_filename = generate_unique_task_filename(&task.text, &existing_filenames);
            existing_filenames.push(task_filename.clone());

            let mut task_to_save = task.clone();
            task_to_save.filename = task_filename;

            if let Err(e) = save_task(&folder_filename, &task_to_save) {
                tracing::error!(
                    target: "tasks::migration",
                    task_id = %task.id,
                    error = %e,
                    "Failed to save task file"
                );
            } else {
                migrated_tasks += 1;
            }
        }

        // Collect tags for this folder
        all_tags.extend(folder_data.tags);

        // Delete the legacy file
        if let Err(e) = std::fs::remove_file(&legacy_file) {
            tracing::warn!(
                target: "tasks::migration",
                path = %legacy_file.display(),
                error = %e,
                "Failed to delete legacy folder file"
            );
        } else {
            tracing::info!(
                target: "tasks::migration",
                path = %legacy_file.display(),
                "Deleted legacy folder file"
            );
        }

        migrated_folders += 1;
    }

    // Update folders index with tags
    index.tags = all_tags;
    save_folders_index(&index)?;

    tracing::info!(
        target: "tasks::migration",
        migrated_folders = migrated_folders,
        migrated_tasks = migrated_tasks,
        "Per-folder to per-task migration completed"
    );

    Ok(())
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

/// Gets the path for a folder's data file (legacy per-folder storage).
/// Used during migration from old format.
fn get_legacy_folder_data_path(filename: &str) -> PathBuf {
    get_tasks_dir().join(format!("{}.json", filename))
}

/// Gets the directory path for a folder's tasks.
/// Each folder has its own directory containing individual task JSON files.
pub fn get_folder_dir(folder_filename: &str) -> PathBuf {
    get_tasks_dir().join(folder_filename)
}

/// Gets the full path for a task's JSON file.
pub fn get_task_file_path(folder_filename: &str, task_filename: &str) -> PathBuf {
    get_folder_dir(folder_filename).join(format!("{}.json", task_filename))
}

/// Gets the effective filename for a task.
/// Returns the filename field if set, otherwise falls back to the task id.
pub fn get_task_filename(task: &Task) -> String {
    if task.filename.is_empty() {
        task.id.clone()
    } else {
        task.filename.clone()
    }
}

/// Generates a unique kebab-case filename for a task within a folder.
/// If the base name already exists, appends a numeric suffix (-1, -2, etc.).
pub fn generate_unique_task_filename(text: &str, existing_filenames: &[String]) -> String {
    let base = to_kebab_case(text);

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
        // Run migrations for existing installations
        migrate_uuid_filenames_to_kebab()?;
        migrate_per_folder_to_per_task()?;
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

    for folder in &index.folders {
        let folder_filename = get_folder_filename(folder);
        let folder_tasks = load_folder_tasks(&folder_filename, &folder.id)?;
        tasks.extend(folder_tasks);
    }

    // Tags are now stored in the folders index
    // folder_id is already set on tags in the index
    let tags = index.tags.clone();

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
    // Save folders index with tags
    let index = FoldersIndex {
        folders: data.folders.clone(),
        tags: data.tags.clone(),
    };
    save_folders_index(&index)?;

    // Save each task to its own file
    for folder in &data.folders {
        let folder_filename = get_folder_filename(folder);
        let folder_tasks: Vec<&Task> = data
            .tasks
            .iter()
            .filter(|task| task.folder_id == folder.id)
            .collect();

        // Ensure folder directory exists
        let folder_dir = get_folder_dir(&folder_filename);
        ensure_dir(&folder_dir)?;

        // Get existing filenames to generate unique names for tasks without filename
        let mut existing_filenames = get_existing_task_filenames(&folder_filename);

        for task in folder_tasks {
            let mut task_to_save = task.clone();

            // Generate filename if not set
            if task_to_save.filename.is_empty() {
                task_to_save.filename =
                    generate_unique_task_filename(&task.text, &existing_filenames);
                existing_filenames.push(task_to_save.filename.clone());
            }

            save_task(&folder_filename, &task_to_save)?;
        }
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

/// Loads all tasks for a folder from its directory.
///
/// Each task is stored as a separate JSON file in the folder's directory.
/// The folder_id is set on each task from the parameter.
///
/// # Arguments
/// * `folder_filename` - The kebab-case folder name (directory name)
/// * `folder_id` - The folder's UUID, used to set folder_id on tasks
pub fn load_folder_tasks(
    folder_filename: &str,
    folder_id: &str,
) -> Result<Vec<Task>, Box<dyn std::error::Error>> {
    let folder_dir = get_folder_dir(folder_filename);

    if !folder_dir.exists() {
        return Ok(Vec::new());
    }

    let mut tasks = Vec::new();

    for entry in std::fs::read_dir(&folder_dir)? {
        let entry = entry?;
        let path = entry.path();

        // Only process .json files
        if path.extension().map_or(true, |ext| ext != "json") {
            continue;
        }

        // Extract filename without extension
        let task_filename = match path.file_stem().and_then(|s| s.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };

        match load_single_task(&path, folder_id, &task_filename) {
            Ok(task) => tasks.push(task),
            Err(e) => {
                tracing::warn!(
                    target: "tasks::storage",
                    path = %path.display(),
                    error = %e,
                    "Failed to load task file, skipping"
                );
            }
        }
    }

    // Sort by created_at descending (newest first)
    tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(tasks)
}

/// Loads a single task from a JSON file.
fn load_single_task(
    path: &PathBuf,
    folder_id: &str,
    task_filename: &str,
) -> Result<Task, Box<dyn std::error::Error>> {
    let content = std::fs::read_to_string(path)?;
    let mut task: Task = serde_json::from_str(&content)?;
    task.folder_id = folder_id.to_string();
    task.filename = task_filename.to_string();
    Ok(task)
}

/// Loads folder data from disk (legacy format - per-folder JSON file).
/// Used during migration from old storage format.
///
/// # Arguments
/// * `filename` - The kebab-case filename (without .json extension)
/// * `folder_id` - The folder's UUID, used to set folder_id on tasks/tags
fn load_legacy_folder_data(
    filename: &str,
    folder_id: &str,
) -> Result<FolderData, Box<dyn std::error::Error>> {
    let path = get_legacy_folder_data_path(filename);
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

/// Saves a single task to its JSON file.
///
/// Creates the folder directory if it doesn't exist.
/// The task's folder_id and filename are not serialized to the file.
///
/// # Arguments
/// * `folder_filename` - The kebab-case folder name (directory name)
/// * `task` - The task to save
pub fn save_task(folder_filename: &str, task: &Task) -> Result<(), Box<dyn std::error::Error>> {
    let folder_dir = get_folder_dir(folder_filename);
    ensure_dir(&folder_dir)?;

    let task_filename = get_task_filename(task);
    let path = get_task_file_path(folder_filename, &task_filename);

    // Create a copy without folder_id and filename for serialization
    let task_for_save = Task {
        id: task.id.clone(),
        folder_id: String::new(),
        filename: String::new(),
        text: task.text.clone(),
        status: task.status.clone(),
        created_at: task.created_at,
        description: task.description.clone(),
        working_directory: task.working_directory.clone(),
        tag_ids: task.tag_ids.clone(),
        subtasks: task.subtasks.clone(),
    };

    let content = serde_json::to_string_pretty(&task_for_save)?;
    std::fs::write(&path, &content)?;
    record_internal_write(&path);

    tracing::trace!(
        target: "tasks::storage",
        task_id = %task.id,
        path = %path.display(),
        "Task saved"
    );

    Ok(())
}

/// Deletes a task's JSON file.
///
/// # Arguments
/// * `folder_filename` - The kebab-case folder name (directory name)
/// * `task_filename` - The kebab-case task filename (without .json extension)
pub fn delete_task_file(
    folder_filename: &str,
    task_filename: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let path = get_task_file_path(folder_filename, task_filename);
    if path.exists() {
        std::fs::remove_file(&path)?;
        tracing::trace!(
            target: "tasks::storage",
            path = %path.display(),
            "Task file deleted"
        );
    }
    Ok(())
}

/// Renames a task's JSON file when the task text changes.
///
/// # Arguments
/// * `folder_filename` - The kebab-case folder name (directory name)
/// * `old_task_filename` - The current filename (without .json extension)
/// * `new_task_filename` - The new filename (without .json extension)
pub fn rename_task_file(
    folder_filename: &str,
    old_task_filename: &str,
    new_task_filename: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    if old_task_filename == new_task_filename {
        return Ok(());
    }

    let old_path = get_task_file_path(folder_filename, old_task_filename);
    let new_path = get_task_file_path(folder_filename, new_task_filename);

    if old_path.exists() {
        std::fs::rename(&old_path, &new_path)?;
        record_internal_write(&new_path);
        tracing::trace!(
            target: "tasks::storage",
            old_path = %old_path.display(),
            new_path = %new_path.display(),
            "Task file renamed"
        );
    }

    Ok(())
}

/// Gets all existing task filenames in a folder.
pub fn get_existing_task_filenames(folder_filename: &str) -> Vec<String> {
    let folder_dir = get_folder_dir(folder_filename);

    if !folder_dir.exists() {
        return Vec::new();
    }

    std::fs::read_dir(&folder_dir)
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .filter_map(|entry| {
                    let path = entry.path();
                    if path.extension().map_or(true, |ext| ext != "json") {
                        return None;
                    }
                    path.file_stem()
                        .and_then(|s| s.to_str())
                        .map(|s| s.to_string())
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Deletes the folder directory and all its task files from disk.
///
/// # Arguments
/// * `folder_filename` - The kebab-case folder name (directory name)
pub fn delete_folder_dir(folder_filename: &str) -> Result<(), Box<dyn std::error::Error>> {
    let folder_dir = get_folder_dir(folder_filename);
    if folder_dir.exists() {
        std::fs::remove_dir_all(&folder_dir)?;
        tracing::trace!(
            target: "tasks::storage",
            path = %folder_dir.display(),
            "Folder directory deleted"
        );
    }
    Ok(())
}

/// Renames a folder directory on disk.
///
/// # Arguments
/// * `old_filename` - The current kebab-case folder name (directory name)
/// * `new_filename` - The new kebab-case folder name (directory name)
pub fn rename_folder_dir(
    old_filename: &str,
    new_filename: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    if old_filename == new_filename {
        return Ok(());
    }

    let old_dir = get_folder_dir(old_filename);
    let new_dir = get_folder_dir(new_filename);

    if old_dir.exists() {
        std::fs::rename(&old_dir, &new_dir)?;
        tracing::trace!(
            target: "tasks::storage",
            old_path = %old_dir.display(),
            new_path = %new_dir.display(),
            "Folder directory renamed"
        );
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
                filename: String::new(), // Will be generated during save_to_storage
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

    #[test]
    fn test_generate_unique_filename_no_collision() {
        let existing = vec!["other-folder".to_string(), "another-one".to_string()];
        assert_eq!(
            generate_unique_filename("My Folder", &existing),
            "my-folder"
        );
    }

    #[test]
    fn test_generate_unique_filename_with_collision() {
        let existing = vec!["my-folder".to_string(), "other-folder".to_string()];
        assert_eq!(
            generate_unique_filename("My Folder", &existing),
            "my-folder-1"
        );
    }

    #[test]
    fn test_generate_unique_filename_multiple_collisions() {
        let existing = vec![
            "my-folder".to_string(),
            "my-folder-1".to_string(),
            "my-folder-2".to_string(),
        ];
        assert_eq!(
            generate_unique_filename("My Folder", &existing),
            "my-folder-3"
        );
    }

    #[test]
    fn test_generate_unique_filename_collision_with_gap() {
        // If my-folder-1 doesn't exist but my-folder does, should use -1
        let existing = vec![
            "my-folder".to_string(),
            "my-folder-2".to_string(),
            "my-folder-3".to_string(),
        ];
        assert_eq!(
            generate_unique_filename("My Folder", &existing),
            "my-folder-1"
        );
    }

    #[test]
    fn test_generate_unique_filename_unnamed_collision() {
        let existing = vec!["unnamed".to_string()];
        assert_eq!(generate_unique_filename("", &existing), "unnamed-1");
    }

    #[test]
    fn test_generate_unique_filename_accent_collision() {
        // "Tarefas Básicas" normalizes to "tarefas-basicas"
        let existing = vec!["tarefas-basicas".to_string()];
        assert_eq!(
            generate_unique_filename("Tarefas Básicas", &existing),
            "tarefas-basicas-1"
        );
    }

    #[test]
    fn test_generate_unique_filename_same_kebab_different_original() {
        // Different folder names that normalize to the same kebab-case
        let existing = vec!["hello-world".to_string()];
        assert_eq!(
            generate_unique_filename("Hello World", &existing),
            "hello-world-1"
        );
        assert_eq!(
            generate_unique_filename("Hello   World", &existing),
            "hello-world-1"
        );
        assert_eq!(
            generate_unique_filename("hello_world", &existing),
            "hello-world-1"
        );
    }
}
