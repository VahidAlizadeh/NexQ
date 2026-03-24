# Translation Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-provider transcript translation to NexQ — full-line auto-translate during/after meetings, select-to-translate on any text, batch export, with a settings page matching the STT/LLM provider pattern.

**Architecture:** Trait-based `TranslationProvider` in Rust backend (mirrors STT/LLM patterns), `TranslationRouter` in `AppState`, IPC commands + events, Zustand store + hook on frontend. Five providers: Microsoft Translator, Google Cloud Translation, DeepL, OPUS-MT (local ONNX), and LLM (reuses existing router).

**Tech Stack:** Rust (async-trait, reqwest, ort, rusqlite), React 18, TypeScript, Zustand, Tailwind CSS, shadcn/ui, Tauri 2 IPC

**Spec:** `docs/superpowers/specs/2026-03-24-translation-design.md`

---

## File Map

### New Files — Backend (Rust)

| File | Responsibility |
|------|---------------|
| `src-tauri/src/translation/mod.rs` | `TranslationProvider` trait, `TranslationRouter`, `TranslationProviderType` enum, error types, in-memory cache |
| `src-tauri/src/translation/microsoft.rs` | Microsoft Translator REST API provider |
| `src-tauri/src/translation/google.rs` | Google Cloud Translation REST API provider |
| `src-tauri/src/translation/deepl.rs` | DeepL REST API provider |
| `src-tauri/src/translation/opus_mt.rs` | OPUS-MT local ONNX provider (via `ort` crate) |
| `src-tauri/src/translation/llm_provider.rs` | LLM-based translation provider (reuses `LLMRouter`) |
| `src-tauri/src/commands/translation_commands.rs` | IPC command handlers for translation |
| `src-tauri/src/db/translation.rs` | DB CRUD for `transcript_translations` table |

### New Files — Frontend (React/TypeScript)

| File | Responsibility |
|------|---------------|
| `src/stores/translationStore.ts` | Zustand store — translation state, preferences, cached translations |
| `src/hooks/useTranslation.ts` | Hook — event listeners, auto-translate trigger, IPC calls |
| `src/settings/TranslationSettings.tsx` | Settings page — provider selection, API keys, language, behavior |
| `src/components/SelectionToolbar.tsx` | Floating mini toolbar on text selection (Translate / Copy / Bookmark) |
| `src/components/TranslationPopup.tsx` | Popup showing translation result for select-to-translate |

### Modified Files

| File | Change |
|------|--------|
| `src-tauri/src/lib.rs:1,10,42-43,237,364` | Add `pub mod translation`, import `translation_commands`, init router in setup, register commands |
| `src-tauri/src/state.rs:12,62,106` | Import `TranslationRouter`, add field to `AppState`, init in `new()` |
| `src-tauri/src/commands/mod.rs:13` | Add `pub mod translation_commands` |
| `src-tauri/src/db/mod.rs` | Add `pub mod translation` |
| `src-tauri/src/db/migrations.rs:9,16` | Add `v6_translation_schema(conn)?` call + function |
| `src/lib/types.ts` | Add translation types (TranslationProviderType, TranslationResult, etc.) |
| `src/lib/ipc.ts` | Add typed wrappers for 8 translation commands |
| `src/lib/events.ts` | Add `onTranslationResult`, `onTranslationError`, `onBatchTranslationProgress` |
| `src/settings/SettingsOverlay.tsx:32,57,147` | Add "translation" to SettingsTab, TAB_GROUPS, renderTabContent switch |
| `src/overlay/TranscriptLine.tsx` | Add inline-below / hover translation display |
| `src/overlay/OverlayView.tsx` | Add translate toggle + Inline/Hover switch to toolbar |
| `src/calllog/` | Add "Translate All" + "Export" buttons, progress bar |
| `src/lib/version.ts` | Bump to 2.12.0 |

---

### Task 1: Backend Foundation — Provider Trait, Types, Router

**Files:**
- Create: `src-tauri/src/translation/mod.rs`
- Modify: `src-tauri/src/lib.rs:1` (add module declaration)

- [ ] **Step 1: Create translation module directory**

```bash
mkdir -p src-tauri/src/translation
```

- [ ] **Step 2: Write `translation/mod.rs` with trait, types, router, and cache**

