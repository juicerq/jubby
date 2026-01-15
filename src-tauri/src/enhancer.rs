use std::process::Command;

const ENHANCE_INSTRUCTION: &str = r#"You are a prompt enhancement assistant. Your task is to take messy, poorly structured prompts and transform them into clear, well-organized prompts that will get better results from AI assistants.

Rules:
1. Preserve the original intent and all important details
2. Add clear structure with sections if needed
3. Clarify ambiguous requirements
4. Remove redundancy
5. Use professional, clear language
6. Output ONLY the improved prompt, no explanations

Transform the following prompt:"#;

/// Execute Claude CLI to enhance a prompt
#[tauri::command]
pub fn enhance_prompt(text: String) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Text cannot be empty".to_string());
    }

    // Use shell-words to properly escape the text for shell
    let escaped_text = shell_escape(&text);

    let output = Command::new("sh")
        .arg("-c")
        .arg(format!(
            "echo {} | claude -p '{}'",
            escaped_text, ENHANCE_INSTRUCTION
        ))
        .output()
        .map_err(|e| format!("Failed to execute Claude CLI: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Claude CLI failed: {}",
            if stderr.is_empty() {
                "Unknown error"
            } else {
                stderr.trim()
            }
        ));
    }

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if result.is_empty() {
        return Err("Claude CLI returned empty response".to_string());
    }

    Ok(result)
}

/// Escape a string for safe use in shell commands
fn shell_escape(s: &str) -> String {
    // Use single quotes and escape any single quotes within
    // Single quotes prevent all shell interpretation except for single quotes themselves
    let escaped = s.replace('\'', "'\\''");
    format!("'{}'", escaped)
}
