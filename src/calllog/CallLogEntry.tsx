import { useCallback } from "react";
import { useCallLogStore } from "../stores/callLogStore";
import { getModeLabel } from "../lib/utils";
import type { LogEntry, IntelligenceMode } from "../lib/types";
import {
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
  Assist: { badge: "bg-info/20 text-info", dot: "bg-info" },
  WhatToSay: {
    badge: "bg-primary/20 text-primary",
    dot: "bg-primary",
  },
  Shorten: { badge: "bg-warning/20 text-warning", dot: "bg-warning" },
  FollowUp: { badge: "bg-info/20 text-info", dot: "bg-info" },
  Recap: {
    badge: "bg-success/20 text-success",
    dot: "bg-success",
  },
  AskQuestion: { badge: "bg-destructive/20 text-destructive", dot: "bg-destructive" },
  MeetingSummary: { badge: "bg-primary/20 text-primary", dot: "bg-primary" },
  ActionItemsExtraction: { badge: "bg-warning/20 text-warning", dot: "bg-warning" },
  BookmarkSuggestions: { badge: "bg-info/20 text-info", dot: "bg-info" },
};

// -- Context source badges ---------------------------------------------------

const SOURCE_BADGES = [
  { key: "includeTranscript" as const, label: "T", color: "text-success/70 bg-success/10", title: "Transcript" },
  { key: "includeRag" as const, label: "R", color: "text-info/70 bg-info/10", title: "Document Excerpts" },
  { key: "includeInstructions" as const, label: "I", color: "text-warning/70 bg-warning/10", title: "Instructions" },
  { key: "includeQuestion" as const, label: "Q", color: "text-destructive/70 bg-destructive/10", title: "Question" },
];

// -- Compact entry row -------------------------------------------------------

interface Props {
  entry: LogEntry;
  isSelected: boolean;
}

export function CallLogEntry({ entry, isSelected }: Props) {
  const setExpanded = useCallLogStore((s) => s.setExpandedEntry);
  const colors = MODE_COLORS[entry.mode] ?? MODE_COLORS.Assist;

  const handleClick = useCallback(() => {
    setExpanded(entry.id);
  }, [entry.id, setExpanded]);

  const timeStr = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <button
      onClick={handleClick}
      className={`flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100 ${
        isSelected
          ? "bg-primary/10 ring-1 ring-primary/20"
          : "hover:bg-accent/30"
      }`}
    >
      {/* Status indicator */}
      <StatusDot status={entry.status} dotColor={colors.dot} />

      {/* Mode badge */}
      <span
        className={`shrink-0 max-w-[100px] truncate rounded px-1.5 py-0.5 text-xs font-semibold ${colors.badge}`}
        title={getModeLabel(entry.mode)}
      >
        {getModeLabel(entry.mode)}
      </span>

      {/* Context source badges */}
      <div className="flex items-center gap-px shrink-0">
        {SOURCE_BADGES.map(({ key, label, color, title }) =>
          entry[key] ? (
            <span
              key={key}
              className={`rounded px-1 py-px text-meta font-bold ${color}`}
              title={title}
            >
              {label}
            </span>
          ) : null
        )}
      </div>

      {/* Provider/Model */}
      <span
        className="min-w-0 flex-1 max-w-[80px] truncate text-xs text-muted-foreground"
        title={`${entry.provider}/${entry.model.split(":")[0].split("/").pop()}`}
      >
        {entry.provider}/{entry.model.split(":")[0].split("/").pop()}
      </span>

      {/* Latency */}
      {entry.latencyMs != null && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
          {entry.latencyMs}ms
        </span>
      )}

      {/* Timestamp */}
      <span className="shrink-0 text-meta text-muted-foreground/60">
        {timeStr}
      </span>
    </button>
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
    return (
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/50" />
    );
  }
  if (status === "streaming") {
    return (
      <span className="relative flex h-3 w-3 shrink-0">
        <span
          className={`absolute inline-flex h-full w-full animate-pulse rounded-full ${dotColor} opacity-40`}
        />
        <span
          className={`relative inline-flex h-3 w-3 rounded-full ${dotColor}`}
        />
      </span>
    );
  }
  if (status === "complete") {
    return (
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success/70" />
    );
  }
  if (status === "error") {
    return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive/70" />;
  }
  // cancelled
  return <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />;
}