```rust
// src-tauri/src/translation/mod.rs
pub mod microsoft;
pub mod google;
pub mod deepl;
pub mod opus_mt;
pub mod llm_provider;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;

// ── Error types ──

#[derive(Debug, thiserror::Error)]
pub enum TranslationError {
    #[error("HTTP request failed: {0}")]
    Http(String),
    #[error("Provider not configured: {0}")]
    NotConfigured(String),
    #[error("API key missing for provider: {0}")]
    NoApiKey(String),
    #[error("Language not supported: {0}")]
    UnsupportedLanguage(String),
    #[error("Rate limit exceeded")]
    RateLimited,
    #[error("Translation failed: {0}")]
    Failed(String),
}

impl Serialize for TranslationError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: serde::Serializer {
        serializer.serialize_str(&self.to_string())
    }
}

// ── Shared types ──

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TranslationProviderType {
    Microsoft,
    Google,
    Deepl,
    OpusMt,
    Llm,
}

impl std::fmt::Display for TranslationProviderType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Microsoft => write!(f, "microsoft"),
            Self::Google => write!(f, "google"),
            Self::Deepl => write!(f, "deepl"),
            Self::OpusMt => write!(f, "opus-mt"),
            Self::Llm => write!(f, "llm"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationResult {
    pub segment_id: Option<String>,
    pub original_text: String,
    pub translated_text: String,
    pub source_lang: String,
    pub target_lang: String,
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedLanguage {
    pub lang: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Language {
    pub code: String,
    pub name: String,
    pub native_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub connected: bool,
    pub language_count: usize,
    pub response_ms: u64,
    pub error: Option<String>,
}

// ── Provider trait ──

#[async_trait]
pub trait TranslationProvider: Send + Sync {
    fn provider_name(&self) -> &str;
    fn provider_type(&self) -> TranslationProviderType;
    fn is_local(&self) -> bool;

    async fn translate(
        &self,
        text: &str,
        source: Option<&str>,
        target: &str,
    ) -> Result<String, TranslationError>;

    async fn translate_batch(
        &self,
        texts: &[String],
        source: Option<&str>,
        target: &str,
    ) -> Result<Vec<String>, TranslationError> {
        // Default: translate one by one. Providers can override with native batch.
        let mut results = Vec::with_capacity(texts.len());
        for text in texts {
            results.push(self.translate(text, source, target).await?);
        }
        Ok(results)
    }

    async fn detect_language(&self, text: &str) -> Result<DetectedLanguage, TranslationError>;

    async fn supported_languages(&self) -> Result<Vec<Language>, TranslationError>;

    async fn test_connection(&self) -> Result<ConnectionStatus, TranslationError>;
}

// ── In-memory LRU cache for ad-hoc translations ──

struct CacheEntry {
    translated_text: String,
}

pub struct TranslationCache {
    map: HashMap<(u64, String), CacheEntry>,
    order: Vec<(u64, String)>,
    max_size: usize,
}

impl TranslationCache {
    pub fn new(max_size: usize) -> Self {
        Self {
            map: HashMap::new(),
            order: Vec::new(),
            max_size,
        }
    }

    fn text_hash(text: &str) -> u64 {
        let mut hasher = DefaultHasher::new();
        text.hash(&mut hasher);
        hasher.finish()
    }

    pub fn get(&self, text: &str, target_lang: &str) -> Option<&str> {
        let key = (Self::text_hash(text), target_lang.to_string());
        self.map.get(&key).map(|e| e.translated_text.as_str())
    }

    pub fn insert(&mut self, text: &str, target_lang: &str, translated: String) {
        let key = (Self::text_hash(text), target_lang.to_string());
        if self.map.contains_key(&key) {
            return;
        }
        if self.map.len() >= self.max_size {
            if let Some(oldest) = self.order.first().cloned() {
                self.map.remove(&oldest);
                self.order.remove(0);
            }
        }
        self.order.push(key.clone());
        self.map.insert(key, CacheEntry { translated_text: translated });
    }
}

// ── Router ──

pub struct TranslationRouter {
    active_provider: Option<Arc<dyn TranslationProvider>>,
    active_type: Option<TranslationProviderType>,
    consecutive_failures: u32,
    cache: TranslationCache,
    // Cached API keys (loaded from CredentialManager)
    microsoft_api_key: Option<String>,
    microsoft_region: Option<String>,
    google_api_key: Option<String>,
    deepl_api_key: Option<String>,
}

impl TranslationRouter {
    pub fn new() -> Self {
        Self {
            active_provider: None,
            active_type: None,
            consecutive_failures: 0,
            cache: TranslationCache::new(1000),
            microsoft_api_key: None,
            microsoft_region: None,
            google_api_key: None,
            deepl_api_key: None,
        }
    }

    pub fn active_type(&self) -> Option<&TranslationProviderType> {
        self.active_type.as_ref()
    }

    pub fn set_microsoft_credentials(&mut self, key: String, region: Option<String>) {
        self.microsoft_api_key = Some(key);
        self.microsoft_region = region;
    }

    pub fn set_google_credentials(&mut self, key: String) {
        self.google_api_key = Some(key);
    }

    pub fn set_deepl_credentials(&mut self, key: String) {
        self.deepl_api_key = Some(key);
    }

    pub fn set_provider(
        &mut self,
        provider_type: TranslationProviderType,
    ) -> Result<(), TranslationError> {
        let provider: Box<dyn TranslationProvider> = match provider_type {
            TranslationProviderType::Microsoft => {
                let key = self.microsoft_api_key.clone()
                    .ok_or_else(|| TranslationError::NoApiKey("microsoft".into()))?;
                let region = self.microsoft_region.clone().unwrap_or_else(|| "global".into());
                Box::new(microsoft::MicrosoftTranslator::new(key, region))
            }
            TranslationProviderType::Google => {
                let key = self.google_api_key.clone()
                    .ok_or_else(|| TranslationError::NoApiKey("google".into()))?;
                Box::new(google::GoogleTranslator::new(key))
            }
            TranslationProviderType::Deepl => {
                let key = self.deepl_api_key.clone()
                    .ok_or_else(|| TranslationError::NoApiKey("deepl".into()))?;
                Box::new(deepl::DeepLTranslator::new(key))
            }
            TranslationProviderType::OpusMt => {
                Box::new(opus_mt::OpusMtTranslator::new())
            }
            TranslationProviderType::Llm => {
                Box::new(llm_provider::LlmTranslator::new())
            }
        };

        self.active_provider = Some(Arc::from(provider));
        self.active_type = Some(provider_type.clone());
        self.consecutive_failures = 0;
        log::info!("Translation provider set to: {}", provider_type);
        Ok(())
    }

    /// Get an Arc clone of the active provider — safe to hold across .await.
    /// IMPORTANT: Always clone the Arc out of the lock scope before awaiting.
    pub fn get_provider(&self) -> Result<Arc<dyn TranslationProvider>, TranslationError> {
        self.active_provider
            .clone()
            .ok_or_else(|| TranslationError::NotConfigured("No translation provider set".into()))
    }

    pub fn active_provider_name(&self) -> String {
        self.active_provider
            .as_ref()
            .map(|p| p.provider_name().to_string())
            .unwrap_or_default()
    }

    pub fn cache(&self) -> &TranslationCache {
        &self.cache
    }

    pub fn cache_mut(&mut self) -> &mut TranslationCache {
        &mut self.cache
    }

    /// Split long text at sentence boundaries for providers with char limits.
    pub fn split_long_text(text: &str, max_chars: usize) -> Vec<String> {
        if text.len() <= max_chars {
            return vec![text.to_string()];
        }
        let mut chunks = Vec::new();
        let mut current = String::new();
        for sentence in text.split_inclusive(|c| c == '.' || c == '!' || c == '?') {
            if current.len() + sentence.len() > max_chars && !current.is_empty() {
                chunks.push(std::mem::take(&mut current));
            }
            current.push_str(sentence);
        }
        if !current.is_empty() {
            chunks.push(current);
        }
        chunks
    }
}
```

- [ ] **Step 3: Add module declaration to `lib.rs`**

In `src-tauri/src/lib.rs`, add `pub mod translation;` after line 9 (`pub mod stt;`).

- [ ] **Step 4: Verify it compiles**

```bash
cd src-tauri && cargo check 2>&1 | head -20
```

Expected: Errors about missing submodule files (microsoft.rs, google.rs, etc.) — that's fine, we'll create them next. The trait and router should compile.

- [ ] **Step 5: Create stub files for all providers to fix compilation**

Create minimal stubs for each provider file so `cargo check` passes:

```rust
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
```

Repeat the same stub pattern for `google.rs` (GoogleTranslator), `deepl.rs` (DeepLTranslator), `opus_mt.rs` (OpusMtTranslator), `llm_provider.rs` (LlmTranslator). Each uses `pub fn new(...)` matching the args in `TranslationRouter::set_provider()`.

- [ ] **Step 6: Verify full compilation**

```bash
cd src-tauri && cargo check
```

Expected: PASS (no errors)

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/translation/
git commit -m "feat(translation): add TranslationProvider trait, router, and provider stubs"
```

---

### Task 2: Database Migration + CRUD

**Files:**
- Create: `src-tauri/src/db/translation.rs`
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/db/migrations.rs:9-16`

- [ ] **Step 1: Add migration v6 to `migrations.rs`**

In `src-tauri/src/db/migrations.rs`, add `v6_translation_schema(conn)?;` after line 13 (`v5_recording_columns(conn)?;`), and add the function:

```rust
/// Schema v6: Translation cache — stores translated transcript segments.
fn v6_translation_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS transcript_translations (
            id              TEXT PRIMARY KEY NOT NULL,
            segment_id      TEXT NOT NULL,
            meeting_id      TEXT NOT NULL,
            source_lang     TEXT NOT NULL,
            target_lang     TEXT NOT NULL,
            original_text   TEXT NOT NULL,
            translated_text TEXT NOT NULL,
            provider        TEXT NOT NULL,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(segment_id, target_lang)
        );

        CREATE INDEX IF NOT EXISTS idx_translations_meeting
            ON transcript_translations(meeting_id, target_lang);
        ",
    )?;
    Ok(())
}
```

- [ ] **Step 2: Create `db/translation.rs` with CRUD functions**

