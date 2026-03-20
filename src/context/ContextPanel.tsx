import { useEffect, useCallback } from "react";
import { useContextStore } from "../stores/contextStore";
import { useConfigStore } from "../stores/configStore";
import { useRagStore } from "../stores/ragStore";
import { FileUpload } from "./FileUpload";
import { ResourceCard } from "./ResourceCard";
import { TokenBudget } from "./TokenBudget";
import { RagIndexBar } from "./RagIndexBar";
import { FileText } from "lucide-react";

export function ContextPanel() {
  const resources = useContextStore((s) => s.resources);
  const removeFile = useContextStore((s) => s.removeFile);
  const loadResources = useContextStore((s) => s.loadResources);
  const refreshTokenBudget = useContextStore((s) => s.refreshTokenBudget);
  const contextStrategy = useConfigStore((s) => s.contextStrategy);
  const autoRemoveFileIndex = useRagStore((s) => s.autoRemoveFileIndex);

  const handleRemoveFile = useCallback((id: string) => {
    removeFile(id);
    if (contextStrategy === "local_rag") {
      autoRemoveFileIndex(id);
    }
  }, [removeFile, contextStrategy, autoRemoveFileIndex]);

  // Load resources and token budget on mount
  useEffect(() => {
    loadResources();
    refreshTokenBudget();
  }, [loadResources, refreshTokenBudget]);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      {/* Panel header */}
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Meeting Context</h2>
        {contextStrategy === "local_rag" && (
          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
            <span>RAG Active</span>
          </div>
        )}
      </div>

      {/* Token budget visualization */}
      <TokenBudget />

      {/* RAG index bar (when RAG is active) */}
      {contextStrategy === "local_rag" && <RagIndexBar />}

      {/* File upload area */}
      <FileUpload />

      {/* Loaded resources list */}
      {resources.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Loaded Context ({resources.length} file
              {resources.length !== 1 ? "s" : ""})
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {resources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                onRemove={handleRemoveFile}
              />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
