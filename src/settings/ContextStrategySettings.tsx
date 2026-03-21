import { useState, useEffect, useCallback } from "react";
import { useConfigStore } from "../stores/configStore";
import { useRagStore } from "../stores/ragStore";
import { useRagEvents } from "../hooks/useRagEvents";
import type { ContextStrategy, RagConfig } from "../lib/types";
import {
  Database,
  Cloud,
  Wifi,
  WifiOff,
  Download,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  X,
  Zap,
  Target,
  Gauge,
} from "lucide-react";

// ─── Preset Definitions ───────────────────────────────────────────────────────
const PRESETS = [
  {
    id: "fastest",
    label: "Fastest",
    ms: "~10ms",
    icon: Zap,
    description: "Keyword-only search, no embedding needed at query time",
    config: {
      search_mode: "keyword",
      top_k: 3,
      chunk_size: 256,
      chunk_overlap: 16,
      embedding_model: "all-minilm",
      semantic_weight: 0.3,
      batch_size: 32,
      similarity_threshold: 0.1,
    },
  },
  {
    id: "faster",
    label: "Faster",
    ms: "~80ms",
    icon: Gauge,
    description: "Hybrid search with small embedding model",
    config: {
      search_mode: "hybrid",
      top_k: 3,
      chunk_size: 512,
      chunk_overlap: 64,
      embedding_model: "all-minilm",
      semantic_weight: 0.7,
      batch_size: 32,
      similarity_threshold: 0.2,
    },
  },
  {
    id: "default",
    label: "Default",
    ms: "~200ms",
    icon: Target,
    description: "Best balance of speed and accuracy",
    config: {
      search_mode: "hybrid",
      top_k: 5,
      chunk_size: 512,
      chunk_overlap: 64,
      embedding_model: "nomic-embed-text",
      semantic_weight: 0.7,
      batch_size: 32,
      similarity_threshold: 0.3,
    },
  },
  {
    id: "accurate",
    label: "Accurate",
    ms: "~350ms",
    icon: Target,
    description: "More results, finer chunks, better coverage",
    config: {
      search_mode: "hybrid",
      top_k: 10,
      chunk_size: 256,
      chunk_overlap: 64,
      embedding_model: "nomic-embed-text",
      semantic_weight: 0.7,
      batch_size: 32,
      similarity_threshold: 0.2,
    },
  },
  {
    id: "most_accurate",
    label: "Most Accurate",
    ms: "~600ms",
    icon: Target,
    description: "High-dimensional model, fine chunks, maximum context",
    config: {
      search_mode: "hybrid",
      top_k: 15,
      chunk_size: 256,
      chunk_overlap: 128,
      embedding_model: "mxbai-embed-large",
      semantic_weight: 0.7,
      batch_size: 32,
      similarity_threshold: 0.2,
    },
  },
] as const;

const PRESET_KEYS: (keyof RagConfig)[] = [
  "search_mode", "top_k", "chunk_size", "chunk_overlap",
  "embedding_model", "semantic_weight", "batch_size", "similarity_threshold",
];

function getActivePresetId(config: RagConfig): string | null {
  for (const p of PRESETS) {
    const match = PRESET_KEYS.every(
      (k) => (config as any)[k] === (p.config as any)[k]
    );
    if (match) return p.id;
  }
  return null;
}

