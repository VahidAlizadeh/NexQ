# AI Actions & Prompt Accuracy Overhaul

**Date:** 2026-03-25
**Status:** Draft
**Scope:** Backend prompt assembly, AI log panel, settings consolidation, RAG integration

## Problem Statement

The AI actions system has several integrity issues between what users configure in settings, what the AI log displays, and what is actually sent to the LLM. Key problems:

1. Clicking Assist on a past detected question sends the wrong question (always sends the latest)
2. RAG chunks section is completely absent from the AI log when no relevant chunks are found, despite RAG being enabled
3. Two duplicate "RAG chunks" settings exist (AI Actions page vs Context Strategy page)
4. Hybrid search mode ignores the similarity threshold, returning top-K regardless of relevance
5. Temperature is not exposed in the AI log despite being correctly applied
6. RAG search uses only one query source (detected question OR transcript), missing relevance opportunities
7. Transcript window defaults and per-action behavior need verification

## Design

### 1. Detected Question Fix

**Current behavior:** `QuestionDetector.tsx:handleAssist()` calls `generateAssist("Assist")` with no question text. Backend always falls back to `engine.last_detected_question()` — the most recent high-confidence question.

**New behavior:**
- When user clicks Assist on a **specific** detected question → pass that question's text as `customQuestion` parameter
- When user clicks the **general** Assist button (no specific question) → keep current behavior, use `last_detected_question`
- Backend: When `custom_question` is provided AND `include_detected_question` is true, create a synthetic `DetectedQuestion` from the provided text (with confidence 1.0 and source "user-selected") and use it instead of `last_detected_question`
- AI log: Label whether the question was "auto-detected (latest)" or "user-selected"

**Backend implementation detail:**
In `intelligence_commands.rs`, the `last_question` variable (currently read from `engine.last_detected_question()`) should be overridden when `custom_question` is Some AND `include_detected_question` is true:
```rust
let effective_question = if let Some(ref cq) = custom_question {
    if include_detected_question {
        Some(DetectedQuestion {
            text: cq.clone(),
            confidence: 1.0,
            source: "user-selected".to_string(),
            timestamp_ms: now_ms,
        })
    } else {
        last_question  // custom_question used for Ask mode (goes to user message, not detected Q section)
    }
} else {
    last_question  // general assist: use backend's last detected
};
```
This `effective_question` replaces `last_question` for both:
1. The "Detected Question" section in `context_builder.build_prompt_with_config()`
2. The RAG query source (Section 2)

The `context_builder.rs` function `build_prompt_with_config` receives `question: Option<&DetectedQuestion>` — no change needed to its signature since we construct the synthetic `DetectedQuestion` before passing it.

**Files:**
- `src/overlay/QuestionDetector.tsx` — pass `questions[index].text` to `generateAssist("Assist", questionText)`
- `src-tauri/src/commands/intelligence_commands.rs` — construct `effective_question` from `custom_question` when applicable
- No IPC changes needed — `generateAssist` already accepts `customQuestion`

### 2. Dual-Source RAG Query

**Current behavior** (`intelligence_commands.rs:225-227`):
```rust
let query = last_question.as_ref()
    .map(|q| q.text.clone())
    .unwrap_or_else(|| transcript_text.chars().take(500).collect());
```
Uses EITHER detected question OR transcript excerpt. Not both.

**New behavior:**
- Combine both sources for richer semantic matching:
  - If both exist: `"{detected_question}\n\n{transcript_excerpt}"` (detected question first for higher weight)
  - If only detected question: use it alone
  - If only transcript: use last 500 chars of the *windowed* transcript (current fallback, changed from first→last for recency)
  - If neither (meeting just started, no speech yet): skip RAG search entirely, return empty chunks. AI log shows "No transcript or question available for RAG search"
- Store the composed query text for exposure in StreamStartEvent

**Files:**
- `src-tauri/src/commands/intelligence_commands.rs` — combine query sources, store query text

### 3. RAG Threshold Normalization

**Current behavior:** `search.rs` applies `similarity_threshold` only in Semantic-only mode. Hybrid mode (default) ignores it — RRF scores (~0.005–0.033) are incompatible with the 0–1 threshold slider.

**New behavior:**
- After RRF fusion, normalize scores to 0–1 range: `normalized = raw_score / max_score`
- Apply `similarity_threshold` to normalized scores in ALL search modes (Hybrid, Semantic, Keyword)
- Add `normalized_score: f64` field to `ScoredChunk` struct
- Result logic: retrieve top-K candidates, normalize, filter by threshold. If top-K is 15 but only 10 pass threshold → return 10. If 20 pass but top-K is 15 → return 15.