```rust
// src-tauri/src/db/translation.rs
use rusqlite::{params, Connection};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct TranslationRow {
    pub id: String,
    pub segment_id: String,
    pub meeting_id: String,
    pub source_lang: String,
    pub target_lang: String,
    pub original_text: String,
    pub translated_text: String,
    pub provider: String,
    pub created_at: String,
}

/// Upsert a translation (insert or replace if segment+lang already exists).
pub fn save_translation(
    conn: &Connection,
    segment_id: &str,
    meeting_id: &str,
    source_lang: &str,
    target_lang: &str,
    original_text: &str,
    translated_text: &str,
    provider: &str,
) -> Result<String, rusqlite::Error> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO transcript_translations (id, segment_id, meeting_id, source_lang, target_lang, original_text, translated_text, provider)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(segment_id, target_lang) DO UPDATE SET
            original_text = excluded.original_text,
            translated_text = excluded.translated_text,
            provider = excluded.provider,
            source_lang = excluded.source_lang,
            created_at = datetime('now')",
        params![id, segment_id, meeting_id, source_lang, target_lang, original_text, translated_text, provider],
    )?;
    Ok(id)
}

/// Load all translations for a meeting + target language.
pub fn get_meeting_translations(
    conn: &Connection,
    meeting_id: &str,
    target_lang: &str,
) -> Result<Vec<TranslationRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, segment_id, meeting_id, source_lang, target_lang, original_text, translated_text, provider, created_at
         FROM transcript_translations
         WHERE meeting_id = ?1 AND target_lang = ?2"
    )?;
    let rows = stmt.query_map(params![meeting_id, target_lang], |row| {
        Ok(TranslationRow {
            id: row.get(0)?,
            segment_id: row.get(1)?,
            meeting_id: row.get(2)?,
            source_lang: row.get(3)?,
            target_lang: row.get(4)?,
            original_text: row.get(5)?,
            translated_text: row.get(6)?,
            provider: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Get a single segment's translation.
pub fn get_segment_translation(
    conn: &Connection,
    segment_id: &str,
    target_lang: &str,
) -> Result<Option<TranslationRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, segment_id, meeting_id, source_lang, target_lang, original_text, translated_text, provider, created_at
         FROM transcript_translations
         WHERE segment_id = ?1 AND target_lang = ?2"
    )?;
    let mut rows = stmt.query_map(params![segment_id, target_lang], |row| {
        Ok(TranslationRow {
            id: row.get(0)?,
            segment_id: row.get(1)?,
            meeting_id: row.get(2)?,
            source_lang: row.get(3)?,
            target_lang: row.get(4)?,
            original_text: row.get(5)?,
            translated_text: row.get(6)?,
            provider: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    Ok(rows.next().transpose()?)
}

/// Delete all translations for a meeting.
pub fn delete_meeting_translations(
    conn: &Connection,
    meeting_id: &str,
) -> Result<usize, rusqlite::Error> {
    conn.execute(
        "DELETE FROM transcript_translations WHERE meeting_id = ?1",
        params![meeting_id],
    )
}

/// Count translations for a meeting + language (for progress tracking).
pub fn count_meeting_translations(
    conn: &Connection,
    meeting_id: &str,
    target_lang: &str,
) -> Result<usize, rusqlite::Error> {
    conn.query_row(
        "SELECT COUNT(*) FROM transcript_translations WHERE meeting_id = ?1 AND target_lang = ?2",
        params![meeting_id, target_lang],
        |row| row.get::<_, usize>(0),
    )
}
```

- [ ] **Step 3: Add `pub mod translation;` to `src-tauri/src/db/mod.rs`**

- [ ] **Step 4: Verify compilation**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/translation.rs src-tauri/src/db/mod.rs src-tauri/src/db/migrations.rs
git commit -m "feat(translation): add transcript_translations DB migration and CRUD"
```

---

### Task 3: Microsoft Translator Provider

**Files:**
- Modify: `src-tauri/src/translation/microsoft.rs`

- [ ] **Step 1: Implement Microsoft Translator using Azure REST API**

Replace the stub in `src-tauri/src/translation/microsoft.rs`:

```rust
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
```

- [ ] **Step 2: Verify compilation**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/translation/microsoft.rs
git commit -m "feat(translation): implement Microsoft Translator provider"
```

---

### Task 4: Google Cloud Translation Provider

**Files:**
- Modify: `src-tauri/src/translation/google.rs`

- [ ] **Step 1: Implement Google Cloud Translation v2 REST API**

Replace stub. Same structure as Microsoft but with Google's endpoint:
- Translate: `POST https://translation.googleapis.com/language/translate/v2?key={key}`
- Detect: `POST https://translation.googleapis.com/language/translate/v2/detect?key={key}`
- Languages: `GET https://translation.googleapis.com/language/translate/v2/languages?key={key}&target=en`

Body format: `{ "q": "text", "target": "es", "source": "en" }`
Response: `{ "data": { "translations": [{ "translatedText": "..." }] } }`

Follow the exact same struct pattern as `microsoft.rs` but with Google's API format.

- [ ] **Step 2: Verify compilation + commit**

```bash
cd src-tauri && cargo check
git add src-tauri/src/translation/google.rs
git commit -m "feat(translation): implement Google Cloud Translation provider"
```

---

### Task 5: DeepL Provider

**Files:**
- Modify: `src-tauri/src/translation/deepl.rs`

- [ ] **Step 1: Implement DeepL REST API**

Key differences from Microsoft/Google:
- Free API endpoint: `https://api-free.deepl.com/v2/translate`
- Pro API endpoint: `https://api.deepl.com/v2/translate`
- Auth: `Authorization: DeepL-Auth-Key {key}` header
- Body: form-encoded `text=...&target_lang=ES&source_lang=EN`
- Response: `{ "translations": [{ "text": "...", "detected_source_language": "EN" }] }`
- Languages endpoint: `GET /v2/languages`
- Detect: Not a separate endpoint — returned in translate response

Detect free vs pro key: free keys end with `:fx`.

- [ ] **Step 2: Verify compilation + commit**

```bash
cd src-tauri && cargo check
git add src-tauri/src/translation/deepl.rs
git commit -m "feat(translation): implement DeepL provider"
```

---

### Task 6: LLM Translation Provider

**Files:**
- Modify: `src-tauri/src/translation/llm_provider.rs`

- [ ] **Step 1: Implement LLM-based translation**

This provider doesn't call external translation APIs — it constructs a prompt and sends it through the existing LLM infrastructure. It needs an `AppHandle` to access the `LLMRouter` from state.

```rust
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
```

Note: Actual LLM translation (prompt construction + streaming) will be handled in `translation_commands.rs` where the `AppHandle` gives access to the `LLMRouter`. The `LlmTranslator` struct is primarily a type marker.

- [ ] **Step 2: Verify compilation + commit**

```bash
cd src-tauri && cargo check
git add src-tauri/src/translation/llm_provider.rs
git commit -m "feat(translation): implement LLM translation provider marker"
```

---

### Task 7: OPUS-MT Local Provider (Stub for v1)

**Files:**
- Modify: `src-tauri/src/translation/opus_mt.rs`

- [ ] **Step 1: Implement OPUS-MT as a functional stub with model discovery**

Full ONNX inference requires downloading Helsinki-NLP models, implementing tokenization, and running encoder-decoder inference. For v1, implement the provider with model discovery and a clear "download models" path, but defer full inference to a follow-up task.

The stub should:
- Check for downloaded models in `{app_data_dir}/models/translation/`
- Report available language pairs based on downloaded model directories
- Return a clear error when no models are downloaded
- `test_connection` checks if model files exist

- [ ] **Step 2: Verify compilation + commit**

```bash
cd src-tauri && cargo check
git add src-tauri/src/translation/opus_mt.rs
git commit -m "feat(translation): add OPUS-MT provider with model discovery (inference TBD)"
```

---

### Task 8: IPC Commands + State Registration

**Files:**
- Create: `src-tauri/src/commands/translation_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs:13` — add `pub mod translation_commands;`
- Modify: `src-tauri/src/state.rs:12,62,106` — add `TranslationRouter` to `AppState`
- Modify: `src-tauri/src/lib.rs:10,43,237,364` — import, init, register commands

- [ ] **Step 1: Add `TranslationRouter` to `AppState`**

In `src-tauri/src/state.rs`:
- Add import: `use crate::translation::TranslationRouter;` after line 16
- Add field: `pub translation: Option<Arc<Mutex<TranslationRouter>>>,` after line 63 (after `rag`)
- Add init: `translation: None,` after line 108 (after `rag: None,`) in `AppState::new()`

- [ ] **Step 2: Initialize router in `lib.rs` setup**

In `src-tauri/src/lib.rs`:
- Add `pub mod translation;` after line 9
- Add `use commands::translation_commands;` after line 43
- After the LLM router initialization (after line 230), add:

```rust
// -- Initialize TranslationRouter --
let translation_router = translation::TranslationRouter::new();
app_state.translation = Some(Arc::new(Mutex::new(translation_router)));
log::info!("Translation router initialized");
```

- [ ] **Step 3: Create `translation_commands.rs`**

