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

/// Double-click: context-aware smart action.
/// Idle → emit start meeting + show overlay.
/// Meeting → bring overlay to front.
pub fn handle_double_click(app: &AppHandle) {
    let state = app.state::<AppState>();
    let tray_mgr = state.tray_manager.clone();

    let meeting_active = {
        let mgr = tray_mgr.lock().unwrap();
        mgr.as_ref().map_or(false, |m| m.meeting_active)
    };

    if meeting_active {
        // Bring overlay to front
        if let Some(overlay) = app.get_webview_window("overlay") {
            let _ = overlay.show();
            let _ = overlay.set_focus();
        }
    } else {
        // Start meeting
        let _ = app.emit("tray_start_meeting", ());
        if let Some(overlay) = app.get_webview_window("overlay") {
            let _ = overlay.show();
            let _ = overlay.set_focus();
        }
        if let Some(launcher) = app.get_webview_window("launcher") {
            let _ = launcher.hide();
        }
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
        // Else: no-op silently
    }
}
