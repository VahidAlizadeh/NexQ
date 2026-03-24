# OpenRouter Model Catalog — Design Spec

## Summary

Replace the flat model dropdown for OpenRouter with a rich, inline model catalog featuring cards with pricing, capabilities, filtering, sorting, favorites, recently used models, cost estimates, and a "Good for meetings" badge. Hybrid architecture: Rust backend caches the model list, React frontend handles all interactive filtering/sorting.

## Context

OpenRouter offers ~350 models via a single `GET /api/v1/models` endpoint (~200KB response). Currently, NexQ dumps all models into a basic `<select>` dropdown showing only name + context window. Users have no way to compare pricing, filter by capabilities, or find models suited for meeting transcription.

The OpenRouter API returns rich per-model data: pricing (prompt/completion/cache), context length, architecture (modalities, tokenizer), supported parameters (tools, reasoning, web search), and descriptions. All sorting must be done client-side — the API has no sort parameter.

## Architecture: Hybrid (Backend Cache + Frontend Filtering)

### Backend (Rust)

**New file: `src-tauri/src/llm/openrouter_models.rs`**

Responsible for fetching, parsing, and caching the OpenRouter model list.

```rust
struct OpenRouterModelCache {
    models: Vec<OpenRouterModel>,
    fetched_at: Instant,
    ttl: Duration, // 4 hours
}
```

**New IPC command: `list_openrouter_models(api_key: String) -> Vec<OpenRouterModel>`**

Flow:
1. Check in-memory cache — if valid (within TTL), return cached list
2. If stale or empty, fetch `GET https://openrouter.ai/api/v1/models` with headers:
   - `Authorization: Bearer <api_key>`
   - `HTTP-Referer: https://nexq.app`
   - `X-Title: NexQ`
3. Parse response into `Vec<OpenRouterModel>` — convert string prices to f64, derive booleans, extract provider name from ID prefix
4. Store in `AppState` as `Arc<Mutex<Option<OpenRouterModelCache>>>`
5. Return full list to frontend

**Changes to existing files:**
- `state.rs` — Add `openrouter_cache: Arc<Mutex<Option<OpenRouterModelCache>>>` to `AppState`
- `lib.rs` — Register `list_openrouter_models` command
- `commands/llm_commands.rs` — Add command handler (or new `openrouter_commands.rs`)

**Unchanged:**
- `list_models()` — other providers still use this
- `openai_compat.rs` — streaming/completion unaffected
- `test_llm_connection` — works via existing path

### Frontend (React)

**New component: `src/settings/OpenRouterModelCatalog.tsx`**

Replaces the model dropdown when `provider === "openrouter"` and models are loaded.

Component tree:
```
LLMSettings.tsx
  └─ (when provider === "openrouter" && models loaded)
     └─ OpenRouterModelCatalog
          ├─ SearchBar              // text input, debounced 200ms
          ├─ FilterBar              // free toggle, sort dropdown, capability chips
          ├─ RecentlyUsedSection    // horizontal row of last 5
          ├─ FavoritesSection       // starred model cards (collapsible)
          └─ AllModelsSection       // scrollable card list
               └─ ModelCard × N     // V1 compact rich card
```

**LLMSettings.tsx change:** After "Load Models" for OpenRouter, render `<OpenRouterModelCatalog>` instead of `<select>`.

**Zustand additions (configStore.ts):**
```typescript
openrouterFavorites: string[];        // persisted model IDs
openrouterRecentlyUsed: string[];     // last 5, most recent first

toggleOpenRouterFavorite(id: string): void;
addOpenRouterRecentlyUsed(id: string): void;
```

No new Zustand store. Two fields + two actions added to existing `configStore`.

## Data Model

### OpenRouterModel (TypeScript)

```typescript
export interface OpenRouterModel {
  id: string;                    // "anthropic/claude-sonnet-4"
  name: string;                  // "Claude Sonnet 4"
  provider_name: string;         // "Anthropic"
  description: string;           // markdown
  created: number;               // unix timestamp
  context_length: number | null;
  max_completion_tokens: number | null;

  pricing: {
    prompt: number;              // USD per 1M tokens (e.g., 3.0)
    completion: number;
    image?: number;
    cache_read?: number;
    cache_write?: number;
  };
  is_free: boolean;              // prompt === 0 && completion === 0

  modality: string;              // "text->text"
  input_modalities: string[];    // ["text"]
  output_modalities: string[];   // ["text"]
  tokenizer: string;             // "Claude", "GPT", "Llama3"

  supports_tools: boolean;
  supports_reasoning: boolean;
  supports_web_search: boolean;

  is_good_for_meetings: boolean; // computed
  estimated_meeting_cost?: number; // computed on render
}
```

### Rust mirror struct

Same fields in `openrouter_models.rs`, serialized with serde to match TypeScript interface. Parsing converts API string prices to f64 and derives boolean capabilities from `supported_parameters` array.

