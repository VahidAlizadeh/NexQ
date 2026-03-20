// Tauri commands for managing local STT model downloads.

use tauri::{command, AppHandle, Manager};

use crate::state::AppState;

/// List all local STT engines with their models and download status.
#[command]
pub async fn list_local_stt_engines(app: AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    let model_mgr = state
        .model_manager
        .as_ref()
        .ok_or("Model manager not initialized")?;
    let mgr = model_mgr
        .lock()
        .map_err(|_| "Model manager lock poisoned".to_string())?;

    let engines = mgr.list_engines_with_status();
    serde_json::to_string(&engines)
        .map_err(|e| format!("Failed to serialize engine list: {}", e))
}

/// Start downloading a local STT model. Progress emitted via `model_download_progress` events.
#[command]
pub async fn download_local_stt_model(
    app: AppHandle,
    engine: String,
    model_id: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let model_mgr = state
        .model_manager
        .as_ref()
        .ok_or("Model manager not initialized")?;

    let mut mgr = model_mgr
        .lock()
        .map_err(|_| "Model manager lock poisoned".to_string())?;

    mgr.download_model(&engine, &model_id, app.clone())
}

/// Cancel an active model download.
#[command]
pub async fn cancel_model_download(
    app: AppHandle,
    engine: String,
    model_id: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let model_mgr = state
        .model_manager
        .as_ref()
        .ok_or("Model manager not initialized")?;

    let mut mgr = model_mgr
        .lock()
        .map_err(|_| "Model manager lock poisoned".to_string())?;

    mgr.cancel_download(&engine, &model_id);
    Ok(())
}

/// Delete a downloaded local STT model.
#[command]
pub async fn delete_local_stt_model(
    app: AppHandle,
    engine: String,
    model_id: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let model_mgr = state
        .model_manager
        .as_ref()
        .ok_or("Model manager not initialized")?;

    let mut mgr = model_mgr
        .lock()
        .map_err(|_| "Model manager lock poisoned".to_string())?;

    mgr.delete_model(&engine, &model_id)
}
