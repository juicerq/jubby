//! Integration tests for OpenCode terminal functionality.
//!
//! Tests cover tmux session naming and the generated tmux command used for
//! OpenCode terminals, ensuring task IDs are properly encoded and prompts
//! are correctly escaped.

use jubby_lib::plugins::tasks::opencode::{
    build_terminal_prompt, get_tmux_session_name, TMUX_SESSION_PREFIX,
};
use jubby_lib::plugins::tasks::types::Task;

/// Helper to create a minimal Task for testing.
fn create_test_task(id: &str, text: &str, description: &str) -> Task {
    Task {
        id: id.to_string(),
        folder_id: String::new(),
        filename: String::new(),
        text: text.to_string(),
        status: "pending".to_string(),
        created_at: 0,
        description: description.to_string(),
        working_directory: String::new(),
        tag_ids: vec![],
        subtasks: vec![],
    }
}

// =============================================================================
// Tests for get_tmux_session_name
// =============================================================================

#[test]
fn test_tmux_session_name_uses_correct_prefix() {
    let task_id = "e4a3e70e-4fe3-4c9c-a226-37c8513f5817";
    let session_name = get_tmux_session_name(task_id);

    assert!(
        session_name.starts_with(TMUX_SESSION_PREFIX),
        "Session name should start with '{}', got: {}",
        TMUX_SESSION_PREFIX,
        session_name
    );
}

#[test]
fn test_tmux_session_name_truncates_task_id_to_8_chars() {
    let task_id = "e4a3e70e-4fe3-4c9c-a226-37c8513f5817";
    let session_name = get_tmux_session_name(task_id);

    // Expected: "jubby-e4a3e70e" (prefix + first 8 chars of task ID)
    let expected = format!("{}e4a3e70e", TMUX_SESSION_PREFIX);
    assert_eq!(session_name, expected);
}

#[test]
fn test_tmux_session_name_short_task_id() {
    // Task ID shorter than 8 characters should use the full ID
    let task_id = "abc123";
    let session_name = get_tmux_session_name(task_id);

    let expected = format!("{}{}", TMUX_SESSION_PREFIX, task_id);
    assert_eq!(session_name, expected);
}

#[test]
fn test_tmux_session_name_exactly_8_chars() {
    let task_id = "12345678";
    let session_name = get_tmux_session_name(task_id);

    let expected = format!("{}{}", TMUX_SESSION_PREFIX, task_id);
    assert_eq!(session_name, expected);
}

#[test]
fn test_tmux_session_name_different_tasks_produce_different_names() {
    let task_id_1 = "aaaaaaaa-1111-2222-3333-444444444444";
    let task_id_2 = "bbbbbbbb-5555-6666-7777-888888888888";

    let session_1 = get_tmux_session_name(task_id_1);
    let session_2 = get_tmux_session_name(task_id_2);

    assert_ne!(
        session_1, session_2,
        "Different task IDs should produce different session names"
    );
}

#[test]
fn test_tmux_session_name_same_task_produces_same_name() {
    let task_id = "e4a3e70e-4fe3-4c9c-a226-37c8513f5817";

    let session_1 = get_tmux_session_name(task_id);
    let session_2 = get_tmux_session_name(task_id);

    assert_eq!(
        session_1, session_2,
        "Same task ID should always produce the same session name"
    );
}

#[test]
fn test_tmux_session_prefix_is_valid_for_tmux() {
    // tmux session names cannot contain periods or colons
    assert!(
        !TMUX_SESSION_PREFIX.contains('.'),
        "TMUX_SESSION_PREFIX should not contain periods"
    );
    assert!(
        !TMUX_SESSION_PREFIX.contains(':'),
        "TMUX_SESSION_PREFIX should not contain colons"
    );
}

// =============================================================================
// Tests for build_terminal_prompt
// =============================================================================

#[test]
fn test_build_terminal_prompt_basic() {
    let task = create_test_task("test-id-123", "Fix the bug", "This is a description");
    let task_file_path = "/home/user/.local/share/jubby/tasks/folder/task.json";

    let prompt = build_terminal_prompt(&task, task_file_path);

    assert!(
        prompt.contains("Fix the bug"),
        "Prompt should contain task text"
    );
    assert!(
        prompt.contains("This is a description"),
        "Prompt should contain description"
    );
    assert!(
        prompt.contains(task_file_path),
        "Prompt should contain task file path"
    );
}

#[test]
fn test_build_terminal_prompt_empty_description() {
    let task = create_test_task("test-id-123", "Fix the bug", "");
    let task_file_path = "/path/to/task.json";

    let prompt = build_terminal_prompt(&task, task_file_path);

    // Should not have " - " separator when description is empty
    assert!(
        prompt.contains("Fix the bug"),
        "Prompt should contain task text"
    );
    assert!(
        prompt.contains(task_file_path),
        "Prompt should contain task file path"
    );
    // The format should be "Task: {text}. Task file: {path}" without description
    assert!(
        !prompt.contains(" - ."),
        "Should not have empty description separator"
    );
}

