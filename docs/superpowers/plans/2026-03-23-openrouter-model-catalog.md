# OpenRouter Model Catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat model dropdown for OpenRouter with a rich inline model catalog featuring cards with pricing, filtering, sorting, favorites, recently used, cost estimates, and a "Good for meetings" badge.

**Architecture:** Hybrid — Rust backend fetches + caches model list from OpenRouter API (`GET /api/v1/models`), returns enriched `OpenRouterModel[]` to frontend. React frontend handles all filtering, sorting, search, favorites, and recently-used UI client-side. Favorites and recently-used persist via existing Zustand + Tauri plugin-store pattern.

**Tech Stack:** Rust (reqwest, serde, tokio), React 18, TypeScript, Zustand 4.5, Tailwind CSS, shadcn/ui patterns

**Spec:** `docs/superpowers/specs/2026-03-23-openrouter-model-catalog-design.md`

---

## File Structure

### Files to Create
| File | Responsibility |
|------|---------------|
| `src-tauri/src/llm/openrouter_models.rs` | Rust struct, API parsing, in-memory cache with TTL |
| `src/settings/openrouter/OpenRouterModelCatalog.tsx` | Main container: filter/sort state, model list orchestration |
| `src/settings/openrouter/ModelCard.tsx` | V1 compact rich card (name, pricing, badges, tags, cost) |
| `src/settings/openrouter/FilterBar.tsx` | Search input, sort dropdown, free toggle, capability chips |
| `src/settings/openrouter/RecentlyUsedSection.tsx` | Horizontal scrollable chip row |
| `src/settings/openrouter/FavoritesSection.tsx` | Starred model cards, collapsible |

### Files to Modify
| File | Change |
|------|--------|
| `src/lib/types.ts:198` | Add `OpenRouterModel` interface after `ModelInfo` |
| `src/lib/ipc.ts:25` | Add import + `listOpenRouterModels()` wrapper |
| `src/stores/configStore.ts:80-187` | Add 2 state fields + 2 actions + loadConfig integration |
| `src/settings/LLMSettings.tsx:464-487` | Conditionally render catalog instead of `<select>` |
| `src-tauri/src/state.rs:43-77` | Add `openrouter_cache` field to `AppState` |
| `src-tauri/src/llm/mod.rs:1-7` | Add `pub mod openrouter_models;` |
| `src-tauri/src/commands/llm_commands.rs` | Add `list_openrouter_models` command |
| `src-tauri/src/lib.rs:362-462` | Register `list_openrouter_models` in invoke handler |
| `src/lib/version.ts` | Version bump |

---

### Task 1: Add OpenRouterModel TypeScript type

**Files:**
- Modify: `src/lib/types.ts:198`

- [ ] **Step 1: Add the OpenRouterModel interface**

After the existing `ModelInfo` interface (line 198), add:

```typescript
// == OPENROUTER ENRICHED MODEL ==

export interface OpenRouterModelPricing {
  prompt: number;              // USD per 1M tokens
  completion: number;
  image?: number;
  cache_read?: number;
  cache_write?: number;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  provider_name: string;
  description: string;
  created: number;
  context_length: number | null;
  max_completion_tokens: number | null;
  pricing: OpenRouterModelPricing;
  is_free: boolean;
  modality: string;
  input_modalities: string[];
  output_modalities: string[];
  tokenizer: string;
  supports_tools: boolean;
  supports_reasoning: boolean;
  supports_web_search: boolean;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd src && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors related to `OpenRouterModel`

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(openrouter): add OpenRouterModel TypeScript interface"
```

---

### Task 2: Create Rust OpenRouterModel struct + parsing + cache

**Files:**
- Create: `src-tauri/src/llm/openrouter_models.rs`

- [ ] **Step 1: Create the Rust module with struct and parsing**

