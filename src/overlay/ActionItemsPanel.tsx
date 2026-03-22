// Action Items Panel — shows AI-detected action items with checkboxes.

import { useActionItemStore } from "../stores/actionItemStore";
import { useSpeakerStore } from "../stores/speakerStore";
import { ClipboardList, CheckSquare, Square } from "lucide-react";
import { formatDuration } from "../lib/utils";

interface ActionItemsPanelProps {
  isOpen: boolean;
}

export function ActionItemsPanel({ isOpen }: ActionItemsPanelProps) {
  const items = useActionItemStore((s) => s.items);
  const toggleCompleted = useActionItemStore((s) => s.toggleCompleted);
  const getSpeakerDisplayName = useSpeakerStore((s) => s.getSpeakerDisplayName);
  const getSpeakerColor = useSpeakerStore((s) => s.getSpeakerColor);

  if (!isOpen) return null;

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-1.5 mb-1.5 px-1">
        <ClipboardList className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="text-meta font-semibold uppercase tracking-wider text-muted-foreground/60">
          Action Items
        </span>
        {items.length > 0 && (
          <span className="ml-auto text-meta text-muted-foreground/50">
            {items.filter((i) => i.completed).length}/{items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/50 py-1 px-1">No action items detected yet.</p>
      ) : (
        <div className="overflow-y-auto max-h-[200px] space-y-1 pr-1">
          {items.map((item) => {
            const speakerColor = item.assignee_speaker_id
              ? getSpeakerColor(item.assignee_speaker_id)
              : undefined;
            const speakerName = item.assignee_speaker_id
              ? getSpeakerDisplayName(item.assignee_speaker_id)
              : undefined;

            return (
              <div
                key={item.id}
                className={`flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors ${
                  item.completed ? "opacity-50" : "hover:bg-accent/20"
                }`}
              >
                <button
                  onClick={() => toggleCompleted(item.id)}
                  className="shrink-0 mt-0.5 text-muted-foreground/60 hover:text-primary transition-colors cursor-pointer"
                  aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
                  aria-pressed={item.completed}
                >
                  {item.completed ? (
                    <CheckSquare className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <span
                    className={`text-xs leading-relaxed ${
                      item.completed ? "line-through text-muted-foreground/50" : "text-foreground/90"
                    }`}
                  >
                    {item.text}
                  </span>

                  <div className="flex items-center gap-1.5 mt-0.5">
                    {speakerName && speakerColor && (
                      <span className="text-meta font-medium" style={{ color: speakerColor }}>
                        @{speakerName}
                      </span>
                    )}
                    <span className="text-meta text-muted-foreground/40 tabular-nums">
                      {formatDuration(item.timestamp_ms)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
