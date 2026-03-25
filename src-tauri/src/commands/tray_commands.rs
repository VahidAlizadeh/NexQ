use tauri::{command, AppHandle, Manager};
use crate::state::AppState;
use crate::tray::{TrayState, tooltip};
use crate::tray::menu::RecentMeetingInfo;
use std::time::Instant;

/// Update the tray icon to reflect a new state.
#[command]
pub async fn set_tray_state(
    app: AppHandle,
    state: TrayState,
) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let mut mgr = app_state.tray_manager.lock().map_err(|e| e.to_string())?;
    let manager = mgr.as_mut().ok_or("TrayManager not initialized")?;

    // Cancel pulse timer if leaving recording state
    if manager.current_state == TrayState::Recording && state != TrayState::Recording {
        if let Some(h) = manager.pulse_timer.take() { h.abort(); }
    }

    manager.current_state = state;

    // Update icon
    let icon = manager.icon_set.get(state);
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
    }

    // Update tooltip
    let tooltip_text = tooltip::build_tooltip(
        state,
        manager.meeting_start_time,
        manager.is_muted,
        manager.custom_tooltip.as_deref(),
    );
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(Some(&tooltip_text)).map_err(|e| e.to_string())?;
    }

    // Start pulse animation for recording
    if state == TrayState::Recording {
        let tray_mgr_clone = app_state.tray_manager.clone();
        let app_clone = app.clone();
        let handle = tokio::spawn(async move {
            let mut bright = true;
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(750)).await;
                bright = !bright;
                let mgr = tray_mgr_clone.lock().unwrap();
                if let Some(ref m) = *mgr {
                    if m.current_state != TrayState::Recording { break; }
                    let icon = if bright {
                        m.icon_set.get(TrayState::Recording)
                    } else {
                        m.icon_set.get_recording_dim()
                    };
                    if let Some(tray) = app_clone.tray_by_id("main") {
                        let _ = tray.set_icon(Some(icon));
                    }
                } else { break; }
            }
        });
        // Need to re-acquire lock to store handle
        drop(mgr);
        let mut mgr = app_state.tray_manager.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut m) = *mgr {
            m.pulse_timer = Some(handle);
        }
    }

    Ok(())
}

/// Set custom tooltip text (used for idle stats).
#[command]
pub async fn set_tray_tooltip(
    app: AppHandle,
    text: String,
) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let mut mgr = app_state.tray_manager.lock().map_err(|e| e.to_string())?;
    let manager = mgr.as_mut().ok_or("TrayManager not initialized")?;

    manager.custom_tooltip = if text.is_empty() { None } else { Some(text) };

    let tooltip_text = tooltip::build_tooltip(
        manager.current_state,
        manager.meeting_start_time,
        manager.is_muted,
        manager.custom_tooltip.as_deref(),
    );
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(Some(&tooltip_text)).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Set or clear the meeting start time (for Rust-side elapsed time tooltip).
#[command]
pub async fn set_meeting_start_time(
    app: AppHandle,
    started: bool,
) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let tray_mgr = app_state.tray_manager.clone();

    {
        let mut mgr = tray_mgr.lock().map_err(|e| e.to_string())?;
        let manager = mgr.as_mut().ok_or("TrayManager not initialized")?;

        if started {
            manager.meeting_start_time = Some(Instant::now());
            manager.meeting_active = true;

            // Cancel any existing tooltip timer
            if let Some(h) = manager.tooltip_timer.take() { h.abort(); }
        } else {
            manager.meeting_start_time = None;
            manager.meeting_active = false;

            // Cancel tooltip timer
            if let Some(h) = manager.tooltip_timer.take() { h.abort(); }
            return Ok(());
        }
    }

    // Start tooltip update timer (every 5 seconds)
    let app_clone = app.clone();
    let timer_tray = tray_mgr.clone();
    let handle = tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            let mgr = timer_tray.lock().unwrap();
            if let Some(ref m) = *mgr {
                if m.meeting_start_time.is_none() { break; }
                let text = tooltip::build_tooltip(
                    m.current_state,
                    m.meeting_start_time,
                    m.is_muted,
                    m.custom_tooltip.as_deref(),
                );
                if let Some(tray) = app_clone.tray_by_id("main") {
                    let _ = tray.set_tooltip(Some(&text));
                }
            } else { break; }
        }
    });

    let mut mgr = tray_mgr.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut m) = *mgr {
        m.tooltip_timer = Some(handle);
    }

    Ok(())
}

/// Rebuild the tray menu for the current state (idle vs meeting).
#[command]
pub async fn rebuild_tray_menu(
    app: AppHandle,
    meeting_active: bool,
    recent_meetings: Vec<RecentMeetingInfo>,
) -> Result<(), String> {
    let menu = if meeting_active {
        crate::tray::menu::build_meeting_menu(&app).map_err(|e| e.to_string())?
    } else {
        crate::tray::menu::build_idle_menu(&app, &recent_meetings).map_err(|e| e.to_string())?
    };

    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Enable or disable a specific menu item by ID.
#[command]
pub async fn set_tray_menu_item_enabled(
    _app: AppHandle,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    // Tauri 2 doesn't expose menu item lookup by ID on tray directly.
    // Menu items are rebuilt via rebuild_tray_menu instead.
    // This command is a no-op placeholder for future use.
    log::debug!("set_tray_menu_item_enabled: {} = {}", id, enabled);
    Ok(())
}