Create `src-tauri/src/llm/openrouter_models.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

/// Enriched model info returned to the frontend.
/// Mirrors the TypeScript `OpenRouterModel` interface in types.ts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterModel {
    pub id: String,
    pub name: String,
    pub provider_name: String,
    pub description: String,
    pub created: u64,
    pub context_length: Option<u64>,
    pub max_completion_tokens: Option<u64>,
    pub pricing: OpenRouterPricing,
    pub is_free: bool,
    pub modality: String,
    pub input_modalities: Vec<String>,
    pub output_modalities: Vec<String>,
    pub tokenizer: String,
    pub supports_tools: bool,
    pub supports_reasoning: bool,
    pub supports_web_search: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterPricing {
    pub prompt: f64,
    pub completion: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_write: Option<f64>,
}

/// In-memory cache with TTL.
pub struct OpenRouterModelCache {
    pub models: Vec<OpenRouterModel>,
    pub fetched_at: Instant,
    pub ttl: Duration,
}

impl OpenRouterModelCache {
    pub fn new(models: Vec<OpenRouterModel>) -> Self {
        Self {
            models,
            fetched_at: Instant::now(),
            ttl: Duration::from_secs(4 * 60 * 60), // 4 hours
        }
    }

    pub fn is_valid(&self) -> bool {
        self.fetched_at.elapsed() < self.ttl
    }
}

/// Parse a price string from the API (e.g., "0.000003") into f64 per 1M tokens.
/// The API returns cost per single token, so multiply by 1_000_000.
fn parse_price(value: &serde_json::Value) -> f64 {
    value
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .map(|p| p * 1_000_000.0)
        .unwrap_or(0.0)
}

/// Parse optional price — returns None if the field is missing.
fn parse_price_opt(obj: &serde_json::Value, key: &str) -> Option<f64> {
    obj.get(key).map(|v| parse_price(v)).filter(|&p| p > 0.0)
}

/// Extract provider display name from model ID prefix.
/// "anthropic/claude-sonnet-4" → "Anthropic"
fn extract_provider_name(id: &str) -> String {
    let prefix = id.split('/').next().unwrap_or(id);
    let mut chars = prefix.chars();
    match chars.next() {
        None => prefix.to_string(),
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

/// Parse the full API response into Vec<OpenRouterModel>.
/// Filters to models that support text input AND text output.
pub fn parse_models_response(body: &serde_json::Value) -> Vec<OpenRouterModel> {
    let arr = match body.get("data").and_then(|d| d.as_array()) {
        Some(arr) => arr,
        None => return Vec::new(),
    };

    arr.iter()
        .filter_map(|m| {
            let id = m.get("id")?.as_str()?.to_string();
            let name = m
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or(&id)
                .to_string();

            // Architecture
            let arch = m.get("architecture")?;
            let modality = arch
                .get("modality")
                .and_then(|v| v.as_str())
                .unwrap_or("text->text")
                .to_string();
            let input_modalities: Vec<String> = arch
                .get("input_modalities")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_else(|| vec!["text".to_string()]);
            let output_modalities: Vec<String> = arch
                .get("output_modalities")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_else(|| vec!["text".to_string()]);

            // Pre-filter: must support text input AND text output
            if !input_modalities.contains(&"text".to_string())
                || !output_modalities.contains(&"text".to_string())
            {
                return None;
            }

            let tokenizer = arch
                .get("tokenizer")
                .and_then(|v| v.as_str())
                .unwrap_or("Other")
                .to_string();

            // Pricing
            let pricing_obj = m.get("pricing")?;
            let prompt_price = parse_price(pricing_obj.get("prompt")?);
            let completion_price = parse_price(pricing_obj.get("completion")?);
            let is_free = prompt_price == 0.0 && completion_price == 0.0;

            // Supported parameters → capabilities
            let supported_params: Vec<String> = m
                .get("supported_parameters")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            let supports_tools = supported_params.contains(&"tools".to_string());
            let supports_reasoning = supported_params.contains(&"reasoning".to_string());
            let supports_web_search =
                supported_params.contains(&"web_search_options".to_string());

            // Top provider info
            let top_provider = m.get("top_provider");
            let max_completion_tokens = top_provider
                .and_then(|tp| tp.get("max_completion_tokens"))
                .and_then(|v| v.as_u64());

            Some(OpenRouterModel {
                provider_name: extract_provider_name(&id),
                id,
                name,
                description: m
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                created: m.get("created").and_then(|v| v.as_u64()).unwrap_or(0),
                context_length: m.get("context_length").and_then(|v| v.as_u64()),
                max_completion_tokens,
                pricing: OpenRouterPricing {
                    prompt: prompt_price,
                    completion: completion_price,
                    image: parse_price_opt(pricing_obj, "image"),
                    cache_read: parse_price_opt(pricing_obj, "input_cache_read"),
                    cache_write: parse_price_opt(pricing_obj, "input_cache_write"),
                },
                is_free,
                modality,
                input_modalities,
                output_modalities,
                tokenizer,
                supports_tools,
                supports_reasoning,
                supports_web_search,
            })
        })
        .collect()
}

/// Fetch models from the OpenRouter API.
pub async fn fetch_openrouter_models(
    api_key: &str,
) -> Result<Vec<OpenRouterModel>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://openrouter.ai/api/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("HTTP-Referer", "https://nexq.app")
        .header("X-Title", "NexQ")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch models: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        if status.as_u16() == 401 || status.as_u16() == 403 {
            return Err(format!("Authentication failed ({}): {}", status, body));
        }
        return Err(format!("Failed to fetch models ({}): {}", status, body));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(parse_models_response(&body))
}
```

- [ ] **Step 2: Register the module**

In `src-tauri/src/llm/mod.rs`, add at line 7 (after `pub mod stream_parser;`):

