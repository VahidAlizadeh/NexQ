// src-tauri/src/translation/opus_mt.rs
use super::*;

pub struct OpusMtTranslator;

impl OpusMtTranslator {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl TranslationProvider for OpusMtTranslator {
    fn provider_name(&self) -> &str { "OPUS-MT (Local)" }
    fn provider_type(&self) -> TranslationProviderType { TranslationProviderType::OpusMt }
    fn is_local(&self) -> bool { true }

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
