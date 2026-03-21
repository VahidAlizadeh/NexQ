use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex};

use crate::audio::AudioCaptureManager;
use crate::context::ContextManager;
use crate::credentials::CredentialManager;
use crate::db::DatabaseManager;
use crate::intelligence::IntelligenceEngine;
use crate::llm::LLMRouter;
use crate::rag::RagManager;
use crate::stt::groq_whisper::GroqConfig;
use crate::stt::local_engines::ModelManager;
use crate::stt::provider::DualPassConfig;
use crate::stt::STTRouter;
use std::sync::RwLock;

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
            whisper_config: Arc::new(RwLock::new(DualPassConfig::default())),
            shared_groq_config: Arc::new(RwLock::new(GroqConfig::default())),
            pause_threshold_ms: Arc::new(AtomicU64::new(3000)),
            device_monitor_running: Arc::new(AtomicBool::new(false)),
            you_muted: Arc::new(AtomicBool::new(false)),
            them_muted: Arc::new(AtomicBool::new(false)),
            original_default_device: Arc::new(Mutex::new(None)),
        }
    }
}

// Safety: AppState is only accessed through Tauri's managed state with proper synchronization
unsafe impl Send for AppState {}
unsafe impl Sync for AppState {}
