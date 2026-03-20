use tauri::{command, State};

use crate::llm::{LLMRouter, ProviderConfig};
use crate::state::AppState;

#[command]
pub async fn set_llm_provider(
    provider: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Parse the provider config from the JSON string, or create a simple one from the provider name
    let config: ProviderConfig = match serde_json::from_str(&provider) {
        Ok(config) => config,
        Err(_) => {
            // Treat the input as just a provider type name
            ProviderConfig {
                provider_type: provider.clone(),
                api_key: None,
                base_url: None,
                auth_type: None,
                auth_value: None,
                auth_header: None,
            }
        }
    };

    let llm = state
        .llm
        .as_ref()
        .ok_or_else(|| "LLM router not initialized".to_string())?;

    let mut router = llm
        .lock()
        .map_err(|e| format!("Failed to lock LLM router: {}", e))?;

    router
        .set_provider(config)
        .map_err(|e| format!("Failed to set provider: {}", e))?;

    log::info!("LLM provider set to: {}", provider);
    Ok(())
}

#[command]
pub async fn list_models(
    provider: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let llm = state
        .llm
        .as_ref()
        .ok_or_else(|| "LLM router not initialized".to_string())?;

    // If the provider string is a JSON config, set it up first
    let config: Option<ProviderConfig> = serde_json::from_str(&provider).ok();

    let provider_arc = {
        let mut router = llm
            .lock()
            .map_err(|e| format!("Failed to lock LLM router: {}", e))?;

        // If a config was provided, set up the provider
        if let Some(config) = config {
            router
                .set_provider(config)
                .map_err(|e| format!("Failed to set provider: {}", e))?;
        }

        router
            .get_provider()
            .map_err(|e| format!("No active provider: {}", e))?
    };

    let provider_guard = provider_arc.lock().await;
    let models = provider_guard
        .list_models()
        .await
        .map_err(|e| format!("Failed to list models: {}", e))?;

    serde_json::to_string(&models).map_err(|e| format!("Failed to serialize models: {}", e))
}

#[command]
pub async fn set_active_model(
    _provider: String,
    model_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let llm = state
        .llm
        .as_ref()
        .ok_or_else(|| "LLM router not initialized".to_string())?;

    let mut router = llm
        .lock()
        .map_err(|e| format!("Failed to lock LLM router: {}", e))?;

    router.set_active_model(model_id.clone());
    log::info!("Active model set to: {}", model_id);
    Ok(())
}

#[command]
pub async fn test_llm_connection(
    provider: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let llm = state
        .llm
        .as_ref()
        .ok_or_else(|| "LLM router not initialized".to_string())?;

    // If the provider string is a JSON config, set it up first
    let config: Option<ProviderConfig> = serde_json::from_str(&provider).ok();

    let provider_arc = {
        let mut router = llm
            .lock()
            .map_err(|e| format!("Failed to lock LLM router: {}", e))?;

        if let Some(config) = config {
            router
                .set_provider(config)
                .map_err(|e| format!("Failed to set provider: {}", e))?;
        }

        router
            .get_provider()
            .map_err(|e| format!("No active provider: {}", e))?
    };

    let provider_guard = provider_arc.lock().await;
    provider_guard
        .test_connection()
        .await
        .map_err(|e| format!("Connection test failed: {}", e))
}

#[command]
pub async fn get_llm_providers() -> Result<String, String> {
    let providers = LLMRouter::get_all_providers();
    serde_json::to_string(&providers)
        .map_err(|e| format!("Failed to serialize providers: {}", e))
}
