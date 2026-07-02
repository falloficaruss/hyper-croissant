use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug, Serialize, Deserialize)]
pub enum HyperCroissantError {
    #[error("Engine not found: {0}")]
    EngineNotFound(String),
    #[error("Engine already running")]
    EngineAlreadyRunning,
    #[error("Engine not running")]
    EngineNotRunning,
    #[error("UCI protocol error: {0}")]
    UciError(String),
    #[error("Invalid FEN: {0}")]
    InvalidFen(String),
    #[error("Invalid move: {0}")]
    InvalidMove(String),
    #[error("Invalid PGN: {0}")]
    InvalidPgn(String),
    #[error("IO error: {0}")]
    IoError(String),
    #[error("Channel closed")]
    ChannelClosed,
    #[error("Analysis error: {0}")]
    AnalysisError(String),
}

impl From<std::io::Error> for HyperCroissantError {
    fn from(e: std::io::Error) -> Self {
        HyperCroissantError::IoError(e.to_string())
    }
}
