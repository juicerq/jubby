use thiserror::Error;

/// Common storage-related errors used across plugins.
#[derive(Error, Debug)]
pub enum StorageError {
    #[error("Failed to read file: {0}")]
    ReadError(#[from] std::io::Error),

    #[error("Failed to parse data: {0}")]
    ParseError(#[from] serde_json::Error),

    #[error("Failed to create directory: {0}")]
    DirectoryError(String),

    #[error("Data not found: {0}")]
    NotFound(String),
}

impl StorageError {
    pub fn directory(msg: impl Into<String>) -> Self {
        StorageError::DirectoryError(msg.into())
    }

    pub fn not_found(msg: impl Into<String>) -> Self {
        StorageError::NotFound(msg.into())
    }
}
