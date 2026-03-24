# Translation Feature — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Transcript translation (full-line + word/phrase lookup) across live meetings and post-meeting review

---

## Overview

Add translation capabilities to NexQ, enabling users to translate meeting transcripts both in real-time during meetings and when reviewing past meetings. The feature supports multiple translation providers (cloud + local), two display modes, and a select-to-translate interaction that works on any text in the app.

## Goals

1. Translate transcript lines automatically during live meetings (togglable)
2. Translate individual words/phrases on demand via text selection
3. Batch-translate and export past meeting transcripts
4. Support multiple translation providers with a settings page consistent with STT/LLM patterns
5. Provide at least one fully offline/private translation option

## Non-Goals

- Auto-translating AI-generated content (summaries, responses) — users can select-to-translate these on demand
- Simultaneous translation to multiple target languages
- Real-time speech-to-speech translation
- Translation of audio/recordings

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React)                                   │
│                                                     │
│  translationStore (Zustand)                         │
│    ├─ provider, targetLang, displayMode, autoOn     │
│    ├─ translations: Map<segmentId, TranslatedText>  │
│    └─ translating: Set<segmentId> (loading states)  │
│                                                     │
│  useTranslation hook                                │
│    ├─ listens: "translation_result" events          │
│    ├─ calls: translateSegment(), translateBatch()   │
│    └─ calls: translateText() (for word/phrase)      │
│                                                     │
│  UI Components                                      │
│    ├─ TranscriptLine → shows translation inline/    │
│    │                    hover based on displayMode   │
│    ├─ SelectionToolbar → mini toolbar on text select │
│    ├─ TranslationToggle → overlay toolbar button    │
│    └─ TranslationSettings → provider settings page  │
├─────────────────────────────────────────────────────┤
│  IPC (invoke + events)                              │
│    Commands: translate_segments, translate_text,    │
│      translate_batch, detect_language,              │
│      test_translation_connection,                   │
│      get_translation_languages                      │
│    Events: translation_result, translation_error,   │
│      batch_translation_progress                     │
├─────────────────────────────────────────────────────┤
│  Backend (Rust)                                     │
│                                                     │
│  TranslationManager (Arc<Mutex<>>)                  │
│    ├─ active_provider: Box<dyn TranslationProvider> │
│    ├─ cache: HashMap<(text_hash, lang), String>     │
│    └─ rate_limiter: per-provider throttle           │
│                                                     │
│  trait TranslationProvider                          │
│    ├─ translate(text, source, target) → String      │
│    ├─ translate_batch(texts, source, target) → Vec  │
│    ├─ detect_language(text) → String                │
│    ├─ supported_languages() → Vec<Language>         │
│    └─ test_connection() → bool                      │
│                                                     │
│  Providers                                          │
│    ├─ MicrosoftTranslator (reqwest + REST)          │
│    ├─ GoogleCloudTranslation (reqwest + REST)       │
│    ├─ DeepLTranslator (reqwest + REST / deepl crate)│
│    ├─ OpusMtTranslator (ort + ONNX models)          │
│    └─ LlmTranslator (reuses LlmManager)            │
│                                                     │
│  SQLite                                             │
│    └─ transcript_translations table                 │
└─────────────────────────────────────────────────────┘
```

### Key Data Flows

**Auto-translate (live meeting):** STT emits final segment → `useTranslation` hook picks it up → calls `invoke("translate_segments")` → Rust translates via active provider → emits `"translation_result"` event → store updates → `TranscriptLine` re-renders with translation.

**Select-to-translate:** User selects text → `SelectionToolbar` appears → click Translate → calls `invoke("translate_text")` → result returned directly (not evented) → shown in popup tooltip.

**Batch (post-meeting):** User clicks "Translate All" → calls `invoke("translate_batch")` → backend processes in chunks, emits `"batch_translation_progress"` events → results saved to SQLite → UI updates progressively.

---

## Translation Providers

| Provider | Type | Free Tier | Languages | Quality | Integration |
|----------|------|-----------|-----------|---------|-------------|
| Microsoft Translator | Cloud | 2M chars/month | 179 | Very good | `reqwest` + REST API |
| Google Cloud Translation | Cloud | 500K chars/month | 249 | Excellent | `reqwest` + REST API |
| DeepL | Cloud | 500K chars/month | 36 | Best (European) | `deepl` crate or REST |
| OPUS-MT (ONNX) | Local | Unlimited | ~58 pairs | Acceptable | `ort` crate (already in NexQ) |
| LLM | Local/Cloud | Varies | All | Good-Excellent | Reuses existing `LlmManager` |

### Provider Trait

```rust
#[async_trait]
pub trait TranslationProvider: Send + Sync {
    async fn translate(&self, text: &str, source: Option<&str>, target: &str) -> Result<String, TranslationError>;
    async fn translate_batch(&self, texts: &[&str], source: Option<&str>, target: &str) -> Result<Vec<String>, TranslationError>;
    async fn detect_language(&self, text: &str) -> Result<DetectedLanguage, TranslationError>;
    async fn supported_languages(&self) -> Result<Vec<Language>, TranslationError>;
    async fn test_connection(&self) -> Result<ConnectionStatus, TranslationError>;
    fn provider_name(&self) -> &str;
    fn is_local(&self) -> bool;
}
```

### Provider-Specific Configuration

- **Microsoft Translator:** API key + Azure region (optional, defaults to "global")
- **Google Cloud Translation:** API key (Google Cloud project required)
- **DeepL:** API key (free or pro)
- **OPUS-MT:** Model directory path, downloaded language pair models (~50-150MB each)
- **LLM:** No additional config — reuses the active LLM provider settings

---

## Database Schema

### New Table: `transcript_translations`

```sql
CREATE TABLE transcript_translations (
    id              TEXT PRIMARY KEY,
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

CREATE INDEX idx_translations_meeting
    ON transcript_translations(meeting_id, target_lang);
```

**Design decisions:**
- `UNIQUE(segment_id, target_lang)` — one translation per segment per target language. Switching from Spanish to French adds new rows; switching back to Spanish is instant from cache.
- `meeting_id` denormalized — avoids joining through `transcript_segments` for the hot path (loading all translations for a meeting).
- `original_text` stored — enables staleness detection when transcript segments are edited/corrected.

### In-Memory Cache (Rust)

```rust
// For ad-hoc translate_text calls (word/phrase lookups)
HashMap<(u64, String), String>  // (text_hash, target_lang) → translated_text
```

LRU-bounded at ~1000 entries. Not persisted — rebuilds from usage. Covers the select-to-translate path which doesn't have segment IDs.

---

## UI Components

### 1. Translation Settings Page

Follows the established STT/LLM provider settings pattern:

1. **Active Provider Banner** — shows current provider, target language, connection status
2. **Provider Selection** — grouped grid: Local & Offline (OPUS-MT, LLM) vs Cloud (Microsoft, Google, DeepL) with status dots, badges, free tier info bar
3. **API Key Configuration** — conditional for cloud providers. Show/hide toggle, "Get a free API key" link, provider-specific fields (e.g., Azure Region for Microsoft). Save & Test Connection + Make Active buttons
4. **Language Settings** — target language dropdown, source language dropdown with "Auto-detect (recommended)" default
5. **Behavior Toggles** — auto-translate during meetings, default display mode (Inline/Hover), select-to-translate toolbar enabled, cache translations to DB

### 2. Live Meeting Overlay

**Toolbar additions:**
- 🌐 Translate toggle button (enables/disables auto-translate for the session)
- Inline | Hover view mode toggle (switches display mode)
- Status badge showing target language + provider name

**Transcript display — Inline Below mode (default):**
- Translation appears directly below each transcript line
- Muted purple-tinted italic text — visually secondary to original
- Loading state shows "Translating..." with animated dots for the latest line
- Auto-scrolls naturally since translations are part of the line's DOM

**Transcript display — Hover Tooltip mode:**
- Transcript looks clean — no translations visible by default
- Hover over any line to see its translation in a floating tooltip below
- Tooltip shows: translated text, source→target language pair, provider name

**View toggle:** User switches between Inline and Hover at any time via the toolbar toggle. The switch is instant (translations are already cached in the store).

### 3. Select-to-Translate Mini Toolbar

Works on any selectable text in the app (transcript, AI responses, anywhere):

1. User selects text (drag or double-click a word)
2. Floating mini toolbar appears above the selection with: **Translate** | Copy | Bookmark
3. Click "Translate" → popup appears showing:
   - Translated text
   - Language pair (EN → ES)
   - Provider name
   - Copy button
4. Popup dismisses on click elsewhere or Escape

The toolbar integrates with existing selection behaviors (copy, bookmark) — it's an extension of the selection action bar, not a separate system.

### 4. Post-Meeting Call Log

**Meeting header additions:**
- "🌐 Translate All" button — triggers batch translation of the entire transcript
- "↗ Export" dropdown with translation-aware formats

**Batch translation:**
- Progress bar with segment count: "Translating to Spanish... 101 / 156"
- Results save to SQLite as they complete — partial results visible during processing
- If meeting already has cached translations for the target language, loads instantly

**Export formats:**
- Translated transcript (.txt) — target language only
- Bilingual transcript (.txt) — original + translation line by line
- Bilingual transcript (.md) — with speaker labels + timestamps
- Copy to clipboard — bilingual format

---

## Error Handling

### API Failures
- Single line failure: show inline "Translation unavailable" indicator (no toast spam)
- Retry once with 1s backoff. If still fails, mark as failed, user can retry via right-click
- 3+ consecutive failures: auto-pause auto-translate, show toast "Translation paused — connection issue"

### Rate Limiting
- Backend `TranslationManager` tracks calls/minute per provider
- Approaching limits: batch more aggressively (queue lines, translate in groups of 5-10)
- Limit hit: pause auto-translate, keep select-to-translate working (lower volume)

### Offline / No Internet
- Cloud providers fail immediately
- If OPUS-MT is configured as fallback: auto-switch to local provider
- No fallback configured: pause auto-translate, notify user
- OPUS-MT works regardless — no degradation

### Language Detection
- Low confidence auto-detect: translate anyway (best effort)
- Source == target detected: skip translation for that line (no redundant display)

### Long Segments
- Cloud APIs: split at sentence boundaries if >5K chars, translate chunks, rejoin
- ONNX models: split more aggressively (~512 token limit)

### Stale Translations
- If transcript segment is edited/corrected, mark cached translation as stale (`original_text` comparison)
- Re-translate automatically if auto-translate is on, or show "Translation outdated" indicator

### Provider Switch Mid-Meeting
- New translations use new provider, existing translations stay
- No disruption — each translation call is independent

---

## New Files

### Backend (Rust)

| File | Purpose |
|------|---------|
| `src-tauri/src/translation/mod.rs` | Module root, `TranslationManager`, `TranslationProvider` trait |
| `src-tauri/src/translation/microsoft.rs` | Microsoft Translator provider |
| `src-tauri/src/translation/google.rs` | Google Cloud Translation provider |
| `src-tauri/src/translation/deepl.rs` | DeepL provider |
| `src-tauri/src/translation/opus_mt.rs` | OPUS-MT ONNX local provider |
| `src-tauri/src/translation/llm.rs` | LLM-based translation provider |
| `src-tauri/src/commands/translation_commands.rs` | IPC command handlers |

### Frontend (React/TypeScript)

| File | Purpose |
|------|---------|
| `src/stores/translationStore.ts` | Zustand store for translation state |
| `src/hooks/useTranslation.ts` | Translation hook (IPC calls, event listeners, caching) |
| `src/components/SelectionToolbar.tsx` | Mini toolbar on text selection |
| `src/components/TranslationPopup.tsx` | Popup showing translation result |
| `src/settings/TranslationSettings.tsx` | Translation provider settings page |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add translation-related TypeScript types |
| `src/lib/ipc.ts` | Add typed wrappers for translation commands |
| `src/lib/events.ts` | Add typed listeners for translation events |
| `src-tauri/src/lib.rs` | Register translation command module |
| `src-tauri/src/state.rs` | Add `TranslationManager` to `AppState` |
| `src-tauri/src/commands/mod.rs` | Export translation commands |
| `src-tauri/src/db/` | Add migration for `transcript_translations` table |
| `src/overlay/TranscriptLine.tsx` | Add translation display (inline/hover) |
| `src/overlay/OverlayView.tsx` | Add translate toggle + view switch to toolbar |
| `src/calllog/` | Add batch translate button, export menu, progress bar |
| `src/settings/` | Add Translation tab to settings navigation |

---

## TypeScript Types

```typescript
// Translation provider identifiers
type TranslationProviderType = 'microsoft' | 'google' | 'deepl' | 'opus-mt' | 'llm';

// Translation display modes
type TranslationDisplayMode = 'inline' | 'hover';

// A single translation result
interface TranslationResult {
  segmentId?: string;          // present for transcript translations
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  provider: TranslationProviderType;
}

// Language info from provider
interface TranslationLanguage {
  code: string;                // ISO 639-1: "es", "fr", etc.
  name: string;                // "Spanish", "French", etc.
  nativeName?: string;         // "Español", "Français", etc.
}

// Provider connection status
interface TranslationConnectionStatus {
  connected: boolean;
  languageCount: number;
  responseMs: number;
  error?: string;
}

// Batch translation progress event
interface BatchTranslationProgress {
  meetingId: string;
  completed: number;
  total: number;
  targetLang: string;
}

// Translation settings in config store
interface TranslationConfig {
  provider: TranslationProviderType;
  targetLang: string;
  sourceLang: string | 'auto';
  displayMode: TranslationDisplayMode;
  autoTranslateEnabled: boolean;
  selectionToolbarEnabled: boolean;
  cacheEnabled: boolean;
}
```

---

## IPC Commands

| Command | Args | Returns | Purpose |
|---------|------|---------|---------|
| `translate_segments` | `{ segment_ids, target_lang?, source_lang? }` | `void` (results via events) | Translate transcript segments, emits `translation_result` events |
| `translate_text` | `{ text, target_lang?, source_lang? }` | `TranslationResult` | Translate arbitrary text (select-to-translate) |
| `translate_batch` | `{ meeting_id, target_lang? }` | `void` (progress via events) | Batch translate entire meeting, emits `batch_translation_progress` |
| `detect_language` | `{ text }` | `{ lang, confidence }` | Detect language of text |
| `test_translation_connection` | `{ provider }` | `TranslationConnectionStatus` | Test provider connectivity |
| `get_translation_languages` | `{ provider }` | `Vec<TranslationLanguage>` | List supported languages for provider |
| `set_translation_provider` | `{ provider, config }` | `void` | Switch active provider |
| `export_translated_transcript` | `{ meeting_id, format, target_lang }` | `string` | Generate exportable translated transcript |

---

## Events

| Event | Payload | Direction |
|-------|---------|-----------|
| `translation_result` | `TranslationResult` | Backend → Frontend |
| `translation_error` | `{ segment_id?, error }` | Backend → Frontend |
| `batch_translation_progress` | `BatchTranslationProgress` | Backend → Frontend |
