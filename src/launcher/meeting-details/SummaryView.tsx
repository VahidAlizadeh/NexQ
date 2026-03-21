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
        showToast("Summary copied to clipboard", "success");
      } catch {
        showToast("Failed to copy", "error");
      }
    }
  }, [meeting.summary, generation.streamedContent]);

  // Generating state — streaming content
  if (generation.isGenerating) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-primary/15 bg-card/30 p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="font-medium">Generating summary...</span>
            </div>
            <button
              onClick={generation.cancel}
              className="rounded-lg px-2 py-1 text-[10px] text-muted-foreground/60 hover:bg-secondary hover:text-foreground cursor-pointer"
            >
              <X className="inline h-3 w-3 mr-0.5" />
              Cancel
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/85">
            {generation.streamedContent}
            <span className="inline-block h-4 w-0.5 animate-pulse bg-primary/60 ml-0.5" />
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (generation.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-xs text-red-400">
          {generation.error}
        </div>
        <button
          onClick={generation.generate}
          className="rounded-xl bg-primary/10 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/20 cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Has summary — display with actions
  if (meeting.summary) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-border/15 bg-card/30 p-6">
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/85">
            {meeting.summary}
          </p>
        </div>
        {/* Action bar */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-muted-foreground/70 hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            <Copy className="h-3 w-3" />
            Copy
          </button>
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-muted-foreground/70 hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            <Download className="h-3 w-3" />
            Export
          </button>
          <div className="flex-1" />
          <button
            onClick={generation.generate}
            disabled={isOtherStreaming}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-muted-foreground/50 hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-40 cursor-pointer"
            title={isOtherStreaming ? "Wait for current AI generation to finish" : "Regenerate summary"}
          >
            <RefreshCw className="h-3 w-3" />
            Regenerate
          </button>
        </div>
      </div>
    );
  }

  // Empty state — no summary yet
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Sparkles className="mb-4 h-8 w-8 text-muted-foreground/40" />
      <p className="mb-1.5 text-sm font-medium text-muted-foreground/60">
        No summary yet
      </p>
      <p className="mb-6 text-xs text-muted-foreground/40">
        Generate an AI-powered summary of this meeting
      </p>
      <button
        onClick={generation.generate}
        disabled={isOtherStreaming || meeting.transcript.length === 0}
        className="group flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-600/35 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        title={
          meeting.transcript.length === 0
            ? "No transcript to summarize"
            : isOtherStreaming
              ? "Wait for current AI generation to finish"
              : undefined
        }
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-bold tracking-tight">Generate AI Summary</span>
      </button>
    </div>
  );
}
