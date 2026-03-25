# AI Actions Prompt Accuracy Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI actions conform to their settings, fix the detected question bug, add RAG section to AI log with scores/query, consolidate duplicate settings, and add token budget display.

**Architecture:** Backend-first approach — fix Rust types and logic first, then expand StreamStartEvent, then update TypeScript types, then wire up frontend components. Each task produces a compilable/runnable state.

**Tech Stack:** Rust (Tauri 2), TypeScript/React 18, Zustand, Tailwind CSS, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-25-ai-actions-prompt-accuracy-design.md`

---

## File Map

**Rust backend (modify):**
| File | Responsibility |
|------|---------------|
| `src-tauri/src/rag/search.rs` | Score normalization + threshold in all modes |
| `src-tauri/src/rag/prompt_builder.rs` | Test helper fix (normalized_score field) |
| `src-tauri/src/llm/provider.rs` | StreamStartPayload + RagChunkInfo structs |
| `src-tauri/src/commands/intelligence_commands.rs` | Prompt assembly: question fix, dual RAG query, settings resolution |
| `src-tauri/src/intelligence/mod.rs` | StreamStartEvent emission with new fields |
| `src-tauri/src/intelligence/action_config.rs` | Default transcript window 300s, `#[serde(default)]` |

**Frontend (modify):**
| File | Responsibility |
|------|---------------|
| `src/lib/types.ts` | RagChunkInfo, expanded StreamStartEvent, expanded LogEntry |
| `src/hooks/useCallLogCapture.ts` | Capture new StreamStartEvent fields |
| `src/overlay/QuestionDetector.tsx` | Pass specific question text on click |
| `src/calllog/PromptViewer.tsx` | RAG section, token budget, query preview |
| `src/calllog/CallLogEntry.tsx` | Temperature badge |
| `src/settings/AIActionsSettings.tsx` | Remove global RAG Chunks, add reference text |
| `src/stores/aiActionsStore.ts` | Remove global ragTopK, update defaults |

---

### Task 1: RAG Score Normalization (search.rs + prompt_builder.rs)

**Files:**
- Modify: `src-tauri/src/rag/search.rs`
- Modify: `src-tauri/src/rag/prompt_builder.rs` (test helper only)

- [ ] **Step 1: Add `normalized_score` to ScoredChunk**

In `search.rs`, add the field to the struct (after line 14):

```rust
#[derive(Debug, Clone, Serialize)]
pub struct ScoredChunk {
    pub chunk_id: String,
    pub text: String,
    pub score: f64,
    pub normalized_score: f64,  // ADD THIS
    pub source_file: String,
    pub chunk_index: usize,
    pub source_type: String,
}
```

- [ ] **Step 2: Add normalize-and-filter helper function**

Add after the `ScoredChunk` struct (before `hybrid_search`):

```rust
/// Normalize scores to 0-1 range and filter by similarity threshold.
/// Formula: normalized = raw / max. Guard: if max == 0, return empty.
fn normalize_and_filter(mut chunks: Vec<ScoredChunk>, threshold: f64) -> Vec<ScoredChunk> {
    if chunks.is_empty() {
        return chunks;
    }
    let max_score = chunks.iter().map(|c| c.score).fold(f64::NEG_INFINITY, f64::max);
    if max_score <= 0.0 {
        return Vec::new();
    }
    for chunk in &mut chunks {
        chunk.normalized_score = chunk.score / max_score;
    }
    chunks.retain(|c| c.normalized_score >= threshold as f64);
    chunks
}
```

- [ ] **Step 3: Apply normalization in `hybrid_search`**

Replace lines 55-72 (the take + push loop) with:

```rust
    // Take top-K candidates, then normalize and filter by threshold.
    let mut results: Vec<ScoredChunk> = Vec::new();
    for (chunk_id, score) in merged.iter().take(config.top_k) {
        match get_chunk_detail(conn, chunk_id) {
            Ok((text, source_file, chunk_index, source_type)) => {
                results.push(ScoredChunk {
                    chunk_id: chunk_id.clone(),
                    text,
                    score: *score,
                    normalized_score: 0.0, // set by normalize_and_filter
                    source_file,
                    chunk_index,
                    source_type,
                });
            }
            Err(e) => {
                log::warn!("Failed to get chunk detail for {}: {}", chunk_id, e);
            }
        }
    }

    Ok(normalize_and_filter(results, config.similarity_threshold as f64))
```

- [ ] **Step 4: Apply normalization in `semantic_only_search`**

Replace lines 86-108 — remove the inline threshold check, collect all top-K, then normalize:

