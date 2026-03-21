import { useState, useEffect } from "react";
import { useRagStore } from "../stores/ragStore";
import { Loader2, Search, RefreshCw } from "lucide-react";
import { TestSearchDialog } from "./TestSearchDialog";

export function RagIndexBar() {
  const indexStatus = useRagStore((s) => s.indexStatus);
  const isIndexing = useRagStore((s) => s.isIndexing);
  const ragConfig = useRagStore((s) => s.ragConfig);
  const rebuildIndex = useRagStore((s) => s.rebuildIndex);
  const refreshIndexStatus = useRagStore((s) => s.refreshIndexStatus);
  const loadRagConfig = useRagStore((s) => s.loadRagConfig);

  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    refreshIndexStatus();
    loadRagConfig();
  }, [refreshIndexStatus, loadRagConfig]);

  const totalChunks = indexStatus?.total_chunks ?? 0;
  const topK = ragConfig?.top_k ?? 5;
  const avgChunkTokens = ragConfig?.chunk_size ?? 512;
  const estimatedTokens = topK * avgChunkTokens;

  return (
    <>
      <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2">
        <div className="flex-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary font-medium">
            {totalChunks} chunks
          </span>
          <span>~{Math.round(estimatedTokens / 1000)}k tokens/query</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => rebuildIndex()}
            disabled={isIndexing}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title="Rebuild All"
          >
            {isIndexing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Rebuild
          </button>
          <button
            onClick={() => setShowSearch(true)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Test Search"
          >
            <Search className="h-3 w-3" />
            Test
          </button>
        </div>
      </div>

      <TestSearchDialog isOpen={showSearch} onClose={() => setShowSearch(false)} />
    </>
  );
}