```rust
pub mod openrouter_models;
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: `Finished` with no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/llm/openrouter_models.rs src-tauri/src/llm/mod.rs
git commit -m "feat(openrouter): add Rust model struct, parsing, and cache"
```

---

### Task 3: Wire backend — AppState, IPC command, registration

**Files:**
- Modify: `src-tauri/src/state.rs:43-77`
- Modify: `src-tauri/src/commands/llm_commands.rs`
- Modify: `src-tauri/src/lib.rs:362-462`

- [ ] **Step 1: Add cache to AppState**

In `src-tauri/src/state.rs`, add the import at the top (after line 9):

```rust
use crate::llm::openrouter_models::OpenRouterModelCache;
```

Add field to `AppState` struct (after line 76, before the closing `}`):

```rust
    /// Cached OpenRouter model list — avoids re-fetching on every settings open.
    pub openrouter_cache: Arc<Mutex<Option<OpenRouterModelCache>>>,
```

Add initialization in `AppState::new()` (after line 98, before the closing `}`):

```rust
            openrouter_cache: Arc::new(Mutex::new(None)),
```

- [ ] **Step 2: Add the IPC command**

Add to the bottom of `src-tauri/src/commands/llm_commands.rs`:

```rust
use crate::llm::openrouter_models::{self, OpenRouterModel};

#[command]
pub async fn list_openrouter_models(
    force_refresh: bool,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Check cache first (unless force refresh)
    if !force_refresh {
        let cache_guard = state
            .openrouter_cache
            .lock()
            .map_err(|e| format!("Failed to lock cache: {}", e))?;
        if let Some(ref cache) = *cache_guard {
            if cache.is_valid() {
                log::info!(
                    "OpenRouter models: returning {} cached models",
                    cache.models.len()
                );
                return serde_json::to_string(&cache.models)
                    .map_err(|e| format!("Failed to serialize: {}", e));
            }
        }
    }

    // Get API key from CredentialManager
    let api_key = {
        let cred_mgr = state
            .credentials
            .as_ref()
            .ok_or_else(|| "Credential manager not initialized".to_string())?;
        let cred = cred_mgr
            .lock()
            .map_err(|e| format!("Failed to lock credential manager: {}", e))?;
        cred.get_key("openrouter")
            .map_err(|e| format!("Failed to get API key: {}", e))?
            .ok_or_else(|| "OpenRouter API key not found. Please enter your API key first.".to_string())?
    };

    // Fetch from API
    let models = openrouter_models::fetch_openrouter_models(&api_key).await?;
    let model_count = models.len();

    // Update cache
    {
        let mut cache_guard = state
            .openrouter_cache
            .lock()
            .map_err(|e| format!("Failed to lock cache: {}", e))?;
        *cache_guard = Some(openrouter_models::OpenRouterModelCache::new(models.clone()));
    }

    log::info!(
        "OpenRouter models: fetched and cached {} models",
        model_count
    );

    serde_json::to_string(&models).map_err(|e| format!("Failed to serialize: {}", e))
}
```

- [ ] **Step 3: Register command in lib.rs**

In `src-tauri/src/lib.rs`, add inside the `invoke_handler` block, after `llm_commands::get_llm_providers,` (line 395):

```rust
            llm_commands::list_openrouter_models,
```

- [ ] **Step 4: Verify Rust compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: `Finished` with no errors

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/state.rs src-tauri/src/commands/llm_commands.rs src-tauri/src/lib.rs
git commit -m "feat(openrouter): add list_openrouter_models IPC command with cache"
```

---

### Task 4: Add IPC wrapper in TypeScript

**Files:**
- Modify: `src/lib/ipc.ts:7-25`

- [ ] **Step 1: Add import and wrapper function**

Add `OpenRouterModel` to the import block at `src/lib/ipc.ts:7` (add after `ModelInfo`):

```typescript
  OpenRouterModel,
```

Add the wrapper function. Place it in the LLM section (after the existing `getLLMProviders` function — search for `// == IPC: LLM` section):

```typescript
export async function listOpenRouterModels(
  forceRefresh: boolean
): Promise<OpenRouterModel[]> {
  const result = await invoke<string>("list_openrouter_models", {
    forceRefresh,
  });
  return JSON.parse(result);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/ipc.ts
git commit -m "feat(openrouter): add listOpenRouterModels IPC wrapper"
```

---

### Task 5: Add Zustand store fields for favorites + recently used

**Files:**
- Modify: `src/stores/configStore.ts:80-187` (interface), `189-220` (defaults), `460-631` (loadConfig)

- [ ] **Step 1: Add state fields to ConfigState interface**

In the `ConfigState` interface, after `confidenceHighlightEnabled: boolean;` (line 143), add:

```typescript
  // OpenRouter catalog
  openrouterFavorites: string[];
  openrouterRecentlyUsed: string[];
```

Add actions after `setConfidenceHighlightEnabled` (line 185):

```typescript
  toggleOpenRouterFavorite: (id: string) => void;
  addOpenRouterRecentlyUsed: (id: string) => void;
```

- [ ] **Step 2: Add default values**

In the `create<ConfigState>` initializer, after `confidenceHighlightEnabled: true,` (line 218), add:

```typescript
  openrouterFavorites: [],
  openrouterRecentlyUsed: [],
```

- [ ] **Step 3: Add action implementations**

After the existing `setConfidenceHighlightEnabled` action, add:

```typescript
  toggleOpenRouterFavorite: (id) => {
    const { openrouterFavorites } = useConfigStore.getState();
    const next = openrouterFavorites.includes(id)
      ? openrouterFavorites.filter((fav) => fav !== id)
      : [...openrouterFavorites, id];
    set({ openrouterFavorites: next });
    persistValue("openrouterFavorites", next);
  },
  addOpenRouterRecentlyUsed: (id) => {
    const { openrouterRecentlyUsed } = useConfigStore.getState();
    const next = [id, ...openrouterRecentlyUsed.filter((r) => r !== id)].slice(0, 5);
    set({ openrouterRecentlyUsed: next });
    persistValue("openrouterRecentlyUsed", next);
  },
```

- [ ] **Step 4: Add loadConfig integration**

In the `loadConfig` function, after the `confidenceHighlightEnabled` store.get call (around line 501), add:

```typescript
      const openrouterFavorites = await store.get<string[]>("openrouterFavorites");
      const openrouterRecentlyUsed = await store.get<string[]>("openrouterRecentlyUsed");
```

In the `set((state) => ({...}))` merge block (around line 631), add before the closing `}))`:

```typescript
        ...(openrouterFavorites != null && { openrouterFavorites }),
        ...(openrouterRecentlyUsed != null && { openrouterRecentlyUsed }),
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add src/stores/configStore.ts
git commit -m "feat(openrouter): add favorites + recently used to configStore"
```

---

### Task 6: Create ModelCard component

**Files:**
- Create: `src/settings/openrouter/ModelCard.tsx`

- [ ] **Step 1: Create the component**

Create directory and file `src/settings/openrouter/ModelCard.tsx`:

```tsx
import type { OpenRouterModel } from "../../lib/types";
import { Star } from "lucide-react";

// Meeting cost estimate: 30-min meeting ≈ 15K input, 2K output tokens
const MEETING_INPUT_TOKENS = 15_000;
const MEETING_OUTPUT_TOKENS = 2_000;

function estimateMeetingCost(pricing: OpenRouterModel["pricing"]): number {
  return (
    (MEETING_INPUT_TOKENS * pricing.prompt +
      MEETING_OUTPUT_TOKENS * pricing.completion) /
    1_000_000
  );
}

function isGoodForMeetings(model: OpenRouterModel): boolean {
  return (
    model.supports_tools &&
    (model.context_length ?? 0) >= 65536 &&
    model.pricing.prompt <= 10
  );
}

function formatContext(ctx: number | null): string {
  if (!ctx) return "—";
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`;
  return `${Math.round(ctx / 1000)}K`;
}