// ─── Help Content ─────────────────────────────────────────────────────────────
const HELP: Record<string, { title: string; body: string }> = {
  embedding_model: {
    title: "Embedding Model",
    body: `Converts documents and your query into vectors for semantic search. Runs locally via Ollama.

• nomic-embed-text (768d) — best balance of quality and speed, ~150ms/query ✓ default
• mxbai-embed-large (1024d) — highest quality embeddings, ~250ms/query, requires more RAM
• all-minilm (384d) — fastest (~60ms/query), good for simple documents

⚠ Changing model invalidates the entire index — full rebuild required.`,
  },
  top_k: {
    title: "Results to Retrieve (top-K)",
    body: `How many document chunks are injected into the LLM prompt alongside your question.

• 3 chunks  → ~300–600 tokens context, fastest LLM response
• 5 chunks  → ~600–1000 tokens, good balance ✓ default
• 10 chunks → ~1200–2000 tokens, better coverage for multi-part questions
• 15–20     → best for large documents with scattered information

More chunks = higher LLM token cost + slightly longer generation time.
Inference latency impact: ~+50ms per 5 additional chunks (LLM input).`,
  },
  search_mode: {
    title: "Search Mode",
    body: `How the top-K relevant chunks are found from the index:

• Hybrid (recommended) — fuses semantic + keyword scores via RRF
  Best quality, handles both vague ("explain their background") and
  exact queries ("Agency: State of Michigan"). ~150–250ms search time.

• Semantic Only — pure embedding similarity (cosine distance)
  Good for conceptual/paraphrased questions. ~150–250ms.
  Exact terms may not match if not semantically related.

• Keyword Only — BM25 exact text matching (no embedding at query time)
  Fastest: ~5–15ms search. Best for names, codes, exact phrases.
  Fails for conceptual questions or paraphrasing.`,
  },
  chunk_size: {
    title: "Chunk Size (tokens)",
    body: `How many tokens each indexed document segment contains.

• Small (128–256) — precise retrieval, more chunks, specific context
  Good for Q&A on dense technical docs. More chunks = slightly slower search.

• Medium (512) — good balance ✓ default
  Works well for resumes, job descriptions, notes.

• Large (1024–2048) — more narrative context per chunk, fewer total chunks
  Good for prose documents. Risk: relevant detail buried inside large chunk.

Latency impact at query time: minimal (cosine scan is O(n), ~1ms per 1000 chunks).
Indexing time impact: smaller chunks = more embeddings = longer initial build.

⚠ Requires full index rebuild after changing.`,
  },
  chunk_overlap: {
    title: "Chunk Overlap (tokens)",
    body: `How many tokens are repeated between adjacent chunks to avoid
cutting sentences or ideas at boundaries.

• 0       — no overlap, fastest indexing, may miss boundary context
• 32–64   — recommended, prevents most boundary split issues ✓ default (64)
• 128–256 — high continuity for narrative text, increases index size
             and indexing time proportionally

Example: with chunk_size=512 and overlap=64, every chunk shares
64 tokens with the previous one, so a key sentence near a boundary
appears in two chunks and is more likely to be retrieved.

⚠ Requires full index rebuild after changing.`,
  },
  similarity_threshold: {
    title: "Similarity Threshold",
    body: `Minimum relevance score to include a chunk in results.

IMPORTANT: This only meaningfully applies to Semantic Only mode.
In Hybrid mode, scores are RRF-fused (max ~0.016) so setting this
above 0.0 will filter ALL results. Keep at 0.0–0.1 for Hybrid.

For Semantic Only (cosine similarity, range 0–1):
• 0.0–0.1 — return everything (low quality bar)
• 0.3     — filters weakly related chunks ✓ default for semantic
• 0.5+    — strict, may miss some relevant content

Accuracy impact: higher threshold = fewer but more precise results.
Latency impact: none (filtering happens after search).`,
  },
  semantic_weight: {
    title: "Semantic Weight (Hybrid mode)",
    body: `In Hybrid mode, controls the balance between semantic and keyword
scores during Reciprocal Rank Fusion (RRF).

Formula: score = w_sem/(60+rank_sem) + (1-w_sem)/(60+rank_kw)

• 0.3 — favor keyword matching (exact terms, names, IDs)
• 0.7 — favor semantic understanding ✓ default
• 1.0 — pure semantic (equivalent to Semantic Only mode)
• 0.0 — pure keyword (equivalent to Keyword Only mode)

Recommendation:
• Technical docs with exact terms → 0.4–0.5
• Narrative docs, resumes, essays → 0.7–0.8
• Unknown content type → keep at 0.7

Has no effect in Semantic Only or Keyword Only modes.`,
  },
  batch_size: {
    title: "Embedding Batch Size",
    body: `How many text chunks are sent to Ollama per embedding API call
during the index build phase.

• 8–16  — safe for low-memory machines (<4GB RAM)
• 32    — good balance, ~2–3x faster than batch=8 ✓ default
• 64    — fastest indexing, needs ~1–2GB extra RAM for the batch

Does NOT affect search latency — only initial index build time.

For 60 chunks at batch=32: ~2 Ollama calls vs ~8 calls at batch=8.`,
  },
};

