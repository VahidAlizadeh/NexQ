use serde::Serialize;
use tauri::{command, AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

/// Information about an available update.
#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

/// Check for an available update.
///
/// Returns `Some(UpdateInfo)` if a newer version is available, or `None` if the
/// app is already up-to-date.
#[command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| format!("Failed to get updater: {}", e))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check for update: {}", e))?;

    match update {
        Some(update) => Ok(Some(UpdateInfo {
            version: update.version.clone(),
            body: update.body.clone(),
            date: update.date.map(|d| d.to_string()),
        })),
        None => Ok(None),
    }
}

/// Download and install the latest update, emitting progress events.
///
/// Emits `update_download_progress` events with `{ chunk_length, content_length }`
/// during the download, and a final `update_ready` event with `{ version }` on
/// completion.
#[command]
pub async fn download_and_install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| format!("Failed to get updater: {}", e))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check for update: {}", e))?
        .ok_or_else(|| "No update available".to_string())?;

    let version = update.version.clone();

    let progress_app = app.clone();
    update
        .download_and_install(
            move |chunk_length, content_length| {
                let _ = progress_app.emit(
                    "update_download_progress",
                    serde_json::json!({
                        "chunk_length": chunk_length,
                        "content_length": content_length,
                    }),
                );
            },
            || {
                log::info!("Download finished, installing update...");
            },
        )
        .await
        .map_err(|e| format!("Failed to download and install update: {}", e))?;

    let _ = app.emit(
        "update_ready",
        serde_json::json!({ "version": version }),
    );

    log::info!("Update v{} downloaded and installed successfully", version);

    Ok(())
}

/// Restart the application to apply a pending update.
#[command]
pub async fn restart_for_update(app: AppHandle) -> Result<(), String> {
    log::info!("Restarting application for update...");
    app.restart();
}
