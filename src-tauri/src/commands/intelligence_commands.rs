use tauri::{command, AppHandle, Emitter, State};

use crate::intelligence::action_config::{AllActionConfigs, InstructionPresets};
use crate::intelligence::IntelligenceEngine;
use crate::llm::provider::GenerationParams;
use crate::rag;
use crate::state::AppState;

/// Compose instruction presets + custom text into a single string.
/// Mirrors the frontend's `composeInstructions()` in aiActionsStore.ts.
fn compose_instructions(presets: &InstructionPresets, custom: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(tone) = &presets.tone {
        parts.push(format!("{} tone.", tone));
    }
    if let Some(fmt) = &presets.format {
        let text = match fmt.as_str() {
            "bullets" => "Use bullet points.".to_string(),
            "paragraphs" => "Use paragraphs.".to_string(),
            "numbered" => "Use a numbered list.".to_string(),
            "oneliner" => "Keep it to one line.".to_string(),
            other => format!("Use {} format.", other),
        };
        parts.push(text);
    }
    if let Some(length) = &presets.length {
        let text = match length.as_str() {
            "brief" => "Brief responses.".to_string(),
            "standard" => "Standard length responses.".to_string(),
            "detailed" => "Detailed responses.".to_string(),
            other => format!("{} responses.", other),
        };
        parts.push(text);
    }
    let prefix = parts.join(" ");
    if !prefix.is_empty() && !custom.is_empty() {
        format!("{} {}", prefix, custom)
    } else if !prefix.is_empty() {
        prefix
    } else {
        custom.to_string()
    }
}