## UI Layout

### Card Design (V1 — Compact Rich)

Horizontal flow, three rows per card:
1. **Top row:** Model name, provider, badges (NEW/FREE/Good for meetings), capability tags right-aligned (tools, reasoning, web)
2. **Middle row:** One-line description (truncated with ellipsis)
3. **Bottom row:** Pricing stats (`$3/M in · $15/M out · 200K ctx · 64K max`), meeting cost estimate right-aligned (`~$0.08 / meeting`)

Star/favorite button in top-right corner of each card. Selected card has indigo highlighted border.

### Full Page Layout (top to bottom)

1. **API Key section** — existing, unchanged (key input, Test button, Load Models button)
2. **Search + Sort bar** — text search input (left), sort dropdown (right)
3. **Filter chips** — "Free only" toggle, divider, capability chips: Tools, Reasoning, Web search
4. **Recently Used** — horizontal scrollable row of compact chips (model name + price)
5. **Favorites** — starred model cards section
6. **All Models** — count + active filter summary, then scrollable card list

### Filtering & Sorting

**Pre-filter (automatic):** Only `text→text` models shown (filter where `output_modalities` includes only `"text"` and `input_modalities` includes only `"text"`).

**User filters:**
- Text search: matches against `name + description + provider_name`, debounced 200ms
- Free only toggle: shows models where `is_free === true`
- Capability chips (multi-select): Tools, Reasoning, Web search — when active, only models with that capability shown

**Sort options (dropdown):**
- Newest first (default) — by `created` descending
- Price: low → high — by `pricing.prompt` ascending
- Price: high → low — by `pricing.prompt` descending
- Context: high → low — by `context_length` descending

All filtering and sorting is client-side on the full cached model list.

## Features

### Cost Estimator

Assumptions: 30-minute meeting ≈ 15,000 input tokens (transcript + prompt), 2,000 output tokens (summary/action items).

Formula: `(15000 * pricing.prompt + 2000 * pricing.completion) / 1_000_000`

Display: `~$X.XX / meeting` on each card. Free models show `Free / meeting`.

### "Good for Meetings" Badge

Criteria (all must be true):
- `supports_tools === true` (NexQ uses tools for action extraction)
- `context_length >= 65536` (must hold full meeting transcript)
- `pricing.prompt <= 10` (under $10/M input tokens)

Computed boolean, not stored. Updates automatically as model data changes.

### Favorites

- Star icon on each card toggles favorite status
- Favorites persisted in `configStore.openrouterFavorites: string[]` (Tauri plugin-store)
- Favorited models appear in dedicated "Favorites" section above "All Models"
- Subject to active filters (hidden if they don't match current filter)

### Recently Used

- Last 5 models used, most recent first
- Updated when user selects a model via `addOpenRouterRecentlyUsed(id)`
- Persisted in `configStore.openrouterRecentlyUsed: string[]`
- Displayed as horizontal scrollable compact chips (name + price)
- Clicking a recent chip selects that model

### Caching

- TTL: 4 hours, in-memory in Rust `AppState`
- "Load Models" button: force-refresh, ignores cache
- Settings panel open: use cached if available
- Cache dies on app restart — first "Load Models" rebuilds it
- API error with existing cache: show toast, keep displaying cached models

## Edge Cases

- **No API key:** Empty state — "Enter your OpenRouter API key and click Load Models"
- **API error:** Toast notification; keep showing cached models if available
- **0 results after filtering:** "No models match your filters" with reset button
- **Selected model removed from OpenRouter:** Graceful fallback, "(model unavailable)" in ServiceStatusBar
- **Very long model names:** Truncated with ellipsis, full name on hover tooltip

## Out of Scope

- Model comparison side-by-side view
- Per-model latency/throughput stats (requires N+1 API calls to `/endpoints`)
- Category filters (programming, roleplay, etc. — not relevant for NexQ)
- Custom cost estimator settings (30-min default is sufficient)
- First-run wizard integration (users add OpenRouter via Settings)

## Files to Create

- `src-tauri/src/llm/openrouter_models.rs` — Rust struct, parsing, cache
- `src/settings/OpenRouterModelCatalog.tsx` — React catalog component

## Files to Modify

- `src/lib/types.ts` — Add `OpenRouterModel` interface
- `src/lib/ipc.ts` — Add `listOpenRouterModels()` wrapper
- `src/stores/configStore.ts` — Add favorites + recently used fields/actions
- `src/settings/LLMSettings.tsx` — Conditional render catalog instead of dropdown
- `src-tauri/src/state.rs` — Add cache slot to `AppState`
- `src-tauri/src/lib.rs` — Register new command
- `src-tauri/src/commands/llm_commands.rs` — Add `list_openrouter_models` handler
- `src-tauri/src/llm/mod.rs` — Add `pub mod openrouter_models`
- `src/lib/version.ts` — Version bump
