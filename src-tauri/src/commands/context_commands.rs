use tauri::{command, State};

use crate::state::AppState;

#[command]
pub async fn load_context_file(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let ctx_mgr = state
        .context
        .as_ref()
        .ok_or_else(|| "Context manager not initialized".to_string())?;

    let resource = {
        let mut ctx = ctx_mgr
            .lock()
            .map_err(|e| format!("Failed to lock context manager: {}", e))?;
        ctx.load_file(&file_path)?
    };

    // Persist to DB so the resource survives app restarts
    if let Some(db_arc) = state.database.as_ref() {
        if let Ok(db_guard) = db_arc.lock() {
            let db_res = crate::db::context::ContextResource {
                id: resource.id.clone(),
                name: resource.name.clone(),
                file_type: resource.file_type.clone(),
                file_path: resource.file_path.clone(),
                size_bytes: resource.size_bytes as i64,
                token_count: resource.token_count as i64,
                preview: resource.preview.clone(),
                loaded_at: resource.loaded_at.clone(),
            };
            if let Err(e) = crate::db::context::add_context_resource(db_guard.connection(), &db_res) {
                log::warn!("Failed to persist context resource to DB: {}", e);
            }
        }
    }

    serde_json::to_string(&resource)
        .map_err(|e| format!("Failed to serialize resource: {}", e))
}

#[command]
pub async fn remove_context_file(
    resource_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let ctx_mgr = state
        .context
        .as_ref()
        .ok_or_else(|| "Context manager not initialized".to_string())?;

    {
        let mut ctx = ctx_mgr
            .lock()
            .map_err(|e| format!("Failed to lock context manager: {}", e))?;
        ctx.remove_file(&resource_id)?;
    }

    // Remove from DB (context record + RAG chunks)
    if let Some(db_arc) = state.database.as_ref() {
        if let Ok(db_guard) = db_arc.lock() {
            let _ = crate::db::context::delete_context_resource(db_guard.connection(), &resource_id);
            let _ = crate::db::rag::delete_chunks_by_file(db_guard.connection(), &resource_id);
        }
    }

    Ok(())
}

#[command]
pub async fn list_context_resources(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let ctx_mgr = state
        .context
        .as_ref()
        .ok_or_else(|| "Context manager not initialized".to_string())?;

    let ctx = ctx_mgr
        .lock()
        .map_err(|e| format!("Failed to lock context manager: {}", e))?;

    let resources = ctx.list_resources();

    serde_json::to_string(&resources)
        .map_err(|e| format!("Failed to serialize resources: {}", e))
}

#[command]
pub async fn set_custom_instructions(
    instructions: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let ctx_mgr = state
        .context
        .as_ref()
        .ok_or_else(|| "Context manager not initialized".to_string())?;

    let mut ctx = ctx_mgr
        .lock()
        .map_err(|e| format!("Failed to lock context manager: {}", e))?;

    ctx.set_custom_instructions(&instructions);

    Ok(())
}

#[command]
pub async fn get_assembled_context(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let ctx_mgr = state
        .context
        .as_ref()
        .ok_or_else(|| "Context manager not initialized".to_string())?;

    let ctx = ctx_mgr
        .lock()
        .map_err(|e| format!("Failed to lock context manager: {}", e))?;

    Ok(ctx.get_assembled_context())
}

#[command]
pub async fn get_token_budget(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let ctx_mgr = state
        .context
        .as_ref()
        .ok_or_else(|| "Context manager not initialized".to_string())?;

    let ctx = ctx_mgr
        .lock()
        .map_err(|e| format!("Failed to lock context manager: {}", e))?;

    // Default model context window: 128k tokens (can be overridden later)
    let model_context_window: u64 = 128_000;
    // Transcript tokens default to 0 when not in a meeting
    let transcript_tokens: usize = 0;

    let budget = ctx.get_token_budget(model_context_window, transcript_tokens);

    serde_json::to_string(&budget)
        .map_err(|e| format!("Failed to serialize token budget: {}", e))
}
