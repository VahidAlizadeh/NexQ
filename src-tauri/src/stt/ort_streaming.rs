// ONNX Runtime in-process streaming STT provider.
//
// Loads streaming transducer ONNX models (encoder, decoder, joiner) via the
// `ort` crate and runs inference on a dedicated std::thread.
//
// Key fixes over the original implementation:
// - Uses log-mel filterbank features (80-dim) instead of raw PCM
// - Manages encoder state tensors across chunks for streaming
// - Discovers model files by pattern instead of hardcoded names
// - Surfaces all errors to the frontend dev log via emit_stt_debug

use async_trait::async_trait;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::mpsc;

use crate::audio::AudioChunk;
use crate::stt::provider::{STTProvider, STTProviderType, TranscriptResult};

/// Audio sample rate expected by the models.
const SAMPLE_RATE: u32 = 16_000;

/// Chunk size in samples: 320ms at 16kHz = 5120 samples.
const CHUNK_SAMPLES: usize = (SAMPLE_RATE as usize) * 320 / 1000;

/// Number of consecutive blank tokens before we consider a segment boundary.
/// Zipformer downsamples ~4x, so each output frame ≈ 40ms.
/// 75 blanks ≈ 3 seconds of silence before splitting segments.
const BLANK_THRESHOLD: usize = 75;

/// The blank token ID used by most transducer vocabularies (token 0).
const BLANK_ID: i64 = 0;

/// Messages from feed_audio to the inference thread.
enum AudioMessage {
    Samples(Vec<i16>),
    Stop,
}

/// ORT Streaming STT provider.
pub struct OrtStreamingSTT {
    model_dir: PathBuf,
    language: String,
    is_streaming: bool,
    result_tx: Option<mpsc::Sender<TranscriptResult>>,
    stop_flag: Arc<AtomicBool>,
    audio_tx: Option<std::sync::mpsc::Sender<AudioMessage>>,
    inference_thread: Option<std::thread::JoinHandle<()>>,
    segment_counter: u64,
    app_handle: Option<AppHandle>,
}

impl OrtStreamingSTT {
    pub fn new(model_dir: PathBuf) -> Self {
        Self {
            model_dir,
            language: "en".to_string(),
            is_streaming: false,
            result_tx: None,
            stop_flag: Arc::new(AtomicBool::new(false)),
            audio_tx: None,
            inference_thread: None,
            segment_counter: 0,
            app_handle: None,
        }
    }

    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }
}

#[async_trait]
impl STTProvider for OrtStreamingSTT {
    fn provider_name(&self) -> &str {
        "ORT Streaming"
    }

    fn provider_type(&self) -> STTProviderType {
        STTProviderType::OrtStreaming
    }

    async fn start_stream(
        &mut self,
        result_tx: mpsc::Sender<TranscriptResult>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if self.is_streaming {
            return Err("Stream already active".into());
        }

        // Discover model files by pattern (handles epoch-based naming)
        let model_files =
            crate::stt::local_engines::model_discovery::discover_model_files(&self.model_dir)
                .map_err(|e| format!("Model discovery failed in {}: {}", self.model_dir.display(), e))?;

        log::info!(
            "OrtStreamingSTT: Discovered models in {} — encoder={}, decoder={}, joiner={}",
            self.model_dir.display(),
            model_files.encoder.file_name().unwrap_or_default().to_string_lossy(),
            model_files.decoder.file_name().unwrap_or_default().to_string_lossy(),
            model_files.joiner.file_name().unwrap_or_default().to_string_lossy(),
        );

        self.stop_flag.store(false, AtomicOrdering::SeqCst);

        let (audio_tx, audio_rx) = std::sync::mpsc::channel::<AudioMessage>();
        self.audio_tx = Some(audio_tx);
        self.result_tx = Some(result_tx.clone());

        let model_dir = self.model_dir.clone();
        let language = self.language.clone();
        let stop_flag = Arc::clone(&self.stop_flag);
        let seg_start = self.segment_counter;
        let app_handle = self.app_handle.clone();
        let encoder_path = model_files.encoder.clone();
        let decoder_path = model_files.decoder.clone();
        let joiner_path = model_files.joiner.clone();
        let tokens_path = model_files.tokens.clone();

        let thread = std::thread::Builder::new()
            .name("ort-stt-inference".to_string())
            .spawn(move || {
                inference_thread_main(
                    model_dir,
                    encoder_path,
                    decoder_path,
                    joiner_path,
                    tokens_path,
                    language,
                    stop_flag,
                    audio_rx,
                    result_tx,
                    seg_start,
                    app_handle,
                );
            })?;

        self.inference_thread = Some(thread);
        self.is_streaming = true;

        log::info!("OrtStreamingSTT: Stream started");
        Ok(())
    }

