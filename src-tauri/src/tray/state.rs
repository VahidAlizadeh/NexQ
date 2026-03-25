use serde::{Deserialize, Serialize};

/// Tray icon visual state. Frontend picks the highest-priority state
/// and sends it via IPC. Rust applies it without duplicate priority logic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrayState {
    Idle,
    Recording,
    Muted,
    Stealth,
    AiProcessing,
    Indexing,
}

impl Default for TrayState {
    fn default() -> Self {
        Self::Idle
    }
}
