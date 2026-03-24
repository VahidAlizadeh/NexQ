// src-tauri/src/translation/deepl.rs
use super::*;

pub struct DeepLTranslator {
    api_key: String,
}

impl DeepLTranslator {
    pub fn new(api_key: String) -> Self {
        Self { api_key }
    }
}

#[async_trait]
impl TranslationProvider for DeepLTranslator {
    fn provider_name(&self) -> &str { "DeepL" }
    fn provider_type(&self) -> TranslationProviderType { TranslationProviderType::Deepl }
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