**Edge cases:**
- Single result: normalized to 1.0, always passes threshold (unless threshold is 1.0)
- All results identical score: all normalize to 1.0, all pass
- Zero results from search: return empty vec, no normalization needed
- `max_score == 0.0`: Guard with `if max_score == 0.0 { return vec![]; }` — zero-scored results indicate no meaningful match

**Applies to all search modes:**
- Hybrid: normalize RRF scores, then apply threshold
- Semantic: normalize cosine scores (already 0-1 but not always max=1.0), then apply threshold
- Keyword: normalize BM25 scores, then apply threshold
- Same normalization formula everywhere: `normalized = raw / max` with `max_score > 0` guard

**Files:**
- `src-tauri/src/rag/search.rs` — add normalization step after each search mode, apply threshold
- `ScoredChunk` struct (in `search.rs`) — add `normalized_score: f64`
- Every constructor of `ScoredChunk` (in `search.rs` and `mod.rs`) must set the new field

### 4. StreamStartEvent Enhancement

**Current payload** (`StreamStartPayload`):
```rust
mode, model, provider, system_prompt, user_prompt,
include_transcript, include_rag, include_instructions, include_question
```

**New fields to add:**
```rust
pub temperature: f64,                        // resolved temperature used
pub rag_query: Option<String>,               // what text was searched
pub rag_chunks: Vec<RagChunkInfo>,           // individual chunk details
pub rag_chunks_filtered: usize,              // chunks below threshold (filtered out)
pub rag_total_candidates: usize,             // total chunks considered before top-K
pub transcript_window_seconds: u64,          // effective window used
pub transcript_segments_count: usize,        // how many segments included
pub transcript_segments_total: usize,        // total segments available
```

**New struct:**
```rust
pub struct RagChunkInfo {
    pub source: String,           // filename (e.g., "resume.pdf")
    pub chunk_index: usize,       // chunk number within source
    pub text: String,             // full chunk text
    pub normalized_score: f64,    // 0-1 normalized score
    pub raw_score: f64,           // original algorithm score
}
```

**TypeScript mirror** in `types.ts`:
```typescript
export interface RagChunkInfo {
  source: string;
  chunk_index: number;
  text: string;
  normalized_score: number;
  raw_score: number;
}

// Add to StreamStartEvent:
temperature: number;
rag_query: string | null;
rag_chunks: RagChunkInfo[];
rag_chunks_filtered: number;
rag_total_candidates: number;
transcript_window_seconds: number;
transcript_segments_count: number;
transcript_segments_total: number;
```

**Files:**
- `src-tauri/src/llm/provider.rs` — expand StreamStartPayload
- `src-tauri/src/intelligence/mod.rs` — populate new fields at emission point
- `src/lib/types.ts` — matching TypeScript types for StreamStartEvent and LogEntry

### 5. Settings Consolidation

**Current state:** Two settings control the same thing:
- AI Actions page → "RAG Chunks" dropdown (3/5/7/10/15/20) stored in `globalDefaults.ragTopK`
- Context Strategy page → "Results to Retrieve (top-K)" dropdown stored in `ragConfig.top_k`
- At runtime, AI Actions value overrides Context Strategy value

**New state:**
- **Remove** "RAG Chunks" dropdown from AI Actions page
- **Keep** "Results to Retrieve (top-K)" on Context Strategy page as single source of truth
- **Keep** per-action top-K overrides in each action's "Override Defaults" section
- AI Actions page: Show a read-only reference line: "RAG uses top-K from Context Strategy (currently: 5)" with link to navigate there
- Backend: Read default top-K from `RagConfig.top_k`, allow per-action override from `ActionConfig.rag_top_k`

**Backend implementation detail:**
The top-K resolution currently happens at line 176:
```rust
let rag_top_k = action_cfg.as_ref().and_then(|c| c.rag_top_k).unwrap_or(global_defaults.rag_top_k);
```
This must change to read `RagConfig.top_k` as fallback. Since `rag_config` is currently accessed inside the `if include_rag` block (line 218+), move the RagConfig read earlier:
```rust
// Read RagConfig.top_k early for default resolution
let rag_default_top_k = {
    let rag_mgr = state.rag_manager.lock().map_err(|e| e.to_string())?;
    rag_mgr.config().top_k
};
let rag_top_k = action_cfg.as_ref().and_then(|c| c.rag_top_k).unwrap_or(rag_default_top_k);
```

