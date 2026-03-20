use tauri::{command, AppHandle, Manager};

/// Enable or disable stealth mode on the overlay window.
///
/// When enabled, the overlay window is excluded from screen captures and recordings
/// using the Windows API `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)`.
///
/// This prevents the overlay from appearing in screenshots, screen recordings, or
/// screen-sharing sessions (e.g., Zoom, Teams, Discord).
#[command]
pub async fn set_stealth_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    let _overlay = app
        .get_webview_window("overlay")
        .ok_or_else(|| "Overlay window not found".to_string())?;

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowDisplayAffinity, WINDOW_DISPLAY_AFFINITY,
        };

        // Obtain the HWND from the overlay window.
        // In Tauri 2, hwnd() is a direct method on WebviewWindow.
        let hwnd_raw = _overlay
            .hwnd()
            .map_err(|e| format!("Failed to get window handle: {}", e))?;

        let hwnd = HWND(hwnd_raw.0 as *mut _);

        // WDA_EXCLUDEFROMCAPTURE = 0x00000011 (Windows 10 v2004+)
        // WDA_NONE = 0x00000000
        let affinity = if enabled {
            WINDOW_DISPLAY_AFFINITY(0x00000011)
        } else {
            WINDOW_DISPLAY_AFFINITY(0x00000000)
        };

        unsafe {
            SetWindowDisplayAffinity(hwnd, affinity)
                .map_err(|e| format!("Failed to set display affinity: {}", e))?;
        }

        log::info!(
            "Stealth mode {}: overlay window {} from capture",
            if enabled { "enabled" } else { "disabled" },
            if enabled { "excluded" } else { "included" }
        );
    }

    #[cfg(not(target_os = "windows"))]
    {
        if enabled {
            log::warn!("Stealth mode is only supported on Windows");
            return Err("Stealth mode is only supported on Windows".to_string());
        }
    }

    Ok(())
}