**IMPORTANT implementation notes (fixes from plan review):**
- **Never hold `std::sync::Mutex` guard across `.await`** — clone `Arc<dyn TranslationProvider>` out of the lock scope, then drop the lock, then await on the Arc clone.
- **Retry once with 1s backoff** on translation failure. Track `consecutive_failures` in the router. After 3+, emit `translation_error` event with "paused" flag.
- **Split long segments** using `TranslationRouter::split_long_text()` (>5000 chars for cloud, ~500 for ONNX).
- **Stale detection:** When loading cached translations from DB, compare `original_text` to current segment text. If different, re-translate.
- **LLM provider:** Detect `TranslationProviderType::Llm` and route through `translate_via_llm()` helper (uses `LLMRouter`).
- **Offline fallback:** In `translate_text`/`translate_segments`, if cloud provider fails and OPUS-MT is available, auto-switch. (Check `router.opus_mt_available()` before falling back.)

```rust
// src-tauri/src/commands/translation_commands.rs
use tauri::{command, AppHandle, Emitter};
use crate::state::AppState;
use crate::translation::{
    TranslationProviderType, TranslationResult, ConnectionStatus, Language,
    DetectedLanguage,
};
use tauri::Manager;

#[derive(serde::Deserialize)]
pub struct SetProviderArgs {
    pub provider: String,
    pub region: Option<String>,
}

#[command]
pub async fn set_translation_provider(
    app: AppHandle,
    provider: String,
    region: Option<String>,
) -> Result<(), String> {
    let state = app.state::<AppState>();

    // Load credentials from CredentialManager into the router
    if let Some(ref cred_arc) = state.credentials {
        if let Ok(cred) = cred_arc.lock() {
            let trans_arc = state.translation.as_ref()
                .ok_or("Translation router not initialized")?;
            let mut router = trans_arc.lock()
                .map_err(|_| "Translation lock poisoned".to_string())?;

            if let Ok(Some(key)) = cred.get_key("translation_microsoft") {
                router.set_microsoft_credentials(key, region.clone());
            }
            if let Ok(Some(key)) = cred.get_key("translation_google") {
                router.set_google_credentials(key);
            }
            if let Ok(Some(key)) = cred.get_key("translation_deepl") {
                router.set_deepl_credentials(key);
            }
        }
    }

    let provider_type = match provider.as_str() {
        "microsoft" => TranslationProviderType::Microsoft,
        "google" => TranslationProviderType::Google,
        "deepl" => TranslationProviderType::Deepl,
        "opus-mt" => TranslationProviderType::OpusMt,
        "llm" => TranslationProviderType::Llm,
        other => return Err(format!("Unknown translation provider: {}", other)),
    };

    let trans_arc = state.translation.as_ref()
        .ok_or("Translation router not initialized")?;
    let mut router = trans_arc.lock()
        .map_err(|_| "Translation lock poisoned".to_string())?;

    router.set_provider(provider_type)
        .map_err(|e| e.to_string())
}

#[command]
pub async fn translate_text(
    app: AppHandle,
    text: String,
    target_lang: Option<String>,
    source_lang: Option<String>,
) -> Result<TranslationResult, String> {
    let state = app.state::<AppState>();
    let trans_arc = state.translation.as_ref()
        .ok_or("Translation router not initialized")?;

    let target = target_lang.unwrap_or_else(|| "es".to_string());
    let source = source_lang.as_deref();

    // Check cache first, then clone Arc<dyn Provider> BEFORE dropping lock
    let (cached_result, provider_arc, provider_name) = {
        let router = trans_arc.lock().map_err(|_| "Lock poisoned")?;
        if let Some(cached) = router.cache().get(&text, &target) {
            (Some(cached.to_string()), None, router.active_provider_name())
        } else {
            let p = router.get_provider().map_err(|e| e.to_string())?;
            let name = p.provider_name().to_string();
            (None, Some(p), name)
        }
        // Lock dropped here — safe to .await below
    };

    if let Some(cached) = cached_result {
        return Ok(TranslationResult {
            segment_id: None,
            original_text: text,
            translated_text: cached,
            source_lang: source.unwrap_or("auto").to_string(),
            target_lang: target,
            provider: provider_name,
        });
    }

    // Translate — no lock held, using Arc clone
    let provider = provider_arc.unwrap();

    // Handle LLM provider specially — construct a translation prompt
    // and route through LLMRouter instead of the marker trait
    let is_llm = {
        let router = trans_arc.lock().map_err(|_| "Lock poisoned")?;
        router.active_type() == Some(&crate::translation::TranslationProviderType::Llm)
    };

    let translated = if is_llm {
        // LLM translation: use existing LLMRouter with a translation prompt
        translate_via_llm(&app, &text, source, &target).await?
    } else {
        // Split long text if needed (>5000 chars for cloud providers)
        let chunks = crate::translation::TranslationRouter::split_long_text(&text, 5000);
        let mut parts = Vec::new();
        for chunk in &chunks {
            // Retry once on failure
            match provider.translate(chunk, source, &target).await {
                Ok(t) => parts.push(t),
                Err(_first_err) => {
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    match provider.translate(chunk, source, &target).await {
                        Ok(t) => parts.push(t),
                        Err(e) => {
                            // Track consecutive failures
                            let mut router = trans_arc.lock().map_err(|_| "Lock poisoned")?;
                            router.consecutive_failures += 1;
                            if router.consecutive_failures >= 3 {
                                let _ = app.emit("translation_error", serde_json::json!({
                                    "error": "Translation paused — connection issue",
                                    "consecutive_failures": router.consecutive_failures,
                                }));
                            }
                            return Err(e.to_string());
                        }
                    }
                }
            }
        }
        // Reset failure counter on success
        {
            let mut router = trans_arc.lock().map_err(|_| "Lock poisoned")?;
            router.consecutive_failures = 0;
        }
        parts.join("")
    };

    // Cache the result
    {
        let mut router = trans_arc.lock().map_err(|_| "Lock poisoned")?;
        router.cache_mut().insert(&text, &target, translated.clone());
    }

    Ok(TranslationResult {
        segment_id: None,
        original_text: text,
        translated_text: translated,
        source_lang: source.unwrap_or("auto").to_string(),
        target_lang: target,
        provider: provider_name,
    })
}

#[command]
pub async fn translate_segments(
    app: AppHandle,
    segment_ids: Vec<String>,
    texts: Vec<String>,
    meeting_id: String,
    target_lang: Option<String>,
    source_lang: Option<String>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let target = target_lang.unwrap_or_else(|| "es".to_string());
    let source = source_lang.as_deref();

    let trans_arc = state.translation.as_ref()
        .ok_or("Translation router not initialized")?;

    // Clone provider Arc out of lock scope — safe to .await
    let (provider_arc, provider_name) = {
        let router = trans_arc.lock().map_err(|_| "Lock poisoned")?;
        let p = router.get_provider().map_err(|e| e.to_string())?;
        let name = p.provider_name().to_string();
        (p, name)
    };

    for (seg_id, text) in segment_ids.iter().zip(texts.iter()) {
        // Skip if source == target language detected
        let translated = provider_arc.translate(text, source, &target).await
            .map_err(|e| e.to_string())?;

        // Save to DB
        if let Some(ref db_arc) = state.database {
            if let Ok(db) = db_arc.lock() {
                let _ = crate::db::translation::save_translation(
                    db.connection(),
                    seg_id,
                    &meeting_id,
                    source.unwrap_or("auto"),
                    &target,
                    text,
                    &translated,
                    &provider_name,
                );
            }
        }

        // Emit result event
        let result = TranslationResult {
            segment_id: Some(seg_id.clone()),
            original_text: text.clone(),
            translated_text: translated,
            source_lang: source.unwrap_or("auto").to_string(),
            target_lang: target.clone(),
            provider: provider_name.clone(),
        };
        let _ = app.emit("translation_result", &result);
    }

    Ok(())
}

#[command]
pub async fn translate_batch(
    app: AppHandle,
    meeting_id: String,
    target_lang: Option<String>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let target = target_lang.unwrap_or_else(|| "es".to_string());

    // Load all segments for the meeting from DB
    let segments: Vec<(String, String)> = {
        let db_arc = state.database.as_ref().ok_or("DB not initialized")?;
        let db = db_arc.lock().map_err(|_| "DB lock poisoned")?;
        let mut stmt = db.connection().prepare(
            "SELECT id, text FROM transcript_segments WHERE meeting_id = ?1 AND is_final = 1 ORDER BY timestamp_ms"
        ).map_err(|e| e.to_string())?;
        stmt.query_map([&meeting_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
    };

    let total = segments.len();

    // Translate in chunks of 10
    for (chunk_idx, chunk) in segments.chunks(10).enumerate() {
        let texts: Vec<String> = chunk.iter().map(|(_, t)| t.clone()).collect();
        let seg_ids: Vec<String> = chunk.iter().map(|(id, _)| id.clone()).collect();

        // Clone Arc out of lock before .await
        let (provider_arc, provider_name) = {
            let trans_arc = state.translation.as_ref()
                .ok_or("Translation router not initialized")?;
            let router = trans_arc.lock().map_err(|_| "Lock poisoned")?;
            let p = router.get_provider().map_err(|e| e.to_string())?;
            (p, router.active_provider_name())
        };

        let translations = provider_arc.translate_batch(&texts, None, &target).await
            .map_err(|e| e.to_string())?;

        // Save each translation
        for (i, ((seg_id, orig_text), translated)) in chunk.iter().zip(translations.iter()).enumerate() {
            if let Some(ref db_arc) = state.database {
                if let Ok(db) = db_arc.lock() {
                    let _ = crate::db::translation::save_translation(
                        db.connection(), seg_id, &meeting_id,
                        "auto", &target, orig_text, translated, &provider_name,
                    );
                }
            }

            let result = TranslationResult {
                segment_id: Some(seg_id.clone()),
                original_text: orig_text.clone(),
                translated_text: translated.clone(),
                source_lang: "auto".to_string(),
                target_lang: target.clone(),
                provider: provider_name.clone(),
            };
            let _ = app.emit("translation_result", &result);
        }

        // Emit progress
        let completed = (chunk_idx + 1) * chunk.len().min(10);
        let _ = app.emit("batch_translation_progress", serde_json::json!({
            "meetingId": meeting_id,
            "completed": completed.min(total),
            "total": total,
            "targetLang": target,
        }));
    }

    Ok(())
}

#[command]
pub async fn detect_language(
    app: AppHandle,
    text: String,
) -> Result<DetectedLanguage, String> {
    let state = app.state::<AppState>();
    let trans_arc = state.translation.as_ref()
        .ok_or("Translation router not initialized")?;
    let provider_arc = {
        let router = trans_arc.lock().map_err(|_| "Lock poisoned")?;
        router.get_provider().map_err(|e| e.to_string())?
        // lock dropped here
    };
    provider_arc.detect_language(&text).await.map_err(|e| e.to_string())
}

#[command]
pub async fn test_translation_connection(
    app: AppHandle,
    provider: String,
) -> Result<ConnectionStatus, String> {
    let state = app.state::<AppState>();
    let trans_arc = state.translation.as_ref()
        .ok_or("Translation router not initialized")?;
    let provider_arc = {
        let router = trans_arc.lock().map_err(|_| "Lock poisoned")?;
        router.get_provider().map_err(|e| e.to_string())?
        // lock dropped here
    };
    provider_arc.test_connection().await.map_err(|e| e.to_string())
}

#[command]
pub async fn get_translation_languages(
    app: AppHandle,
) -> Result<Vec<Language>, String> {
    let state = app.state::<AppState>();
    let trans_arc = state.translation.as_ref()
        .ok_or("Translation router not initialized")?;
    let provider_arc = {
        let router = trans_arc.lock().map_err(|_| "Lock poisoned")?;
        router.get_provider().map_err(|e| e.to_string())?
        // lock dropped here
    };
    provider_arc.supported_languages().await.map_err(|e| e.to_string())
}

#[command]
pub async fn get_meeting_translations(
    app: AppHandle,
    meeting_id: String,
    target_lang: String,
) -> Result<Vec<TranslationResult>, String> {
    let state = app.state::<AppState>();
    let db_arc = state.database.as_ref().ok_or("DB not initialized")?;
    let db = db_arc.lock().map_err(|_| "DB lock poisoned")?;

    let rows = crate::db::translation::get_meeting_translations(
        db.connection(), &meeting_id, &target_lang
    ).map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|r| TranslationResult {
        segment_id: Some(r.segment_id),
        original_text: r.original_text,
        translated_text: r.translated_text,
        source_lang: r.source_lang,
        target_lang: r.target_lang,
        provider: r.provider,
    }).collect())
}

/// Helper: translate text using the configured LLM provider
/// instead of a dedicated translation API.
async fn translate_via_llm(
    app: &AppHandle,
    text: &str,
    source: Option<&str>,
    target: &str,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    let llm_arc = state.llm.as_ref().ok_or("LLM router not initialized")?;

    let src_label = source.unwrap_or("the detected language");
    let prompt = format!(
        "Translate the following text from {} to {}. \
         Return ONLY the translation, no explanations or commentary.\n\n{}",
        src_label, target, text
    );

    // Use the LLM router's stream_completion or a simple completion
    // This integrates with the existing LLM infrastructure
    let messages = vec![crate::llm::provider::LLMMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    let provider_arc = {
        let router = llm_arc.lock().map_err(|_| "LLM lock poisoned")?;
        router.get_provider().map_err(|e| format!("LLM not configured: {}", e))?
    };

    let provider = provider_arc.lock().await;
    let model = {
        let router = llm_arc.lock().map_err(|_| "LLM lock poisoned")?;
        router.active_model().to_string()
    };

    let params = crate::llm::provider::GenerationParams::default();
    let stats = provider.stream_completion(
        messages, &model, params, app.clone()
    ).await.map_err(|e| format!("LLM translation failed: {}", e))?;

    Ok(stats.content.unwrap_or_default())
}

#[command]
pub async fn export_translated_transcript(
    app: AppHandle,
    meeting_id: String,
    target_lang: String,
    format: String,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    let db_arc = state.database.as_ref().ok_or("DB not initialized")?;
    let db = db_arc.lock().map_err(|_| "DB lock poisoned")?;

    // Load segments
    let mut seg_stmt = db.connection().prepare(
        "SELECT id, text, speaker, timestamp_ms FROM transcript_segments
         WHERE meeting_id = ?1 AND is_final = 1 ORDER BY timestamp_ms"
    ).map_err(|e| e.to_string())?;

    let segments: Vec<(String, String, String, i64)> = seg_stmt
        .query_map([&meeting_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Load translations
    let translations = crate::db::translation::get_meeting_translations(
        db.connection(), &meeting_id, &target_lang
    ).map_err(|e| e.to_string())?;

    let trans_map: std::collections::HashMap<String, String> = translations
        .into_iter()
        .map(|t| (t.segment_id, t.translated_text))
        .collect();

    let mut output = String::new();

    match format.as_str() {
        "translated_txt" => {
            for (seg_id, _orig, speaker, _ts) in &segments {
                let translated = trans_map.get(seg_id).cloned().unwrap_or_else(|| "[not translated]".into());
                output.push_str(&format!("{}: {}\n", speaker, translated));
            }
        }
        "bilingual_txt" => {
            for (seg_id, orig, speaker, _ts) in &segments {
                let translated = trans_map.get(seg_id).cloned().unwrap_or_else(|| "[not translated]".into());
                output.push_str(&format!("{}: {}\n", speaker, orig));
                output.push_str(&format!("  → {}\n\n", translated));
            }
        }
        "bilingual_md" => {
            output.push_str("# Translated Transcript\n\n");
            for (seg_id, orig, speaker, ts) in &segments {
                let minutes = ts / 60000;
                let seconds = (ts % 60000) / 1000;
                let translated = trans_map.get(seg_id).cloned().unwrap_or_else(|| "[not translated]".into());
                output.push_str(&format!("**{}** _{:02}:{:02}_\n", speaker, minutes, seconds));
                output.push_str(&format!("> {}\n", orig));
                output.push_str(&format!("> _{}_\n\n", translated));
            }
        }
        _ => return Err(format!("Unknown export format: {}", format)),
    }

    Ok(output)
}
```

