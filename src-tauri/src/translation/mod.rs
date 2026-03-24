// src-tauri/src/translation/mod.rs
pub mod microsoft;
pub mod google;
pub mod deepl;
pub mod opus_mt;
pub mod llm_provider;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use std::sync::Arc;

// ── Error types ──

#[derive(Debug, thiserror::Error)]
pub enum TranslationError {
    #[error("HTTP request failed: {0}")]
    Http(String),
    #[error("Provider not configured: {0}")]
    NotConfigured(String),
    #[error("API key missing for provider: {0}")]
    NoApiKey(String),
    #[error("Language not supported: {0}")]
    UnsupportedLanguage(String),
    #[error("Rate limit exceeded")]
    RateLimited,
    #[error("Translation failed: {0}")]
    Failed(String),
}

impl Serialize for TranslationError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        serializer.serialize_str(&self.to_string())
    }
}

// ── Shared types ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TranslationProviderType {
    Microsoft,
    Google,
    Deepl,
    OpusMt,
    Llm,
}

impl std::fmt::Display for TranslationProviderType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Microsoft => write!(f, "microsoft"),
            Self::Google => write!(f, "google"),
            Self::Deepl => write!(f, "deepl"),
            Self::OpusMt => write!(f, "opus-mt"),
            Self::Llm => write!(f, "llm"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationResult {
    pub segment_id: Option<String>,
    pub original_text: String,
    pub translated_text: String,
    pub source_lang: String,
    pub target_lang: String,
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedLanguage {
    pub lang: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Language {
    pub code: String,
    pub name: String,
    pub native_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub connected: bool,
    pub language_count: usize,
    pub response_ms: u64,
    pub error: Option<String>,
}

// ── Provider trait ──

#[async_trait]
pub trait TranslationProvider: Send + Sync {
    fn provider_name(&self) -> &str;
    fn provider_type(&self) -> TranslationProviderType;
    fn is_local(&self) -> bool;

    async fn translate(
        &self,
        text: &str,
        source: Option<&str>,
        target: &str,
    ) -> Result<String, TranslationError>;

    async fn translate_batch(
        &self,
        texts: &[String],
        source: Option<&str>,
        target: &str,
    ) -> Result<Vec<String>, TranslationError> {
        // Default: translate one by one. Providers can override with native batch.
        let mut results = Vec::with_capacity(texts.len());
        for text in texts {
            results.push(self.translate(text, source, target).await?);
        }
        Ok(results)
    }

    async fn detect_language(&self, text: &str) -> Result<DetectedLanguage, TranslationError>;

    async fn supported_languages(&self) -> Result<Vec<Language>, TranslationError>;

    async fn test_connection(&self) -> Result<ConnectionStatus, TranslationError>;
}

// ── In-memory LRU cache for ad-hoc translations ──

struct CacheEntry {
    translated_text: String,
}

pub struct TranslationCache {
    map: HashMap<(u64, String), CacheEntry>,
    order: Vec<(u64, String)>,
    max_size: usize,
}

impl TranslationCache {
    pub fn new(max_size: usize) -> Self {
        Self {
            map: HashMap::new(),
            order: Vec::new(),
            max_size,
        }
    }

    fn text_hash(text: &str) -> u64 {
        let mut hasher = DefaultHasher::new();
        text.hash(&mut hasher);
        hasher.finish()
    }

    pub fn get(&self, text: &str, target_lang: &str) -> Option<&str> {
        let key = (Self::text_hash(text), target_lang.to_string());
        self.map.get(&key).map(|e| e.translated_text.as_str())
    }

    pub fn insert(&mut self, text: &str, target_lang: &str, translated: String) {
        let key = (Self::text_hash(text), target_lang.to_string());
        if self.map.contains_key(&key) {
            return;
        }
        if self.map.len() >= self.max_size {
            if let Some(oldest) = self.order.first().cloned() {
                self.map.remove(&oldest);
                self.order.remove(0);
            }
        }
        self.order.push(key.clone());
        self.map.insert(key, CacheEntry { translated_text: translated });
    }
}

// ── Router ──

pub struct TranslationRouter {
    active_provider: Option<Arc<dyn TranslationProvider>>,
    active_type: Option<TranslationProviderType>,
    consecutive_failures: u32,
    cache: TranslationCache,
    // Cached API keys (loaded from CredentialManager)
    microsoft_api_key: Option<String>,
    microsoft_region: Option<String>,
    google_api_key: Option<String>,
    deepl_api_key: Option<String>,
}

impl TranslationRouter {
    pub fn new() -> Self {
        Self {
            active_provider: None,
            active_type: None,
            consecutive_failures: 0,
            cache: TranslationCache::new(1000),
            microsoft_api_key: None,
            microsoft_region: None,
            google_api_key: None,
            deepl_api_key: None,
        }
    }

    pub fn active_type(&self) -> Option<&TranslationProviderType> {
        self.active_type.as_ref()
    }

    pub fn set_microsoft_credentials(&mut self, key: String, region: Option<String>) {
        self.microsoft_api_key = Some(key);
        self.microsoft_region = region;
    }

    pub fn set_google_credentials(&mut self, key: String) {
        self.google_api_key = Some(key);
    }

    pub fn set_deepl_credentials(&mut self, key: String) {
        self.deepl_api_key = Some(key);
    }

    pub fn set_provider(
        &mut self,
        provider_type: TranslationProviderType,
    ) -> Result<(), TranslationError> {
        let provider: Box<dyn TranslationProvider> = match provider_type {
            TranslationProviderType::Microsoft => {
                let key = self.microsoft_api_key.clone()
                    .ok_or_else(|| TranslationError::NoApiKey("microsoft".into()))?;
                let region = self.microsoft_region.clone().unwrap_or_else(|| "global".into());
                Box::new(microsoft::MicrosoftTranslator::new(key, region))
            }
            TranslationProviderType::Google => {
                let key = self.google_api_key.clone()
                    .ok_or_else(|| TranslationError::NoApiKey("google".into()))?;
                Box::new(google::GoogleTranslator::new(key))
            }
            TranslationProviderType::Deepl => {
                let key = self.deepl_api_key.clone()
                    .ok_or_else(|| TranslationError::NoApiKey("deepl".into()))?;
                Box::new(deepl::DeepLTranslator::new(key))
            }
            TranslationProviderType::OpusMt => {
                Box::new(opus_mt::OpusMtTranslator::new())
            }
            TranslationProviderType::Llm => {
                Box::new(llm_provider::LlmTranslator::new())
            }
        };

        self.active_provider = Some(Arc::from(provider));
        self.active_type = Some(provider_type.clone());
        self.consecutive_failures = 0;
        log::info!("Translation provider set to: {}", provider_type);
        Ok(())
    }

    /// Get an Arc clone of the active provider — safe to hold across .await.
    /// IMPORTANT: Always clone the Arc out of the lock scope before awaiting.
    pub fn get_provider(&self) -> Result<Arc<dyn TranslationProvider>, TranslationError> {
        self.active_provider
            .clone()
            .ok_or_else(|| TranslationError::NotConfigured("No translation provider set".into()))
    }

    pub fn active_provider_name(&self) -> String {
        self.active_provider
            .as_ref()
            .map(|p| p.provider_name().to_string())
            .unwrap_or_default()
    }

    pub fn cache(&self) -> &TranslationCache {
        &self.cache
    }

    pub fn cache_mut(&mut self) -> &mut TranslationCache {
        &mut self.cache
    }

    /// Increment the consecutive failure counter.
    /// Returns the new count after incrementing.
    pub fn record_failure(&mut self) -> u32 {
        self.consecutive_failures += 1;
        self.consecutive_failures
    }

    /// Reset the consecutive failure counter (call on success).
    pub fn reset_failures(&mut self) {
        self.consecutive_failures = 0;
    }

    /// Get the current consecutive failure count.
    pub fn failure_count(&self) -> u32 {
        self.consecutive_failures
    }

    /// Split long text at sentence boundaries for providers with char limits.
    pub fn split_long_text(text: &str, max_chars: usize) -> Vec<String> {
        if text.len() <= max_chars {
            return vec![text.to_string()];
        }
        let mut chunks = Vec::new();
        let mut current = String::new();
        for sentence in text.split_inclusive(|c| c == '.' || c == '!' || c == '?') {
            if current.len() + sentence.len() > max_chars && !current.is_empty() {
                chunks.push(std::mem::take(&mut current));
            }
            current.push_str(sentence);
        }
        if !current.is_empty() {
            chunks.push(current);
        }
        chunks
    }
}