    async fn feed_audio(
        &mut self,
        chunk: AudioChunk,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if !self.is_streaming {
            return Ok(());
        }

        if chunk.pcm_data.is_empty() {
            return Ok(());
        }

        if let Some(ref tx) = self.audio_tx {
            if tx.send(AudioMessage::Samples(chunk.pcm_data)).is_err() {
                log::warn!("OrtStreamingSTT: Audio channel closed");
                self.is_streaming = false;
            }
        }

        Ok(())
    }

    async fn stop_stream(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if !self.is_streaming {
            return Ok(());
        }

        log::info!("OrtStreamingSTT: Stopping stream");

        self.stop_flag.store(true, AtomicOrdering::SeqCst);

        // Send stop signal and drop channel
        if let Some(tx) = self.audio_tx.take() {
            let _ = tx.send(AudioMessage::Stop);
        }

        // Wait for inference thread
        if let Some(thread) = self.inference_thread.take() {
            let _ = thread.join();
        }

        self.is_streaming = false;
        self.result_tx = None;

        log::info!("OrtStreamingSTT: Stream stopped");
        Ok(())
    }

    async fn test_connection(&self) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        match crate::stt::local_engines::model_discovery::discover_model_files(&self.model_dir) {
            Ok(_) => Ok(true),
            Err(e) => Err(format!("Model files not found: {}", e).into()),
        }
    }

    fn set_language(&mut self, language: &str) {
        self.language = language
            .split('-')
            .next()
            .unwrap_or(language)
            .to_string();
        log::info!("OrtStreamingSTT: Language set to {}", self.language);
    }
}

/// Load tokens from tokens.txt. Format: one token per line, either
/// "token_text id" or just "token_text" (index = line number).
fn load_tokens(path: &std::path::Path) -> Result<HashMap<i64, String>, String> {
    use std::io::{BufRead, BufReader};

    let file = std::fs::File::open(path)
        .map_err(|e| format!("Failed to open tokens file: {}", e))?;
    let reader = BufReader::new(file);

    let mut tokens = HashMap::new();
    for (idx, line) in reader.lines().enumerate() {
        let line = line.map_err(|e| format!("Failed to read tokens line: {}", e))?;
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }

        // Try "token_text id" format first
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            if let Ok(id) = parts.last().unwrap().parse::<i64>() {
                let text = parts[..parts.len() - 1].join(" ");
                tokens.insert(id, text);
                continue;
            }
        }
        // Fallback: line number is the ID
        tokens.insert(idx as i64, line);
    }

    Ok(tokens)
}

/// Decode a sequence of token IDs into text.
/// Applies sentence casing since some model vocabularies are ALL CAPS.
fn detokenize(token_ids: &[i64], vocab: &HashMap<i64, String>) -> String {
    let mut result = String::new();
    for &id in token_ids {
        if id == BLANK_ID {
            continue;
        }
        if let Some(text) = vocab.get(&id) {
            let cleaned = text
                .replace('\u{2581}', " ")
                .replace("▁", " ");
            result.push_str(&cleaned);
        }
    }
    let trimmed = result.trim().to_string();
    // Sentence-case: lowercase everything, then capitalize first character
    let lower = trimmed.to_lowercase();
    let mut chars = lower.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().to_string() + chars.as_str(),
    }
}

/// State tensor that can be either f32 or i64 (matching model expectations).
enum StateTensor {
    F32(ndarray::ArrayD<f32>),
    I64(ndarray::ArrayD<i64>),
}