- [ ] **Step 4: Add `pub mod translation_commands;` to `src-tauri/src/commands/mod.rs`**

- [ ] **Step 5: Register commands in `lib.rs` invoke_handler**

Add after line 464 (after recording commands):

```rust
// == COMMANDS: translation ==
translation_commands::set_translation_provider,
translation_commands::translate_text,
translation_commands::translate_segments,
translation_commands::translate_batch,
translation_commands::detect_language,
translation_commands::test_translation_connection,
translation_commands::get_translation_languages,
translation_commands::get_meeting_translations,
translation_commands::export_translated_transcript,
```

- [ ] **Step 6: Verify full compilation**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/translation_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/state.rs src-tauri/src/lib.rs
git commit -m "feat(translation): add IPC commands + register in AppState and lib.rs"
```

---

### Task 9: Frontend Types + IPC + Events

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/lib/events.ts`

- [ ] **Step 1: Add translation types to `types.ts`**

Append to end of file:

```typescript
// == Translation ==

export type TranslationProviderType = "microsoft" | "google" | "deepl" | "opus-mt" | "llm";

export type TranslationDisplayMode = "inline" | "hover";

export interface TranslationResult {
  segment_id?: string;
  original_text: string;
  translated_text: string;
  source_lang: string;
  target_lang: string;
  provider: string;
}

export interface TranslationLanguage {
  code: string;
  name: string;
  native_name?: string;
}

export interface TranslationConnectionStatus {
  connected: boolean;
  language_count: number;
  response_ms: number;
  error?: string;
}

export interface BatchTranslationProgress {
  meetingId: string;
  completed: number;
  total: number;
  targetLang: string;
}

export interface TranslationConfig {
  provider: TranslationProviderType;
  targetLang: string;
  sourceLang: string;
  displayMode: TranslationDisplayMode;
  autoTranslateEnabled: boolean;
  selectionToolbarEnabled: boolean;
  cacheEnabled: boolean;
}
```

