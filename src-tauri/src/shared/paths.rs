use std::path::PathBuf;

/// Get the base storage directory following XDG Base Directory Specification.
/// Returns `$XDG_DATA_HOME/jubby` or `~/.local/share/jubby`.
pub fn get_storage_dir() -> PathBuf {
    if let Ok(xdg_data) = std::env::var("XDG_DATA_HOME") {
        return PathBuf::from(xdg_data).join("jubby");
    }

    let home = std::env::var("HOME").expect("HOME environment variable must be set");
    PathBuf::from(home)
        .join(".local")
        .join("share")
        .join("jubby")
}

/// Get the logs directory path.
/// Returns `{storage_dir}/logs`.
pub fn get_log_dir() -> PathBuf {
    get_storage_dir().join("logs")
}

/// Get a plugin-specific storage directory.
/// Returns `{storage_dir}/{plugin_name}`.
pub fn get_plugin_dir(plugin_name: &str) -> PathBuf {
    get_storage_dir().join(plugin_name)
}

/// Ensure a directory exists, creating it if necessary.
/// Returns the path if successful.
pub fn ensure_dir(path: &PathBuf) -> std::io::Result<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_storage_dir_structure() {
        let storage = get_storage_dir();
        assert!(storage.ends_with("jubby"));

        let logs = get_log_dir();
        assert!(logs.ends_with("logs"));

        let plugin = get_plugin_dir("tasks");
        assert!(plugin.ends_with("tasks"));
    }
}
