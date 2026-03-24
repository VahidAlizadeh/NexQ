import { useCallback } from "react";
import type { Meeting, ActionItem } from "../../lib/types";
import type { ActionItemsExtractionState } from "../../hooks/useActionItemsExtraction";
import { updateActionItem } from "../../lib/ipc";
import { useStreamStore } from "../../stores/streamStore";
import { useConfigStore } from "../../stores/configStore";
import { formatTimestamp } from "../../lib/utils";
import {
  CheckSquare,
  Square,
  Sparkles,
  Loader2,
  X,
  RefreshCw,
  User,
} from "lucide-react";

interface ActionItemsTabProps {
  meeting: Meeting;
  extraction: ActionItemsExtractionState;
  onItemsUpdated: (items: ActionItem[]) => void;
}

// ---------------------------------------------------------------------------
// Individual action item row
// ---------------------------------------------------------------------------
function ActionItemRow({
  item,
  assignee,
  meetingStartMs,
  onToggle,
}: {
  item: ActionItem;
  assignee?: { display_name: string; color?: string };
  meetingStartMs: number;
  onToggle: (id: string, completed: boolean) => void;
}) {
  // Only show timestamp if it's a real value (not 0 or nonsensical)
  const relativeMs = item.timestamp_ms > meetingStartMs
    ? item.timestamp_ms - meetingStartMs
    : 0;
  const hasTimestamp = relativeMs > 0;
  const hasAssignee = !!assignee;
  const showMeta = hasTimestamp || hasAssignee;

  return (
    <div
      className={`group flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/20 ${
        item.completed ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={() => onToggle(item.id, !item.completed)}
        className="mt-0.5 shrink-0 text-muted-foreground/50 hover:text-primary transition-colors cursor-pointer"
        aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
        aria-pressed={item.completed}
      >
        {item.completed ? (
          <CheckSquare className="h-4 w-4 text-success" />
        ) : (
          <Square className="h-4 w-4" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm leading-relaxed text-foreground/80 ${
            item.completed ? "line-through text-muted-foreground/50" : ""
          }`}
        >
          {item.text}
        </p>
        {showMeta && (
          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/40">
            {hasTimestamp && (
              <span className="tabular-nums">{formatTimestamp(relativeMs)}</span>
            )}
            {hasTimestamp && hasAssignee && <span>&middot;</span>}
            {hasAssignee && (
              <span className="flex items-center gap-1 font-medium text-muted-foreground/60">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: assignee.color ?? "#6b7280" }}
                />
                {assignee.display_name}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main tab component with 3 states
// ---------------------------------------------------------------------------
export function ActionItemsTab({
  meeting,
  extraction,
  onItemsUpdated,
}: ActionItemsTabProps) {
  const items = meeting.action_items ?? [];
  const meetingStartMs = new Date(meeting.start_time).getTime();
  const isOtherStreaming = useStreamStore((s) => s.isStreaming);
  const llmModel = useConfigStore((s) => s.llmModel);

  const hasTranscript = meeting.transcript.length > 0;
  const hasLlm = !!llmModel;
  const completedCount = items.filter((i) => i.completed).length;

  // Toggle completion with optimistic update + rollback
  const handleToggle = useCallback(
    async (itemId: string, completed: boolean) => {
      const prev = items;
      const updated = items.map((a) =>
        a.id === itemId ? { ...a, completed } : a
      );
      onItemsUpdated(updated);
      try {
        await updateActionItem(itemId, completed);
      } catch {
        // Rollback on failure
        onItemsUpdated(prev);
      }
    },
    [items, onItemsUpdated]
  );

  // Re-extract with confirmation
  const handleReextract = useCallback(() => {
    if (items.length > 0) {
      const confirmed = window.confirm(
        `This will replace ${items.length} existing action items. Continue?`
      );
      if (!confirmed) return;
    }
    extraction.extract();
  }, [items.length, extraction]);

  // ---- State 2: Extracting ---- //
  if (extraction.isExtracting) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="rounded-xl border border-primary/20 bg-card/30 px-8 py-6 text-center">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
          <p className="mb-1 text-sm font-medium text-foreground/70">
            Analyzing transcript...
          </p>
          <p className="mb-4 text-[11px] text-muted-foreground/40">
            Extracting action items, assignments, and follow-ups
          </p>
          <button
            onClick={extraction.cancel}
            className="flex items-center gap-1.5 mx-auto rounded-lg px-3 py-1.5 text-xs text-muted-foreground/50 hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ---- Error state ---- //
  if (extraction.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
          {extraction.error}
        </div>
        <button
          onClick={() => extraction.extract()}
          className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  // ---- State 3: Has items ---- //
  if (items.length > 0) {
    return (
      <div className="p-3">
        {/* Progress header */}
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
            {completedCount} of {items.length} completed
          </span>
          <button
            onClick={handleReextract}
            disabled={isOtherStreaming || extraction.isExtracting}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground/40 hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-30 cursor-pointer"
            title={
              isOtherStreaming
                ? "Wait for current AI generation"
                : "Re-extract action items"
            }
          >
            <RefreshCw className="h-3 w-3" />
            Re-extract
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-3 px-1">
          <div className="h-1 w-full overflow-hidden rounded-full bg-secondary/40">
            <div
              className="h-full rounded-full bg-success transition-all duration-300"
              style={{
                width: `${Math.round((completedCount / items.length) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-0.5">
          {items.map((item) => {
            const speaker = meeting.speakers?.find(
              (s) => s.id === item.assignee_speaker_id
            );
            return (
              <ActionItemRow
                key={item.id}
                item={item}
                assignee={
                  speaker
                    ? {
                        display_name: speaker.display_name,
                        color: speaker.color,
                      }
                    : undefined
                }
                meetingStartMs={meetingStartMs}
                onToggle={handleToggle}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // ---- State 1: No items, no extraction ---- //
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Sparkles className="mb-4 h-8 w-8 text-primary/20" />
      <p className="mb-1 text-sm font-semibold text-muted-foreground/50">
        Extract Action Items
      </p>
      <p className="mb-5 max-w-xs text-center text-xs text-muted-foreground/40">
        AI will analyze the full transcript to find action items, assignments,
        and follow-ups
      </p>
      <button
        onClick={() => extraction.extract()}
        disabled={!hasTranscript || !hasLlm || isOtherStreaming}
        className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/10 transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        title={
          !hasTranscript
            ? "No transcript to analyze"
            : !hasLlm
              ? "Configure an LLM provider first"
              : isOtherStreaming
                ? "Wait for current AI generation"
                : "Extract action items from transcript"
        }
      >
        <Sparkles className="h-4 w-4" />
        Extract Action Items
      </button>
    </div>
  );
}