- [ ] **Step 2: Add IPC wrappers to `ipc.ts`**

Append to end of file:

```typescript
// == IPC: Translation ==

export async function setTranslationProvider(
  provider: string,
  region?: string,
): Promise<void> {
  return invoke("set_translation_provider", { provider, region });
}

export async function translateText(
  text: string,
  targetLang?: string,
  sourceLang?: string,
): Promise<TranslationResult> {
  return invoke<TranslationResult>("translate_text", {
    text,
    target_lang: targetLang,
    source_lang: sourceLang,
  });
}

export async function translateSegments(
  segmentIds: string[],
  texts: string[],
  meetingId: string,
  targetLang?: string,
  sourceLang?: string,
): Promise<void> {
  return invoke("translate_segments", {
    segment_ids: segmentIds,
    texts,
    meeting_id: meetingId,
    target_lang: targetLang,
    source_lang: sourceLang,
  });
}

export async function translateBatch(
  meetingId: string,
  targetLang?: string,
): Promise<void> {
  return invoke("translate_batch", {
    meeting_id: meetingId,
    target_lang: targetLang,
  });
}

export async function detectLanguage(
  text: string,
): Promise<{ lang: string; confidence: number }> {
  return invoke("detect_language", { text });
}

export async function testTranslationConnection(
  provider: string,
): Promise<TranslationConnectionStatus> {
  return invoke<TranslationConnectionStatus>("test_translation_connection", { provider });
}

export async function getTranslationLanguages(): Promise<TranslationLanguage[]> {
  return invoke<TranslationLanguage[]>("get_translation_languages");
}

export async function getMeetingTranslations(
  meetingId: string,
  targetLang: string,
): Promise<TranslationResult[]> {
  return invoke<TranslationResult[]>("get_meeting_translations", {
    meeting_id: meetingId,
    target_lang: targetLang,
  });
}

export async function exportTranslatedTranscript(
  meetingId: string,
  targetLang: string,
  format: string,
): Promise<string> {
  return invoke<string>("export_translated_transcript", {
    meeting_id: meetingId,
    target_lang: targetLang,
    format,
  });
}
```

Add the necessary type imports at the top of `ipc.ts` from `types.ts`.

- [ ] **Step 3: Add event listeners to `events.ts`**

Append to end of file:

```typescript
// == Events: Translation ==

export function onTranslationResult(
  handler: (result: TranslationResult) => void,
): Promise<UnlistenFn> {
  return listen<TranslationResult>("translation_result", (e) =>
    handler(e.payload),
  );
}

export function onTranslationError(
  handler: (error: { segment_id?: string; error: string }) => void,
): Promise<UnlistenFn> {
  return listen<{ segment_id?: string; error: string }>("translation_error", (e) =>
    handler(e.payload),
  );
}

export function onBatchTranslationProgress(
  handler: (progress: BatchTranslationProgress) => void,
): Promise<UnlistenFn> {
  return listen<BatchTranslationProgress>("batch_translation_progress", (e) =>
    handler(e.payload),
  );
}
```

Add the necessary type imports from `types.ts`.

- [ ] **Step 4: Verify frontend compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/ipc.ts src/lib/events.ts
git commit -m "feat(translation): add TypeScript types, IPC wrappers, and event listeners"
```

---

### Task 10: Translation Store (Zustand)

**Files:**
- Create: `src/stores/translationStore.ts`

- [ ] **Step 1: Create the Zustand store**

Follow the `configStore.ts` pattern — Tauri plugin-store persistence, cross-window sync.

```typescript
// src/stores/translationStore.ts
import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";
import type {
  TranslationProviderType,
  TranslationDisplayMode,
  TranslationResult,
} from "../lib/types";

const STORE_PATH = "translation-config.json";
let storeInstance: LazyStore | null = null;

async function getStore(): Promise<LazyStore> {
  if (!storeInstance) {
    storeInstance = new LazyStore(STORE_PATH);
  }
  return storeInstance;
}

async function persistValue(key: string, value: unknown): Promise<void> {
  try {
    const store = await getStore();
    await store.set(key, value);
  } catch (err) {
    console.error(`[translationStore] Failed to persist "${key}":`, err);
  }
}

interface TranslationState {
  // Persisted preferences
  provider: TranslationProviderType;
  targetLang: string;
  sourceLang: string; // "auto" or ISO code
  displayMode: TranslationDisplayMode;
  autoTranslateEnabled: boolean;
  selectionToolbarEnabled: boolean;
  cacheEnabled: boolean;

  // Session state (not persisted)
  autoTranslateActive: boolean; // current session toggle
  translations: Map<string, TranslationResult>; // segmentId → result
  translating: Set<string>; // segmentIds currently being translated
  batchProgress: { completed: number; total: number } | null;

  // Actions
  setProvider: (provider: TranslationProviderType) => void;
  setTargetLang: (lang: string) => void;
  setSourceLang: (lang: string) => void;
  setDisplayMode: (mode: TranslationDisplayMode) => void;
  setAutoTranslateEnabled: (enabled: boolean) => void;
  setSelectionToolbarEnabled: (enabled: boolean) => void;
  setCacheEnabled: (enabled: boolean) => void;
  setAutoTranslateActive: (active: boolean) => void;
  addTranslation: (result: TranslationResult) => void;
  addTranslations: (results: TranslationResult[]) => void;
  setTranslating: (segmentId: string, isTranslating: boolean) => void;
  setBatchProgress: (progress: { completed: number; total: number } | null) => void;
  clearTranslations: () => void;
  loadConfig: () => Promise<void>;
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  provider: "microsoft",
  targetLang: "es",
  sourceLang: "auto",
  displayMode: "inline",
  autoTranslateEnabled: true,
  selectionToolbarEnabled: true,
  cacheEnabled: true,
  autoTranslateActive: false,
  translations: new Map(),
  translating: new Set(),
  batchProgress: null,

