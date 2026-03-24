// OPUS-MT local translation provider with ONNX inference.
// Uses ort (ONNX Runtime) for encoder-decoder inference and the
// tokenizers crate for SentencePiece tokenization.

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

use super::*;
use super::opus_mt_registry;

/// A loaded ONNX model ready for translation.
struct LoadedModel {
    encoder: ort::session::Session,
    decoder: ort::session::Session,
    tokenizer: tokenizers::Tokenizer,
    eos_token_id: i64,
    decoder_start_token_id: i64,
}

pub struct OpusMtTranslator {
    models_dir: Option<PathBuf>,
    /// Currently loaded model: (model_id, sessions).
    /// Only one model is loaded at a time to limit memory usage (~300-450 MB per model).
    loaded: Option<(String, Arc<TokioMutex<LoadedModel>>)>,
}

impl OpusMtTranslator {
    pub fn new() -> Self {
        Self {
            models_dir: None,
            loaded: None,
        }
    }

    pub fn set_models_dir(&mut self, path: PathBuf) {
        self.models_dir = Some(path);
    }

    /// Load a model from disk into ONNX sessions.
    pub fn load_model(&mut self, model_id: &str) -> Result<(), String> {
        // Already loaded?
        if let Some((loaded_id, _)) = &self.loaded {
            if loaded_id == model_id {
                return Ok(());
            }
        }

        let models_dir = self.models_dir.as_ref()
            .ok_or("OPUS-MT models directory not configured")?;

        let model_dir = models_dir.join(model_id);
        if !model_dir.is_dir() {
            return Err(format!("Model directory not found: {}", model_dir.display()));
        }

        let encoder_path = model_dir.join("encoder_model.onnx");
        let decoder_path = model_dir.join("decoder_model_merged.onnx");
        let tokenizer_path = model_dir.join("tokenizer.json");

        if !encoder_path.exists() || !decoder_path.exists() || !tokenizer_path.exists() {
            return Err(format!("Model files missing in {}", model_dir.display()));
        }

        log::info!("Loading OPUS-MT model: {} from {}", model_id, model_dir.display());

        let encoder = load_onnx_session(&encoder_path)?;
        log_session_io("Encoder", &encoder);

        let decoder = load_onnx_session(&decoder_path)?;
        log_session_io("Decoder", &decoder);

        let tokenizer = tokenizers::Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| format!("Failed to load tokenizer: {}", e))?;

        let (eos_token_id, decoder_start_token_id) = extract_special_tokens(&tokenizer);

        log::info!(
            "OPUS-MT model loaded: {} (eos={}, dec_start={})",
            model_id, eos_token_id, decoder_start_token_id
        );

        // Unload previous model
        self.loaded = None;

        self.loaded = Some((
            model_id.to_string(),
            Arc::new(TokioMutex::new(LoadedModel {
                encoder,
                decoder,
                tokenizer,
                eos_token_id,
                decoder_start_token_id,
            })),
        ));

        Ok(())
    }

    /// Unload the currently loaded model to free memory.
    pub fn unload(&mut self) {
        if let Some((id, _)) = self.loaded.take() {
            log::info!("Unloaded OPUS-MT model: {}", id);
        }
    }

}

#[async_trait]
impl TranslationProvider for OpusMtTranslator {
    fn provider_name(&self) -> &str { "OPUS-MT (Local)" }
    fn provider_type(&self) -> TranslationProviderType { TranslationProviderType::OpusMt }
    fn is_local(&self) -> bool { true }

    async fn translate(
        &self,
        text: &str,
        source: Option<&str>,
        target: &str,
    ) -> Result<String, TranslationError> {
        let source = source.unwrap_or("en");

        // We need &mut self to load the model, but the trait gives us &self.
        // The caller (TranslationRouter) holds the Arc<dyn TranslationProvider>,
        // so we use interior mutability via the TokioMutex on LoadedModel.
        // For model loading, we need a different approach — pre-load via load_model().

        // Find the loaded model
        let model_arc = self.loaded
            .as_ref()
            .map(|(_, m)| Arc::clone(m))
            .ok_or_else(|| TranslationError::NotConfigured(
                format!("No OPUS-MT model loaded. Activate a {} → {} model in Settings → Translation.", source, target)
            ))?;

        // Verify the loaded model matches the requested pair
        if let Some((loaded_id, _)) = &self.loaded {
            let expected_id = format!("opus-mt-{}-{}", source, target);
            if loaded_id != &expected_id {
                return Err(TranslationError::NotConfigured(
                    format!("Active model ({}) doesn't match requested pair {} → {}. Activate the correct model in Settings.", loaded_id, source, target)
                ));
            }
        }

        let text_owned = text.to_string();

        // Run inference on a blocking thread (ONNX is CPU-bound)
        let result = tokio::task::spawn_blocking(move || {
            let mut model = model_arc.blocking_lock();
            translate_blocking(&text_owned, &mut model)
        })
        .await
        .map_err(|e| TranslationError::Failed(format!("Inference task failed: {}", e)))?
        .map_err(|e| TranslationError::Failed(e))?;

        Ok(result)
    }