// ─── Default Config ───────────────────────────────────────────────────────────
const DEFAULT_RAG_CONFIG: RagConfig = {
  enabled: true,
  embedding_model: "nomic-embed-text",
  ollama_url: "http://localhost:11434",
  batch_size: 32,
  chunk_size: 512,
  chunk_overlap: 64,
  splitting_strategy: "recursive",
  top_k: 5,
  search_mode: "hybrid",
  similarity_threshold: 0.3,
  semantic_weight: 0.7,
  include_transcript: false, // Transcript is sent as context window, not indexed
  embedding_dimensions: 768,
};

const MODEL_DIMS: Record<string, number> = {
  "nomic-embed-text": 768,
  "mxbai-embed-large": 1024,
  "all-minilm": 384,
};

const EMBEDDING_MODELS = [
  { id: "nomic-embed-text", label: "nomic-embed-text (768d)", dims: 768 },
  { id: "mxbai-embed-large", label: "mxbai-embed-large (1024d)", dims: 1024 },
  { id: "all-minilm", label: "all-minilm (384d)", dims: 384 },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function HelpButton({
  id,
  activeId,
  onToggle,
}: {
  id: string;
  activeId: string | null;
  onToggle: (id: string | null) => void;
}) {
  const isOpen = activeId === id;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(isOpen ? null : id); }}
      className={`inline-flex items-center justify-center rounded-full border transition-colors ${
        isOpen
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/30 text-muted-foreground/60 hover:border-border/60 hover:text-muted-foreground"
      } h-[18px] w-[18px]`}
      title="Show explanation"
    >
      {isOpen ? <X className="h-2.5 w-2.5" /> : <HelpCircle className="h-2.5 w-2.5" />}
    </button>
  );
}

