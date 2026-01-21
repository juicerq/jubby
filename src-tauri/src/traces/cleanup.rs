use std::fs;

use chrono::Local;
use tracing::warn;

use crate::shared::paths::get_log_dir;

/// Clean up old trace log files, keeping only today's and yesterday's logs.
/// Runs silently on startup - errors are logged but don't fail the app.
pub fn cleanup_old_traces() {
    let traces_dir = get_log_dir().join("traces");

    if !traces_dir.exists() {
        return;
    }

    let cutoff = Local::now()
        .checked_sub_days(chrono::Days::new(1))
        .map(|d| d.format("%Y-%m-%d").to_string());

    let Some(cutoff_date) = cutoff else {
        return;
    };

    let entries = match fs::read_dir(&traces_dir) {
        Ok(entries) => entries,
        Err(e) => {
            warn!(target: "system", "Failed to read traces directory: {}", e);
            return;
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();

        let Some(filename) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };

        // YYYY-MM-DD format allows lexicographic comparison
        if filename < cutoff_date.as_str() {
            if let Err(e) = fs::remove_file(&path) {
                warn!(target: "system", "Failed to delete old trace file {:?}: {}", path, e);
            }
        }
    }
}
