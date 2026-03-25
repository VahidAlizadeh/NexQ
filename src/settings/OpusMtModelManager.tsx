// OPUS-MT model download/management UI for the Translation settings panel.
// Shows available language pairs with download, activate, and delete controls.

import { useState, useEffect, useCallback } from "react";
import {
  Download,
  Trash2,
  CheckCircle,
  Loader2,
  X,
  Zap,
  HardDrive,
  Globe,
} from "lucide-react";
import { useModelDownload } from "../hooks/useModelDownload";
import {
  listOpusMtModels,
  downloadOpusMtModel,
  deleteOpusMtModel,
  activateOpusMtModel,
  cancelOpusMtDownload,
} from "../lib/ipc";
import { useTranslationStore } from "../stores/translationStore";
import type { OpusMtModelStatus } from "../lib/types";
import { showToast } from "../stores/toastStore";

export function OpusMtModelManager() {
  const [models, setModels] = useState<OpusMtModelStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLang, setFilterLang] = useState("all");
  const { downloads } = useModelDownload();
  const setStoreProvider = useTranslationStore((s) => s.setProvider);
  const setTargetLang = useTranslationStore((s) => s.setTargetLang);
  const setSourceLang = useTranslationStore((s) => s.setSourceLang);

  const loadModels = useCallback(async () => {
    try {
      const data = await listOpusMtModels();
      setModels(data);
      return data;
    } catch (err) {
      console.error("Failed to load OPUS-MT models:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Reload on download completion, show errors as toasts
  useEffect(() => {
    for (const [key, d] of Object.entries(downloads)) {
      if (!key.startsWith("opus_mt:")) continue;
      if (d.status === "complete") {
        loadModels();
      } else if (d.status === "error") {
        const modelId = key.replace("opus_mt:", "");
        showToast(`Download failed for ${modelId}`, "error");
      }
    }
  }, [downloads, loadModels]);

  const handleDownload = useCallback(
    async (modelId: string) => {
      try {
        await downloadOpusMtModel(modelId);
      } catch (err: any) {
        const msg = typeof err === "string" ? err : err?.message ?? "Unknown error";
        showToast(`Download failed: ${msg}`, "error");
      }
    },
    []
  );

  const handleCancel = useCallback(
    async (modelId: string) => {
      try {
        await cancelOpusMtDownload(modelId);
      } catch (err) {
        console.error("Failed to cancel download:", err);
      }
    },
    []
  );

  const handleDelete = useCallback(
    async (modelId: string) => {
      try {
        await deleteOpusMtModel(modelId);
        showToast("Model deleted", "success");
        loadModels();
      } catch (err: any) {
        showToast(`Delete failed: ${err}`, "error");
      }
    },
    [loadModels]
  );

  const handleActivate = useCallback(
    async (modelId: string) => {
      try {
        // Activate the model and set OPUS-MT as the active provider (backend handles both)
        await activateOpusMtModel(modelId);
        setStoreProvider("opus-mt");

        // Update source/target language to match the activated model
        const model = models.find((m) => m.definition.model_id === modelId);
        if (model) {
          setSourceLang(model.definition.source_lang);
          setTargetLang(model.definition.target_lang);
        }

        showToast("Model activated — translation will load on first use", "success");
        loadModels();
      } catch (err: any) {
        showToast(`Activation failed: ${err}`, "error");
      }
    },
    [loadModels, setStoreProvider]
  );

  // Get unique source languages for filter
  const sourceLanguages = (() => {
    const langs = new Map<string, string>();
    for (const m of models) {
      langs.set(m.definition.source_lang, m.definition.source_name);
    }
    return Array.from(langs.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  })();

  const filteredModels =
    filterLang === "all"
      ? models
      : models.filter((m) => m.definition.source_lang === filterLang);

  const activeModel = models.find((m) => m.is_active);
  const downloadedCount = models.filter((m) => m.is_downloaded).length;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading models...
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-primary/80">OPUS-MT Models</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {downloadedCount} downloaded · {models.length} available
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterLang}
            onChange={(e) => setFilterLang(e.target.value)}
            className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer"
          >
            <option value="all">All Languages</option>
            {sourceLanguages.map(([code, name]) => (
              <option key={code} value={code}>
                {name} →
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active model banner */}
      {activeModel && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2">
          <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />
          <span className="text-xs font-medium text-success">
            Active: {activeModel.definition.display_name}
          </span>
        </div>
      )}

      {/* Model list */}
      <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
        {filteredModels.map((model) => {
          const downloadKey = `opus_mt:${model.definition.model_id}`;
          const downloadProgress = downloads[downloadKey];
          const isDownloading =
            downloadProgress &&
            (downloadProgress.status === "downloading" ||
              downloadProgress.status === "extracting" ||
              downloadProgress.status === "verifying");

          return (
            <ModelRow
              key={model.definition.model_id}
              model={model}
              isDownloading={!!isDownloading}
              progress={downloadProgress}
              onDownload={() => handleDownload(model.definition.model_id)}
              onCancel={() => handleCancel(model.definition.model_id)}
              onDelete={() => handleDelete(model.definition.model_id)}
              onActivate={() => handleActivate(model.definition.model_id)}
            />
          );
        })}
      </div>

      {filteredModels.length === 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No models found for this filter.
        </p>
      )}
    </div>
  );
}

function ModelRow({
  model,
  isDownloading,
  progress,
  onDownload,
  onCancel,
  onDelete,
  onActivate,
}: {
  model: OpusMtModelStatus;
  isDownloading: boolean;
  progress?: { percent: number; status: string };
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onActivate: () => void;
}) {
  const def = model.definition;
  const sizeMB = Math.round(def.size_bytes / 1_000_000);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        model.is_active
          ? "border-success/30 bg-success/5"
          : model.is_downloaded
          ? "border-border/40 bg-card/30"
          : "border-border/20 bg-transparent"
      }`}
    >
      {/* Language pair */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {def.display_name}
          </p>
          <p className="text-meta text-muted-foreground/60">
            ~{sizeMB} MB
          </p>
        </div>
      </div>

      {/* Progress bar during download */}
      {isDownloading && progress && (
        <div className="flex items-center gap-2 min-w-[120px]">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(progress.percent, 100)}%` }}
            />
          </div>
          <span className="text-meta text-muted-foreground tabular-nums w-8 text-right">
            {Math.round(progress.percent)}%
          </span>
          <button
            onClick={onCancel}
            className="p-0.5 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            title="Cancel download"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Status badge + actions */}
      {!isDownloading && (
        <div className="flex items-center gap-1.5 shrink-0">
          {model.is_active && (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
              <CheckCircle className="h-2.5 w-2.5" />
              Active
            </span>
          )}

          {model.is_downloaded && !model.is_active && (
            <button
              onClick={onActivate}
              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors cursor-pointer"
              title="Set as active model"
            >
              <Zap className="h-2.5 w-2.5" />
              Activate
            </button>
          )}

          {!model.is_downloaded && (
            <button
              onClick={onDownload}
              className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
              title="Download model"
            >
              <Download className="h-2.5 w-2.5" />
              Download
            </button>
          )}

          {model.is_downloaded && (
            <button
              onClick={onDelete}
              className="p-1 text-muted-foreground/50 hover:text-destructive transition-colors cursor-pointer"
              title="Delete model"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
