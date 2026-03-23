import { useCallback } from "react";
import type { Meeting } from "../../lib/types";
import type { SummaryGenerationState } from "../../hooks/useSummaryGeneration";
import { useStreamStore } from "../../stores/streamStore";
import { showToast } from "../../stores/toastStore";
import { Sparkles, RefreshCw, Copy, Download, Loader2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*/gi, "")
    .trim();
}

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
        await navigator.clipboard.writeText(stripThinkTags(text));
        showToast("Copied to clipboard", "success");
      } catch { showToast("Couldn't copy to clipboard", "error"); }
    }
  }, [meeting.summary, generation.streamedContent]);

  // Streaming
  if (generation.isGenerating) {
    const cleanedStreaming = stripThinkTags(generation.streamedContent);
    return (
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-medium">Generating summary...</span>
          </div>
          <button
            onClick={generation.cancel}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-muted-foreground/50 hover:bg-secondary hover:text-foreground cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
        <div className="prose prose-sm prose-invert max-w-none
          prose-headings:text-foreground prose-headings:font-semibold
          prose-h2:text-base prose-h2:mt-6 prose-h2:mb-2 prose-h2:border-b prose-h2:border-border/20 prose-h2:pb-1.5
          prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-1.5
          prose-p:text-sm prose-p:leading-relaxed prose-p:text-foreground/80
          prose-li:text-sm prose-li:text-foreground/80 prose-li:leading-relaxed
          prose-strong:text-foreground prose-strong:font-semibold
          prose-ul:my-1.5 prose-ol:my-1.5
        ">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanedStreaming}</ReactMarkdown>
          <span className="inline-block h-4 w-0.5 animate-pulse bg-primary/60 ml-0.5" />
        </div>
      </div>
    );
  }

  // Error
  if (generation.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
          {generation.error}
        </div>
        <button
          onClick={generation.generate}
          className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 cursor-pointer"
        >
          Regenerate Summary
        </button>
      </div>
    );
  }

  // Has summary
  if (meeting.summary) {
    const cleanedSummary = stripThinkTags(meeting.summary);
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border/20">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
            <Sparkles className="h-3 w-3" />
            <span>AI Generated</span>
          </div>
          <div className="flex-1" />
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="prose prose-sm prose-invert max-w-none
            prose-headings:text-foreground prose-headings:font-semibold
            prose-h2:text-base prose-h2:mt-6 prose-h2:mb-2 prose-h2:border-b prose-h2:border-border/20 prose-h2:pb-1.5
            prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-1.5
            prose-p:text-sm prose-p:leading-relaxed prose-p:text-foreground/80
            prose-li:text-sm prose-li:text-foreground/80 prose-li:leading-relaxed
            prose-strong:text-foreground prose-strong:font-semibold
            prose-ul:my-1.5 prose-ol:my-1.5
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanedSummary}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Sparkles className="mb-4 h-8 w-8 text-primary/20" />
      <p className="mb-1 text-sm font-semibold text-muted-foreground/50">No summary yet</p>
      <p className="mb-5 text-xs text-muted-foreground/40">Generate an AI summary from the transcript</p>
      <button
        onClick={generation.generate}
        disabled={isOtherStreaming || meeting.transcript.length === 0}
        className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/10 transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        <Sparkles className="h-4 w-4" />
        Generate Summary
      </button>
    </div>
  );
}