    async fn detect_language(&self, _text: &str) -> Result<DetectedLanguage, TranslationError> {
        Err(TranslationError::NotConfigured(
            "Language detection requires a cloud provider".into(),
        ))
    }

    async fn supported_languages(&self) -> Result<Vec<Language>, TranslationError> {
        // Return languages from the catalog
        let mut langs: Vec<Language> = Vec::new();
        let mut seen = std::collections::HashSet::new();

        for model in opus_mt_registry::all_models() {
            if seen.insert(model.source_lang) {
                langs.push(Language {
                    code: model.source_lang.into(),
                    name: model.source_name.into(),
                    native_name: None,
                });
            }
            if seen.insert(model.target_lang) {
                langs.push(Language {
                    code: model.target_lang.into(),
                    name: model.target_name.into(),
                    native_name: None,
                });
            }
        }

        langs.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(langs)
    }

    async fn test_connection(&self) -> Result<ConnectionStatus, TranslationError> {
        let Some(dir) = &self.models_dir else {
            return Ok(ConnectionStatus {
                connected: false,
                language_count: 0,
                response_ms: 0,
                error: Some("Models directory not configured".into()),
            });
        };

        if !dir.exists() {
            return Ok(ConnectionStatus {
                connected: false,
                language_count: 0,
                response_ms: 0,
                error: Some("Models directory not found".into()),
            });
        }

        // Count downloaded models
        let model_count = opus_mt_registry::all_models()
            .iter()
            .filter(|m| {
                let model_dir = dir.join(m.model_id);
                model_dir.join("encoder_model.onnx").exists()
                    && model_dir.join("decoder_model_merged.onnx").exists()
                    && model_dir.join("tokenizer.json").exists()
            })
            .count();

        if model_count == 0 {
            return Ok(ConnectionStatus {
                connected: false,
                language_count: 0,
                response_ms: 0,
                error: Some("No models downloaded".into()),
            });
        }

        let has_loaded = self.loaded.is_some();

        Ok(ConnectionStatus {
            connected: has_loaded,
            language_count: model_count,
            response_ms: 0,
            error: if has_loaded {
                None
            } else {
                Some("Models downloaded but none activated".into())
            },
        })
    }
}

// ── ONNX inference helpers ──

/// Load an ONNX session from a file path.
fn load_onnx_session(path: &std::path::Path) -> Result<ort::session::Session, String> {
    ort::session::Session::builder()
        .map_err(|e| format!("Failed to create session builder: {}", e))?
        .with_intra_threads(4)
        .map_err(|e| format!("Failed to set thread count: {}", e))?
        .commit_from_file(path)
        .map_err(|e| format!("Failed to load ONNX model {}: {}", path.display(), e))
}

/// Log session input/output names for debugging.
fn log_session_io(name: &str, session: &ort::session::Session) {
    let inputs: Vec<String> = session.inputs().iter().map(|i| i.name().to_string()).collect();
    let outputs: Vec<String> = session.outputs().iter().map(|o| o.name().to_string()).collect();
    log::info!("{} inputs: {:?}", name, inputs);
    log::info!("{} outputs: {:?}", name, outputs);
}

/// Extract EOS and decoder start token IDs from the tokenizer.
fn extract_special_tokens(tokenizer: &tokenizers::Tokenizer) -> (i64, i64) {
    // MarianMT convention: </s> is EOS (usually id=0), <pad> is decoder start
    let eos_id = tokenizer
        .token_to_id("</s>")
        .map(|id| id as i64)
        .unwrap_or(0);

    let pad_id = tokenizer
        .token_to_id("<pad>")
        .map(|id| id as i64)
        .unwrap_or(eos_id);

    // decoder_start_token_id is typically <pad> for MarianMT
    (eos_id, pad_id)
}