function formatPrice(price: number): string {
  if (price === 0) return "Free";
  if (price < 0.01) return `$${price.toFixed(4)}`;
  if (price < 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(price % 1 === 0 ? 0 : 2)}`;
}

// "NEW" if created within last 14 days
function isNew(created: number): boolean {
  const fourteenDays = 14 * 24 * 60 * 60;
  return Date.now() / 1000 - created < fourteenDays;
}

interface ModelCardProps {
  model: OpenRouterModel;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export function ModelCard({
  model,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: ModelCardProps) {
  const meetingCost = estimateMeetingCost(model.pricing);
  const goodForMeetings = isGoodForMeetings(model);

  return (
    <div
      onClick={() => onSelect(model.id)}
      className={`group relative rounded-lg border p-3 cursor-pointer transition-all duration-150 hover:border-border/60 hover:bg-accent/30 ${
        isSelected
          ? "border-primary/50 bg-primary/5"
          : "border-border/20 bg-card/30"
      }`}
    >
      {/* Favorite star */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(model.id);
        }}
        className={`absolute top-2.5 right-3 transition-all duration-150 cursor-pointer ${
          isFavorite
            ? "text-yellow-500 opacity-100"
            : "text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:!opacity-60"
        }`}
        style={{ opacity: isFavorite ? 1 : undefined }}
      >
        <Star className="h-3.5 w-3.5" fill={isFavorite ? "currentColor" : "none"} />
      </button>

      {/* Row 1: Name, provider, badges, tags */}
      <div className="flex items-center gap-2 mb-1 pr-6">
        <span className="text-[13.5px] font-semibold text-foreground truncate">
          {model.name}
        </span>
        <span className="text-[10px] text-muted-foreground/50 shrink-0">
          {model.provider_name}
        </span>
        {isNew(model.created) && (
          <span className="text-[9px] px-1.5 py-px rounded bg-emerald-500/12 text-emerald-500 shrink-0">
            NEW
          </span>
        )}
        {model.is_free && (
          <span className="text-[9px] px-1.5 py-px rounded bg-green-500/15 text-green-500 font-semibold shrink-0">
            FREE
          </span>
        )}
        {goodForMeetings && (
          <span className="text-[9px] px-1.5 py-px rounded bg-primary/12 text-primary shrink-0">
            Good for meetings
          </span>
        )}
        <div className="ml-auto flex gap-1 shrink-0">
          {model.supports_tools && (
            <span className="text-[9px] px-1.5 py-px rounded bg-yellow-500/12 text-yellow-500">
              tools
            </span>
          )}
          {model.supports_reasoning && (
            <span className="text-[9px] px-1.5 py-px rounded bg-emerald-500/12 text-emerald-500">
              reasoning
            </span>
          )}
          {model.supports_web_search && (
            <span className="text-[9px] px-1.5 py-px rounded bg-pink-500/12 text-pink-500">
              web
            </span>
          )}
        </div>
      </div>

      {/* Row 2: Description */}
      <p className="text-[11px] text-muted-foreground/45 leading-snug mb-1.5 truncate">
        {model.description}
      </p>

      {/* Row 3: Stats */}
      <div className="flex items-center gap-3.5 text-[11px] text-muted-foreground/65">
        {model.is_free ? (
          <span className="text-green-500 font-semibold">Free</span>
        ) : (
          <>
            <span>
              <b className="font-semibold">{formatPrice(model.pricing.prompt)}</b>
              <span className="opacity-50">/M in</span>
            </span>
            <span>
              <b className="font-semibold">{formatPrice(model.pricing.completion)}</b>
              <span className="opacity-50">/M out</span>
            </span>
          </>
        )}
        <span>
          <b className="font-semibold">{formatContext(model.context_length)}</b>
          <span className="opacity-50"> ctx</span>
        </span>
        {model.max_completion_tokens && (
          <span>
            <b className="font-semibold">
              {formatContext(model.max_completion_tokens)}
            </b>
            <span className="opacity-50"> max</span>
          </span>
        )}
        <span className="ml-auto text-[10px]">
          {model.is_free ? (
            <span className="text-green-500 font-medium">Free / meeting</span>
          ) : (
            <span className="text-primary font-medium">
              ~${meetingCost < 0.01 ? meetingCost.toFixed(4) : meetingCost.toFixed(2)} / meeting
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/settings/openrouter/ModelCard.tsx
git commit -m "feat(openrouter): create ModelCard component with pricing + badges"
```

---

### Task 7: Create FilterBar component

**Files:**
- Create: `src/settings/openrouter/FilterBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Search } from "lucide-react";

export type SortOption = "newest" | "price_asc" | "price_desc" | "context_desc";

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  freeOnly: boolean;
  onFreeOnlyChange: (value: boolean) => void;
  filterTools: boolean;
  onFilterToolsChange: (value: boolean) => void;
  filterReasoning: boolean;
  onFilterReasoningChange: (value: boolean) => void;
  filterWebSearch: boolean;
  onFilterWebSearchChange: (value: boolean) => void;
}

export function FilterBar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  freeOnly,
  onFreeOnlyChange,
  filterTools,
  onFilterToolsChange,
  filterReasoning,
  onFilterReasoningChange,
  filterWebSearch,
  onFilterWebSearchChange,
}: FilterBarProps) {
  return (
    <div className="space-y-2.5">
      {/* Search + Sort row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
          <input
            type="text"
            placeholder="Search models..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-border/30 bg-background/50 pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="rounded-lg border border-border/30 bg-background/50 px-3 py-2 text-xs text-foreground focus:border-primary/40 focus:outline-none cursor-pointer min-w-[150px]"
        >
          <option value="newest">Newest first</option>
          <option value="price_asc">Price: low → high</option>
          <option value="price_desc">Price: high → low</option>
          <option value="context_desc">Context: high → low</option>
        </select>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5">
        <Chip
          label="Free only"
          active={freeOnly}
          onClick={() => onFreeOnlyChange(!freeOnly)}
          variant="free"
        />
        <div className="w-px h-4 bg-border/20 mx-1" />
        <Chip
          label="Tools"
          active={filterTools}
          onClick={() => onFilterToolsChange(!filterTools)}
        />
        <Chip
          label="Reasoning"
          active={filterReasoning}
          onClick={() => onFilterReasoningChange(!filterReasoning)}
        />
        <Chip
          label="Web search"
          active={filterWebSearch}
          onClick={() => onFilterWebSearchChange(!filterWebSearch)}
        />
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
  variant,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  variant?: "free";
}) {
  const activeClass =
    variant === "free"
      ? "bg-green-500/12 border-green-500/30 text-green-500"
      : "bg-primary/12 border-primary/30 text-primary";

  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] border transition-all duration-150 cursor-pointer ${
        active
          ? activeClass
          : "border-border/20 text-muted-foreground/50 hover:border-border/40 hover:text-muted-foreground/70"
      }`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/settings/openrouter/FilterBar.tsx
git commit -m "feat(openrouter): create FilterBar with search, sort, capability chips"
```

---

### Task 8: Create RecentlyUsedSection component

**Files:**
- Create: `src/settings/openrouter/RecentlyUsedSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { OpenRouterModel } from "../../lib/types";

interface RecentlyUsedSectionProps {
  recentIds: string[];
  models: OpenRouterModel[];
  onSelect: (id: string) => void;
}

export function RecentlyUsedSection({
  recentIds,
  models,
  onSelect,
}: RecentlyUsedSectionProps) {
  const recentModels = recentIds
    .map((id) => models.find((m) => m.id === id))
    .filter(Boolean) as OpenRouterModel[];

  if (recentModels.length === 0) return null;

  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground/40 mb-2 pl-0.5">
        Recently Used
      </h4>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {recentModels.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/15 bg-card/30 text-xs text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all duration-150 cursor-pointer"
          >
            {m.name}
            <span className={`text-[10px] ${m.is_free ? "text-green-500" : "text-muted-foreground/40"}`}>
              {m.is_free
                ? "Free"
                : `$${m.pricing.prompt < 1 ? m.pricing.prompt.toFixed(2) : m.pricing.prompt.toFixed(0)}/$${m.pricing.completion < 1 ? m.pricing.completion.toFixed(2) : m.pricing.completion.toFixed(0)}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/settings/openrouter/RecentlyUsedSection.tsx
git commit -m "feat(openrouter): create RecentlyUsedSection component"
```

---

### Task 9: Create FavoritesSection component

**Files:**
- Create: `src/settings/openrouter/FavoritesSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { OpenRouterModel } from "../../lib/types";
import { ModelCard } from "./ModelCard";

interface FavoritesSectionProps {
  favoriteIds: string[];
  models: OpenRouterModel[];
  selectedModelId: string;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export function FavoritesSection({
  favoriteIds,
  models,
  selectedModelId,
  onSelect,
  onToggleFavorite,
}: FavoritesSectionProps) {
  const favoriteModels = favoriteIds
    .map((id) => models.find((m) => m.id === id))
    .filter(Boolean) as OpenRouterModel[];

  if (favoriteModels.length === 0) return null;

  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground/40 mb-2 pl-0.5">
        ★ Favorites
      </h4>
      <div className="flex flex-col gap-1.5">
        {favoriteModels.map((m) => (
          <ModelCard
            key={m.id}
            model={m}
            isSelected={selectedModelId === m.id}
            isFavorite={true}
            onSelect={onSelect}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/settings/openrouter/FavoritesSection.tsx
git commit -m "feat(openrouter): create FavoritesSection component"
```

---

### Task 10: Create OpenRouterModelCatalog — main container

**Files:**
- Create: `src/settings/openrouter/OpenRouterModelCatalog.tsx`

- [ ] **Step 1: Create the main catalog component**

```tsx
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { OpenRouterModel } from "../../lib/types";
import { useConfigStore } from "../../stores/configStore";
import { setActiveModel as ipcSetActiveModel } from "../../lib/ipc";
import { ModelCard } from "./ModelCard";
import { FilterBar, type SortOption } from "./FilterBar";
import { RecentlyUsedSection } from "./RecentlyUsedSection";
import { FavoritesSection } from "./FavoritesSection";

interface OpenRouterModelCatalogProps {
  models: OpenRouterModel[];
}

const VISIBLE_BATCH = 50;

export function OpenRouterModelCatalog({ models }: OpenRouterModelCatalogProps) {
  const llmModel = useConfigStore((s) => s.llmModel);
  const setConfigModel = useConfigStore((s) => s.setLLMModel);
  const favorites = useConfigStore((s) => s.openrouterFavorites);
  const recentlyUsed = useConfigStore((s) => s.openrouterRecentlyUsed);
  const toggleFavorite = useConfigStore((s) => s.toggleOpenRouterFavorite);
  const addRecentlyUsed = useConfigStore((s) => s.addOpenRouterRecentlyUsed);

  // Filter/sort state (local, resets on leave)
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search input by 200ms
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(debounceRef.current);
  }, [search]);
  const [sort, setSort] = useState<SortOption>("newest");
  const [freeOnly, setFreeOnly] = useState(false);
  const [filterTools, setFilterTools] = useState(false);
  const [filterReasoning, setFilterReasoning] = useState(false);
  const [filterWebSearch, setFilterWebSearch] = useState(false);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_BATCH);

  // Model selection handler
  const handleSelect = useCallback(
    async (id: string) => {
      setConfigModel(id);
      addRecentlyUsed(id);
      try {
        await ipcSetActiveModel("openrouter", id);
      } catch (err) {
        console.error("[OpenRouterCatalog] Failed to set active model:", err);
      }
    },
    [setConfigModel, addRecentlyUsed]
  );

  // Filter + sort pipeline (uses debounced search)
  const filtered = useMemo(() => {
    const lowerSearch = debouncedSearch.toLowerCase();

    let result = models.filter((m) => {
      if (freeOnly && !m.is_free) return false;
      if (filterTools && !m.supports_tools) return false;
      if (filterReasoning && !m.supports_reasoning) return false;
      if (filterWebSearch && !m.supports_web_search) return false;
      if (
        lowerSearch &&
        !m.name.toLowerCase().includes(lowerSearch) &&
        !m.description.toLowerCase().includes(lowerSearch) &&
        !m.provider_name.toLowerCase().includes(lowerSearch)
      )
        return false;
      return true;
    });

    result.sort((a, b) => {
      switch (sort) {
        case "newest":
          return b.created - a.created;
        case "price_asc":
          return a.pricing.prompt - b.pricing.prompt;
        case "price_desc":
          return b.pricing.prompt - a.pricing.prompt;
        case "context_desc":
          return (b.context_length ?? 0) - (a.context_length ?? 0);
        default:
          return 0;
      }
    });

    return result;
  }, [models, debouncedSearch, sort, freeOnly, filterTools, filterReasoning, filterWebSearch]);

  // Favorites that also pass current filters
  const filteredFavoriteIds = useMemo(
    () => favorites.filter((id) => filtered.some((m) => m.id === id)),
    [favorites, filtered]
  );

  // Virtual scroll: show more on scroll
  const visibleModels = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Active filter summary
  const activeFilters: string[] = [];
  if (freeOnly) activeFilters.push("free");
  if (filterTools) activeFilters.push("tools");
  if (filterReasoning) activeFilters.push("reasoning");
  if (filterWebSearch) activeFilters.push("web search");

  const resetFilters = () => {
    setSearch("");
    setFreeOnly(false);
    setFilterTools(false);
    setFilterReasoning(false);
    setFilterWebSearch(false);
    setSort("newest");
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <FilterBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setVisibleCount(VISIBLE_BATCH); }}
        sort={sort}
        onSortChange={setSort}
        freeOnly={freeOnly}
        onFreeOnlyChange={setFreeOnly}
        filterTools={filterTools}
        onFilterToolsChange={setFilterTools}
        filterReasoning={filterReasoning}
        onFilterReasoningChange={setFilterReasoning}
        filterWebSearch={filterWebSearch}
        onFilterWebSearchChange={setFilterWebSearch}
      />

      {/* Recently Used */}
      <RecentlyUsedSection
        recentIds={recentlyUsed}
        models={models}
        onSelect={handleSelect}
      />

      {/* Favorites */}
      <FavoritesSection
        favoriteIds={filteredFavoriteIds}
        models={filtered}
        selectedModelId={llmModel}
        onSelect={handleSelect}
        onToggleFavorite={toggleFavorite}
      />

      {/* All Models */}
      <div>
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground/40 mb-1 pl-0.5">
          All Models
        </h4>
        <p className="text-[11px] text-muted-foreground/30 mb-2 pl-0.5">
          {filtered.length} models
          {activeFilters.length > 0 && ` · filtered: ${activeFilters.join(", ")}`}
        </p>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-border/20 bg-accent/10 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground/50">
              No models match your filters
            </p>
            <button
              onClick={resetFilters}
              className="mt-2 text-xs text-primary hover:underline cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-[520px] overflow-y-auto pr-1 scrollbar-thin">
            {visibleModels.map((m) => (
              <ModelCard
                key={m.id}
                model={m}
                isSelected={llmModel === m.id}
                isFavorite={favorites.includes(m.id)}
                onSelect={handleSelect}
                onToggleFavorite={toggleFavorite}
              />
            ))}
            {hasMore && (
              <button
                onClick={() => setVisibleCount((c) => c + VISIBLE_BATCH)}
                className="py-2 text-xs text-muted-foreground/40 hover:text-muted-foreground/60 cursor-pointer"
              >
                Show more ({filtered.length - visibleCount} remaining)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/settings/openrouter/OpenRouterModelCatalog.tsx
git commit -m "feat(openrouter): create OpenRouterModelCatalog main container"
```

---

### Task 11: Integrate catalog into LLMSettings

**Files:**
- Modify: `src/settings/LLMSettings.tsx:1-14` (imports), `230-254` (handleLoadModels), `464-487` (model selection section)

- [ ] **Step 1: Add imports**

At the top of `LLMSettings.tsx`, add to the imports from `../lib/ipc` (line 7):

```typescript
  listOpenRouterModels,
```

Add a new import for the catalog and types:

```typescript
import { OpenRouterModelCatalog } from "./openrouter/OpenRouterModelCatalog";
import type { OpenRouterModel } from "../lib/types";
```

- [ ] **Step 2: Add OpenRouter models state**

Inside the component function, near the existing `const [models, setModels]` state, add:

```typescript
const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
```

- [ ] **Step 3: Modify handleLoadModels for OpenRouter**

Replace the existing `handleLoadModels` function (lines 230-254) with:

```typescript
  const handleLoadModels = async () => {
    setModelsLoading(true);
    setModelsError("");
    setModels([]);
    setOpenRouterModels([]);
    try {
      if (apiKey) await storeApiKey(selectedProvider, apiKey).catch(() => {});

      if (selectedProvider === "openrouter") {
        // Set provider on backend + configStore first
        const configJson = buildProviderConfig();
        await setLLMProvider(configJson).catch(() => {});
        setConfigProvider(selectedProvider);
        // Use enriched OpenRouter endpoint
        const orModels = await listOpenRouterModels(true);
        setOpenRouterModels(orModels);
        if (orModels.length === 0) {
          setModelsError("No text models found");
        }
      } else {
        // Use generic model listing for other providers
        const configJson = buildProviderConfig();
        await setLLMProvider(configJson).catch(() => {});
        setConfigProvider(selectedProvider);
        const modelList = await listModels(configJson);
        const chatModels = filterChatModels(modelList);
        setModels(chatModels);
        if (chatModels.length === 0) {
          setModelsError(
            modelList.length > 0
              ? "No chat models found (embedding-only models filtered)"
              : "No models found"
          );
        }
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setModelsLoading(false);
    }
  };
```

- [ ] **Step 4: Replace model selection section**

Replace the model selection section (lines 464-487, the `<div>` with `<h3>Model</h3>` and the `<select>`) with:

```tsx
      {/* Model Selection */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-5">
        <h3 className="mb-3 text-sm font-semibold text-primary/80">Model</h3>
        {selectedProvider === "openrouter" && openRouterModels.length > 0 ? (
          <OpenRouterModelCatalog models={openRouterModels} />
        ) : models.length > 0 ? (
          <select
            value={selectedModel}
            onChange={(e) => handleModelSelect(e.target.value)}
            className="w-full rounded-lg border border-border/50 bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer"
          >
            <option value="">Select a model...</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}{m.context_window ? ` (${Math.round(m.context_window / 1000)}K ctx)` : ""}
              </option>
            ))}
          </select>
        ) : (
          <div className="rounded-lg border border-border/30 bg-accent/20 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {modelsError || (modelsLoading ? "Loading models..." : 'Click "Load Models" to fetch available models')}
            </p>
          </div>
        )}
      </div>
```

- [ ] **Step 5: Also clear openRouterModels on provider change**

In the `handleProviderChange` function (wherever `setModels([])` is called), also add:

```typescript
setOpenRouterModels([]);
```

Also find the `useEffect` that resets state on provider change (around line 154-167 — the one that calls `setModels([])` when `selectedProvider` changes). Add `setOpenRouterModels([]);` there too so stale catalog data doesn't flash when switching providers.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/settings/LLMSettings.tsx
git commit -m "feat(openrouter): integrate model catalog into LLMSettings"
```

---

### Task 12: Version bump + final verification

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Bump version**

Update `src/lib/version.ts`:

```typescript
export const NEXQ_VERSION = "2.10.0";
export const NEXQ_BUILD_DATE = "2026-03-23"; // v2.10.0: OpenRouter model catalog with pricing, filters, favorites
```

- [ ] **Step 2: Verify full TypeScript build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Verify Rust build**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: `Finished` with no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/version.ts
git commit -m "chore: bump version to 2.10.0 for OpenRouter model catalog"
```

- [ ] **Step 5: Test manually**

Run: `npx tauri dev`
1. Open Settings → LLM → select OpenRouter
2. Enter API key, click "Load Models"
3. Verify: model cards appear with pricing, badges, tags
4. Test: search filters models, sort changes order, "Free only" works
5. Test: click star → model appears in Favorites section
6. Test: select a model → appears in Recently Used on next load
7. Test: "Good for meetings" badge shows on qualifying models
8. Test: cost estimate shows on each card