  setProvider: (provider) => {
    set({ provider });
    persistValue("provider", provider);
  },
  setTargetLang: (lang) => {
    set({ targetLang: lang });
    persistValue("targetLang", lang);
  },
  setSourceLang: (lang) => {
    set({ sourceLang: lang });
    persistValue("sourceLang", lang);
  },
  setDisplayMode: (mode) => {
    set({ displayMode: mode });
    persistValue("displayMode", mode);
  },
  setAutoTranslateEnabled: (enabled) => {
    set({ autoTranslateEnabled: enabled });
    persistValue("autoTranslateEnabled", enabled);
  },
  setSelectionToolbarEnabled: (enabled) => {
    set({ selectionToolbarEnabled: enabled });
    persistValue("selectionToolbarEnabled", enabled);
  },
  setCacheEnabled: (enabled) => {
    set({ cacheEnabled: enabled });
    persistValue("cacheEnabled", enabled);
  },
  setAutoTranslateActive: (active) => set({ autoTranslateActive: active }),

  addTranslation: (result) => {
    if (!result.segment_id) return;
    set((state) => {
      const updated = new Map(state.translations);
      updated.set(result.segment_id!, result);
      const translating = new Set(state.translating);
      translating.delete(result.segment_id!);
      return { translations: updated, translating };
    });
  },
  addTranslations: (results) => {
    set((state) => {
      const updated = new Map(state.translations);
      const translating = new Set(state.translating);
      for (const r of results) {
        if (r.segment_id) {
          updated.set(r.segment_id, r);
          translating.delete(r.segment_id);
        }
      }
      return { translations: updated, translating };
    });
  },
  setTranslating: (segmentId, isTranslating) => {
    set((state) => {
      const updated = new Set(state.translating);
      if (isTranslating) updated.add(segmentId);
      else updated.delete(segmentId);
      return { translating: updated };
    });
  },
  setBatchProgress: (progress) => set({ batchProgress: progress }),
  clearTranslations: () => set({ translations: new Map(), translating: new Set() }),

  loadConfig: async () => {
    const store = await getStore();
    const provider = await store.get<TranslationProviderType>("provider");
    const targetLang = await store.get<string>("targetLang");
    const sourceLang = await store.get<string>("sourceLang");
    const displayMode = await store.get<TranslationDisplayMode>("displayMode");
    const autoTranslateEnabled = await store.get<boolean>("autoTranslateEnabled");
    const selectionToolbarEnabled = await store.get<boolean>("selectionToolbarEnabled");
    const cacheEnabled = await store.get<boolean>("cacheEnabled");

    set({
      provider: provider ?? "microsoft",
      targetLang: targetLang ?? "es",
      sourceLang: sourceLang ?? "auto",
      displayMode: displayMode ?? "inline",
      autoTranslateEnabled: autoTranslateEnabled ?? true,
      selectionToolbarEnabled: selectionToolbarEnabled ?? true,
      cacheEnabled: cacheEnabled ?? true,
    });

    // Cross-window sync
    store.onKeyChange<TranslationProviderType>("provider", (val) => {
      if (val != null) set({ provider: val });
    });
    store.onKeyChange<string>("targetLang", (val) => {
      if (val != null) set({ targetLang: val });
    });
    store.onKeyChange<TranslationDisplayMode>("displayMode", (val) => {
      if (val != null) set({ displayMode: val });
    });
    store.onKeyChange<boolean>("autoTranslateEnabled", (val) => {
      if (val != null) set({ autoTranslateEnabled: val });
    });
  },
}));
```

- [ ] **Step 2: Verify frontend compiles + commit**

```bash
npx tsc --noEmit
git add src/stores/translationStore.ts
git commit -m "feat(translation): add translationStore with persistence and cross-window sync"
```

---

### Task 11: useTranslation Hook

**Files:**
- Create: `src/hooks/useTranslation.ts`

- [ ] **Step 1: Create the hook following the `useTranscript.ts` pattern**

The hook subscribes to `translation_result` and `batch_translation_progress` events and routes results into the store. It also provides an `autoTranslate` function that watches for new final transcript segments.

```typescript
// src/hooks/useTranslation.ts
import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  onTranslationResult,
  onTranslationError,
  onBatchTranslationProgress,
} from "../lib/events";
import { useTranslationStore } from "../stores/translationStore";

export function useTranslation() {
  const addTranslation = useTranslationStore((s) => s.addTranslation);
  const setBatchProgress = useTranslationStore((s) => s.setBatchProgress);

  const addRef = useRef(addTranslation);
  const progressRef = useRef(setBatchProgress);

  useEffect(() => {
    addRef.current = addTranslation;
    progressRef.current = setBatchProgress;
  }, [addTranslation, setBatchProgress]);

  useEffect(() => {
    let unResult: UnlistenFn | null = null;
    let unError: UnlistenFn | null = null;
    let unProgress: UnlistenFn | null = null;
    let mounted = true;

    const setup = async () => {
      const u1 = await onTranslationResult((result) => {
        if (!mounted) return;
        addRef.current(result);
      });

      const u2 = await onTranslationError((error) => {
        if (!mounted) return;
        console.warn("[translation] Error:", error.error, error.segment_id);
      });

      const u3 = await onBatchTranslationProgress((progress) => {
        if (!mounted) return;
        progressRef.current(
          progress.completed >= progress.total ? null : progress,
        );
      });

      if (mounted) {
        unResult = u1;
        unError = u2;
        unProgress = u3;
      } else {
        u1();
        u2();
        u3();
      }
    };

    setup();

    return () => {
      mounted = false;
      if (unResult) unResult();
      if (unError) unError();
      if (unProgress) unProgress();
    };
  }, []);
}
```

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/hooks/useTranslation.ts
git commit -m "feat(translation): add useTranslation hook for event subscriptions"
```

---

### Task 12: Translation Settings Page

**Files:**
- Create: `src/settings/TranslationSettings.tsx`

- [ ] **Step 1: Create TranslationSettings component**

Follow the STT/LLM settings pattern: provider grid (local vs cloud groups), API key input with show/hide, test connection, language dropdowns, behavior toggles. Reference the mockup from the brainstorming session and the STTSettings.tsx patterns (provider cards, badge variants, input styling).

This is the largest frontend component (~400 lines). Key sections:
1. Active provider banner (purple/primary background)
2. Provider selection grid: Local (OPUS-MT, LLM) vs Cloud (Microsoft, Google, DeepL)
3. API key input (conditional per provider) with Save & Test
4. Language settings: target + source dropdowns
5. Behavior toggles: auto-translate, display mode, selection toolbar, cache

Use the same Tailwind classes as STTSettings/LLMSettings for consistency:
- Card: `rounded-xl border border-border/30 bg-card/50 p-5`
- Section header: `mb-3 text-sm font-semibold text-primary/80`
- Input: `w-full rounded-lg border border-border/50 bg-background px-3.5 py-2.5 text-sm`
- Button secondary: `inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-4 py-2 text-sm font-medium`

Import lucide-react icons: `Globe, Cloud, Server, CheckCircle, XCircle, Eye, EyeOff, Loader2, Wifi`

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/settings/TranslationSettings.tsx
git commit -m "feat(translation): add TranslationSettings page matching STT/LLM pattern"
```

---

### Task 13: Settings Navigation Integration

**Files:**
- Modify: `src/settings/SettingsOverlay.tsx:1,32,57,147`

- [ ] **Step 1: Add Translation tab to SettingsOverlay**

1. Add import: `import { TranslationSettings } from "./TranslationSettings";` and `import { Globe } from "lucide-react";` (if not already imported)

2. Update `SettingsTab` type (line 32): add `| "translation"`

3. Add to `TAB_GROUPS` (line 55-58, in the "Providers" group, after STT):
```typescript
{ id: "translation", label: "Translation", icon: <Globe className="h-4 w-4" /> },
```

4. Add case to `renderTabContent` switch (after line 158):
```typescript
case "translation":
  return <TranslationSettings />;