```rust
pub fn semantic_only_search(
    conn: &Connection,
    query_embedding: &[f32],
    config: &RagConfig,
    embeddings: &[(String, Vec<f32>)],
) -> Result<Vec<ScoredChunk>, String> {
    let results = vector_store::search_similar(query_embedding, embeddings, config.top_k);

    let mut scored_chunks: Vec<ScoredChunk> = Vec::new();
    for (chunk_id, score) in results {
        match get_chunk_detail(conn, &chunk_id) {
            Ok((text, source_file, chunk_index, source_type)) => {
                scored_chunks.push(ScoredChunk {
                    chunk_id,
                    text,
                    score: score as f64,
                    normalized_score: 0.0, // set by normalize_and_filter
                    source_file,
                    chunk_index,
                    source_type,
                });
            }
            Err(e) => {
                log::warn!("Failed to get chunk detail for {}: {}", chunk_id, e);
            }
        }
    }

    Ok(normalize_and_filter(scored_chunks, config.similarity_threshold as f64))
}
```

- [ ] **Step 5: Apply normalization in `keyword_only_search`**

Replace lines 120-139 — same pattern:

```rust
pub fn keyword_only_search(
    conn: &Connection,
    query_text: &str,
    config: &RagConfig,
) -> Result<Vec<ScoredChunk>, String> {
    let results = fts_store::search_keywords(conn, query_text, config.top_k)?;

    let mut scored_chunks: Vec<ScoredChunk> = Vec::new();
    for (chunk_id, score) in results {
        match get_chunk_detail(conn, &chunk_id) {
            Ok((text, source_file, chunk_index, source_type)) => {
                scored_chunks.push(ScoredChunk {
                    chunk_id,
                    text,
                    score,
                    normalized_score: 0.0, // set by normalize_and_filter
                    source_file,
                    chunk_index,
                    source_type,
                });
            }
            Err(e) => {
                log::warn!("Failed to get chunk detail for {}: {}", chunk_id, e);
            }
        }
    }

    Ok(normalize_and_filter(scored_chunks, config.similarity_threshold as f64))
}
```

- [ ] **Step 6: Fix `prompt_builder.rs` test helper**

In `src-tauri/src/rag/prompt_builder.rs`, the `make_chunk` test helper (line 60-68) constructs `ScoredChunk` without the new `normalized_score` field. Add it:

```rust
    fn make_chunk(
        source_type: &str,
        source_file: &str,
        chunk_index: usize,
        text: &str,
    ) -> ScoredChunk {
        ScoredChunk {
            chunk_id: format!("chunk_{}", chunk_index),
            text: text.to_string(),
            score: 0.9,
            normalized_score: 0.9,  // ADD THIS
            source_file: source_file.to_string(),
            chunk_index,
            source_type: source_type.to_string(),
        }
    }
```

- [ ] **Step 7: Verify compilation + tests**

