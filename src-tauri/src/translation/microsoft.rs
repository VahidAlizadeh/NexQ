// src-tauri/src/translation/microsoft.rs
use super::*;

pub struct MicrosoftTranslator {
    api_key: String,
    region: String,
}

impl MicrosoftTranslator {
    pub fn new(api_key: String, region: String) -> Self {
        Self { api_key, region }
    }
}

#[async_trait]
impl TranslationProvider for MicrosoftTranslator {
    fn provider_name(&self) -> &str { "Microsoft Translator" }
    fn provider_type(&self) -> TranslationProviderType { TranslationProviderType::Microsoft }
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
