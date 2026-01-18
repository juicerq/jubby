use super::super::errors::QuickClipError;
use std::path::PathBuf;
use std::process::{Command, Stdio};

pub fn check_ffmpeg() -> Result<(), QuickClipError> {
    Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|_| QuickClipError::FfmpegNotFound)?;
    Ok(())
}

pub fn generate_thumbnail(
    video_path: &PathBuf,
    thumbnail_path: &PathBuf,
) -> Result<(), QuickClipError> {
    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            &video_path.to_string_lossy(),
            "-ss",
            "00:00:00",
            "-vframes",
            "1",
            "-vf",
            "scale=320:-1",
            &thumbnail_path.to_string_lossy(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| {
            QuickClipError::EncodingError(format!("Thumbnail generation failed: {}", e))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::error!(target: "quickclip", "[ENCODE] Thumbnail failed: {}", stderr);
        return Err(QuickClipError::EncodingError(format!(
            "Thumbnail generation failed: {}",
            stderr
        )));
    }

    Ok(())
}

pub fn cleanup_session_dir(session_dir: &PathBuf) {
    if session_dir.exists() {
        let _ = std::fs::remove_dir_all(session_dir);
    }
}
