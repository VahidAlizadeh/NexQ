import { useCallback, useState } from "react";
import { useCallLogStore } from "../stores/callLogStore";
import { getModeLabel } from "../lib/utils";
import type { LogEntry, IntelligenceMode } from "../lib/types";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
} from "lucide-react";

// -- Mode color coding -------------------------------------------------------

const MODE_COLORS: Record<
  IntelligenceMode,
  { badge: string; dot: string }
> = {
  Assist: { badge: "bg-blue-500/15 text-blue-400", dot: "bg-blue-500" },
  WhatToSay: {
    badge: "bg-violet-500/15 text-violet-400",
    dot: "bg-violet-500",
  },
  Shorten: { badge: "bg-amber-500/15 text-amber-400", dot: "bg-amber-500" },
  FollowUp: { badge: "bg-teal-500/15 text-teal-400", dot: "bg-teal-500" },
  Recap: {
    badge: "bg-emerald-500/15 text-emerald-400",
    dot: "bg-emerald-500",
  },
  AskQuestion: { badge: "bg-rose-500/15 text-rose-400", dot: "bg-rose-500" },
};

// -- Entry component ---------------------------------------------------------

interface Props {
  entry: LogEntry;
}

export function CallLogEntry({ entry }: Props) {
  const expandedId = useCallLogStore((s) => s.expandedEntryId);
  const setExpanded = useCallLogStore((s) => s.setExpandedEntry);
  const isExpanded = expandedId === entry.id;
  const colors = MODE_COLORS[entry.mode] ?? MODE_COLORS.Assist;

  const handleToggle = useCallback(() => {
    setExpanded(entry.id);
  }, [entry.id, setExpanded]);

  const timeStr = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const ttft =
    entry.firstTokenAt && entry.startedAt
      ? entry.firstTokenAt - entry.startedAt
      : null;

  return (
    <div className="rounded-md border border-border/30 bg-card/60 overflow-hidden">
      {/* Header row */}
      <button
        onClick={handleToggle}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-accent/30 transition-colors duration-100"
      >
        {/* Status indicator */}
        <StatusDot status={entry.status} dotColor={colors.dot} />

        {/* Mode badge */}
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${colors.badge}`}
        >
          {getModeLabel(entry.mode)}
        </span>

        {/* Provider/Model */}
        <span className="flex-1 truncate text-[10px] text-muted-foreground/70">
          {entry.provider}/{entry.model.split(":")[0].split("/").pop()}
        </span>

        {/* Latency */}
        {entry.latencyMs != null && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
            {entry.latencyMs}ms
          </span>
        )}

        {/* Timestamp */}
        <span className="shrink-0 text-[9px] text-muted-foreground/40">
          {timeStr}
        </span>

        {/* Expand chevron */}
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/40" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
        )}
      </button>

      {/* Live streaming preview (collapsed only) */}
      {entry.status === "streaming" &&
        !isExpanded &&
        entry.responseContentClean && (
          <div className="border-t border-border/20 px-2.5 py-1.5">
            <p className="line-clamp-2 text-[10px] italic text-foreground/60">
              {entry.responseContentClean}
            </p>
          </div>
        )}

      {/* Expanded body */}
      {isExpanded && <EntryBody entry={entry} ttft={ttft} />}
    </div>
  );
}

// -- Status dot --------------------------------------------------------------

function StatusDot({
  status,
  dotColor,
}: {
  status: LogEntry["status"];
  dotColor: string;
}) {
  if (status === "sending") {
    return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground/50" />;
  }
  if (status === "streaming") {
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dotColor} opacity-75`}
        />
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotColor}`}
        />
      </span>
    );
  }
  if (status === "complete") {
    return (
      <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500/70" />
    );
  }
  if (status === "error") {
    return <AlertCircle className="h-3 w-3 shrink-0 text-red-500/70" />;
  }
  // cancelled
  return <Clock className="h-3 w-3 shrink-0 text-muted-foreground/40" />;
}

// -- Expanded entry body -----------------------------------------------------

function EntryBody({
  entry,
  ttft,
}: {
  entry: LogEntry;
  ttft: number | null;
}) {
  return (
    <div className="border-t border-border/20">
      {/* Latency timeline */}
      {entry.latencyMs != null && (
        <div className="border-b border-border/10 px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between text-[9px] text-muted-foreground/50">
            <span>TTFT: {ttft != null ? `${ttft}ms` : "—"}</span>
            <span>Total: {entry.latencyMs}ms</span>
            {entry.totalTokens != null && (
              <span>{entry.totalTokens} tok</span>
            )}
          </div>
          {ttft != null && entry.latencyMs > 0 && (
            <div className="h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary/40"
                style={{
                  width: `${Math.min(100, (ttft / entry.latencyMs) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {entry.errorMessage && (
        <div className="mx-2.5 my-2 rounded border border-red-500/20 bg-red-500/5 px-2 py-1.5">
          <p className="text-[10px] text-red-400">{entry.errorMessage}</p>
        </div>
      )}

      {/* Prompt snapshot */}
      <div className="border-b border-border/10 px-2.5 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">
            Prompt Snapshot
          </span>
          <CopyButton
            text={[
              `[SYSTEM]\n${entry.reconstructedSystemPrompt}`,
              `[CONTEXT]\n${entry.snapshotContext}`,
              `[TRANSCRIPT]\n${entry.snapshotTranscript}`,
            ].join("\n\n---\n\n")}
          />
        </div>
        <div className="space-y-1.5">
          <PromptSection
            label="System"
            content={entry.reconstructedSystemPrompt}
            maxLines={3}
          />
          <PromptSection
            label="Context"
            content={entry.snapshotContext}
            maxLines={2}
          />
          <PromptSection
            label="Transcript"
            content={entry.snapshotTranscript}
            maxLines={4}
          />
        </div>
      </div>

      {/* Response */}
      {(entry.responseContentClean || entry.status === "streaming") && (
        <div className="px-2.5 py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">
              Response
              {entry.status === "streaming" && (
                <span className="ml-1.5 animate-pulse text-primary/60">
                  streaming...
                </span>
              )}
            </span>
            {entry.responseContentClean && (
              <CopyButton text={entry.responseContentClean} />
            )}
          </div>
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-foreground/70">
            {entry.responseContentClean}
          </p>
        </div>
      )}
    </div>
  );
}

// -- Prompt section ----------------------------------------------------------

function PromptSection({
  label,
  content,
  maxLines,
}: {
  label: string;
  content: string;
  maxLines: number;
}) {
  if (!content) return null;
  // Use inline style for line-clamp since dynamic Tailwind classes won't work
  return (
    <div>
      <span className="text-[9px] font-medium text-muted-foreground/40">
        {label}:{" "}
      </span>
      <p
        className="text-[10px] text-muted-foreground/60 overflow-hidden break-words"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: maxLines,
          WebkitBoxOrient: "vertical",
        }}
      >
        {content}
      </p>
    </div>
  );
}

// -- Copy button -------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="rounded p-0.5 text-muted-foreground/30 transition-colors hover:text-foreground"
      title="Copy"
    >
      {copied ? (
        <Check className="h-2.5 w-2.5 text-emerald-500" />
      ) : (
        <Copy className="h-2.5 w-2.5" />
      )}
    </button>
  );
}