/// Encoder state manager for streaming transducer models.
///
/// At load time, introspects the ONNX model's inputs/outputs to discover:
/// - Which inputs are audio features vs. cached states
/// - How state inputs map to state outputs (by "new_" prefix convention)
/// - The shape and element type of each state tensor (for zero-initialization)
/// - The required number of time frames per chunk (fixed models like zipformer)
struct EncoderStateManager {
    /// State tensor data, keyed by input name (supports mixed f32/i64 types).
    states: HashMap<String, StateTensor>,
    /// (input_name, output_name) pairs for state tensors.
    state_pairs: Vec<(String, String)>,
    /// Name of the audio feature input (e.g., "x").
    audio_input_name: String,
    /// Name of the audio length input (e.g., "x_lens").
    lens_input_name: Option<String>,
    /// All input names in session order (for positional building).
    input_order: Vec<String>,
    /// All output names in session order.
    output_order: Vec<String>,
    /// Indices of encoder output tensors (non-state outputs).
    encoder_out_indices: Vec<usize>,
    /// Required number of time frames per encoder call (from model shape).
    required_chunk_frames: usize,
}

impl EncoderStateManager {
    /// Discover model structure and initialize states from a loaded encoder session.
    fn discover(session: &ort::session::Session) -> Result<Self, String> {
        let mut audio_input_name = String::new();
        let mut lens_input_name: Option<String> = None;
        let mut state_input_names: Vec<String> = Vec::new();
        let mut input_order: Vec<String> = Vec::new();

        // The required time dimension for the audio input (extracted from model shape).
        let mut required_chunk_frames: usize = 0;

        // Classify inputs
        for input in session.inputs() {
            let name = input.name().to_string();
            input_order.push(name.clone());

            if let ort::value::ValueType::Tensor { shape, .. } = input.dtype() {
                if shape.len() == 3 && shape.last() == Some(&80) {
                    // Audio features: [batch, time, 80]
                    audio_input_name = name;
                    // Extract the required time dimension (shape[1])
                    let time_dim = shape[1];
                    if time_dim > 0 {
                        required_chunk_frames = time_dim as usize;
                    }
                } else if shape.len() == 1
                    && (name.contains("len") || name == "x_lens")
                {
                    lens_input_name = Some(name);
                } else {
                    state_input_names.push(name);
                }
            }
        }

        // Fallback: if no input matched the [_, _, 80] pattern, use first input
        if audio_input_name.is_empty() {
            if let Some(first) = input_order.first() {
                log::warn!(
                    "OrtStreamingSTT: No [_, _, 80] input found, using first input '{}' as audio",
                    first
                );
                audio_input_name = first.clone();
                state_input_names.retain(|n| n != first);
            }
        }

        // Classify outputs
        let mut output_order: Vec<String> = Vec::new();
        let mut state_output_names: Vec<String> = Vec::new();
        let mut encoder_out_indices: Vec<usize> = Vec::new();

        for (idx, output) in session.outputs().iter().enumerate() {
            let name = output.name().to_string();
            output_order.push(name.clone());

            let is_state = state_input_names.iter().any(|inp| {
                name == format!("new_{}", inp)
                    || name.strip_prefix("new_").map_or(false, |s| s == inp)
            });

            if is_state {
                state_output_names.push(name);
            } else {
                encoder_out_indices.push(idx);
            }
        }

        // Build state pairs: (input_name, output_name)
        let mut state_pairs: Vec<(String, String)> = Vec::new();
        for inp_name in &state_input_names {
            let out_name = format!("new_{}", inp_name);
            if state_output_names.contains(&out_name) {
                state_pairs.push((inp_name.clone(), out_name));
            }
        }

        // Initialize state tensors to zeros (type-aware: f32 or i64)
        let mut states: HashMap<String, StateTensor> = HashMap::new();
        for input in session.inputs() {
            let inp_name = input.name().to_string();
            if state_input_names.contains(&inp_name) {
                if let ort::value::ValueType::Tensor { ty, shape, .. } = input.dtype() {
                    let dims: Vec<usize> = shape
                        .iter()
                        .map(|&d| if d <= 0 { 1 } else { d as usize })
                        .collect();
                    let state = if *ty == ort::value::TensorElementType::Int64 {
                        StateTensor::I64(ndarray::ArrayD::zeros(ndarray::IxDyn(&dims)))
                    } else {
                        StateTensor::F32(ndarray::ArrayD::zeros(ndarray::IxDyn(&dims)))
                    };
                    states.insert(inp_name, state);
                }
            }
        }

        // Default to 39 if model has dynamic shape (0 or negative)
        if required_chunk_frames == 0 {
            required_chunk_frames = 39;
            log::info!("EncoderState: dynamic time dim, defaulting to {} frames", required_chunk_frames);
        }

        let i64_count = states.values().filter(|s| matches!(s, StateTensor::I64(_))).count();
        let f32_count = states.values().filter(|s| matches!(s, StateTensor::F32(_))).count();
        log::info!(
            "EncoderState: audio='{}', lens={:?}, {} state pairs ({} f32, {} i64), {} encoder outputs, chunk={}frames",
            audio_input_name,
            lens_input_name,
            state_pairs.len(),
            f32_count,
            i64_count,
            encoder_out_indices.len(),
            required_chunk_frames,
        );

        Ok(Self {
            states,
            state_pairs,
            audio_input_name,
            lens_input_name,
            input_order,
            output_order,
            encoder_out_indices,
            required_chunk_frames,
        })
    }

