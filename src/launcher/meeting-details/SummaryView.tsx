import { useCallback } from "react";
import type { Meeting } from "../../lib/types";
import type { SummaryGenerationState } from "../../hooks/useSummaryGeneration";
import { useStreamStore } from "../../stores/streamStore";
import { showToast } from "../../stores/toastStore";
import {
  Sparkles,
  RefreshCw,
  Copy,
  Download,
  Loader2,
  X,
} from "lucide-react";

interface SummaryViewProps {
  meeting: Meeting;
  generation: SummaryGenerationState;
  onExport: () => void;
}

export function SummaryView({ meeting, generation, onExport }: SummaryViewProps) {
  const isOtherStreaming = useStreamStore((s) => s.isStreaming);

  const handleCopy = useCallback(async () => {
    const text = meeting.summary || generation.streamedContent;
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        showToast("Copied", "success");
      } catch {
        showToast("Failed to copy", "error");
      }
    }
  }, [meeting.summary, generation.streamedContent]);

  // Generating — streaming
  if (generation.isGenerating) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-primary/15 bg-card/20 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="font-medium">Generating...</span>
            </div>
            <button
              onClick={generation.cancel}
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] text-muted-foreground/50 hover:bg-secondary hover:text-foreground cursor-pointer"
            >
              <X className="h-2.5 w-2.5" />
              Cancel
            </button>
          </div>
          <p className="whitespace-pre-wrap text-[11px] leading-6 text-foreground/80">
            {generation.streamedContent}
            <span className="inline-block h-3.5 w-0.5 animate-pulse bg-primary/60 ml-0.5" />
          </p>
        </div>
      </div>
    );
  }

  // Error
  if (generation.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[11px] text-red-400">
          {generation.error}
        </div>
        <button
          onClick={generation.generate}
          className="rounded-md bg-primary/10 px-3 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/20 cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Has summary
  if (meeting.summary) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-lg border border-border/12 bg-card/20 p-4">
            <p className="whitespace-pre-wrap text-[11px] leading-6 text-foreground/80">
              {meeting.summary}
            </p>
          </div>
        </div>
        {/* Compact action bar */}
        <div className="flex items-center gap-1 border-t border-border/10 px-3 py-1.5">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            <Copy className="h-3 w-3" />
            Copy
          </button>
          <button
            onClick={onExport}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            <Download className="h-3 w-3" />
            Export
          </button>
          <div className="flex-1" />
          <button
            onClick={generation.generate}
            disabled={isOtherStreaming}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground/40 hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-30 cursor-pointer"
            title={isOtherStreaming ? "Wait for current AI generation" : "Regenerate"}
          >
            <RefreshCw className="h-3 w-3" />
            Regen
          </button>
        </div>
      </div>
    );
  }

  // Empty state — compact
  return (
    <div className="flex flex-col items-center justify-center py-14">
      <Sparkles className="mb-3 h-6 w-6 text-muted-foreground/30" />
      <p className="mb-1 text-xs font-medium text-muted-foreground/50">No summary yet</p>
      <p className="mb-4 text-[10px] text-muted-foreground/30">Generate an AI summary of this meeting</p>
      <button
        onClick={generation.generate}
        disabled={isOtherStreaming || meeting.transcript.length === 0}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        title={meeting.transcript.length === 0 ? "No transcript" : isOtherStreaming ? "AI busy" : undefined}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Generate Summary
      </button>
    </div>
  );
}
