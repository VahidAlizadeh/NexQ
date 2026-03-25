pub mod state;
pub mod icons;
pub mod tooltip;
pub mod menu;
pub mod click;

pub use state::TrayState;
pub use icons::IconSet;

use std::time::Instant;
use tokio::task::JoinHandle;

/// Manages tray icon state, icon swaps, tooltip updates, and animation timers.
/// Accessed through AppState via Arc<Mutex<TrayManager>>.
pub struct TrayManager {
    pub current_state: TrayState,
    pub icon_set: IconSet,
    pub meeting_start_time: Option<Instant>,
    pub is_muted: bool,
    pub meeting_active: bool,
    pub custom_tooltip: Option<String>,
    /// Handle for the recording pulse animation timer
    pub pulse_timer: Option<JoinHandle<()>>,
    /// Handle for the tooltip elapsed-time updater
    pub tooltip_timer: Option<JoinHandle<()>>,
}

impl TrayManager {
    pub fn new(icon_set: IconSet) -> Self {
        Self {
            current_state: TrayState::Idle,
            icon_set,
            meeting_start_time: None,
            is_muted: false,
            meeting_active: false,
            custom_tooltip: None,
            pulse_timer: None,
            tooltip_timer: None,
        }
    }

    /// Cancel all active timers. Called on shutdown or state transitions.
    pub fn cancel_timers(&mut self) {
        if let Some(h) = self.pulse_timer.take() { h.abort(); }
        if let Some(h) = self.tooltip_timer.take() { h.abort(); }
    }
}
