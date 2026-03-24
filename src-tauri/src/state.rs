use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex};

use crate::audio::AudioCaptureManager;
use crate::context::ContextManager;
use crate::credentials::CredentialManager;
use crate::db::DatabaseManager;
use crate::intelligence::IntelligenceEngine;
use crate::llm::openrouter_models::OpenRouterModelCache;
use crate::llm::LLMRouter;
use crate::rag::RagManager;
use crate::translation::TranslationRouter;
use crate::translation::opus_mt_manager::OpusMtManager;
use crate::stt::groq_whisper::GroqConfig;
use crate::stt::local_engines::ModelManager;
use crate::stt::provider::DualPassConfig;
use crate::stt::STTRouter;
use std::sync::RwLock;

/// Recording info captured when stop_capture runs, consumed by end_meeting
/// to trigger the post-meeting processing pipeline.
pub struct PendingRecording {
    /// Path to the raw WAV file
    pub wav_path: PathBuf,
    /// Unix epoch milliseconds when recording started
    pub start_time_ms: u64,
}

/// Active scenario prompts pushed from the frontend when a meeting starts.
/// The intelligence pipeline reads these instead of hardcoded prompt_templates.
pub struct ActiveScenario {
    pub system_prompt: String,
    pub summary_prompt: String,
    pub question_detection_prompt: String,
    pub speaker_context: String,
}

impl Default for ActiveScenario {
    fn default() -> Self {
        Self {
            system_prompt: String::new(),
            summary_prompt: String::new(),
            question_detection_prompt: String::new(),
            speaker_context: String::new(),
        }
    }
}

/// Central application state managed by Tauri.
/// Each manager is wrapped in Option<Arc<Mutex<>>> so sub-PRDs can
/// initialize their own managers independently.
///
/// Audio uses Arc<Mutex<Option<...>>> so commands can always acquire the lock
/// and then check/initialize the manager within.
pub struct AppState {
    pub database: Option<Arc<Mutex<DatabaseManager>>>,
    pub audio: Arc<Mutex<Option<AudioCaptureManager>>>,
    pub stt: Option<Arc<Mutex<STTRouter>>>,
    pub llm: Option<Arc<Mutex<LLMRouter>>>,
    pub intelligence: Option<Arc<Mutex<IntelligenceEngine>>>,
    pub context: Option<Arc<Mutex<ContextManager>>>,
    pub credentials: Option<Arc<Mutex<CredentialManager>>>,
    pub model_manager: Option<Arc<Mutex<ModelManager>>>,
    pub rag: Option<Arc<Mutex<RagManager>>>,
    pub translation: Option<Arc<Mutex<TranslationRouter>>>,
    pub opus_mt_manager: Option<Arc<Mutex<OpusMtManager>>>,
    pub whisper_config: Arc<RwLock<DualPassConfig>>,
    /// Shared Groq Whisper config — read by running providers on each API call,
    /// written by IPC commands. Allows live config updates mid-meeting.
    pub shared_groq_config: Arc<RwLock<GroqConfig>>,
    /// Universal pause threshold for transcript line-breaking (ms).
    /// Read lock-free by the system STT task; written by the settings IPC.
    pub pause_threshold_ms: Arc<AtomicU64>,
    /// Stop signal for the Live Monitor background thread.
    /// true = thread is running (keep looping); false = thread should stop.
    pub device_monitor_running: Arc<AtomicBool>,
    /// Per-party mute flags — when true, audio is NOT forwarded to the STT engine.
    /// Audio levels + recording continue unaffected.
    pub you_muted: Arc<AtomicBool>,
    pub them_muted: Arc<AtomicBool>,
    /// Original default capture endpoint ID saved before IPolicyConfig override.
    /// Set when Web Speech / Windows Speech uses a non-default device; restored on stop.
    pub original_default_device: Arc<Mutex<Option<String>>>,
    /// Resolved Windows endpoint ID of the IPolicyConfig target device.
    /// Set alongside original_default_device; used by ensure_ipolicy_override
    /// to verify the OS default hasn't drifted.
    pub ipolicy_target_endpoint: Arc<Mutex<Option<String>>>,
    /// Active scenario prompts — pushed by the frontend at meeting start.
    /// Intelligence pipeline reads these for scenario-aware prompt assembly.
    pub active_scenario: Arc<RwLock<ActiveScenario>>,
    /// Recording info stored by stop_capture, consumed by end_meeting.
    /// This bridges the gap: frontend calls stopCapture() then endMeeting()
    /// in sequence; by the time end_meeting runs the recorder is stopped and
    /// the WAV path + start time are waiting here.
    pub pending_recording: Arc<Mutex<Option<PendingRecording>>>,
    /// In-memory cache for OpenRouter model catalog (TTL: 4 hours).
    pub openrouter_cache: Arc<Mutex<Option<OpenRouterModelCache>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            database: None,
            audio: Arc::new(Mutex::new(Some(AudioCaptureManager::new()))),
            stt: None,
            llm: None,
            intelligence: None,
            context: None,
            credentials: None,
            model_manager: None,
            rag: None,
            translation: None,
            opus_mt_manager: None,
            whisper_config: Arc::new(RwLock::new(DualPassConfig::default())),
            shared_groq_config: Arc::new(RwLock::new(GroqConfig::default())),
            pause_threshold_ms: Arc::new(AtomicU64::new(3000)),
            device_monitor_running: Arc::new(AtomicBool::new(false)),
            you_muted: Arc::new(AtomicBool::new(false)),
            them_muted: Arc::new(AtomicBool::new(false)),
            original_default_device: Arc::new(Mutex::new(None)),
            ipolicy_target_endpoint: Arc::new(Mutex::new(None)),
            active_scenario: Arc::new(RwLock::new(ActiveScenario::default())),
            pending_recording: Arc::new(Mutex::new(None)),
            openrouter_cache: Arc::new(Mutex::new(None)),
        }
    }
}

// Safety: AppState is only accessed through Tauri's managed state with proper synchronization
unsafe impl Send for AppState {}
unsafe impl Sync for AppState {}
