// src-tauri/src/translation/google.rs
use super::*;

pub struct GoogleTranslator {
    api_key: String,
}

impl GoogleTranslator {
    pub fn new(api_key: String) -> Self {
        Self { api_key }
    }
}

#[async_trait]
impl TranslationProvider for GoogleTranslator {
    fn provider_name(&self) -> &str { "Google Cloud Translation" }
    fn provider_type(&self) -> TranslationProviderType { TranslationProviderType::Google }
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
