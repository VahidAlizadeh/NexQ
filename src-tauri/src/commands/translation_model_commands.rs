// Tauri commands for managing OPUS-MT translation model downloads.

use tauri::{command, AppHandle, Manager};

use crate::state::AppState;

/// List all OPUS-MT models with their download and activation status.
#[command]
pub async fn list_opus_mt_models(app: AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    let mgr = state
        .opus_mt_manager
        .as_ref()
        .ok_or("OPUS-MT manager not initialized")?;
    let mgr = mgr
        .lock()
        .map_err(|_| "OPUS-MT manager lock poisoned".to_string())?;

    let models = mgr.list_models();
    serde_json::to_string(&models)
        .map_err(|e| format!("Failed to serialize models: {}", e))
}

/// Start downloading an OPUS-MT model. Progress emitted via `model_download_progress` events.
#[command]
pub async fn download_opus_mt_model(
    app: AppHandle,
    model_id: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mgr = state
        .opus_mt_manager
        .as_ref()
        .ok_or("OPUS-MT manager not initialized")?;

    let mut mgr = mgr
        .lock()
        .map_err(|_| "OPUS-MT manager lock poisoned".to_string())?;

    mgr.download_model(&model_id, app.clone())
}

/// Cancel an active OPUS-MT model download.
#[command]
pub async fn cancel_opus_mt_download(
    app: AppHandle,
    model_id: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mgr = state
        .opus_mt_manager
        .as_ref()
        .ok_or("OPUS-MT manager not initialized")?;

    let mut mgr = mgr
        .lock()
        .map_err(|_| "OPUS-MT manager lock poisoned".to_string())?;

    mgr.cancel_download(&model_id);
    Ok(())
}

/// Delete a downloaded OPUS-MT model.
#[command]
pub async fn delete_opus_mt_model(
    app: AppHandle,
    model_id: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mgr = state
        .opus_mt_manager
        .as_ref()
        .ok_or("OPUS-MT manager not initialized")?;

    let mut mgr = mgr
        .lock()
        .map_err(|_| "OPUS-MT manager lock poisoned".to_string())?;

    mgr.delete_model(&model_id)
}

/// Activate a downloaded OPUS-MT model. ONNX sessions load lazily on first translate().
#[command]
pub async fn activate_opus_mt_model(
    app: AppHandle,
    model_id: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();

    // Activate in the manager (persists to active_model.txt)
    {
        let mgr = state
            .opus_mt_manager
            .as_ref()
            .ok_or("OPUS-MT manager not initialized")?;
        let mut mgr = mgr
            .lock()
            .map_err(|_| "OPUS-MT manager lock poisoned".to_string())?;
        mgr.activate_model(&model_id)?;
    }

    // Update the router's active model ID so set_provider() passes it to the translator.
    // Also re-create the provider so it picks up the new active model ID.
    // ONNX sessions are NOT loaded here — they load lazily on the first translate() call.
    if let Some(translation) = &state.translation {
        let mut router = translation
            .lock()
            .map_err(|_| "Translation router lock poisoned".to_string())?;

        router.set_opus_mt_active_model(Some(model_id.clone()));

        // Re-create the provider with the new active model ID
        // (set_provider just sets the model ID, no ONNX loading)
        let _ = router.set_provider(crate::translation::TranslationProviderType::OpusMt);
    }

    log::info!("OPUS-MT model activated: {} (ONNX will load on first translate)", model_id);
    Ok(())
}
