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

// -- Context source badges ---------------------------------------------------

const SOURCE_BADGES = [
  { key: "includeTranscript" as const, label: "T", color: "text-emerald-500/70 bg-emerald-500/10", title: "Transcript" },
  { key: "includeRag" as const, label: "R", color: "text-blue-500/70 bg-blue-500/10", title: "RAG Chunks" },
  { key: "includeInstructions" as const, label: "I", color: "text-amber-500/70 bg-amber-500/10", title: "Instructions" },
  { key: "includeQuestion" as const, label: "Q", color: "text-rose-500/70 bg-rose-500/10", title: "Question" },
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
          ? "bg-primary/8 ring-1 ring-primary/20"
          : "hover:bg-accent/30"
      }`}
    >
      {/* Status indicator */}
      <StatusDot status={entry.status} dotColor={colors.dot} />

      {/* Mode badge */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${colors.badge}`}
      >
        {getModeLabel(entry.mode)}
      </span>

      {/* Context source badges */}
      <div className="flex items-center gap-px shrink-0">
        {SOURCE_BADGES.map(({ key, label, color, title }) =>
          entry[key] ? (
            <span
              key={key}
              className={`rounded px-1 py-px text-[9px] font-bold ${color}`}
              title={title}
            >
              {label}
            </span>
          ) : null
        )}
      </div>

      {/* Provider/Model */}
      <span className="flex-1 truncate text-[11px] text-muted-foreground">
        {entry.provider}/{entry.model.split(":")[0].split("/").pop()}
      </span>

      {/* Latency */}
      {entry.latencyMs != null && (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
          {entry.latencyMs}ms
        </span>
      )}

      {/* Timestamp */}
      <span className="shrink-0 text-[10px] text-muted-foreground/60">
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
          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dotColor} opacity-75`}
        />
        <span
          className={`relative inline-flex h-3 w-3 rounded-full ${dotColor}`}
        />
      </span>
    );
  }
  if (status === "complete") {
    return (
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
    );
  }
  if (status === "error") {
    return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500/70" />;
  }
  // cancelled
  return <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />;
}
