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

**New IPC command: `list_openrouter_models(force_refresh: bool) -> Vec<OpenRouterModel>`**

The command reads the API key internally from Windows CredentialManager (matching the existing credential pattern — the frontend never passes raw keys over IPC for data fetches).

Flow:
1. Read API key from CredentialManager for `"openrouter"`
2. If `force_refresh` is false, check in-memory cache — if valid (within TTL), return cached list
3. If stale, empty, or `force_refresh` is true, fetch `GET https://openrouter.ai/api/v1/models` with headers:
   - `Authorization: Bearer <api_key>`
   - `HTTP-Referer: https://nexq.app`
   - `X-Title: NexQ`
4. Parse response into `Vec<OpenRouterModel>` — convert string prices to f64, derive booleans, extract provider name from ID prefix
5. Store in `AppState` as `Arc<Mutex<Option<OpenRouterModelCache>>>`
6. Return full list to frontend

**Call sites:**
- "Load Models" button → `list_openrouter_models(true)` (force refresh)
- Settings panel open with existing cache → `list_openrouter_models(false)` (use cache)

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

**File structure:** All sub-components live in `src/settings/openrouter/`:
```
src/settings/openrouter/
  ├─ OpenRouterModelCatalog.tsx   // main container, filtering/sorting state
  ├─ ModelCard.tsx                // V1 compact rich card
  ├─ FilterBar.tsx                // free toggle, sort dropdown, capability chips
  ├─ RecentlyUsedSection.tsx      // horizontal chip row
  └─ FavoritesSection.tsx         // starred model cards (collapsible)
```

Component tree:
```
LLMSettings.tsx
  └─ (when provider === "openrouter" && models loaded)
     └─ OpenRouterModelCatalog
          ├─ SearchBar              // text input, debounced 200ms
          ├─ FilterBar              // free toggle, sort dropdown, capability chips
          ├─ RecentlyUsedSection    // horizontal row of last 5
          ├─ FavoritesSection       // starred model cards (collapsible)
          └─ AllModelsSection       // virtualized scrollable card list (see Rendering)
               └─ ModelCard × N     // V1 compact rich card
```

**LLMSettings.tsx change:** After "Load Models" for OpenRouter, render `<OpenRouterModelCatalog>` instead of `<select>`.

**Model selection handoff:** When a user clicks a model card, the catalog must:
1. Call `setActiveModel("openrouter", modelId)` IPC (existing backend command)
2. Update `configStore.llmModel` (existing Zustand action)
3. Call `addOpenRouterRecentlyUsed(modelId)` (new Zustand action)

**Zustand additions (configStore.ts):**
```typescript
// State fields
openrouterFavorites: string[];        // persisted model IDs
openrouterRecentlyUsed: string[];     // last 5, most recent first

// Actions
toggleOpenRouterFavorite(id: string): void;
  // If id is in favorites, remove it. Otherwise, add it.

addOpenRouterRecentlyUsed(id: string): void;
  // 1. Filter out `id` from existing list (dedup)
  // 2. Prepend `id` to front
  // 3. Slice to max 5 entries
```

No new Zustand store. Two fields + two actions added to existing `configStore`.

**loadConfig integration:** The `loadConfig` function must also load both fields from the Tauri plugin-store on startup via `store.get("openrouterFavorites")` and `store.get("openrouterRecentlyUsed")`, with `[]` defaults. Both fields must be included in the store persistence logic alongside existing fields.

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

  // Derived from API `supported_parameters` array:
  //   supports_tools = supported_parameters.contains("tools")
  //   supports_reasoning = supported_parameters.contains("reasoning")
  //   supports_web_search = supported_parameters.contains("web_search_options")
  supports_tools: boolean;
  supports_reasoning: boolean;
  supports_web_search: boolean;
}

// Frontend-only computed fields (NOT part of IPC payload, NOT in Rust struct):
//   is_good_for_meetings: supports_tools && context_length >= 65536 && pricing.prompt <= 10
//   estimated_meeting_cost: (15000 * pricing.prompt + 2000 * pricing.completion) / 1_000_000
```

### Rust mirror struct

The Rust struct in `openrouter_models.rs` contains all fields above EXCEPT `is_good_for_meetings` and `estimated_meeting_cost`, which are computed on the frontend only. Serialized with serde to match the TypeScript interface.

**Capability derivation (Rust parsing):** The API returns a `supported_parameters: Vec<String>` array at the top level of each model object. Map to booleans:
- `supports_tools = supported_parameters.contains(&"tools".to_string())`
- `supports_reasoning = supported_parameters.contains(&"reasoning".to_string())`
- `supports_web_search = supported_parameters.contains(&"web_search_options".to_string())`

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
6. **All Models** — count + active filter summary, then virtualized scrollable card list

### Rendering

The "All Models" section uses virtual scrolling to avoid rendering 200+ cards simultaneously. Since all model cards have uniform height (~80px), a simple windowed approach works: render only the cards visible in the scroll viewport plus a small overscan buffer. This can use CSS `overflow-y: auto` with a container of fixed `max-height` (~520px) and an intersection observer or `react-window` for virtualization. No new dependencies required if using intersection observer.

### Filtering & Sorting

**Pre-filter (automatic):** Only models capable of text-to-text shown. Filter where `output_modalities` includes `"text"` AND `input_modalities` includes `"text"`. Models with additional modalities (e.g., `input_modalities: ["text", "image"]`) are NOT excluded — many capable meeting models like GPT-4o and Claude accept images but work perfectly for text-only use. The filter ensures the model can accept text input and produce text output, not that it does *only* text.

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
- Updated when user selects a model via `addOpenRouterRecentlyUsed(id)`:
  1. Remove `id` from existing list if present (dedup)
  2. Prepend `id` to front
  3. Slice to max 5 entries
- Persisted in `configStore.openrouterRecentlyUsed: string[]` (Tauri plugin-store)
- Displayed as horizontal scrollable compact chips (model name + price)
- Clicking a recent chip selects that model (same handoff: `setActiveModel` IPC + configStore update)

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
- `src/settings/openrouter/OpenRouterModelCatalog.tsx` — main catalog container
- `src/settings/openrouter/ModelCard.tsx` — V1 compact rich card component
- `src/settings/openrouter/FilterBar.tsx` — search, sort, filter chips
- `src/settings/openrouter/RecentlyUsedSection.tsx` — horizontal chip row
- `src/settings/openrouter/FavoritesSection.tsx` — starred model cards

## Files to Modify

- `src/lib/types.ts` — Add `OpenRouterModel` interface
- `src/lib/ipc.ts` — Add `listOpenRouterModels()` wrapper
- `src/stores/configStore.ts` — Add favorites + recently used fields/actions + loadConfig integration
- `src/settings/LLMSettings.tsx` — Conditional render catalog instead of dropdown
- `src-tauri/src/state.rs` — Add cache slot to `AppState`
- `src-tauri/src/lib.rs` — Register new command
- `src-tauri/src/commands/llm_commands.rs` — Add `list_openrouter_models` handler
- `src-tauri/src/llm/mod.rs` — Add `pub mod openrouter_models`
- `src/lib/version.ts` — Version bump
