import { useState, useCallback } from "react";
import type { Meeting, ActionItem } from "../../lib/types";
import { CheckSquare, Square, ListTodo } from "lucide-react";
import { formatTimestamp } from "../../lib/utils";

interface ActionItemsTabProps {
  meeting: Meeting;
}

function ActionItemRow({
  item,
  assigneeName,
  meetingStartMs,
  onToggle,
}: {
  item: ActionItem;
  assigneeName?: string;
  meetingStartMs: number;
  onToggle: (id: string) => void;
}) {
  const relativeMs = Math.max(0, item.timestamp_ms - meetingStartMs);

  return (
    <div
      className={`group flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/20 ${
        item.completed ? "opacity-60" : ""
      }`}
    >
      <button
        onClick={() => onToggle(item.id)}
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
          className={`text-xs leading-relaxed text-foreground/80 ${
            item.completed ? "line-through text-muted-foreground/50" : ""
          }`}
        >
          {item.text}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/40">
          <span className="tabular-nums">{formatTimestamp(relativeMs)}</span>
          {assigneeName && (
            <>
              <span>&middot;</span>
              <span className="font-medium text-muted-foreground/60">{assigneeName}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ActionItemsTab({ meeting }: ActionItemsTabProps) {
  const [items, setItems] = useState<ActionItem[]>(
    () => meeting.action_items ?? []
  );

  const handleToggle = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
    // Note: persisting to DB requires a future IPC command (Task 23+)
  }, []);

  const meetingStartMs = new Date(meeting.start_time).getTime();
  const completedCount = items.filter((i) => i.completed).length;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
        <ListTodo className="mb-3 h-6 w-6" />
        <p className="text-xs font-medium">No action items</p>
        <p className="mt-1 text-[11px] text-muted-foreground/40">
          Action items are extracted from meeting discussions
        </p>
      </div>
    );
  }

  return (
    <div className="p-3">
      {/* Progress header */}
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
          {items.length} item{items.length !== 1 ? "s" : ""}
        </span>
        <span className="text-[10px] text-muted-foreground/40">
          {completedCount}/{items.length} done
        </span>
      </div>

      {/* Progress bar */}
      {items.length > 0 && (
        <div className="mb-3 px-1">
          <div className="h-1 w-full overflow-hidden rounded-full bg-secondary/40">
            <div
              className="h-full rounded-full bg-success transition-all duration-300"
              style={{ width: `${Math.round((completedCount / items.length) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Items */}
      <div className="space-y-0.5">
        {items.map((item) => {
          const assignee = meeting.speakers?.find(
            (s) => s.id === item.assignee_speaker_id
          );
          return (
            <ActionItemRow
              key={item.id}
              item={item}
              assigneeName={assignee?.display_name}
              meetingStartMs={meetingStartMs}
              onToggle={handleToggle}
            />
          );
        })}
      </div>
    </div>
  );
}
