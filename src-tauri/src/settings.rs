use serde::{Deserialize, Serialize};

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub global_shortcut: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            global_shortcut: "F9".to_string(),
        }
    }
}
