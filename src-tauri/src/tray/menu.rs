use serde::Deserialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    AppHandle,
};

/// Lightweight meeting info for the recent meetings menu.
#[derive(Debug, Clone, Deserialize)]
pub struct RecentMeetingInfo {
    pub id: String,
    pub title: String,
    pub start_time: String,
    pub duration: u64,
}

/// Build the idle-state tray menu (flat — no submenus for Windows tray compatibility).
pub fn build_idle_menu(
    app: &AppHandle,
    _recent_meetings: &[RecentMeetingInfo],
) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let start = MenuItem::with_id(app, "start_meeting", "Start Meeting", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let copy_ai = MenuItem::with_id(app, "copy_ai_answer", "Copy Last AI Answer", true, None::<&str>)?;
    let copy_actions = MenuItem::with_id(app, "copy_action_items", "Copy Action Items", true, None::<&str>)?;
    let copy_summary = MenuItem::with_id(app, "copy_summary", "Copy Summary", true, None::<&str>)?;
    let copy_transcript = MenuItem::with_id(app, "copy_transcript", "Copy Transcript", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit NexQ", true, None::<&str>)?;

    Menu::with_items(app, &[
        &start, &sep1,
        &copy_ai, &copy_actions, &copy_summary, &copy_transcript, &sep2,
        &settings, &quit,
    ])
}

/// Build the meeting-active tray menu (flat — no submenus for Windows tray compatibility).
pub fn build_meeting_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let stop = MenuItem::with_id(app, "stop_meeting", "Stop Meeting", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let mute_mic = MenuItem::with_id(app, "toggle_mic", "Mute Microphone", true, None::<&str>)?;
    let mute_sys = MenuItem::with_id(app, "toggle_system", "Mute System Audio", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let stealth = MenuItem::with_id(app, "toggle_stealth", "Stealth Mode", true, None::<&str>)?;
    let show_overlay = MenuItem::with_id(app, "show_overlay", "Show Overlay", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let copy_ai = MenuItem::with_id(app, "copy_ai_answer", "Copy Last AI Answer", true, None::<&str>)?;
    let copy_actions = MenuItem::with_id(app, "copy_action_items", "Copy Action Items", true, None::<&str>)?;
    let copy_summary = MenuItem::with_id(app, "copy_summary", "Copy Summary", true, None::<&str>)?;
    let copy_transcript = MenuItem::with_id(app, "copy_transcript", "Copy Transcript", true, None::<&str>)?;
    let sep4 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit NexQ", true, None::<&str>)?;

    Menu::with_items(app, &[
        &stop, &sep1,
        &mute_mic, &mute_sys, &sep2,
        &stealth, &show_overlay, &sep3,
        &copy_ai, &copy_actions, &copy_summary, &copy_transcript, &sep4,
        &settings, &quit,
    ])
}