    /// Run encoder with feature frames and manage state tensors.
    fn run_encoder(
        &mut self,
        session: &mut ort::session::Session,
        features: &[Vec<f32>],
    ) -> Result<Vec<Vec<f32>>, String> {
        if features.is_empty() {
            return Ok(vec![]);
        }

        let num_frames = features.len();

        // Build feature tensor [1, num_frames, 80]
        let flat: Vec<f32> = features.iter().flatten().copied().collect();
        let feature_arr = ndarray::Array3::from_shape_vec((1, num_frames, 80), flat)
            .map_err(|e| format!("feature shape: {}", e))?;

        // Build lens tensor [1]
        let lens_arr = ndarray::Array1::from_vec(vec![num_frames as i64]);

        // Build named input values: Vec<(Cow<str>, SessionInputValue)>
        let mut input_values: Vec<(
            std::borrow::Cow<'_, str>,
            ort::session::SessionInputValue<'_>,
        )> = Vec::new();

        for name in &self.input_order {
            if *name == self.audio_input_name {
                let tensor = ort::value::Tensor::from_array(feature_arr.clone())
                    .map_err(|e| format!("audio tensor: {}", e))?;
                input_values.push((name.clone().into(), tensor.into()));
            } else if self.lens_input_name.as_ref() == Some(name) {
                let tensor = ort::value::Tensor::from_array(lens_arr.clone())
                    .map_err(|e| format!("lens tensor: {}", e))?;
                input_values.push((name.clone().into(), tensor.into()));
            } else if let Some(state_tensor) = self.states.get(name) {
                match state_tensor {
                    StateTensor::F32(arr) => {
                        let tensor = ort::value::Tensor::from_array(arr.clone())
                            .map_err(|e| format!("state '{}' (f32): {}", name, e))?;
                        input_values.push((name.clone().into(), tensor.into()));
                    }
                    StateTensor::I64(arr) => {
                        let tensor = ort::value::Tensor::from_array(arr.clone())
                            .map_err(|e| format!("state '{}' (i64): {}", name, e))?;
                        input_values.push((name.clone().into(), tensor.into()));
                    }
                }
            }
        }

        let outputs = session
            .run(input_values)
            .map_err(|e| format!("encoder run: {}", e))?;

        // Extract encoder output frames from the first encoder output index
        let mut frames = Vec::new();
        if let Some(&out_idx) = self.encoder_out_indices.first() {
            let (shape, flat_out) = outputs[out_idx]
                .try_extract_tensor::<f32>()
                .map_err(|e| format!("encoder output extract: {}", e))?;

            let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();
            let time_out = if dims.len() >= 2 { dims[1] } else { 1 };
            let enc_dim = if dims.len() >= 3 {
                dims[2]
            } else {
                flat_out.len() / time_out.max(1)
            };

            for t in 0..time_out {
                let start = t * enc_dim;
                let end = start + enc_dim;
                if end <= flat_out.len() {
                    frames.push(flat_out[start..end].to_vec());
                }
            }
        }

        // Update states from outputs (type-aware: match input type)
        for (input_name, output_name) in &self.state_pairs {
            if let Some(out_idx) = self.output_order.iter().position(|n| n == output_name) {
                if out_idx < outputs.len() {
                    let is_i64 = matches!(self.states.get(input_name), Some(StateTensor::I64(_)));
                    let new_state = if is_i64 {
                        let (shape, data) = outputs[out_idx]
                            .try_extract_tensor::<i64>()
                            .map_err(|e| format!("state output '{}' (i64): {}", output_name, e))?;
                        let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();
                        StateTensor::I64(
                            ndarray::ArrayD::from_shape_vec(ndarray::IxDyn(&dims), data.to_vec())
                                .map_err(|e| format!("state reshape '{}': {}", input_name, e))?,
                        )
                    } else {
                        let (shape, data) = outputs[out_idx]
                            .try_extract_tensor::<f32>()
                            .map_err(|e| format!("state output '{}' (f32): {}", output_name, e))?;
                        let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();
                        StateTensor::F32(
                            ndarray::ArrayD::from_shape_vec(ndarray::IxDyn(&dims), data.to_vec())
                                .map_err(|e| format!("state reshape '{}': {}", input_name, e))?,
                        )
                    };
                    self.states.insert(input_name.clone(), new_state);
                }
            }
        }

        Ok(frames)
    }
}