```

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/settings/SettingsOverlay.tsx
git commit -m "feat(translation): add Translation tab to settings navigation"
```

---

### Task 14: Overlay Toolbar — Translate Toggle + View Switch

**Files:**
- Modify: `src/overlay/OverlayView.tsx`

- [ ] **Step 1: Add translation controls to overlay toolbar**

Read `OverlayView.tsx` to find the exact toolbar location. Add:

1. Import `useTranslationStore` and `Globe` icon
2. Subscribe to store: `autoTranslateActive`, `displayMode`, `setAutoTranslateActive`, `setDisplayMode`
3. Add toolbar button group after existing buttons:

```tsx
{/* Translation controls */}
<button
  onClick={() => setAutoTranslateActive(!autoTranslateActive)}
  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all ${
    autoTranslateActive
      ? "bg-primary/10 text-primary ring-1 ring-primary/20"
      : "text-muted-foreground hover:bg-accent"
  }`}
  title="Toggle auto-translate"
>
  <Globe className="h-3 w-3" />
  Translate
</button>

{autoTranslateActive && (
  <div className="flex rounded-md border border-border/30 overflow-hidden">
    <button
      onClick={() => setDisplayMode("inline")}
      className={`px-2 py-0.5 text-[10px] font-medium transition-all ${
        displayMode === "inline" ? "bg-primary/15 text-primary" : "text-muted-foreground/50"
      }`}
    >
      Inline
    </button>
    <button
      onClick={() => setDisplayMode("hover")}
      className={`px-2 py-0.5 text-[10px] font-medium border-l border-border/30 transition-all ${
        displayMode === "hover" ? "bg-primary/15 text-primary" : "text-muted-foreground/50"
      }`}
    >
      Hover
    </button>
  </div>
)}
```

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/overlay/OverlayView.tsx
git commit -m "feat(translation): add translate toggle and view switch to overlay toolbar"
```

---

### Task 15: TranscriptLine — Translation Display

**Files:**
- Modify: `src/overlay/TranscriptLine.tsx`

- [ ] **Step 1: Add translation display to TranscriptLine**

Read `TranscriptLine.tsx`. Add:

1. Import `useTranslationStore`
2. Subscribe: `translations` map, `translating` set, `displayMode`, `autoTranslateActive`
3. Get translation for this segment: `const translation = translations.get(segment.id)`
4. Get loading state: `const isTranslating = translating.has(segment.id)`

After the main text span, conditionally render:

**Inline Below mode:**
```tsx
{autoTranslateActive && displayMode === "inline" && (
  <div className="pl-[40px] text-[11.5px] text-primary/45 italic leading-snug">
    {isTranslating ? (
      <span className="text-muted-foreground/30 animate-pulse">Translating...</span>
    ) : translation ? (
      translation.translated_text
    ) : null}
  </div>
)}
```

**Hover mode:** Add a tooltip that shows on hover using a `title` attribute or a custom tooltip component showing the translated text.

- [ ] **Step 2: Verify + commit**

```bash
npx tsc --noEmit
git add src/overlay/TranscriptLine.tsx
git commit -m "feat(translation): add inline-below and hover translation display to TranscriptLine"
```

---

### Task 16: Selection Toolbar + Translation Popup

**Files:**
- Create: `src/components/SelectionToolbar.tsx`
- Create: `src/components/TranslationPopup.tsx`

- [ ] **Step 1: Create SelectionToolbar**

A floating toolbar that appears when text is selected anywhere in the app. Listens to `mouseup`/`selectionchange` events on the document. Shows Translate | Copy | Bookmark buttons.

Key implementation:
- `useEffect` subscribes to `document.addEventListener("mouseup", handleSelection)`
- `window.getSelection()` to get selected text + bounding rect
- Position toolbar above the selection using `getBoundingClientRect()`
- Click "Translate" calls `translateText()` IPC and shows `TranslationPopup`
- Dismiss on click outside or Escape

~120 lines of code. Use absolute positioning with `portal` pattern (render at document root).

- [ ] **Step 2: Create TranslationPopup**

Small popup component that receives `TranslationResult` and renders:
- Translated text (bold)
- Language pair badge: "EN → ES"
- Provider name (muted)
- Copy button

~60 lines. Position below the selection toolbar.

- [ ] **Step 3: Mount SelectionToolbar in the app root**

Add `<SelectionToolbar />` to the appropriate root component (likely `App.tsx` or the overlay/launcher root) so it's available globally. Guard with `selectionToolbarEnabled` from store.

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit
git add src/components/SelectionToolbar.tsx src/components/TranslationPopup.tsx
git commit -m "feat(translation): add select-to-translate mini toolbar and popup"
```

---

### Task 17: Call Log — Batch Translate + Export

**Files:**
- Modify: Call log meeting view component(s) in `src/calllog/`

- [ ] **Step 1: Explore call log components to find integration point**

Read the call log meeting detail view to find where the meeting header / action buttons are rendered.

- [ ] **Step 2: Add "Translate All" button**

Add a button in the meeting header that calls `translateBatch(meetingId, targetLang)`. Show `batchProgress` from the store as a progress bar below the header when active.

- [ ] **Step 3: Add "Export" dropdown**

Add a dropdown button with 4 options:
- Translated transcript (.txt)
- Bilingual transcript (.txt)
- Bilingual transcript (.md)
- Copy to clipboard

Each calls `exportTranslatedTranscript(meetingId, targetLang, format)` and either saves to file or copies to clipboard.

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit
git add src/calllog/
git commit -m "feat(translation): add batch translate and export to call log"
```

---

### Task 18: Auto-Translate Trigger in useTranslation

**Files:**
- Modify: `src/hooks/useTranslation.ts`

- [ ] **Step 1: Add auto-translate trigger on new final segments**

Enhance the `useTranslation` hook to watch for new final transcript segments and auto-translate them when `autoTranslateActive` is true.

Subscribe to the transcript store's final segments. When a new segment arrives and auto-translate is active, call `translateSegments([segmentId], [text], meetingId, targetLang)`.

Debounce by 200ms to avoid translating rapid successive segments individually.

- [ ] **Step 2: Add meeting translations preload**

When a meeting is opened in the call log, preload cached translations from the DB:
```typescript
const cached = await getMeetingTranslations(meetingId, targetLang);
addTranslations(cached);
```

- [ ] **Step 3: Verify + commit**

```bash
npx tsc --noEmit
git add src/hooks/useTranslation.ts
git commit -m "feat(translation): add auto-translate trigger and meeting translation preload"
```

---

### Task 19: Version Bump + Final Wiring

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Bump version**

```typescript
export const NEXQ_VERSION = "2.12.0";
export const NEXQ_BUILD_DATE = "2026-03-24";
```

- [ ] **Step 2: Ensure useTranslation hook is mounted**

Add `useTranslation()` call in the overlay view (or a shared layout component) so translation events are always listened to during meetings. Also call `translationStore.loadConfig()` during app initialization (alongside other store loads).

- [ ] **Step 3: Full build test**

```bash
npm run build
cd src-tauri && cargo build
```

Expected: Both frontend and backend compile without errors.

- [ ] **Step 4: Manual smoke test**

```bash
npx tauri dev
```

Verify:
- Translation tab appears in Settings
- Can select a provider and enter API key
- Test Connection works
- Target language dropdown populates
- Translation toggle appears in overlay toolbar
- Select-to-translate toolbar appears on text selection

- [ ] **Step 5: Final commit**

```bash
git add src/lib/version.ts
git commit -m "feat(translation): version bump to 2.12.0 + final wiring"
```
