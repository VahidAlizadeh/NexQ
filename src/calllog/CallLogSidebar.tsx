import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useCallLogStore } from "../stores/callLogStore";
import { useMeetingStore } from "../stores/meetingStore";
import { CallLogEntry } from "./CallLogEntry";
import type { LogFilterKind } from "../lib/types";
import {
  X,
  Trash2,
  Activity,
  FileSearch,
} from "lucide-react";

// -- Filter options ----------------------------------------------------------

const FILTER_OPTIONS: Array<{ label: string; value: LogFilterKind }> = [
  { label: "All", value: "all" },
  { label: "Assist", value: "Assist" },
  { label: "Say", value: "WhatToSay" },
  { label: "Short", value: "Shorten" },
  { label: "F/U", value: "FollowUp" },
  { label: "Recap", value: "Recap" },
  { label: "Ask", value: "AskQuestion" },
  { label: "Errors", value: "errors" },
];

// -- Main sidebar component --------------------------------------------------

export function CallLogSidebar() {
  const isOpen = useCallLogStore((s) => s.isOpen);
  const setOpen = useCallLogStore((s) => s.setOpen);
  const entries = useCallLogStore((s) => s.entries);
  const activeFilter = useCallLogStore((s) => s.activeFilter);
  const setFilter = useCallLogStore((s) => s.setFilter);
  const clearAll = useCallLogStore((s) => s.clearAll);
  const [isVisible, setIsVisible] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Animate in/out driven by isOpen state
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // Focus close button when sidebar opens
  useEffect(() => {
    if (isVisible) {
      closeButtonRef.current?.focus();
    }
  }, [isVisible]);

  // Close with animation
  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => setOpen(false), 200);
  }, [setOpen]);

  // Close on Escape (skip if settings overlay is open — it handles Escape first)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (useMeetingStore.getState().settingsOpen) return;
        handleClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    if (activeFilter === "all") return entries;
    if (activeFilter === "errors")
      return entries.filter((e) => e.status === "error");
    return entries.filter((e) => e.mode === activeFilter);
  }, [entries, activeFilter]);

  // Filter counts
  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = { all: entries.length, errors: 0 };
    for (const e of entries) {
      counts[e.mode] = (counts[e.mode] ?? 0) + 1;
      if (e.status === "error") counts.errors++;
    }
    return counts;
  }, [entries]);

  // Performance stats
  const stats = useMemo(() => {
    const completed = entries.filter((e) => e.status === "complete");
    const totalTokens = completed.reduce(
      (s, e) => s + (e.totalTokens ?? 0),
      0
    );
    const avgLatency =
      completed.length > 0
        ? Math.round(
            completed.reduce((s, e) => s + (e.latencyMs ?? 0), 0) /
              completed.length
          )
        : 0;
    const errorCount = entries.filter((e) => e.status === "error").length;
    return { total: entries.length, avgLatency, totalTokens, errorCount };
  }, [entries]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[80] transition-colors duration-200 ${
          isVisible ? "bg-black/20" : "bg-black/0"
        }`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 z-[90] flex h-full w-80 flex-col border-l border-border/40 bg-card shadow-xl transition-transform duration-200 ease-out ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="border-b border-border/30 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">
                AI Call Log
              </span>
              {entries.length > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-meta font-medium text-primary">
                  {entries.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {entries.length > 0 && (
                <button
                  onClick={clearAll}
                  className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-destructive"
                  title="Clear all"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
              <button
                ref={closeButtonRef}
                onClick={handleClose}
                className="rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                title="Close (Esc)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Filter chips */}
          <div className="mt-2 flex flex-wrap gap-1">
            {FILTER_OPTIONS.map(({ label, value }) => {
              const count = filterCounts[value] ?? 0;
              const isActive = activeFilter === value;
              return (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-meta font-medium transition-colors duration-100 ${
                    isActive
                      ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                      : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span
                      className={
                        isActive
                          ? "text-primary/70"
                          : "text-muted-foreground/70"
                      }
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Performance mini-dashboard */}
        {stats.total > 0 && (
          <div className="flex items-center justify-between border-b border-border/20 bg-secondary/20 px-3 py-1.5">
            <StatTile label="Calls" value={`${stats.total}`} />
            <StatTile label="Avg" value={`${stats.avgLatency}ms`} />
            <StatTile
              label="Tokens"
              value={
                stats.totalTokens > 999
                  ? `${(stats.totalTokens / 1000).toFixed(1)}k`
                  : `${stats.totalTokens}`
              }
            />
            {stats.errorCount > 0 && (
              <StatTile
                label="Errors"
                value={`${stats.errorCount}`}
                valueClass="text-destructive"
              />
            )}
          </div>
        )}

        {/* Entry list */}
        <div className="flex-1 overflow-y-auto">
          {filteredEntries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/60">
              <FileSearch className="h-6 w-6" />
              <span className="text-xs">
                {entries.length === 0
                  ? "No AI calls yet"
                  : "No calls match filter"}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 p-2">
              {filteredEntries.map((entry) => (
                <CallLogEntry key={entry.id} entry={entry} isSelected={false} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// -- Internal stat tile component --------------------------------------------

function StatTile({
  label,
  value,
  valueClass = "text-foreground",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-xs font-medium tabular-nums ${valueClass}`}>
        {value}
      </span>
      <span className="text-meta text-muted-foreground/70">{label}</span>
    </div>
  );
}