/// Main inference thread function.
fn inference_thread_main(
    _model_dir: PathBuf,
    encoder_path: PathBuf,
    decoder_path: PathBuf,
    joiner_path: PathBuf,
    tokens_path: PathBuf,
    language: String,
    stop_flag: Arc<AtomicBool>,
    audio_rx: std::sync::mpsc::Receiver<AudioMessage>,
    result_tx: mpsc::Sender<TranscriptResult>,
    segment_counter_start: u64,
    app_handle: Option<AppHandle>,
) {
    // Helper to emit both to Rust log and frontend dev log
    let debug = |level: &str, msg: &str| {
        match level {
            "error" => log::error!("[ort_streaming] {}", msg),
            "warn" => log::warn!("[ort_streaming] {}", msg),
            _ => log::info!("[ort_streaming] {}", msg),
        }
        if let Some(ref handle) = app_handle {
            crate::stt::emit_stt_debug(handle, level, "ort_streaming", msg);
        }
    };

    debug("info", "Inference thread started, loading models...");

    // Load tokens
    let tokens = match load_tokens(&tokens_path) {
        Ok(t) => {
            debug("info", &format!("Loaded {} tokens", t.len()));
            t
        }
        Err(e) => {
            debug("error", &format!("Failed to load tokens: {}", e));
            return;
        }
    };

    // Load ORT sessions (mut required for session.run())
    let mut encoder = match load_ort_session(&encoder_path) {
        Ok(s) => s,
        Err(e) => {
            debug("error", &format!("Encoder load failed: {}", e));
            return;
        }
    };
    let mut decoder = match load_ort_session(&decoder_path) {
        Ok(s) => s,
        Err(e) => {
            debug("error", &format!("Decoder load failed: {}", e));
            return;
        }
    };
    let mut joiner = match load_ort_session(&joiner_path) {
        Ok(s) => s,
        Err(e) => {
            debug("error", &format!("Joiner load failed: {}", e));
            return;
        }
    };

    // Initialize encoder state manager (introspects model inputs/outputs)
    let mut state_mgr = match EncoderStateManager::discover(&encoder) {
        Ok(s) => s,
        Err(e) => {
            debug(
                "error",
                &format!("Encoder state discovery failed: {}", e),
            );
            return;
        }
    };

    debug(
        "info",
        &format!(
            "Models loaded successfully: {} state inputs, {} tokens",
            state_mgr.states.len(),
            tokens.len()
        ),
    );

    // Initialize Fbank feature extractor
    let mut fbank = crate::stt::fbank::FbankExtractor::new();

    // Buffer for accumulating Fbank frames until we have enough for one encoder call
    let mut feature_buffer: Vec<Vec<f32>> = Vec::new();
    let chunk_frames = state_mgr.required_chunk_frames;

    debug(
        "info",
        &format!(
            "Encoder requires {} frames per chunk ({:.0}ms)",
            chunk_frames,
            chunk_frames as f64 * 10.0
        ),
    );

    // Helper: current epoch time in milliseconds (matches frontend Date.now())
    let epoch_ms = || -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    };

    // Decode state
    let mut pcm_buffer: Vec<f32> = Vec::new();
    let mut emitted_tokens: Vec<i64> = Vec::new();
    let mut segment_counter = segment_counter_start;
    let mut consecutive_blanks: usize = 0;
    let mut first_transcription = true;

    // Main decode loop
    loop {
        if stop_flag.load(AtomicOrdering::SeqCst) {
            break;
        }

        // Receive audio with timeout
        match audio_rx.recv_timeout(std::time::Duration::from_millis(100)) {
            Ok(AudioMessage::Samples(samples)) => {
                for &s in &samples {
                    pcm_buffer.push(s as f32 / 32768.0);
                }
            }
            Ok(AudioMessage::Stop) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }

        // Extract Fbank frames from available PCM and accumulate in feature_buffer
        while pcm_buffer.len() >= CHUNK_SAMPLES {
            let chunk: Vec<f32> = pcm_buffer.drain(..CHUNK_SAMPLES).collect();
            let new_frames = fbank.process_chunk(&chunk);
            feature_buffer.extend(new_frames);
        }

        // Process encoder when we have accumulated enough frames
        while feature_buffer.len() >= chunk_frames {
            let chunk: Vec<Vec<f32>> = feature_buffer.drain(..chunk_frames).collect();

            // Run encoder with state management
            let encoder_frames = match state_mgr.run_encoder(&mut encoder, &chunk) {
                Ok(frames) => frames,
                Err(e) => {
                    debug("error", &format!("Encoder error: {}", e));
                    continue;
                }
            };

            // Process each encoder output frame through the transducer
            for enc_frame in &encoder_frames {
                // Run decoder on current context
                let decoder_out = match run_decoder(&mut decoder, &emitted_tokens) {
                    Ok(out) => out,
                    Err(e) => {
                        debug("error", &format!("Decoder error: {}", e));
                        continue;
                    }
                };

                // Run joiner
                let logits = match run_joiner(&mut joiner, enc_frame, &decoder_out) {
                    Ok(l) => l,
                    Err(e) => {
                        debug("error", &format!("Joiner error: {}", e));
                        continue;
                    }
                };

                // Greedy decode: argmax
                let top_token = logits
                    .iter()
                    .enumerate()
                    .max_by(|(_, a), (_, b)| {
                        a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal)
                    })
                    .map(|(idx, _)| idx as i64)
                    .unwrap_or(BLANK_ID);

                if top_token != BLANK_ID {
                    emitted_tokens.push(top_token);
                    consecutive_blanks = 0;

                    // Emit interim result
                    let text = detokenize(&emitted_tokens, &tokens);
                    if !text.is_empty() {
                        if first_transcription {
                            debug("info", "First transcription produced");
                            first_transcription = false;
                        }
                        let seg_id = format!("ort_{}", segment_counter);
                        let _ = result_tx.blocking_send(TranscriptResult {
                            text,
                            is_final: false,
                            confidence: 0.80,
                            timestamp_ms: epoch_ms(),
                            speaker: None,
                            language: Some(language.clone()),
                            segment_id: Some(seg_id),
                        });
                    }
                } else {
                    consecutive_blanks += 1;

                    // Segment boundary: too many blanks
                    if consecutive_blanks >= BLANK_THRESHOLD && !emitted_tokens.is_empty() {
                        let text = detokenize(&emitted_tokens, &tokens);
                        if !text.is_empty() {
                            let seg_id = format!("ort_{}", segment_counter);
                            let _ = result_tx.blocking_send(TranscriptResult {
                                text,
                                is_final: true,
                                confidence: 0.90,
                                timestamp_ms: epoch_ms(),
                                speaker: None,
                                language: Some(language.clone()),
                                segment_id: Some(seg_id),
                            });
                        }

                        // Reset for next segment
                        emitted_tokens.clear();
                        consecutive_blanks = 0;
                        segment_counter += 1;
                    }
                }
            }
        }
    }

    // Flush remaining tokens
    if !emitted_tokens.is_empty() {
        let text = detokenize(&emitted_tokens, &tokens);
        if !text.is_empty() {
            let seg_id = format!("ort_{}", segment_counter);
            let _ = result_tx.blocking_send(TranscriptResult {
                text,
                is_final: true,
                confidence: 0.85,
                timestamp_ms: epoch_ms(),
                speaker: None,
                language: Some(language),
                segment_id: Some(seg_id),
            });
        }
    }

    debug("info", "Inference thread exiting");
}

