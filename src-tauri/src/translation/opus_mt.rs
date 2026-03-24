// src-tauri/src/translation/opus_mt.rs
use std::path::PathBuf;
use super::*;

pub struct OpusMtTranslator {
    models_dir: Option<PathBuf>,
}

impl OpusMtTranslator {
    pub fn new() -> Self {
        Self { models_dir: None }
    }

    pub fn set_models_dir(&mut self, path: PathBuf) {
        self.models_dir = Some(path);
    }
}

#[async_trait]
impl TranslationProvider for OpusMtTranslator {
    fn provider_name(&self) -> &str { "OPUS-MT (Local)" }
    fn provider_type(&self) -> TranslationProviderType { TranslationProviderType::OpusMt }
    fn is_local(&self) -> bool { true }

    async fn translate(
        &self,
        _text: &str,
        _source: Option<&str>,
        _target: &str,
    ) -> Result<String, TranslationError> {
        Err(TranslationError::NotConfigured(
            "OPUS-MT models not downloaded. Download language models in Settings to enable offline translation.".into(),
        ))
    }

    async fn detect_language(&self, _text: &str) -> Result<DetectedLanguage, TranslationError> {
        Err(TranslationError::NotConfigured(
            "Language detection requires a cloud provider".into(),
        ))
    }

    async fn supported_languages(&self) -> Result<Vec<Language>, TranslationError> {
        Ok(vec![
            Language { code: "en".into(), name: "English".into(),    native_name: Some("English".into()) },
            Language { code: "es".into(), name: "Spanish".into(),    native_name: Some("Español".into()) },
            Language { code: "fr".into(), name: "French".into(),     native_name: Some("Français".into()) },
            Language { code: "de".into(), name: "German".into(),     native_name: Some("Deutsch".into()) },
            Language { code: "pt".into(), name: "Portuguese".into(), native_name: Some("Português".into()) },
            Language { code: "it".into(), name: "Italian".into(),    native_name: Some("Italiano".into()) },
            Language { code: "nl".into(), name: "Dutch".into(),      native_name: Some("Nederlands".into()) },
            Language { code: "ru".into(), name: "Russian".into(),    native_name: Some("Русский".into()) },
            Language { code: "zh".into(), name: "Chinese".into(),    native_name: Some("中文".into()) },
            Language { code: "ja".into(), name: "Japanese".into(),   native_name: Some("日本語".into()) },
            Language { code: "ko".into(), name: "Korean".into(),     native_name: Some("한국어".into()) },
            Language { code: "ar".into(), name: "Arabic".into(),     native_name: Some("العربية".into()) },
        ])
    }

    async fn test_connection(&self) -> Result<ConnectionStatus, TranslationError> {
        let Some(dir) = &self.models_dir else {
            return Ok(ConnectionStatus {
                connected: false,
                language_count: 0,
                response_ms: 0,
                error: Some("No models directory configured".into()),
            });
        };

        if !dir.exists() {
            return Ok(ConnectionStatus {
                connected: false,
                language_count: 0,
                response_ms: 0,
                error: Some("No models directory configured".into()),
            });
        }

        // Count immediate subdirectories — each represents one downloaded model pair.
        let model_count = std::fs::read_dir(dir)
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().is_dir())
                    .count()
            })
            .unwrap_or(0);

        if model_count == 0 {
            return Ok(ConnectionStatus {
                connected: false,
                language_count: 0,
                response_ms: 0,
                error: Some("No models directory configured".into()),
            });
        }

        Ok(ConnectionStatus {
            connected: true,
            language_count: model_count,
            response_ms: 0,
            error: None,
        })
    }
}
