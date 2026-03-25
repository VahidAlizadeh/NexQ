use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

/// Single click: toggle launcher window visibility.
pub fn handle_single_click(app: &AppHandle) {
    if let Some(launcher) = app.get_webview_window("launcher") {
        if launcher.is_visible().unwrap_or(false) {
            let _ = launcher.hide();
        } else {
            let _ = launcher.show();
            let _ = launcher.set_focus();
        }
    }
}

/// Double-click: show and focus launcher (same as single-click but always shows).
/// On Windows, Click fires before DoubleClick, so single-click already toggled.
/// We just ensure the launcher is visible and focused.
pub fn handle_double_click(app: &AppHandle) {
    if let Some(launcher) = app.get_webview_window("launcher") {
        let _ = launcher.show();
        let _ = launcher.set_focus();
    }
}

/// Middle-click: toggle mic mute during meeting. No-op when idle.
pub fn handle_middle_click(app: &AppHandle) {
    let state = app.state::<AppState>();
    let tray_mgr = state.tray_manager.clone();

    let mgr = tray_mgr.lock().unwrap();
    if let Some(ref manager) = *mgr {
        if manager.meeting_active {
            let _ = app.emit("tray_toggle_mic", ());
        }
    }
}