/// Load an ORT session from a file.
fn load_ort_session(path: &std::path::Path) -> Result<ort::session::Session, String> {
    let filename = path.file_name().unwrap_or_default().to_string_lossy();

    let session = ort::session::Session::builder()
        .map_err(|e| format!("Session builder error: {}", e))?
        .with_intra_threads(4)
        .map_err(|e| format!("Thread config error: {}", e))?
        .commit_from_file(path)
        .map_err(|e| format!("Failed to load {}: {}", filename, e))?;

    log::info!(
        "OrtStreamingSTT: Loaded {} ({} inputs, {} outputs)",
        filename,
        session.inputs().len(),
        session.outputs().len(),
    );
    Ok(session)
}

/// Run decoder on current token context.
fn run_decoder(
    session: &mut ort::session::Session,
    token_context: &[i64],
) -> Result<Vec<f32>, String> {
    use ort::value::Tensor;

    // Use last 2 tokens (or pad with blanks)
    let context: Vec<i64> = if token_context.len() >= 2 {
        token_context[token_context.len() - 2..].to_vec()
    } else {
        let mut ctx = vec![BLANK_ID; 2];
        for (i, &t) in token_context.iter().rev().enumerate() {
            if i < 2 {
                ctx[1 - i] = t;
            }
        }
        ctx
    };

    let arr = ndarray::Array2::from_shape_vec((1, context.len()), context)
        .map_err(|e| format!("decoder input shape error: {}", e))?;
    let input = Tensor::from_array(arr)
        .map_err(|e| format!("decoder tensor creation failed: {}", e))?;

    let outputs = session
        .run(ort::inputs![input])
        .map_err(|e| format!("decoder inference failed: {}", e))?;

    let (_shape, data) = outputs[0]
        .try_extract_tensor::<f32>()
        .map_err(|e| format!("decoder output extraction failed: {}", e))?;

    Ok(data.to_vec())
}