/// Run the full encoder-decoder translation on the current thread.
fn translate_blocking(text: &str, model: &mut LoadedModel) -> Result<String, String> {
    use ndarray::{Array2, ArrayD, IxDyn};

    // 1. Tokenize input
    let encoding = model
        .tokenizer
        .encode(text, true)
        .map_err(|e| format!("Tokenization failed: {}", e))?;

    let input_ids: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();
    let seq_len = input_ids.len();

    if seq_len == 0 {
        return Ok(String::new());
    }

    let input_ids_arr = Array2::from_shape_vec((1, seq_len), input_ids.clone())
        .map_err(|e| format!("Input tensor error: {}", e))?;

    let attention_mask_arr = Array2::from_shape_vec(
        (1, seq_len),
        vec![1i64; seq_len],
    )
    .map_err(|e| format!("Attention mask error: {}", e))?;

    // 2. Run encoder — build inputs as Vec<(Cow<str>, SessionInputValue)>
    let enc_ids_tensor = ort::value::Tensor::from_array(input_ids_arr.clone())
        .map_err(|e| format!("Encoder input_ids tensor: {}", e))?;
    let enc_mask_tensor = ort::value::Tensor::from_array(attention_mask_arr.clone())
        .map_err(|e| format!("Encoder attention_mask tensor: {}", e))?;

    let encoder_inputs: Vec<(
        std::borrow::Cow<'_, str>,
        ort::session::SessionInputValue<'_>,
    )> = vec![
        ("input_ids".into(), enc_ids_tensor.into()),
        ("attention_mask".into(), enc_mask_tensor.into()),
    ];

    let encoder_outputs = model
        .encoder
        .run(encoder_inputs)
        .map_err(|e| format!("Encoder inference failed: {}", e))?;

    // Extract encoder hidden states: (shape, &[f32])
    let (enc_shape, enc_data) = encoder_outputs[0]
        .try_extract_tensor::<f32>()
        .map_err(|e| format!("Failed to extract encoder output: {}", e))?;

    let enc_dims: Vec<usize> = enc_shape.iter().map(|&d| d as usize).collect();
    let encoder_hidden = ArrayD::from_shape_vec(IxDyn(&enc_dims), enc_data.to_vec())
        .map_err(|e| format!("Encoder output reshape: {}", e))?;

    // 3. Greedy decode loop
    let max_new_tokens = 512;
    let mut decoder_input_ids: Vec<i64> = vec![model.decoder_start_token_id];

    for _step in 0..max_new_tokens {
        let dec_len = decoder_input_ids.len();
        let dec_ids_arr = Array2::from_shape_vec(
            (1, dec_len),
            decoder_input_ids.clone(),
        )
        .map_err(|e| format!("Decoder input error: {}", e))?;

        // Build decoder inputs
        let dec_ids_tensor = ort::value::Tensor::from_array(dec_ids_arr)
            .map_err(|e| format!("Decoder input_ids tensor: {}", e))?;
        let dec_mask_tensor = ort::value::Tensor::from_array(attention_mask_arr.clone())
            .map_err(|e| format!("Decoder attention_mask tensor: {}", e))?;
        let dec_hidden_tensor = ort::value::Tensor::from_array(encoder_hidden.clone())
            .map_err(|e| format!("Decoder hidden_states tensor: {}", e))?;

        let decoder_inputs: Vec<(
            std::borrow::Cow<'_, str>,
            ort::session::SessionInputValue<'_>,
        )> = vec![
            ("input_ids".into(), dec_ids_tensor.into()),
            ("encoder_attention_mask".into(), dec_mask_tensor.into()),
            ("encoder_hidden_states".into(), dec_hidden_tensor.into()),
        ];

        let decoder_outputs = model
            .decoder
            .run(decoder_inputs)
            .map_err(|e| format!("Decoder inference failed: {}", e))?;

        // Extract logits: shape [1, dec_len, vocab_size]
        let (logits_shape, logits_data) = decoder_outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("Failed to extract decoder output: {}", e))?;

        let logits_dims: Vec<usize> = logits_shape.iter().map(|&d| d as usize).collect();
        let vocab_size = logits_dims.last().copied().unwrap_or(0);
        let last_pos = dec_len - 1;

        // argmax over vocabulary at the last position
        let offset = last_pos * vocab_size;
        let mut max_val = f32::NEG_INFINITY;
        let mut max_idx: i64 = 0;
        for i in 0..vocab_size {
            let val = logits_data[offset + i];
            if val > max_val {
                max_val = val;
                max_idx = i as i64;
            }
        }

        // Check for EOS
        if max_idx == model.eos_token_id {
            break;
        }

        decoder_input_ids.push(max_idx);
    }

    // 4. Decode output tokens (skip the start token)
    let output_tokens: Vec<u32> = decoder_input_ids[1..]
        .iter()
        .map(|&id| id as u32)
        .collect();

    let decoded = model
        .tokenizer
        .decode(&output_tokens, true)
        .map_err(|e| format!("Decoding failed: {}", e))?;

    Ok(decoded.trim().to_string())
}
