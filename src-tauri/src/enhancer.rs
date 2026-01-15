use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Duration;
use tokio::time::timeout;

const ENHANCE_INSTRUCTION: &str = r##"Transform the user's messy prompt into a clear, well-structured prompt.

Rules:
- Preserve original intent and details
- Add structure with sections if needed
- Clarify ambiguous requirements
- Remove redundancy
- Use clear, professional language

NEVER ASK QUESTIONS. NEVER request clarification. NEVER ask for more information.
If the prompt is ambiguous, make reasonable assumptions and proceed.
Your job is to IMPROVE the prompt, not interrogate the user.

CRITICAL: Output ONLY the improved prompt text. No introductions, no explanations, no "Here is...", no commentary, no headers, no "Key improvements" section, no questions, no bullet points asking for clarification. Just the raw improved prompt and nothing else."##;

/// Execute Claude CLI to enhance a prompt
#[tauri::command]
pub async fn enhance_prompt(text: String) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Text cannot be empty".to_string());
    }

    const TIMEOUT_SECS: u64 = 120; // 2 minutes

    let task = tauri::async_runtime::spawn_blocking(move || {
        let mut child = Command::new("claude")
            .args(["--model", "haiku", "-p", ENHANCE_INSTRUCTION])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to execute Claude CLI: {}", e))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(text.as_bytes())
                .map_err(|e| format!("Failed to write to Claude CLI stdin: {}", e))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| format!("Failed to execute Claude CLI: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let err_msg = if stderr.is_empty() {
                "Unknown error"
            } else {
                stderr.trim()
            };
            return Err(format!("Claude CLI failed: {}", err_msg));
        }

        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();

        if result.is_empty() {
            return Err("Claude CLI returned empty response".to_string());
        }

        Ok(result)
    });

    let result = timeout(Duration::from_secs(TIMEOUT_SECS), task)
        .await
        .map_err(|_| format!("Claude CLI timeout after {} seconds", TIMEOUT_SECS))?
        .map_err(|e| format!("Task failed: {}", e))?;

    result
}
