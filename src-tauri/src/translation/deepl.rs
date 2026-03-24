// src-tauri/src/translation/deepl.rs
use super::*;
use std::time::Instant;

pub struct DeepLTranslator {
    api_key: String,
    base_url: String,
    client: reqwest::Client,
}

impl DeepLTranslator {
    pub fn new(api_key: String) -> Self {
        // Free tier keys end with ":fx"; all others use the pro endpoint.
        let base_url = if api_key.ends_with(":fx") {
            "https://api-free.deepl.com/v2".to_string()
        } else {
            "https://api.deepl.com/v2".to_string()
        };
        Self {
            api_key,
            base_url,
            client: reqwest::Client::new(),
        }
    }

    /// DeepL expects UPPERCASE language codes (e.g. "EN", "DE").
    fn to_deepl_lang(code: &str) -> String {
        code.to_uppercase()
    }

    /// Convert DeepL UPPERCASE codes back to lowercase for consistency.
    fn from_deepl_lang(code: &str) -> String {
        code.to_lowercase()
    }
}

// ── Response shapes ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct DeepLTranslation {
    text: String,
    detected_source_language: String,
}

#[derive(Debug, Deserialize)]
struct DeepLTranslateResponse {
    translations: Vec<DeepLTranslation>,
}

#[derive(Debug, Deserialize)]
struct DeepLLanguage {
    language: String,
    name: String,
}

// ── Trait impl ───────────────────────────────────────────────────────────────

#[async_trait]
impl TranslationProvider for DeepLTranslator {
    fn provider_name(&self) -> &str { "DeepL" }
    fn provider_type(&self) -> TranslationProviderType { TranslationProviderType::Deepl }
    fn is_local(&self) -> bool { false }

    async fn translate(
        &self,
        text: &str,
        source: Option<&str>,
        target: &str,
    ) -> Result<String, TranslationError> {
        let url = format!("{}/translate", self.base_url);

        let mut params = vec![
            ("text", text.to_string()),
            ("target_lang", Self::to_deepl_lang(target)),
        ];
        if let Some(src) = source {
            params.push(("source_lang", Self::to_deepl_lang(src)));
        }

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("DeepL-Auth-Key {}", self.api_key))
            .form(&params)
            .send()
            .await
            .map_err(|e| TranslationError::Http(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(TranslationError::Http(format!(
                "DeepL API error {}: {}",
                status, body
            )));
        }

        let data: DeepLTranslateResponse = resp
            .json()
            .await
            .map_err(|e| TranslationError::Http(e.to_string()))?;

        data.translations
            .into_iter()
            .next()
            .map(|t| t.text)
            .ok_or_else(|| TranslationError::Failed("Empty translations array".into()))
    }

    async fn translate_batch(
        &self,
        texts: &[String],
        source: Option<&str>,
        target: &str,
    ) -> Result<Vec<String>, TranslationError> {
        if texts.is_empty() {
            return Ok(vec![]);
        }

        let url = format!("{}/translate", self.base_url);

        // DeepL accepts multiple `text` params in a single form-encoded body.
        let mut params: Vec<(&str, String)> = texts
            .iter()
            .map(|t| ("text", t.clone()))
            .collect();
        params.push(("target_lang", Self::to_deepl_lang(target)));
        if let Some(src) = source {
            params.push(("source_lang", Self::to_deepl_lang(src)));
        }

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("DeepL-Auth-Key {}", self.api_key))
            .form(&params)
            .send()
            .await
            .map_err(|e| TranslationError::Http(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(TranslationError::Http(format!(
                "DeepL API error {}: {}",
                status, body
            )));
        }

        let data: DeepLTranslateResponse = resp
            .json()
            .await
            .map_err(|e| TranslationError::Http(e.to_string()))?;

        Ok(data.translations.into_iter().map(|t| t.text).collect())
    }

    async fn detect_language(&self, text: &str) -> Result<DetectedLanguage, TranslationError> {
        // DeepL has no standalone detect endpoint; use translate with a fixed
        // target and read back detected_source_language.
        let url = format!("{}/translate", self.base_url);

        let params = vec![
            ("text", text.to_string()),
            ("target_lang", "EN".to_string()),
        ];

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("DeepL-Auth-Key {}", self.api_key))
            .form(&params)
            .send()
            .await
            .map_err(|e| TranslationError::Http(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(TranslationError::Http(format!(
                "DeepL API error {}: {}",
                status, body
            )));
        }

        let data: DeepLTranslateResponse = resp
            .json()
            .await
            .map_err(|e| TranslationError::Http(e.to_string()))?;

        let detected = data
            .translations
            .into_iter()
            .next()
            .map(|t| Self::from_deepl_lang(&t.detected_source_language))
            .ok_or_else(|| TranslationError::Failed("Empty translations array".into()))?;

        Ok(DetectedLanguage {
            lang: detected,
            confidence: 1.0,
        })
    }

    async fn supported_languages(&self) -> Result<Vec<Language>, TranslationError> {
        let url = format!("{}/languages", self.base_url);

        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("DeepL-Auth-Key {}", self.api_key))
            .send()
            .await
            .map_err(|e| TranslationError::Http(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(TranslationError::Http(format!(
                "DeepL API error {}: {}",
                status, body
            )));
        }

        let languages: Vec<DeepLLanguage> = resp
            .json()
            .await
            .map_err(|e| TranslationError::Http(e.to_string()))?;

        Ok(languages
            .into_iter()
            .map(|l| Language {
                code: Self::from_deepl_lang(&l.language),
                name: l.name,
                native_name: None,
            })
            .collect())
    }

    async fn test_connection(&self) -> Result<ConnectionStatus, TranslationError> {
        let start = Instant::now();
        match self.supported_languages().await {
            Ok(langs) => Ok(ConnectionStatus {
                connected: true,
                language_count: langs.len(),
                response_ms: start.elapsed().as_millis() as u64,
                error: None,
            }),
            Err(e) => Ok(ConnectionStatus {
                connected: false,
                language_count: 0,
                response_ms: start.elapsed().as_millis() as u64,
                error: Some(e.to_string()),
            }),
        }
    }
}
