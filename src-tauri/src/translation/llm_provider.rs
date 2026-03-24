// src-tauri/src/translation/llm_provider.rs
use super::*;

pub struct LlmTranslator;

impl LlmTranslator {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl TranslationProvider for LlmTranslator {
    fn provider_name(&self) -> &str { "LLM Translation" }
    fn provider_type(&self) -> TranslationProviderType { TranslationProviderType::Llm }
    fn is_local(&self) -> bool { false }

    async fn translate(&self, _text: &str, _source: Option<&str>, _target: &str) -> Result<String, TranslationError> {
        Err(TranslationError::NotConfigured("Not yet implemented".into()))
    }

    async fn detect_language(&self, _text: &str) -> Result<DetectedLanguage, TranslationError> {
        Err(TranslationError::NotConfigured("Not yet implemented".into()))
    }

    async fn supported_languages(&self) -> Result<Vec<Language>, TranslationError> {
        Err(TranslationError::NotConfigured("Not yet implemented".into()))
    }

    async fn test_connection(&self) -> Result<ConnectionStatus, TranslationError> {
        Err(TranslationError::NotConfigured("Not yet implemented".into()))
    }
}
