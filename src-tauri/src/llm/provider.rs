use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Per-request generation parameters.
/// `None` fields mean "use provider default" — they won't be sent in the HTTP body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationParams {
    pub temperature: Option<f64>,
    pub max_tokens: Option<u64>,
}

impl Default for GenerationParams {
    fn default() -> Self {
        Self {
            temperature: None,
            max_tokens: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub context_window: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionStats {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Error)]
pub enum LLMError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    #[error("JSON parse error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Provider not configured: {0}")]
    NotConfigured(String),

    #[error("Authentication failed: {0}")]
    AuthError(String),

    #[error("Stream cancelled")]
    Cancelled,

    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),

    #[error("Provider error: {0}")]
    ProviderError(String),
}

impl Serialize for LLMError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Event payloads emitted during streaming
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamStartPayload {
    pub mode: String,
    pub model: String,
    pub provider: String,
    pub system_prompt: String,
    pub user_prompt: String,
    pub include_transcript: bool,
    pub include_rag: bool,
    pub include_instructions: bool,
    pub include_question: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamTokenPayload {
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamEndPayload {
    pub total_tokens: u64,
    pub latency_ms: u64,
}

/// Trait that all LLM providers implement.
#[async_trait::async_trait]
pub trait LLMProvider: Send + Sync {
    /// Returns the name of this provider (e.g., "openai", "ollama")
    fn provider_name(&self) -> &str;

    /// Lists available models for this provider
    async fn list_models(&self) -> Result<Vec<ModelInfo>, LLMError>;

    /// Tests whether the provider is reachable and properly configured
    async fn test_connection(&self) -> Result<bool, LLMError>;

    /// Streams a completion response, emitting tokens via Tauri events.
    /// Events: "llm_stream_start", "llm_stream_token", "llm_stream_end", "llm_stream_error"
    async fn stream_completion(
        &self,
        messages: Vec<LLMMessage>,
        model: &str,
        params: GenerationParams,
        app_handle: tauri::AppHandle,
    ) -> Result<CompletionStats, LLMError>;
}