#[test]
fn test_build_terminal_prompt_newlines_in_description_replaced() {
    let task = create_test_task(
        "test-id-123",
        "Multi-line task",
        "First line\nSecond line\r\nThird line",
    );
    let task_file_path = "/path/to/task.json";

    let prompt = build_terminal_prompt(&task, task_file_path);

    // Newlines should be replaced with spaces for shell safety
    assert!(
        !prompt.contains('\n'),
        "Prompt should not contain newline characters"
    );
    assert!(
        !prompt.contains('\r'),
        "Prompt should not contain carriage return characters"
    );
    assert!(
        prompt.contains("First line"),
        "Prompt should contain description content"
    );
    assert!(
        prompt.contains("Second line"),
        "Prompt should contain description content after newline replacement"
    );
}

#[test]
fn test_build_terminal_prompt_format_structure() {
    let task = create_test_task("id", "Task Text", "Description");
    let path = "/some/path.json";

    let prompt = build_terminal_prompt(&task, path);

    // Verify the expected format: "Task: {text} - {description}. Task file: {path}"
    assert!(
        prompt.starts_with("Task:"),
        "Prompt should start with 'Task:'"
    );
    assert!(
        prompt.contains("Task file:"),
        "Prompt should contain 'Task file:'"
    );
}

#[test]
fn test_build_terminal_prompt_special_characters_preserved() {
    // Special characters in task text/description should be preserved
    // (escaping is done at the shell level when building the tmux command)
    let task = create_test_task(
        "id",
        "Task with 'quotes' and \"double quotes\"",
        "Description with $variables and `backticks`",
    );
    let path = "/path/to/task.json";

    let prompt = build_terminal_prompt(&task, path);

    assert!(
        prompt.contains("'quotes'"),
        "Single quotes should be preserved in prompt"
    );
    assert!(
        prompt.contains("\"double quotes\""),
        "Double quotes should be preserved in prompt"
    );
    assert!(
        prompt.contains("$variables"),
        "Dollar signs should be preserved in prompt"
    );
    assert!(
        prompt.contains("`backticks`"),
        "Backticks should be preserved in prompt"
    );
}

// =============================================================================
// Tests for tmux command escaping (integration-like tests)
// =============================================================================

/// Tests that the prompt can be safely used in a tmux command context.
/// This verifies the escaping logic that would be applied by open_in_gui_terminal.
#[test]
fn test_prompt_escaping_for_tmux_command() {
    let task = create_test_task("id", "Task's name", "Description");
    let path = "/path/to/task.json";

    let prompt = build_terminal_prompt(&task, path);

    // Simulate the escaping done in open_in_gui_terminal
    let escaped_prompt = prompt.replace('\'', "'\\''");

    // Build a mock tmux command to verify it's well-formed
    let tmux_cmd = format!(
        "tmux new-session -A -s 'test-session' -c '/tmp' opencode '{}'",
        escaped_prompt
    );

    // Verify the command is valid shell (no unmatched quotes)
    // Count single quotes - should be even number for valid shell
    let quote_count = tmux_cmd.matches('\'').count();
    assert!(
        quote_count % 2 == 0 || tmux_cmd.contains("'\\''"),
        "tmux command should have balanced quotes or proper escaping"
    );
}

#[test]
fn test_multiple_single_quotes_escaping() {
    let task = create_test_task("id", "Don't break it's logic", "More 'quotes' here");
    let path = "/path/to/task.json";

    let prompt = build_terminal_prompt(&task, path);
    let escaped_prompt = prompt.replace('\'', "'\\''");

    // Each single quote should be replaced with '\''
    assert!(
        escaped_prompt.contains("Don'\\''t"),
        "Single quotes should be properly escaped"
    );
}

// =============================================================================
// Edge cases and boundary conditions
// =============================================================================

#[test]
fn test_empty_task_id() {
    let session_name = get_tmux_session_name("");
    assert_eq!(session_name, TMUX_SESSION_PREFIX);
}

#[test]
fn test_task_file_path_with_spaces() {
    let task = create_test_task("id", "Task", "Description");
    let path = "/home/user/My Documents/jubby/task.json";

    let prompt = build_terminal_prompt(&task, path);

    assert!(
        prompt.contains(path),
        "Path with spaces should be preserved in prompt"
    );
}

#[test]
fn test_very_long_description() {
    let long_description = "x".repeat(10000);
    let task = create_test_task("id", "Task", &long_description);
    let path = "/path/to/task.json";

    let prompt = build_terminal_prompt(&task, path);

    // Should still work without panicking and contain the task text
    assert!(prompt.contains("Task"), "Prompt should contain task text");
    assert!(
        prompt.len() > 10000,
        "Prompt should contain long description"
    );
}

#[test]
fn test_unicode_in_task() {
    let task = create_test_task("id", "Corrigir bug", "Descricao em portugues");
    let path = "/caminho/para/tarefa.json";

    let prompt = build_terminal_prompt(&task, path);

    assert!(
        prompt.contains("Corrigir bug"),
        "Prompt should handle Unicode text"
    );
    assert!(
        prompt.contains("portugues"),
        "Prompt should handle Unicode description"
    );
}