**Backward compatibility:**
Existing users may have `ragTopK` in their persisted `globalDefaults` in config.json. Since `aiActionsStore.ts` uses `@tauri-apps/plugin-store` with spread-defaults pattern, removing the field from the TypeScript type is safe — the persisted value is silently ignored. The Rust `AllActionConfigs` struct should use `#[serde(default)]` on any fields that may be absent in old configs.

**Files:**
- `src/settings/AIActionsSettings.tsx` — remove RAG Chunks dropdown, add reference text/link
- `src-tauri/src/commands/intelligence_commands.rs` — read default from RagConfig, move read earlier
- `src/stores/aiActionsStore.ts` — remove `ragTopK` from `GlobalDefaults` type, keep in per-action `ActionConfig`
- `src-tauri/src/intelligence/action_config.rs` — update default resolution logic, add `#[serde(default)]`

### 6. AI Log Enhancement

#### 6a. RAG Chunks Section

Always show when `include_rag` is true, regardless of whether chunks were found.

**When chunks found (collapsed by default):**
```
▼ RAG CHUNKS (3/5 relevant, query: "Such as?")            [copy]
  ▶ #1 resume.pdf (chunk 0) — 0.92 — "Experience with distributed sys..."
  ▶ #2 notes.md (chunk 2) — 0.78 — "Key architecture decisions for..."
  ▶ #3 resume.pdf (chunk 3) — 0.61 — "Led migration of legacy mono..."
  ⊘ 2 chunks filtered (below 0.30 threshold)
```

Clicking a chunk expands to show full text:
```
▼ #1 resume.pdf (chunk 0) — score: 0.92
  Experience with distributed systems including microservices
  architecture, event-driven design, and container orchestration.
  Led team of 8 engineers across 3 time zones...
```

**When no chunks found:**
```
▼ RAG CHUNKS (0 relevant)                                  [copy]
  ⊘ No relevant chunks found
    0 of 13 indexed chunks passed 0.30 threshold
    Query: "Such as?" + transcript context
```

**When RAG not enabled (include_rag = false):**
Section not shown at all (correct current behavior).

#### 6b. Token Budget Breakdown

Add a compact row between the Structured/Raw toggle and the first section in PromptViewer:

```
Tokens: System 180 · Transcript 920 · RAG 450 · Question 30 → Total ~1,580
```

- **Data source:** Use structured fields from `StreamStartEvent` (system_prompt, rag_chunks texts, transcript segment count) rather than re-parsing the user prompt string. The `LogEntry` already stores `actualSystemPrompt` separately; with the new `rag_chunks` array and `transcript_segments_count`, each section's token count can be calculated directly.
- **Estimation:** `Math.ceil(text.length / 4)` (reasonable approximation across models)
- **Color-coded segments:** gray (system), green (transcript), blue (RAG), rose (question)
- **Placement:** Below the Structured/Raw toggle, above the first collapsible section

#### 6c. Temperature Display

Add temperature to the `CallLogEntry` compact row metadata:
```
Assist  T R I Q  Groq/gpt-o5...  3924ms  03:36:49 PM  0.3°
```

Small `0.3°` badge next to the timestamp.

#### 6d. RAG Query Preview

Show the query text used for RAG search in the RAG section header or as a sub-line:
```
Query: "Such as?" + transcript (last 500 chars)
```

This helps users understand why certain chunks were/weren't matched.

**Files:**
- `src/calllog/PromptViewer.tsx` — new RAG section component with collapsible chunks, token budget bar
- `src/calllog/CallLogEntry.tsx` — add temperature badge
- `src/lib/types.ts` — expand LogEntry with rag_chunks, rag_query, temperature, token estimates
- `src/hooks/useCallLogCapture.ts` — capture all new StreamStartEvent fields into LogEntry

### 7. Transcript Window & Action Audit

#### 7a. Transcript Window Defaults

**Change global default** from current value to **5 minutes** (300 seconds) for first-time startup.

**Per-action transcript windows:**

| Action | Window Source | Default |
|--------|-------------|---------|
| Assist | Global `transcriptWindowMinutes` | 5 min |
| Say | Per-action override | 60s |
| Short | Per-action override | 30s |
| F/U | Global `transcriptWindowMinutes` | 5 min |
| Recap | Per-action override, default 0s | All transcript |
| Ask | Global `transcriptWindowMinutes` | 5 min |

