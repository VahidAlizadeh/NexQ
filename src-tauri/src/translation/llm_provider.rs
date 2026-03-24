// src-tauri/src/translation/llm_provider.rs
use super::*;

pub struct LlmTranslator;

impl LlmTranslator {
    pub fn new() -> Self { Self }
}

#[async_trait]
impl TranslationProvider for LlmTranslator {
    fn provider_name(&self) -> &str { "LLM Translation" }
    fn provider_type(&self) -> TranslationProviderType { TranslationProviderType::Llm }
    fn is_local(&self) -> bool { false } // depends on configured LLM

    async fn translate(
        &self,
        _text: &str,
        _source: Option<&str>,
        _target: &str,
    ) -> Result<String, TranslationError> {
        // LLM translation is handled at the command level where we have AppHandle
        // to access the LLMRouter. This provider serves as a marker/type identifier.
        Err(TranslationError::NotConfigured(
            "LLM translation is invoked through the command layer".into()
        ))
    }

    async fn detect_language(&self, _text: &str) -> Result<DetectedLanguage, TranslationError> {
        Err(TranslationError::NotConfigured("Use cloud provider for detection".into()))
    }

    async fn supported_languages(&self) -> Result<Vec<Language>, TranslationError> {
        // LLMs support all languages — return a curated list
        Ok(vec![
            Language { code: "en".into(), name: "English".into(), native_name: Some("English".into()) },
            Language { code: "es".into(), name: "Spanish".into(), native_name: Some("Español".into()) },
            Language { code: "fr".into(), name: "French".into(), native_name: Some("Français".into()) },
            Language { code: "de".into(), name: "German".into(), native_name: Some("Deutsch".into()) },
            Language { code: "ja".into(), name: "Japanese".into(), native_name: Some("日本語".into()) },
            Language { code: "zh".into(), name: "Chinese".into(), native_name: Some("中文".into()) },
            Language { code: "ko".into(), name: "Korean".into(), native_name: Some("한국어".into()) },
            Language { code: "pt".into(), name: "Portuguese".into(), native_name: Some("Português".into()) },
            Language { code: "it".into(), name: "Italian".into(), native_name: Some("Italiano".into()) },
            Language { code: "ru".into(), name: "Russian".into(), native_name: Some("Русский".into()) },
            Language { code: "ar".into(), name: "Arabic".into(), native_name: Some("العربية".into()) },
        ])
    }

    async fn test_connection(&self) -> Result<ConnectionStatus, TranslationError> {
        // LLM provider availability is checked through LLMRouter
        Ok(ConnectionStatus {
            connected: true,
            language_count: 11,
            response_ms: 0,
            error: None,
        })
    }
}