/// Build transcript text from frontend-provided segments, applying the per-action window.
/// The frontend transcript store is the single source of truth for ALL STT engines.
fn build_transcript_from_segments(segments_json: &str, window_seconds: u64) -> String {
    #[derive(serde::Deserialize)]
    struct Seg {
        text: String,
        speaker: String,
        timestamp_ms: u64,
    }
    let segments: Vec<Seg> = match serde_json::from_str(segments_json) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("Failed to parse frontend transcript segments: {}", e);
            return String::new();
        }
    };

    if segments.is_empty() {
        return String::new();
    }

    // Find the latest timestamp for windowing
    let latest_ts = segments.iter().map(|s| s.timestamp_ms).max().unwrap_or(0);

    // Apply window: 0 = all segments, otherwise filter by time window
    let cutoff_ms = if window_seconds == 0 {
        0
    } else {
        latest_ts.saturating_sub(window_seconds * 1000)
    };

    segments.iter()
        .filter(|s| s.timestamp_ms >= cutoff_ms)
        .map(|s| {
            let label = match s.speaker.as_str() {
                "User" => "You",
                "Them" => "Them",
                other => other,
            };
            format!("[{}]: {}", label, s.text)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[command]
pub async fn generate_assist(
    mode: String,
    custom_question: Option<String>,
    transcript_segments: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Extract what we need from the intelligence engine under its lock
    let (last_question, cancel_flag, action_config_snapshot, composed_instructions) = {
        let intel = state
            .intelligence
            .as_ref()
            .ok_or_else(|| "Intelligence engine not initialized".to_string())?;
        let engine = intel
            .lock()
            .map_err(|e| format!("Failed to lock intelligence engine: {}", e))?;

        if engine.is_generating() {
            return Err("Generation already in progress".to_string());
        }

        engine.set_generating(true);

        // Look up per-action config
        let action_cfg = engine.get_action_config(&mode).cloned();
        let global_defaults = engine.get_action_configs().global_defaults.clone();

        // Compose instructions from AllActionConfigs (reliable path — same sync as system prompts)
        let all_configs = engine.get_action_configs();
        let composed = compose_instructions(
            &all_configs.instruction_presets,
            &all_configs.custom_instructions,
        );

        let question = engine.last_detected_question().cloned();
        let cancel = engine.cancel_flag();

        (question, cancel, (action_cfg, global_defaults), composed)
    };

    let (action_cfg, global_defaults) = action_config_snapshot;

    // Determine transcript window: per-action override or global default
    let window_seconds = action_cfg
        .as_ref()
        .and_then(|c| c.transcript_window_seconds)
        .unwrap_or(global_defaults.transcript_window_seconds);

    // Build transcript from frontend segments (universal — works with any STT engine).
    // The frontend transcript store is the single source of truth.
    // Falls back to engine buffer only if frontend didn't send segments.
    let transcript_text = if let Some(ref segs) = transcript_segments {
        build_transcript_from_segments(segs, window_seconds)
    } else {
        // Legacy fallback: read from backend buffer
        let intel = state.intelligence.as_ref()
            .ok_or_else(|| "Intelligence engine not initialized".to_string())?;
        let engine = intel.lock().map_err(|e| e.to_string())?;
        if window_seconds == 0 {
            engine.get_all_transcript()
        } else {
            engine.transcript_buffer.get_recent_text(window_seconds)
        }
    };

    // Resolve per-action settings
    let include_rag = action_cfg.as_ref().map(|c| c.include_rag_chunks).unwrap_or(true);
    let include_transcript = action_cfg.as_ref().map(|c| c.include_transcript).unwrap_or(true);
    let include_question = action_cfg.as_ref().map(|c| c.include_detected_question).unwrap_or(true);
    let include_instructions = action_cfg.as_ref().map(|c| c.include_custom_instructions).unwrap_or(true);
    let rag_top_k = action_cfg.as_ref().and_then(|c| c.rag_top_k).unwrap_or(global_defaults.rag_top_k);

    // Resolve base system prompt: from action config or fallback to default template
    let base_system_prompt = action_cfg
        .as_ref()
        .map(|c| c.system_prompt.clone())
        .unwrap_or_else(|| {
            crate::intelligence::prompt_templates::get_system_prompt(&mode).to_string()
        });

    // Append composed instructions (tone + format + length + custom text) to system prompt.
    // These are behavioral directives that belong in the system context, not as reference materials.
    let system_prompt = if include_instructions && !composed_instructions.is_empty() {
        format!("{}\n\nAdditional Instructions: {}", base_system_prompt, composed_instructions)
    } else {
        base_system_prompt
    };

    // Build generation params from per-action overrides or global defaults
    let temperature = action_cfg
        .as_ref()
        .and_then(|c| c.temperature)
        .unwrap_or(global_defaults.temperature);
    let params = GenerationParams {
        temperature: Some(temperature),
        max_tokens: None,
    };

    // Get context — RAG chunks only.
    // Composed instructions now go in system prompt (above), not here.
    // Key principle: NEVER fall back to full file dump. If RAG fails, just skip RAG chunks.
    let context_text = {
        let mut parts: Vec<String> = Vec::new();

        // RAG chunks (if action includes them AND RAG is enabled globally)
        if include_rag {
            let rag_enabled = state.rag.as_ref()
                .and_then(|r| r.lock().ok())
                .map(|r| r.config().enabled)
                .unwrap_or(false);

            if rag_enabled {
                let query = last_question.as_ref()
                    .map(|q| q.text.clone())
                    .unwrap_or_else(|| transcript_text.chars().take(500).collect());

                let rag_result = if let (Some(rag_arc), Some(db_arc)) =
                    (state.rag.as_ref(), state.database.as_ref()) {
                    let (mut config, embedder_url, embedding_model) = {
                        let rag_guard = rag_arc.lock().map_err(|e| e.to_string())?;
                        (rag_guard.config().clone(), rag_guard.embedder_url(), rag_guard.embedding_model())
                    };
                    config.top_k = rag_top_k;
                    rag::RagManager::search_async(db_arc, &query, &config, &embedder_url, &embedding_model).await
                } else {
                    Err("RAG not initialized".to_string())
                };

                match rag_result {
                    Ok(chunks) if !chunks.is_empty() => {
                        parts.push(rag::prompt_builder::build_rag_context(&chunks, ""));
                    }
                    Ok(_) => {
                        log::debug!("RAG search returned no results for mode={}", mode);
                    }
                    Err(e) => {
                        log::warn!("RAG search failed for mode={}: {}", mode, e);
                    }
                }
            }
        }

        parts.join("\n\n")
    };

    // include_context = whether context_text has content to include
    let include_context = !context_text.is_empty();

    // Get the LLM provider and model info
    let (provider_arc, model, provider_name) = {
        let llm = state
            .llm
            .as_ref()
            .ok_or_else(|| "LLM router not initialized".to_string())?;
        let router = llm
            .lock()
            .map_err(|e| format!("Failed to lock LLM router: {}", e))?;

        let provider = router
            .get_provider()
            .map_err(|e| format!("No active LLM provider: {}", e))?;

        let model_name = router.active_model().to_string();
        if model_name.is_empty() {
            return Err("No active model selected".to_string());
        }

        let ptype = router
            .active_provider_type()
            .map(|pt| pt.display_name().to_string())
            .unwrap_or_else(|| "Unknown".to_string());

        (provider, model_name, ptype)
    };

    // Run the generation asynchronously
    let mode_clone = mode.clone();
    let result = IntelligenceEngine::generate_assist(
        &system_prompt,
        &mode_clone,
        custom_question.as_deref(),
        transcript_text,
        last_question,
        context_text,
        include_context,
        include_transcript,
        include_question,
        include_rag,
        include_instructions,
        provider_arc,
        model,
        provider_name,
        params,
        app_handle,
        cancel_flag,
    )
    .await;

    // Clear generating state
    {
        let intel = state.intelligence.as_ref();
        if let Some(intel) = intel {
            if let Ok(engine) = intel.lock() {
                engine.set_generating(false);
            }
        }
    }

    result
}

#[command]
pub async fn cancel_generation(state: State<'_, AppState>) -> Result<(), String> {
    let intel = state
        .intelligence
        .as_ref()
        .ok_or_else(|| "Intelligence engine not initialized".to_string())?;

    let engine = intel
        .lock()
        .map_err(|e| format!("Failed to lock intelligence engine: {}", e))?;

    engine.cancel();
    engine.set_generating(false);

    // Cancellation is handled via the atomic flag in IntelligenceEngine.
    // The LLM provider stream will check for cancellation on the next iteration.
    log::info!("Generation cancelled");
    Ok(())
}

#[command]
pub async fn set_auto_trigger(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let intel = state
        .intelligence
        .as_ref()
        .ok_or_else(|| "Intelligence engine not initialized".to_string())?;

    let engine = intel
        .lock()
        .map_err(|e| format!("Failed to lock intelligence engine: {}", e))?;

    engine.set_auto_trigger(enabled);
    log::info!("Auto-trigger set to: {}", enabled);
    Ok(())
}

#[command]
pub async fn set_context_window_seconds(
    seconds: u64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let intel = state
        .intelligence
        .as_ref()
        .ok_or_else(|| "Intelligence engine not initialized".to_string())?;

    let mut engine = intel
        .lock()
        .map_err(|e| format!("Failed to lock intelligence engine: {}", e))?;

    engine.set_context_window(seconds);
    log::info!("Context window set to: {}s", seconds);
    Ok(())
}

/// Push a transcript segment to the intelligence engine's buffer.
/// Called from the frontend when Web Speech API produces results.
#[command]
pub async fn push_transcript(
    text: String,
    speaker: String,
    timestamp_ms: u64,
    is_final: bool,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let intel = state
        .intelligence
        .as_ref()
        .ok_or_else(|| "Intelligence engine not initialized".to_string())?;

    let mut engine = intel
        .lock()
        .map_err(|e| format!("Failed to lock intelligence engine: {}", e))?;

    // Clone text and speaker before they are moved into push_transcript
    let text_clone = text.clone();
    let speaker_clone = speaker.clone();

    let questions = engine.push_transcript(text, speaker, timestamp_ms, is_final);

    // Emit question detected events
    for q in questions {
        let payload = serde_json::json!({
            "text": q.text,
            "confidence": q.confidence,
            "timestamp_ms": q.timestamp_ms,
            "source": q.source,
        });
        let _ = app_handle.emit("question_detected", &payload);
    }

    // Feed transcript to RAG indexer if enabled
    if is_final {
        if let Some(rag_arc) = state.rag.as_ref() {
            if let Ok(mut rag_mgr) = rag_arc.lock() {
                if rag_mgr.config().enabled && rag_mgr.config().include_transcript {
                    if let Some(indexer) = rag_mgr.transcript_indexer_mut() {
                        indexer.push_segment(&text_clone, &speaker_clone, timestamp_ms);
                    }
                }
            }
        }
    }

    Ok(())
}

/// Update action configs from the frontend.
/// Frontend is the source of truth — this syncs to backend IntelligenceEngine.
#[command]
pub async fn update_action_configs(
    configs_json: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let configs: AllActionConfigs = serde_json::from_str(&configs_json)
        .map_err(|e| format!("Failed to parse action configs: {}", e))?;

    let intel = state
        .intelligence
        .as_ref()
        .ok_or_else(|| "Intelligence engine not initialized".to_string())?;

    let mut engine = intel
        .lock()
        .map_err(|e| format!("Failed to lock intelligence engine: {}", e))?;

    // Also sync global defaults to intelligence engine settings
    engine.set_auto_trigger(configs.global_defaults.auto_trigger);
    engine.set_context_window(configs.global_defaults.transcript_window_seconds);

    engine.set_action_configs(configs);

    log::info!("Action configs updated from frontend");
    Ok(())
}

/// Get current action configs from the backend.
#[command]
pub async fn get_action_configs(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let intel = state
        .intelligence
        .as_ref()
        .ok_or_else(|| "Intelligence engine not initialized".to_string())?;

    let engine = intel
        .lock()
        .map_err(|e| format!("Failed to lock intelligence engine: {}", e))?;

    let configs = engine.get_action_configs();
    serde_json::to_string(configs)
        .map_err(|e| format!("Failed to serialize action configs: {}", e))
}