Run: `cd src-tauri && cargo check && cargo test -p nexq-lib -- rag::prompt_builder`
Expected: Compiles and tests pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/rag/search.rs src-tauri/src/rag/prompt_builder.rs
git commit -m "feat(rag): add score normalization and threshold filtering in all search modes"
```

---

### Task 2: Expand StreamStartPayload + RagChunkInfo (provider.rs)

**Files:**
- Modify: `src-tauri/src/llm/provider.rs`

- [ ] **Step 1: Add RagChunkInfo struct**

Add after `StreamStartPayload` (after line 91):

```rust
/// Metadata about a single RAG chunk, sent to the frontend for AI log display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagChunkInfo {
    pub source: String,
    pub chunk_index: usize,
    pub text: String,
    pub normalized_score: f64,
    pub raw_score: f64,
}
```

- [ ] **Step 2: Expand StreamStartPayload**

Replace the `StreamStartPayload` struct (lines 80-91):

```rust
/// Event payloads emitted during streaming
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamStartPayload {
    pub mode: String,
    pub model: String,
    pub provider: String,
    pub system_prompt: String,
    pub user_prompt: String,
    pub include_transcript: bool,
    pub include_rag: bool,
    pub include_instructions: bool,
    pub include_question: bool,
    // New fields for AI log enrichment
    pub temperature: f64,
    pub rag_query: Option<String>,
    pub rag_chunks: Vec<RagChunkInfo>,
    pub rag_chunks_filtered: usize,
    pub rag_total_candidates: usize,
    pub transcript_window_seconds: u64,
    pub transcript_segments_count: usize,
    pub transcript_segments_total: usize,
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Errors in `intelligence/mod.rs` where the struct is constructed (missing new fields). This is expected — we fix it in Task 4.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/llm/provider.rs
git commit -m "feat(types): expand StreamStartPayload with temperature, RAG metadata, transcript info"
```

---

### Task 3: Backend Prompt Assembly Fixes (intelligence_commands.rs)

**Files:**
- Modify: `src-tauri/src/commands/intelligence_commands.rs`

This is the largest task — covers detected question fix, dual-source RAG query, settings consolidation, and passing metadata for the StreamStartEvent.

- [ ] **Step 1: Add `use` for RagChunkInfo**

At the top of the file (after line 6), add:

```rust
use crate::llm::provider::RagChunkInfo;
```

- [ ] **Step 2: Add segment counting helper**

Add after `build_transcript_from_segments` (after line 95):

```rust
/// Count total segments in the JSON, regardless of window filtering.
fn count_total_segments(segments_json: &str) -> usize {
    #[derive(serde::Deserialize)]
    struct Seg { text: String }
    serde_json::from_str::<Vec<Seg>>(segments_json)
        .map(|s| s.len())
        .unwrap_or(0)
}
```

- [ ] **Step 3: Fix detected question — construct effective_question**

After line 136 (`(question, cancel, (action_cfg, global_defaults), composed)`), replace the line that destructures and add the effective question logic. Replace lines 138-144 with:

```rust
    let (action_cfg, global_defaults) = action_config_snapshot;

    // Construct effective question: prefer user-clicked question over backend's last detected.
    // When custom_question is provided AND include_detected_question is true, the user clicked
    // a specific question in the overlay — create a synthetic DetectedQuestion from it.
    let include_question = action_cfg.as_ref().map(|c| c.include_detected_question).unwrap_or(true);
    let effective_question = if let Some(ref cq) = custom_question {
        if include_question {
            // User clicked a specific detected question → use it
            Some(crate::intelligence::question_detector::DetectedQuestion {
                text: cq.clone(),
                confidence: 1.0,
                timestamp_ms: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
                source: "user-selected".to_string(),
            })
        } else {
            last_question // Ask mode: custom_question goes to user message, not detected Q section
        }
    } else {
        last_question // General assist: use backend's last detected
    };

    // Determine transcript window: per-action override or global default
    let window_seconds = action_cfg
        .as_ref()
        .and_then(|c| c.transcript_window_seconds)
        .unwrap_or(global_defaults.transcript_window_seconds);
```

- [ ] **Step 4: Update settings resolution — read top-K from RagConfig**

Replace line 176 (`let rag_top_k = ...`) with:

```rust
    // Read default top-K from RagConfig (Context Strategy page) — single source of truth.
    // Per-action override takes precedence if set.
    let rag_default_top_k = state.rag.as_ref()
        .and_then(|r| r.lock().ok())
        .map(|r| r.config().top_k)
        .unwrap_or(5);
    let rag_top_k = action_cfg.as_ref().and_then(|c| c.rag_top_k).unwrap_or(rag_default_top_k);
```

Also update the other `include_*` variables that still exist (lines 172-175) — replace `include_question` since we now compute it earlier:

```rust
    let include_rag = action_cfg.as_ref().map(|c| c.include_rag_chunks).unwrap_or(true);
    let include_transcript = action_cfg.as_ref().map(|c| c.include_transcript).unwrap_or(true);
    // include_question already computed above for effective_question logic
    let include_instructions = action_cfg.as_ref().map(|c| c.include_custom_instructions).unwrap_or(true);
```

- [ ] **Step 5: Count total segments**

After the transcript_text building block (after line 162), add:

```rust
    let total_segments = transcript_segments.as_ref()
        .map(|s| count_total_segments(s))
        .unwrap_or(0);
    let included_segments = transcript_text.lines()
        .filter(|l| l.starts_with("["))
        .count();
```

- [ ] **Step 6: Implement dual-source RAG query + collect metadata**

Replace the RAG block (lines 214-256) with:

```rust
    // Get context — RAG chunks only.
    let mut rag_query_text: Option<String> = None;
    let mut rag_chunk_infos: Vec<RagChunkInfo> = Vec::new();
    let mut rag_chunks_filtered: usize = 0;
    let mut rag_total_candidates: usize = 0;

    let context_text = {
        let mut parts: Vec<String> = Vec::new();

        if include_rag {
            let rag_enabled = state.rag.as_ref()
                .and_then(|r| r.lock().ok())
                .map(|r| r.config().enabled)
                .unwrap_or(false);

            if rag_enabled {
                // Dual-source RAG query: combine detected question + transcript excerpt
                let question_text = effective_question.as_ref().map(|q| q.text.clone());
                let transcript_excerpt: String = transcript_text.chars().rev().take(500).collect::<String>().chars().rev().collect();

                let query = match (&question_text, transcript_excerpt.is_empty()) {
                    (Some(q), false) => format!("{}\n\n{}", q, transcript_excerpt),
                    (Some(q), true) => q.clone(),
                    (None, false) => transcript_excerpt,
                    (None, true) => String::new(), // no source available
                };

                rag_query_text = if query.is_empty() { None } else { Some(query.clone()) };

                if !query.is_empty() {
                    let rag_result = if let (Some(rag_arc), Some(db_arc)) =
                        (state.rag.as_ref(), state.database.as_ref()) {
                        let (mut config, embedder_url, embedding_model) = {
                            let rag_guard = rag_arc.lock().map_err(|e| e.to_string())?;
                            (rag_guard.config().clone(), rag_guard.embedder_url(), rag_guard.embedding_model())
                        };
                        config.top_k = rag_top_k;
                        rag::RagManager::search_async(db_arc, &query, &config, &embedder_url, &embedding_model).await
                    } else {
                        Err("RAG not initialized".to_string())
                    };

                    match rag_result {
                        Ok(chunks) => {
                            // Build RagChunkInfo metadata for StreamStartEvent
                            for c in &chunks {
                                rag_chunk_infos.push(RagChunkInfo {
                                    source: c.source_file.clone(),
                                    chunk_index: c.chunk_index,
                                    text: c.text.clone(),
                                    normalized_score: c.normalized_score,
                                    raw_score: c.score,
                                });
                            }
                            // rag_total_candidates = how many chunks exist in the index
                            // rag_chunks_filtered = how many passed search but were below threshold
                            // We can't know exact filtered count without modifying search_async,
                            // so we report (top_k - returned) only when returned < top_k AND index has >= top_k chunks
                            rag_total_candidates = rag_top_k; // approximate: we requested this many
                            if chunks.len() < rag_top_k {
                                rag_chunks_filtered = rag_top_k - chunks.len();
                            }

                            if !chunks.is_empty() {
                                parts.push(rag::prompt_builder::build_rag_context(&chunks, ""));
                            }
                        }
                        Err(e) => {
                            log::warn!("RAG search failed for mode={}: {}", mode, e);
                        }
                    }
                }
            }
        }

        parts.join("\n\n")
    };
```

- [ ] **Step 7: Update the generate_assist call — pass effective_question instead of last_question**

Replace lines 289-309 (the `IntelligenceEngine::generate_assist` call). The key change is:
- Pass `effective_question` instead of `last_question`
- Pass the new metadata fields

```rust
    let mode_clone = mode.clone();
    let result = IntelligenceEngine::generate_assist(
        &system_prompt,
        &mode_clone,
        custom_question.as_deref(),
        transcript_text,
        effective_question,
        context_text,
        include_context,
        include_transcript,
        include_question,
        include_rag,
        include_instructions,
        provider_arc,
        model,
        provider_name,
        params,
        temperature,
        rag_query_text,
        rag_chunk_infos,
        rag_chunks_filtered,
        rag_total_candidates,
        window_seconds,
        included_segments,
        total_segments,
        app_handle,
        cancel_flag,
    )
    .await;
```

- [ ] **Step 8: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Errors in `intelligence/mod.rs` — the `generate_assist` signature needs updating. This is expected — fixed in Task 4.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/commands/intelligence_commands.rs
git commit -m "feat(intelligence): fix detected question selection, dual-source RAG query, settings consolidation"
```

---

### Task 4: Update generate_assist + StreamStartEvent Emission (mod.rs)

**Files:**
- Modify: `src-tauri/src/intelligence/mod.rs`

- [ ] **Step 1: Update generate_assist signature**

Replace the function signature (lines 88-106) to accept the new metadata fields:

```rust
    pub async fn generate_assist(
        system_prompt: &str,
        mode: &str,
        custom_question: Option<&str>,
        transcript_text: String,
        last_question: Option<DetectedQuestion>,
        context_text: String,
        include_context: bool,
        include_transcript: bool,
        include_question: bool,
        include_rag: bool,
        include_instructions: bool,
        llm_provider: Arc<tokio::sync::Mutex<Box<dyn crate::llm::provider::LLMProvider>>>,
        model: String,
        provider_name: String,
        params: GenerationParams,
        // New metadata fields for StreamStartEvent
        temperature: f64,
        rag_query: Option<String>,
        rag_chunks: Vec<crate::llm::provider::RagChunkInfo>,
        rag_chunks_filtered: usize,
        rag_total_candidates: usize,
        transcript_window_seconds: u64,
        transcript_segments_count: usize,
        transcript_segments_total: usize,
        app_handle: tauri::AppHandle,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<(), String> {
```

- [ ] **Step 2: Update StreamStartEvent emission**

Replace lines 141-154 (the `app_handle.emit` call):

```rust
        // Emit stream start with actual prompt data + enriched metadata
        let _ = app_handle.emit(
            "llm_stream_start",
            crate::llm::provider::StreamStartPayload {
                mode: mode.to_string(),
                model: model.clone(),
                provider: provider_name.clone(),
                system_prompt: system_msg,
                user_prompt: user_msg,
                include_transcript,
                include_rag,
                include_instructions,
                include_question,
                temperature,
                rag_query,
                rag_chunks,
                rag_chunks_filtered,
                rag_total_candidates,
                transcript_window_seconds,
                transcript_segments_count,
                transcript_segments_total,
            },
        );
```

- [ ] **Step 3: Verify full Rust compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles successfully. All Rust changes complete.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/intelligence/mod.rs
git commit -m "feat(intelligence): populate StreamStartEvent with temperature, RAG metadata, transcript info"
```

---

### Task 5: Update Rust Defaults (action_config.rs)

**Files:**
- Modify: `src-tauri/src/intelligence/action_config.rs`

- [ ] **Step 1: Change global transcript window default to 300s (5 min)**

In the `Default` impl for `GlobalDefaults` (line 40), change:

```rust
impl Default for GlobalDefaults {
    fn default() -> Self {
        Self {
            transcript_window_seconds: 300,  // was 120
            rag_top_k: 5,
            temperature: 0.3,
            auto_trigger: true,
        }
    }
}
```

- [ ] **Step 2: Add `#[serde(default)]` for backward compatibility**

Add `#[serde(default)]` to `GlobalDefaults` and `AllActionConfigs` structs to handle missing fields in old configs:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct GlobalDefaults {
    pub transcript_window_seconds: u64,
    pub rag_top_k: usize,
    pub temperature: f64,
    pub auto_trigger: bool,
}
```

Also add `#[serde(default)]` to `AllActionConfigs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AllActionConfigs {
    pub global_defaults: GlobalDefaults,
    pub custom_instructions: String,
    pub instruction_presets: InstructionPresets,
    pub actions: HashMap<String, ActionConfig>,
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/intelligence/action_config.rs
git commit -m "feat(config): change default transcript window to 5min, add serde(default) for backward compat"
```

---

### Task 6: TypeScript Types Update (types.ts)

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add RagChunkInfo interface**

After `RagSearchResult` (after line 596), add:

```typescript
export interface RagChunkInfo {
  source: string;
  chunk_index: number;
  text: string;
  normalized_score: number;
  raw_score: number;
}
```

- [ ] **Step 2: Expand StreamStartEvent**

Replace the `StreamStartEvent` interface (lines 492-502):

```typescript
export interface StreamStartEvent {
  mode: IntelligenceMode;
  model: string;
  provider: string;
  system_prompt: string;
  user_prompt: string;
  include_transcript: boolean;
  include_rag: boolean;
  include_instructions: boolean;
  include_question: boolean;
  // Enriched metadata
  temperature: number;
  rag_query: string | null;
  rag_chunks: RagChunkInfo[];
  rag_chunks_filtered: number;
  rag_total_candidates: number;
  transcript_window_seconds: number;
  transcript_segments_count: number;
  transcript_segments_total: number;
}
```

- [ ] **Step 3: Expand LogEntry**

Add new fields to the `LogEntry` interface (after `includeQuestion`, line 552):

```typescript
  // Enriched metadata (from StreamStartEvent)
  temperature: number | null;
  ragQuery: string | null;
  ragChunks: RagChunkInfo[];
  ragChunksFiltered: number;
  ragTotalCandidates: number;
  transcriptWindowSeconds: number | null;
  transcriptSegmentsCount: number | null;
  transcriptSegmentsTotal: number | null;
```

- [ ] **Step 4: Update `RagSearchResult` to include `normalized_score`**

The existing `RagSearchResult` interface (line 589-596) mirrors `ScoredChunk` from Rust. Add the new field:

```typescript
export interface RagSearchResult {
  chunk_id: string;
  text: string;
  score: number;
  normalized_score: number;  // ADD THIS
  source_file: string;
  chunk_index: number;
  source_type: string;
}
```

- [ ] **Step 5: Remove `ragTopK` from GlobalDefaults**

In the `GlobalDefaults` interface (lines 645-650), remove `ragTopK`:

```typescript
export interface GlobalDefaults {
  transcriptWindowSeconds: number;
  temperature: number;
  autoTrigger: boolean;
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npm run build`
Expected: TypeScript errors in files that use GlobalDefaults.ragTopK and files that construct LogEntry without new fields. These are fixed in subsequent tasks.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add RagChunkInfo, expand StreamStartEvent and LogEntry, remove global ragTopK"
```

---

### Task 7: Frontend Capture (useCallLogCapture.ts)

**Files:**
- Modify: `src/hooks/useCallLogCapture.ts`

- [ ] **Step 1: Capture new StreamStartEvent fields**

Update the `entry` construction in `onStreamStart` handler (lines 36-63). Replace the LogEntry construction:

```typescript
        const entry: LogEntry = {
          id,
          timestamp: Date.now(),
          mode,
          provider: event.provider,
          model: event.model,
          status: "sending",
          startedAt: Date.now(),
          firstTokenAt: null,
          completedAt: null,
          totalTokens: null,
          latencyMs: null,
          responseContent: "",
          responseContentClean: "",
          // Actual prompt data from backend
          actualSystemPrompt: event.system_prompt,
          actualUserPrompt: event.user_prompt,
          // Context source flags
          includeTranscript: event.include_transcript,
          includeRag: event.include_rag,
          includeInstructions: event.include_instructions,
          includeQuestion: event.include_question,
          // Enriched metadata
          temperature: event.temperature,
          ragQuery: event.rag_query,
          ragChunks: event.rag_chunks ?? [],
          ragChunksFiltered: event.rag_chunks_filtered ?? 0,
          ragTotalCandidates: event.rag_total_candidates ?? 0,
          transcriptWindowSeconds: event.transcript_window_seconds,
          transcriptSegmentsCount: event.transcript_segments_count,
          transcriptSegmentsTotal: event.transcript_segments_total,
          // Legacy fields (empty for new entries)
          snapshotTranscript: "",
          snapshotContext: "",
          reconstructedSystemPrompt: "",
          errorMessage: null,
        };
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCallLogCapture.ts
git commit -m "feat(calllog): capture temperature, RAG metadata, transcript info from StreamStartEvent"
```

---

### Task 8: Frontend — Detected Question Fix (QuestionDetector.tsx)

**Files:**
- Modify: `src/overlay/QuestionDetector.tsx`

- [ ] **Step 1: Pass question text in handleAssist**

Replace the `handleAssist` callback (lines 56-61):

```typescript
  const handleAssist = useCallback((index: number) => {
    const questionText = questions[index]?.text;
    setQuestions((prev) =>
      prev.map((q, i) => i === index ? { ...q, assisted: true } : q)
    );
    // Pass the specific question text so backend uses it instead of last_detected_question
    generateAssist("Assist", questionText).catch(() => {});
  }, [questions]);
```

Note: `questions` is added to the dependency array since we now read from it inside the callback.

- [ ] **Step 2: Commit**

```bash
git add src/overlay/QuestionDetector.tsx
git commit -m "fix(overlay): pass specific question text to generateAssist when clicking past questions"
```

---

### Task 9: AI Log — RAG Section + Token Budget (PromptViewer.tsx)

**Files:**
- Modify: `src/calllog/PromptViewer.tsx`

- [ ] **Step 1: Add imports**

Add at top of file (after existing imports):

```typescript
import { Search, Database } from "lucide-react";
import type { RagChunkInfo } from "../lib/types";
```

- [ ] **Step 2: Add TokenBudget component**

Add before the `StructuredView` function:

```typescript
// -- Token Budget Bar --------------------------------------------------------

function TokenBudget({ entry }: { entry: LogEntry }) {
  const est = (text: string) => Math.ceil((text || "").length / 4);

  const system = est(entry.actualSystemPrompt);
  const rag = entry.ragChunks?.reduce((sum, c) => sum + est(c.text), 0) ?? 0;
  // Estimate transcript tokens from user prompt minus RAG and question sections
  const userTotal = est(entry.actualUserPrompt);
  const question = entry.includeQuestion ? est(
    entry.actualUserPrompt.split("## Detected Question")[1]?.split("##")[0] || ""
  ) : 0;
  const transcript = Math.max(0, userTotal - rag - question);
  const total = system + userTotal;

  const items = [
    { label: "System", tokens: system, color: "text-muted-foreground" },
    { label: "Transcript", tokens: transcript, color: "text-success" },
    { label: "RAG", tokens: rag, color: "text-info" },
    { label: "Question", tokens: question, color: "text-destructive" },
  ].filter((i) => i.tokens > 0);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/20 text-meta text-muted-foreground/60">
      <span className="font-medium">Tokens:</span>
      {items.map((item, i) => (
        <span key={item.label}>
          {i > 0 && <span className="mx-0.5">·</span>}
          <span className={item.color}>{item.label}</span>{" "}
          <span className="tabular-nums">{item.tokens.toLocaleString()}</span>
        </span>
      ))}
      <span className="mx-0.5">→</span>
      <span className="font-semibold tabular-nums">~{total.toLocaleString()}</span>
    </div>
  );
}
```

- [ ] **Step 3: Add RagChunksSection component**

Add after `TokenBudget`:

```typescript
// -- RAG Chunks Section ------------------------------------------------------

function RagChunksSection({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());

  if (!entry.includeRag) return null;

  const chunks = entry.ragChunks ?? [];
  const filtered = entry.ragChunksFiltered ?? 0;
  const query = entry.ragQuery;
  const hasChunks = chunks.length > 0;

  const toggleChunk = (idx: number) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const allText = chunks.map((c) => `[${c.source}, chunk ${c.chunk_index}] (score: ${c.normalized_score.toFixed(2)})\n${c.text}`).join("\n---\n");

  return (
    <div className="border-b border-border/20">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/20 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        )}
        <span className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-meta font-medium bg-info/10 text-info border-info/20">
          <Database className="h-2.5 w-2.5" />
          {hasChunks ? `${chunks.length} chunks` : "0 relevant"}
        </span>
        <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          RAG CHUNKS
        </span>
        <SectionCopyButton text={allText} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1">
          {/* Query preview */}
          {query && (
            <div className="flex items-start gap-1.5 rounded-md bg-secondary/20 px-2.5 py-1.5 mb-2">
              <Search className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/50" />
              <p className="text-meta text-muted-foreground/60 break-words">
                <span className="font-medium">Query:</span> {query.length > 200 ? query.slice(0, 200) + "..." : query}
              </p>
            </div>
          )}

          {hasChunks ? (
            <>
              {chunks.map((chunk, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleChunk(idx)}
                  className="flex w-full items-start gap-2 rounded-md bg-secondary/20 px-2.5 py-1.5 text-left hover:bg-secondary/30 transition-colors"
                >
                  {expandedChunks.has(idx) ? (
                    <ChevronDown className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/60" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/60" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-meta font-semibold text-info/80">#{idx + 1}</span>
                      <span className="text-meta text-muted-foreground truncate">{chunk.source} (chunk {chunk.chunk_index})</span>
                      <span className="text-meta font-mono tabular-nums text-info/70">{chunk.normalized_score.toFixed(2)}</span>
                    </div>
                    {expandedChunks.has(idx) ? (
                      <p className="mt-1 font-mono text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
                        {chunk.text}
                      </p>
                    ) : (
                      <p className="text-meta text-muted-foreground/50 truncate">
                        {chunk.text.slice(0, 80)}...
                      </p>
                    )}
                  </div>
                </button>
              ))}
              {filtered > 0 && (
                <p className="text-meta text-muted-foreground/50 px-2.5 py-1">
                  {filtered} chunk{filtered !== 1 ? "s" : ""} filtered (below threshold)
                </p>
              )}
            </>
          ) : (
            <div className="rounded-md bg-secondary/20 px-2.5 py-2 text-meta text-muted-foreground/50">
              No relevant chunks found
              {filtered > 0 && <span> — {filtered} candidates below threshold</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire into StructuredView**

Update `StructuredView` to include the TokenBudget and RagChunksSection. Replace the function (lines 76-119):

```typescript
function StructuredView({ entry }: { entry: LogEntry }) {
  const sections = useMemo(
    () => parseUserPromptSections(entry.actualUserPrompt),
    [entry.actualUserPrompt]
  );

  // Filter out RAG sections from parsed user prompt (we render them via RagChunksSection instead)
  const nonRagSections = sections.filter(
    (s) => s.type !== "context" || (!s.title.includes("Relevant Context") && !s.title.includes("RAG") && !s.title.includes("Reference"))
  );

  return (
    <div className="flex flex-col gap-0.5">
      {/* Token budget bar */}
      <TokenBudget entry={entry} />

      {/* System prompt (collapsed by default) */}
      {entry.actualSystemPrompt && (
        <CollapsibleSection
          title="SYSTEM PROMPT"
          content={entry.actualSystemPrompt}
          defaultExpanded={false}
          badge={{ label: "System", color: "gray", icon: Sparkles }}
        />
      )}

      {/* User message sections (excluding RAG — rendered separately below) */}
      {nonRagSections.map((section, i) => (
        <CollapsibleSection
          key={i}
          title={section.title || "USER MESSAGE"}
          content={section.content}
          defaultExpanded={true}
          badge={section.badge}
        />
      ))}

      {/* RAG Chunks section — always visible when RAG enabled */}
      <RagChunksSection entry={entry} />

      {/* Response */}
      {(entry.responseContentClean || entry.status === "streaming") && (
        <CollapsibleSection
          title={
            entry.status === "streaming" ? "RESPONSE (streaming...)" : "RESPONSE"
          }
          content={entry.responseContentClean}
          defaultExpanded={true}
          badge={{ label: "Response", color: "emerald", icon: MessageSquare }}
          isResponse
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify frontend compiles**

Run: `npm run build`
Expected: May have errors in other files referencing removed `ragTopK` from `GlobalDefaults`. Fix in Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/calllog/PromptViewer.tsx
git commit -m "feat(calllog): add RAG chunks section with scores, token budget bar, query preview"
```

---

### Task 10: Temperature Badge (CallLogEntry.tsx)

**Files:**
- Modify: `src/calllog/CallLogEntry.tsx`

- [ ] **Step 1: Add temperature badge**

After the timestamp span (line 118), add:

```typescript
      {/* Temperature */}
      {entry.temperature != null && (
        <span
          className="shrink-0 text-meta tabular-nums text-muted-foreground/50"
          title={`Temperature: ${entry.temperature}`}
        >
          {entry.temperature.toFixed(1)}°
        </span>
      )}
```

- [ ] **Step 2: Commit**

```bash
git add src/calllog/CallLogEntry.tsx
git commit -m "feat(calllog): add temperature badge to AI log entry row"
```

---

### Task 11: Settings Consolidation (AIActionsSettings.tsx + aiActionsStore.ts)

**Files:**
- Modify: `src/settings/AIActionsSettings.tsx`
- Modify: `src/stores/aiActionsStore.ts`

- [ ] **Step 1: Update aiActionsStore defaults**

In `aiActionsStore.ts`, update `createDefaultConfigs` (lines 58-119):

Change `transcriptWindowSeconds` from 120 to 300 (5 min):
```typescript
    globalDefaults: {
      transcriptWindowSeconds: 300,  // was 120; 5 minutes default
      temperature: 0.3,
      autoTrigger: true,
    },
```

Note: `ragTopK` is removed from `globalDefaults` since it's now in Context Strategy.

- [ ] **Step 2: Fix any TypeScript errors in aiActionsStore from removed ragTopK**

Search for any references to `configs.globalDefaults.ragTopK` in the store and remove or update them. The store's `loadConfigs` merge logic (line 174-178) handles unknown fields via spread — no change needed there.

- [ ] **Step 3: Update AIActionsSettings.tsx — remove RAG Chunks dropdown**

In `AIActionsSettings.tsx`, replace the RAG Chunks section (around lines 584-606) with a read-only reference:

```typescript
              {/* RAG Chunks — reference to Context Strategy */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    RAG Chunks
                  </label>
                  <span className="text-xs text-muted-foreground/60">
                    Set in Context Strategy
                  </span>
                </div>
                <p className="mt-1 text-meta text-muted-foreground/50">
                  Document chunks per query are controlled by the "Results to Retrieve (top-K)" setting in the Context Strategy page. Per-action overrides are available in each action's Override Defaults.
                </p>
              </div>
```

Also remove `RAG_CHUNK_OPTIONS` constant (line 59) and the `ragChunks` entry from `HELP` (lines 91-93) since they're no longer used in the global section.

- [ ] **Step 4: Keep per-action RAG top-K override**

The per-action override UI (around lines 956-978) should remain — it still works since `ActionConfig.ragTopK` is kept. No change needed there.

- [ ] **Step 5: Fix handleGlobalDefaultChange references**

Search for `handleGlobalDefaultChange("ragTopK"` — this was the onChange handler for the removed dropdown. Since the dropdown is removed, this call is also removed (it was inline in the JSX we replaced).

- [ ] **Step 6: Verify frontend compiles**

Run: `npm run build`
Expected: Compiles successfully.

- [ ] **Step 7: Commit**

```bash
git add src/settings/AIActionsSettings.tsx src/stores/aiActionsStore.ts
git commit -m "feat(settings): consolidate RAG top-K to Context Strategy, change default transcript window to 5min"
```

---

### Task 12: Full Build + Version Bump

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Bump version**

Update `src/lib/version.ts` with new version and build date.

- [ ] **Step 2: Full build verification**

Run: `npm run build`
Expected: TypeScript compiles with no errors.

Run: `cd src-tauri && cargo build`
Expected: Rust compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/version.ts
git commit -m "chore: bump version for AI actions prompt accuracy overhaul"
```

---

### Task 13: Action Conformance Audit

**Files:** None (verification only)

This task verifies every action end-to-end after all code changes are complete.

- [ ] **Step 1: Verify all 6 user-facing actions**

For each action (Assist, Say, Short, F/U, Recap, Ask), verify in `action_config.rs` and `aiActionsStore.ts`:
- Toggle defaults match between Rust and TypeScript
- Per-action transcript window overrides are correct (Say=60s, Short=30s, Recap=0s, others=global)
- System prompt templates match between Rust `prompt_templates.rs` and TS `aiActionsStore.ts`

- [ ] **Step 2: Verify internal actions**

Confirm `ActionItemsExtraction` and `BookmarkSuggestions` in `action_config.rs`:
- `temperature: Some(0.1)` — low temp for structured output
- `transcript_window_seconds: Some(0)` — all transcript
- `include_rag_chunks: false`, `include_custom_instructions: false`, `include_detected_question: false`
- These actions are `visible: false` and don't appear in the overlay action bar

- [ ] **Step 3: Verify StreamStartEvent carries all data**

Read `intelligence/mod.rs` emit block and confirm every field in `StreamStartPayload` is populated:
- temperature, rag_query, rag_chunks, rag_chunks_filtered, rag_total_candidates
- transcript_window_seconds, transcript_segments_count, transcript_segments_total
- All include_* flags match the resolved per-action settings

- [ ] **Step 4: Verify AI log displays all sections**

Read `PromptViewer.tsx` and confirm:
- System prompt section always shown (when present)
- Transcript section shown when `includeTranscript` is true
- RAG section shown when `includeRag` is true (even with 0 chunks)
- Detected Question section shown when `includeQuestion` is true
- Token budget bar shows all sections
- Temperature badge appears in `CallLogEntry.tsx`

- [ ] **Step 5: Commit audit confirmation**

```bash
git commit --allow-empty -m "audit: verify all AI actions conform to settings and AI log displays accurately"
```

---

## Parallelization Guide

Tasks that can run in parallel (no dependencies between them):
- **Wave 1:** Task 1 (search.rs) + Task 2 (provider.rs) + Task 5 (action_config.rs)
- **Wave 2:** Task 3 (intelligence_commands.rs) — depends on Task 1 + Task 2
- **Wave 3:** Task 4 (mod.rs) — depends on Task 3
- **Wave 4:** Task 6 (types.ts) — depends on Task 2
- **Wave 5:** Task 7 (useCallLogCapture.ts) + Task 8 (QuestionDetector.tsx) — depend on Task 6
- **Wave 6:** Task 9 (PromptViewer.tsx) + Task 10 (CallLogEntry.tsx) + Task 11 (settings) — depend on Task 6
- **Wave 7:** Task 12 (build + version)
