// src-tauri/src/translation/microsoft.rs
use super::*;
use reqwest::Client;
use serde_json::Value;
use std::time::Instant;

pub struct MicrosoftTranslator {
    api_key: String,
    region: String,
    client: Client,
}

impl MicrosoftTranslator {
    pub fn new(api_key: String, region: String) -> Self {
        Self {
            api_key,
            region,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl TranslationProvider for MicrosoftTranslator {
    fn provider_name(&self) -> &str { "Microsoft Translator" }
    fn provider_type(&self) -> TranslationProviderType { TranslationProviderType::Microsoft }
    fn is_local(&self) -> bool { false }

    async fn translate(
        &self,
        text: &str,
        source: Option<&str>,
        target: &str,
    ) -> Result<String, TranslationError> {
        let mut url = format!(
            "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to={}",
            target
        );
        if let Some(src) = source {
            url.push_str(&format!("&from={}", src));
        }

        let body = serde_json::json!([{ "text": text }]);

        let resp = self.client
            .post(&url)
            .header("Ocp-Apim-Subscription-Key", &self.api_key)
            .header("Ocp-Apim-Subscription-Region", &self.region)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| TranslationError::Http(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body_text = resp.text().await.unwrap_or_default();
            return Err(TranslationError::Failed(format!(
                "Microsoft API returned {}: {}", status, body_text
            )));
        }

        let json: Value = resp.json().await
            .map_err(|e| TranslationError::Failed(e.to_string()))?;

        json[0]["translations"][0]["text"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| TranslationError::Failed("Unexpected response format".into()))
    }

    async fn translate_batch(
        &self,
        texts: &[String],
        source: Option<&str>,
        target: &str,
    ) -> Result<Vec<String>, TranslationError> {
        // Microsoft supports up to 100 texts / 10K chars per request
        let mut url = format!(
            "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to={}",
            target
        );
        if let Some(src) = source {
            url.push_str(&format!("&from={}", src));
        }

        let body: Vec<Value> = texts.iter()
            .map(|t| serde_json::json!({ "text": t }))
            .collect();

        let resp = self.client
            .post(&url)
            .header("Ocp-Apim-Subscription-Key", &self.api_key)
            .header("Ocp-Apim-Subscription-Region", &self.region)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| TranslationError::Http(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body_text = resp.text().await.unwrap_or_default();
            return Err(TranslationError::Failed(format!(
                "Microsoft batch API returned {}: {}", status, body_text
            )));
        }

        let json: Vec<Value> = resp.json().await
            .map_err(|e| TranslationError::Failed(e.to_string()))?;

        json.iter()
            .map(|item| {
                item["translations"][0]["text"]
                    .as_str()
                    .map(|s| s.to_string())
                    .ok_or_else(|| TranslationError::Failed("Unexpected batch response format".into()))
            })
            .collect()
    }

    async fn detect_language(&self, text: &str) -> Result<DetectedLanguage, TranslationError> {
        let body = serde_json::json!([{ "text": text }]);

        let resp = self.client
            .post("https://api.cognitive.microsofttranslator.com/detect?api-version=3.0")
            .header("Ocp-Apim-Subscription-Key", &self.api_key)
            .header("Ocp-Apim-Subscription-Region", &self.region)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| TranslationError::Http(e.to_string()))?;

        let json: Value = resp.json().await
            .map_err(|e| TranslationError::Failed(e.to_string()))?;

        Ok(DetectedLanguage {
            lang: json[0]["language"].as_str().unwrap_or("unknown").to_string(),
            confidence: json[0]["score"].as_f64().unwrap_or(0.0),
        })
    }

    async fn supported_languages(&self) -> Result<Vec<Language>, TranslationError> {
        let resp = self.client
            .get("https://api.cognitive.microsofttranslator.com/languages?api-version=3.0&scope=translation")
            .send()
            .await
            .map_err(|e| TranslationError::Http(e.to_string()))?;

        let json: Value = resp.json().await
            .map_err(|e| TranslationError::Failed(e.to_string()))?;

        let translation_map = json["translation"].as_object()
            .ok_or_else(|| TranslationError::Failed("No translation languages".into()))?;

        Ok(translation_map.iter().map(|(code, info)| {
            Language {
                code: code.clone(),
                name: info["name"].as_str().unwrap_or(code).to_string(),
                native_name: info["nativeName"].as_str().map(|s| s.to_string()),
            }
        }).collect())
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