function HelpPanel({ id }: { id: string }) {
  const content = HELP[id];
  if (!content) return null;
  return (
    <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-3 space-y-1">
      <p className="text-xs font-semibold text-primary/80">{content.title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
        {content.body}
      </p>
    </div>
  );
}

function SectionHelp({ id, activeId, onToggle }: { id: string; activeId: string | null; onToggle: (id: string | null) => void }) {
  return (
    <div className="flex items-center gap-2">
      <HelpButton id={id} activeId={activeId} onToggle={onToggle} />
    </div>
  );
}

function RebuildBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-meta font-medium text-amber-500">
      rebuild
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ContextStrategySettings() {
  const contextStrategy = useConfigStore((s) => s.contextStrategy);
  const setContextStrategy = useConfigStore((s) => s.setContextStrategy);

  const ragConfig = useRagStore((s) => s.ragConfig);
  const indexStatus = useRagStore((s) => s.indexStatus);
  const ollamaStatus = useRagStore((s) => s.ollamaStatus);
  const isIndexing = useRagStore((s) => s.isIndexing);
  const indexProgress = useRagStore((s) => s.indexProgress);
  const isPullingModel = useRagStore((s) => s.isPullingModel);
  const pullProgress = useRagStore((s) => s.pullProgress);
  const isCheckingConnection = useRagStore((s) => s.isCheckingConnection);
  const indexStale = useRagStore((s) => s.indexStale);

  const loadRagConfig = useRagStore((s) => s.loadRagConfig);
  const saveRagConfig = useRagStore((s) => s.saveRagConfig);
  const saveRagConfigWithStaleCheck = useRagStore((s) => s.saveRagConfigWithStaleCheck);
  const refreshIndexStatus = useRagStore((s) => s.refreshIndexStatus);
  const checkOllamaStatus = useRagStore((s) => s.checkOllamaStatus);
  const rebuildIndex = useRagStore((s) => s.rebuildIndex);
  const clearIndex = useRagStore((s) => s.clearIndex);
  const pullModel = useRagStore((s) => s.pullModel);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [localConfig, setLocalConfig] = useState<RagConfig>(DEFAULT_RAG_CONFIG);
  const [openHelp, setOpenHelp] = useState<string | null>(null);

  useRagEvents();

  useEffect(() => {
    loadRagConfig();
    refreshIndexStatus();
    checkOllamaStatus();
  }, [loadRagConfig, refreshIndexStatus, checkOllamaStatus]);

  useEffect(() => {
    if (ragConfig) {
      setLocalConfig({ ...ragConfig, include_transcript: false });
    }
  }, [ragConfig]);

  const handleStrategyChange = (strategy: ContextStrategy) => {
    setContextStrategy(strategy);
    const enabled = strategy === "local_rag";
    const updated = { ...localConfig, enabled, include_transcript: false };
    setLocalConfig(updated);
    saveRagConfig(updated);
  };

  const updateField = useCallback(
    <K extends keyof RagConfig>(key: K, value: RagConfig[K]) => {
      setLocalConfig((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const saveWithStaleCheck = useCallback(() => {
    if (ragConfig) {
      saveRagConfigWithStaleCheck({ ...localConfig, include_transcript: false }, ragConfig);
    } else {
      saveRagConfig({ ...localConfig, include_transcript: false });
    }
  }, [saveRagConfig, saveRagConfigWithStaleCheck, localConfig, ragConfig]);

  const handleFieldBlur = useCallback(() => {
    saveWithStaleCheck();
  }, [saveWithStaleCheck]);

  const handleSelectChange = useCallback(
    <K extends keyof RagConfig>(key: K, value: RagConfig[K]) => {
      const extraFields: Partial<RagConfig> = {};
      if (key === "embedding_model") {
        const dims = MODEL_DIMS[value as string] ?? 768;
        extraFields.embedding_dimensions = dims;
      }
      const updated = { ...localConfig, [key]: value, ...extraFields, include_transcript: false };
      setLocalConfig(updated);
      if (ragConfig) {
        saveRagConfigWithStaleCheck(updated, ragConfig);
      } else {
        saveRagConfig(updated);
      }
    },
    [localConfig, ragConfig, saveRagConfig, saveRagConfigWithStaleCheck]
  );

  const applyPreset = useCallback(
    (preset: (typeof PRESETS)[number]) => {
      const updated: RagConfig = {
        ...localConfig,
        ...preset.config,
        include_transcript: false,
        embedding_dimensions: MODEL_DIMS[preset.config.embedding_model] ?? 768,
      };
      setLocalConfig(updated);
      if (ragConfig) {
        saveRagConfigWithStaleCheck(updated, ragConfig);
      } else {
        saveRagConfig(updated);
      }
    },
    [localConfig, ragConfig, saveRagConfig, saveRagConfigWithStaleCheck]
  );

  const handleClearIndex = () => {
    if (confirmClear) {
      clearIndex();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  const handleRebuild = () => {
    if (indexStale && !confirmRebuild) {
      setConfirmRebuild(true);
      setTimeout(() => setConfirmRebuild(false), 4000);
      return;
    }
    setConfirmRebuild(false);
    rebuildIndex();
  };

  const handleResetDefaults = () => {
    const config = { ...DEFAULT_RAG_CONFIG, enabled: localConfig.enabled };
    setLocalConfig(config);
    saveRagConfig(config);
  };

  const toggleHelp = useCallback((id: string | null) => {
    setOpenHelp((prev) => (prev === id ? null : id));
  }, []);

  const selectedModelAvailable = ollamaStatus?.connected
    ? ollamaStatus.models.some(
        (m) =>
          m === localConfig.embedding_model ||
          m.startsWith(`${localConfig.embedding_model}:`)
      )
    : false;

  const totalChunks = indexStatus?.total_chunks ?? 0;
  const hasIndex = totalChunks > 0;
  const activePresetId = getActivePresetId(localConfig);

  return (
    <div className="space-y-6">
      {/* ── Strategy Selector ── */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => handleStrategyChange("local_rag")}
          className={`relative flex flex-col items-start rounded-xl border p-4 text-left transition-all duration-150 ${
            contextStrategy === "local_rag"
              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
              : "border-border/50 hover:border-border hover:bg-accent/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Local RAG</span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            Embed documents locally via Ollama, hybrid semantic+keyword search
          </p>
        </button>

        <div className="relative flex flex-col items-start rounded-xl border border-border/30 bg-accent/10 p-4 text-left opacity-60 cursor-not-allowed">
          <div className="absolute -top-1.5 right-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-meta font-medium text-muted-foreground">
              Coming Soon
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Gemini Context Cache</span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground/70 leading-relaxed">
            Cache documents in Gemini for fast repeated queries
          </p>
        </div>
      </div>

      {contextStrategy === "local_rag" && (
        <>
          {/* ── Quick Presets ── */}
          <div className="rounded-xl border border-border/30 bg-card/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-primary/80">Quick Presets</h3>
              <p className="text-meta text-muted-foreground/60">
                Expected search latency per query
              </p>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {PRESETS.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    title={preset.description}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center transition-all ${
                      isActive
                        ? "border-primary bg-primary/10 ring-1 ring-primary/20"
                        : "border-border/30 bg-background hover:border-border/60 hover:bg-accent/40"
                    }`}
                  >
                    <span className={`text-xs font-semibold ${isActive ? "text-primary" : "text-foreground"}`}>
                      {preset.label}
                    </span>
                    <span className={`rounded-full px-1.5 py-0.5 text-meta font-medium font-mono ${
                      isActive ? "bg-primary/20 text-primary" : "bg-muted/50 text-muted-foreground"
                    }`}>
                      {preset.ms}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-meta text-muted-foreground/70 leading-relaxed">
              Latency = query embedding + chunk search. Fastest uses keyword-only (no embedding).
              Accurate presets produce smaller chunks and retrieve more — requires index rebuild.
            </p>
          </div>

          {/* ── Connection ── */}
          <div className="rounded-xl border border-border/30 bg-card/50 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-primary/80">Connection</h3>
            </div>
            <div className="space-y-4">
              {/* Ollama status */}
              <div className="flex items-center gap-3">
                {ollamaStatus?.connected ? (
                  <>
                    <div className="h-2.5 w-2.5 rounded-full bg-success" />
                    <Wifi className="h-3.5 w-3.5 text-success" />
                    <span className="text-xs text-success">Ollama Connected</span>
                    <span className="text-meta text-muted-foreground">
                      ({ollamaStatus.models.length} model{ollamaStatus.models.length !== 1 ? "s" : ""})
                    </span>
                  </>
                ) : (
                  <>
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    <WifiOff className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-xs text-red-500">Ollama Disconnected</span>
                    <span className="text-meta text-muted-foreground/60">— start Ollama to use embedding</span>
                  </>
                )}
              </div>

              {ollamaStatus?.connected && (
                <div className="flex items-center gap-2 text-xs">
                  {selectedModelAvailable ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      <span className="text-success">{localConfig.embedding_model} available</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-amber-500">
                        {localConfig.embedding_model} not found — pull it below
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Embedding model */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    Embedding Model
                    <HelpButton id="embedding_model" activeId={openHelp} onToggle={toggleHelp} />
                  </label>
                  <RebuildBadge show={hasIndex && localConfig.embedding_model !== (ragConfig?.embedding_model ?? "nomic-embed-text")} />
                </div>
                {openHelp === "embedding_model" && <HelpPanel id="embedding_model" />}
                <select
                  value={localConfig.embedding_model}
                  onChange={(e) => handleSelectChange("embedding_model", e.target.value)}
                  className="w-full rounded-lg border border-border/50 bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 mt-1.5"
                >
                  {EMBEDDING_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={checkOllamaStatus}
                  disabled={isCheckingConnection}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCheckingConnection ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                  Test Connection
                </button>
                <button
                  onClick={() => pullModel(localConfig.embedding_model)}
                  disabled={isPullingModel}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPullingModel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {isPullingModel ? "Pulling..." : "Pull Model"}
                </button>
              </div>

              {isPullingModel && (
                <div className="space-y-1.5 rounded-lg border border-border/20 bg-background/50 p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      {pullProgress?.status || "Connecting..."}
                    </span>
                    {pullProgress && pullProgress.total > 0 && (
                      <span className="font-mono">
                        {Math.round((pullProgress.completed / pullProgress.total) * 100)}%
                        <span className="text-muted-foreground/70 ml-1">
                          ({formatBytes(pullProgress.completed)} / {formatBytes(pullProgress.total)})
                        </span>
                      </span>
                    )}
                  </div>
                  {pullProgress && pullProgress.total > 0 && (
                    <div className="h-1.5 rounded-full bg-muted/40">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.round((pullProgress.completed / pullProgress.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Search Settings ── */}
          <div className="rounded-xl border border-border/30 bg-card/50 p-5">
            <h3 className="mb-3 text-sm font-semibold text-primary/80">Search Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              {/* top-K */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Results to Retrieve (top-K)
                  </label>
                  <HelpButton id="top_k" activeId={openHelp} onToggle={toggleHelp} />
                </div>
                {openHelp === "top_k" && (
                  <div className="col-span-2 mb-2"><HelpPanel id="top_k" /></div>
                )}
                <select
                  value={localConfig.top_k}
                  onChange={(e) => handleSelectChange("top_k", Number(e.target.value))}
                  className="w-full rounded-lg border border-border/50 bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                >
                  {[3, 5, 7, 10, 15, 20].map((v) => (
                    <option key={v} value={v}>{v} chunks</option>
                  ))}
                </select>
              </div>

              {/* Search mode */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <label className="text-xs font-medium text-foreground">Search Mode</label>
                  <HelpButton id="search_mode" activeId={openHelp} onToggle={toggleHelp} />
                </div>
                <select
                  value={localConfig.search_mode}
                  onChange={(e) => handleSelectChange("search_mode", e.target.value)}
                  className="w-full rounded-lg border border-border/50 bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                >
                  <option value="hybrid">Hybrid (recommended)</option>
                  <option value="semantic">Semantic Only</option>
                  <option value="keyword">Keyword Only (fastest)</option>
                </select>
              </div>
            </div>
            {/* Help panels for search settings (full width) */}
            {openHelp === "search_mode" && <div className="mt-3"><HelpPanel id="search_mode" /></div>}
          </div>

          {/* ── Index Status ── */}
          <div className={`rounded-xl border bg-card/50 p-5 ${
            indexStale ? "border-amber-500/40 ring-1 ring-amber-500/10" : "border-border/30"
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-primary/80">Index Status</h3>
              {indexStale && (
                <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-meta font-medium text-amber-500">
                  <AlertTriangle className="h-3 w-3" />
                  Settings Changed — Rebuild Required
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-accent/20 px-3 py-2.5">
                <span className="text-muted-foreground">Files indexed</span>
                <p className="mt-0.5 text-sm font-medium text-foreground">
                  {indexStatus?.indexed_files ?? 0} / {indexStatus?.total_files ?? 0}
                </p>
              </div>
              <div className="rounded-lg bg-accent/20 px-3 py-2.5">
                <span className="text-muted-foreground">Total chunks</span>
                <p className="mt-0.5 text-sm font-medium text-foreground">
                  {indexStatus?.total_chunks ?? 0}
                </p>
              </div>
              <div className="rounded-lg bg-accent/20 px-3 py-2.5">
                <span className="text-muted-foreground">Total tokens</span>
                <p className="mt-0.5 text-sm font-medium text-foreground">
                  {indexStatus?.total_tokens ? `~${Math.round(indexStatus.total_tokens / 1000)}k` : "0"}
                </p>
              </div>
              <div className="rounded-lg bg-accent/20 px-3 py-2.5">
                <span className="text-muted-foreground">Last indexed</span>
                <p className="mt-0.5 text-sm font-medium text-foreground truncate">
                  {indexStatus?.last_indexed_at
                    ? new Date(indexStatus.last_indexed_at).toLocaleString()
                    : "Never"}
                </p>
              </div>
            </div>

            {isIndexing && indexProgress && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{indexProgress.status}</span>
                  <span>{indexProgress.filesDone}/{indexProgress.filesTotal} files</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: indexProgress.filesTotal > 0
                        ? `${Math.round((indexProgress.filesDone / indexProgress.filesTotal) * 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={handleRebuild}
                disabled={isIndexing}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  indexStale
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                    : "border-border/50 bg-background text-foreground hover:bg-accent"
                }`}
              >
                {isIndexing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {confirmRebuild ? "Confirm Rebuild" : indexStale ? "Rebuild Required" : hasIndex ? "Rebuild Index" : "Build Index"}
              </button>
              <button
                onClick={handleClearIndex}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  confirmClear
                    ? "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20"
                    : "border-border/50 bg-background text-foreground hover:bg-accent"
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirmClear ? "Confirm Clear" : "Clear Index"}
              </button>
            </div>
          </div>

          {/* ── Advanced Settings ── */}
          <div className="rounded-xl border border-border/30 bg-card/50">
            <button
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-semibold text-primary/80 transition-colors hover:bg-accent/20"
            >
              <span>Advanced Settings</span>
              {advancedOpen
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
              }
            </button>

            {advancedOpen && (
              <div className="border-t border-border/20 px-5 py-4 space-y-5">

                {/* Chunk Size */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      Chunk Size
                      <HelpButton id="chunk_size" activeId={openHelp} onToggle={toggleHelp} />
                      <RebuildBadge show={hasIndex && localConfig.chunk_size !== (ragConfig?.chunk_size ?? 512)} />
                    </label>
                    <span className="text-xs text-muted-foreground font-mono">{localConfig.chunk_size} tokens</span>
                  </div>
                  {openHelp === "chunk_size" && <HelpPanel id="chunk_size" />}
                  <input
                    type="range" min={128} max={2048} step={64}
                    value={localConfig.chunk_size}
                    onChange={(e) => updateField("chunk_size", Number(e.target.value))}
                    onMouseUp={handleFieldBlur} onTouchEnd={handleFieldBlur}
                    className="w-full accent-primary mt-1.5"
                  />
                  <div className="flex justify-between text-meta text-muted-foreground/60">
                    <span>128 — precise</span><span>2048 — broad</span>
                  </div>
                </div>

                {/* Chunk Overlap */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      Chunk Overlap
                      <HelpButton id="chunk_overlap" activeId={openHelp} onToggle={toggleHelp} />
                      <RebuildBadge show={hasIndex && localConfig.chunk_overlap !== (ragConfig?.chunk_overlap ?? 64)} />
                    </label>
                    <span className="text-xs text-muted-foreground font-mono">{localConfig.chunk_overlap} tokens</span>
                  </div>
                  {openHelp === "chunk_overlap" && <HelpPanel id="chunk_overlap" />}
                  <input
                    type="range" min={0} max={512} step={16}
                    value={localConfig.chunk_overlap}
                    onChange={(e) => updateField("chunk_overlap", Number(e.target.value))}
                    onMouseUp={handleFieldBlur} onTouchEnd={handleFieldBlur}
                    className="w-full accent-primary mt-1.5"
                  />
                  <div className="flex justify-between text-meta text-muted-foreground/60">
                    <span>0 — no overlap</span><span>512 — max continuity</span>
                  </div>
                </div>

                {/* Similarity Threshold */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      Similarity Threshold
                      <HelpButton id="similarity_threshold" activeId={openHelp} onToggle={toggleHelp} />
                      {localConfig.search_mode !== "semantic" && (
                        <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-meta text-muted-foreground/60">
                          semantic only
                        </span>
                      )}
                    </label>
                    <span className="text-xs text-muted-foreground font-mono">{localConfig.similarity_threshold.toFixed(2)}</span>
                  </div>
                  {openHelp === "similarity_threshold" && <HelpPanel id="similarity_threshold" />}
                  <input
                    type="range" min={0} max={0.9} step={0.05}
                    value={localConfig.similarity_threshold}
                    onChange={(e) => updateField("similarity_threshold", Number(e.target.value))}
                    onMouseUp={handleFieldBlur} onTouchEnd={handleFieldBlur}
                    className="w-full accent-primary mt-1.5"
                  />
                  <div className="flex justify-between text-meta text-muted-foreground/60">
                    <span>0.0 — include all</span><span>0.9 — strict</span>
                  </div>
                </div>

                {/* Semantic Weight */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      Semantic Weight
                      <HelpButton id="semantic_weight" activeId={openHelp} onToggle={toggleHelp} />
                      {localConfig.search_mode !== "hybrid" && (
                        <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-meta text-muted-foreground/60">
                          hybrid only
                        </span>
                      )}
                    </label>
                    <span className="text-xs text-muted-foreground font-mono">
                      {Math.round(localConfig.semantic_weight * 100)}% semantic / {Math.round((1 - localConfig.semantic_weight) * 100)}% keyword
                    </span>
                  </div>
                  {openHelp === "semantic_weight" && <HelpPanel id="semantic_weight" />}
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={localConfig.semantic_weight}
                    onChange={(e) => updateField("semantic_weight", Number(e.target.value))}
                    onMouseUp={handleFieldBlur} onTouchEnd={handleFieldBlur}
                    className="w-full accent-primary mt-1.5"
                  />
                  <div className="flex justify-between text-meta text-muted-foreground/60">
                    <span>0.0 — keyword</span><span>1.0 — semantic</span>
                  </div>
                </div>

                {/* Ollama URL */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">
                    Ollama URL
                  </label>
                  <input
                    type="text"
                    value={localConfig.ollama_url}
                    onChange={(e) => updateField("ollama_url", e.target.value)}
                    onBlur={handleFieldBlur}
                    placeholder="http://localhost:11434"
                    className="w-full rounded-lg border border-border/50 bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                  />
                </div>

                {/* Batch Size */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label className="text-xs font-medium text-foreground">Batch Size</label>
                    <HelpButton id="batch_size" activeId={openHelp} onToggle={toggleHelp} />
                  </div>
                  {openHelp === "batch_size" && <HelpPanel id="batch_size" />}
                  <select
                    value={localConfig.batch_size}
                    onChange={(e) => handleSelectChange("batch_size", Number(e.target.value))}
                    className="w-full rounded-lg border border-border/50 bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 mt-1"
                  >
                    {[8, 16, 32, 64].map((v) => (
                      <option key={v} value={v}>{v} chunks/request</option>
                    ))}
                  </select>
                </div>

                {/* Reset */}
                <button
                  onClick={handleResetDefaults}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset to Defaults
                </button>
              </div>
            )}
          </div>

          {/* ── How it works during meetings ── */}
          <div className="rounded-xl border border-border/20 bg-accent/10 px-4 py-3">
            <p className="text-xs text-muted-foreground/70 leading-relaxed">
              <span className="font-semibold text-foreground/70">During meetings: </span>
              The live transcript is sent as a rolling context window (configured in General settings),
              not stored in the RAG index. RAG retrieves the top-{localConfig.top_k} relevant chunks
              from your pre-indexed documents. Both are injected into the LLM prompt together.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