**Filtering logic:** Filter segments where `segment.timestamp_ms >= (now_ms - window_seconds * 1000)`. If meeting is shorter than window, all segments pass naturally — no special handling needed.

**Files:**
- `src-tauri/src/intelligence/action_config.rs` — default transcript_window_seconds = 300
- `src/stores/aiActionsStore.ts` — default transcriptWindowMinutes = 5

#### 7b. Full Action Conformance Audit

For each action, verify end-to-end that:
1. Toggle states (Transcript, Custom Instructions, RAG Chunks, Detected Question) control prompt inclusion
2. System prompt = base template + composed instructions (when Custom Instructions toggled on)
3. Transcript = segments within configured window
4. RAG chunks = retrieved with correct top-K, filtered by normalized threshold
5. Detected question = correct question (clicked vs. latest)
6. Temperature = per-action override → global default
7. StreamStartEvent contains all data shown in AI log
8. AI log sections accurately reflect what was sent

**Internal actions** (ActionItemsExtraction, BookmarkSuggestions):
- Verify they use temperature 0.1, all transcript (0s window), and correct prompt templates
- These don't appear in AI log but should still conform

## Architecture Summary

```
User clicks Assist on specific question
    ↓
QuestionDetector.tsx: generateAssist("Assist", questionText)
    ↓
ipc.ts: invoke("generate_assist", { mode, customQuestion, transcriptSegments })
    ↓
intelligence_commands.rs:
    1. Resolve ActionConfig (per-action overrides → global defaults)
    2. Resolve temperature (per-action → global)
    3. Resolve top-K (per-action → RagConfig.top_k)
    4. Filter transcript by window (timestamp-based)
    5. Build RAG query (detected question + transcript excerpt)
    6. Search RAG with normalized threshold filtering
    7. Compose system prompt (template + custom instructions)
    8. Build user prompt via ContextBuilder
    9. Emit StreamStartEvent with ALL data (including RAG details, temperature, query)
    10. Call LLM with resolved temperature
    ↓
Frontend captures StreamStartEvent:
    - Creates LogEntry with all fields
    - AI log shows: System, Transcript (with segment count), RAG (with chunks/scores/query), Question, Response
    - Token budget calculated from section lengths
```

## Files Changed (Complete List)

**Rust backend:**
- `src-tauri/src/commands/intelligence_commands.rs` — prompt assembly fixes
- `src-tauri/src/intelligence/mod.rs` — StreamStartEvent population
- `src-tauri/src/intelligence/action_config.rs` — default changes
- `src-tauri/src/intelligence/context_builder.rs` — minor (if needed)
- `src-tauri/src/rag/search.rs` — score normalization + threshold in all modes
- `src-tauri/src/rag/prompt_builder.rs` — no changes (scores stay out of LLM prompt, only in metadata)
- `src-tauri/src/llm/provider.rs` — StreamStartPayload expansion

**Frontend:**
- `src/lib/types.ts` — StreamStartEvent, LogEntry, RagChunkInfo types
- `src/hooks/useCallLogCapture.ts` — capture new fields
- `src/overlay/QuestionDetector.tsx` — pass specific question text
- `src/calllog/PromptViewer.tsx` — RAG section, token budget, query preview
- `src/calllog/CallLogEntry.tsx` — temperature badge
- `src/settings/AIActionsSettings.tsx` — remove RAG Chunks dropdown, add reference
- `src/stores/aiActionsStore.ts` — remove global ragTopK, update defaults

## Verified: Working Correctly (No Fix Needed)

**Temperature resolution:** Verified in `intelligence_commands.rs:202-208`. Temperature IS correctly resolved (per-action override → global default) and passed to the LLM via `GenerationParams`. The only issue is that temperature is not exposed in `StreamStartEvent` (fixed in Section 4) and not shown in the AI log (fixed in Section 6c).

**AI log prompt fidelity:** The `StreamStartEvent` already sends `system_prompt` and `user_prompt` as the EXACT strings passed to the LLM. The AI log's Structured view parses these real strings — not reconstructed data. The new metadata fields (RAG chunk scores, query text, token budget) are **diagnostic metadata** displayed alongside the prompt, clearly separated from the actual prompt content. The Raw view continues to show exactly what was sent.

## Out of Scope

- RAG prompt builder changes (scores intentionally kept out of the LLM prompt — shown only in AI log metadata)
- New AI action types
- Custom action creation workflow
- Settings page redesign beyond the consolidation
