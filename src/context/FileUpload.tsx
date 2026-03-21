import { useState, useCallback } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useContextStore } from "../stores/contextStore";
import { useConfigStore } from "../stores/configStore";
import { useRagStore } from "../stores/ragStore";

export function FileUpload() {
  const loadFile = useContextStore((s) => s.loadFile);
  const contextStrategy = useConfigStore((s) => s.contextStrategy);
  const autoIndexFile = useRagStore((s) => s.autoIndexFile);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const processFile = useCallback(
    async (filePath: string) => {
      setIsProcessing(true);
      setErrorMessage(null);
      try {
        const resource = await loadFile(filePath);
        // Auto-index if RAG is active — fire and forget, doesn't block UI
        if (contextStrategy === "local_rag") {
          autoIndexFile(resource.id);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMessage(msg);
        setTimeout(() => setErrorMessage(null), 5000);
      } finally {
        setIsProcessing(false);
      }
    },
    [loadFile, contextStrategy, autoIndexFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as File & { path?: string }).path;
        if (filePath) {
          await processFile(filePath);
        }
      }
    },
    [processFile]
  );

  const handleBrowse = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Context Files",
            extensions: ["pdf", "txt", "md", "docx"],
          },
        ],
      });

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        for (const filePath of paths) {
          if (filePath) {
            await processFile(filePath);
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  }, [processFile]);

  return (
    <div className="w-full">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBrowse}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleBrowse();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Drop files here or click to browse"
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200 ${
          isDragOver
            ? "border-primary/60 bg-primary/5 scale-[1.01]"
            : "border-muted-foreground/20 bg-secondary/20 hover:border-muted-foreground/30 hover:bg-secondary/30"
        } px-6 py-6`}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mb-2 h-8 w-8 animate-spin text-primary/60" />
            <p className="text-sm font-medium text-muted-foreground">
              Processing file...
            </p>
          </>
        ) : (
          <>
            <CloudUpload
              className={`mb-2 h-8 w-8 transition-colors duration-200 ${
                isDragOver ? "text-primary" : "text-primary/30"
              }`}
            />
            <p className="text-sm font-medium text-muted-foreground">
              {isDragOver ? "Drop to upload" : "Drag files here"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, TXT, Markdown, or DOCX
            </p>
            <button
              onClick={handleBrowse}
              className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 hover:text-primary"
            >
              Browse Files
            </button>
          </>
        )}
      </div>

      {/* Error toast */}
      {errorMessage && (
        <div className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