/// Run joiner on encoder frame + decoder output to get logits.
fn run_joiner(
    session: &mut ort::session::Session,
    encoder_frame: &[f32],
    decoder_out: &[f32],
) -> Result<Vec<f32>, String> {
    use ort::value::Tensor;

    let enc_dim = encoder_frame.len();
    let dec_dim = decoder_out.len();

    let enc_arr =
        ndarray::Array2::from_shape_vec((1, enc_dim), encoder_frame.to_vec())
            .map_err(|e| format!("joiner enc shape error: {}", e))?;
    let dec_arr =
        ndarray::Array2::from_shape_vec((1, dec_dim), decoder_out.to_vec())
            .map_err(|e| format!("joiner dec shape error: {}", e))?;

    let enc = Tensor::from_array(enc_arr)
        .map_err(|e| format!("joiner enc tensor failed: {}", e))?;
    let dec = Tensor::from_array(dec_arr)
        .map_err(|e| format!("joiner dec tensor failed: {}", e))?;

    let outputs = session
        .run(ort::inputs![enc, dec])
        .map_err(|e| format!("joiner inference failed: {}", e))?;

    let (_shape, data) = outputs[0]
        .try_extract_tensor::<f32>()
        .map_err(|e| format!("joiner output extraction failed: {}", e))?;

    Ok(data.to_vec())
}
