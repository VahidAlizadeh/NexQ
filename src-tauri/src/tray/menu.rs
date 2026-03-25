use serde::Deserialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
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

/// Build the idle-state tray menu.
pub fn build_idle_menu(
    app: &AppHandle,
    recent_meetings: &[RecentMeetingInfo],
) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let start = MenuItem::with_id(app, "start_meeting", "Start Meeting", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = vec![
        Box::new(start),
        Box::new(sep1),
    ];

    // Recent meetings (up to 3)
    if !recent_meetings.is_empty() {
        for meeting in recent_meetings.iter().take(3) {
            let label = format!("{}  —  {}", meeting.title, meeting.start_time);
            let id = format!("recent_{}", meeting.id);
            let item = MenuItem::with_id(app, &id, &label, true, None::<&str>)?;
            items.push(Box::new(item));
        }
        items.push(Box::new(PredefinedMenuItem::separator(app)?));
    }

    // Copy submenu
    let copy_sub = build_copy_submenu(app, "Copy from Last Meeting")?;
    items.push(Box::new(copy_sub));
    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    // Settings + Quit
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit NexQ", true, None::<&str>)?;
    items.push(Box::new(settings));
    items.push(Box::new(quit));

    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        items.iter().map(|i| i.as_ref()).collect();
    Menu::with_items(app, &refs)
}

/// Build the meeting-active tray menu.
pub fn build_meeting_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let stop = MenuItem::with_id(app, "stop_meeting", "Stop Meeting", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let mute_mic = MenuItem::with_id(app, "toggle_mic", "Mute Microphone", true, None::<&str>)?;
    let mute_sys = MenuItem::with_id(app, "toggle_system", "Mute System Audio", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    let stealth = MenuItem::with_id(app, "toggle_stealth", "Stealth Mode", true, None::<&str>)?;
    let show_overlay = MenuItem::with_id(app, "show_overlay", "Show Overlay", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;

    let copy_sub = build_copy_submenu(app, "Copy")?;
    let sep4 = PredefinedMenuItem::separator(app)?;

    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit NexQ", true, None::<&str>)?;

    Menu::with_items(app, &[
        &stop, &sep1,
        &mute_mic, &mute_sys, &sep2,
        &stealth, &show_overlay, &sep3,
        &copy_sub, &sep4,
        &settings, &quit,
    ])
}

/// Build the copy submenu (shared between idle and meeting menus).
fn build_copy_submenu(app: &AppHandle, label: &str) -> Result<Submenu<tauri::Wry>, tauri::Error> {
    let ai = MenuItem::with_id(app, "copy_ai_answer", "Last AI Answer", true, None::<&str>)?;
    let actions = MenuItem::with_id(app, "copy_action_items", "Action Items", true, None::<&str>)?;
    let summary = MenuItem::with_id(app, "copy_summary", "Meeting Summary", true, None::<&str>)?;
    let transcript = MenuItem::with_id(app, "copy_transcript", "Full Transcript", true, None::<&str>)?;

    Submenu::with_items(app, label, true, &[&ai, &actions, &summary, &transcript])
}
