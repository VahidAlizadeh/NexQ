import type { AIInteraction } from "../../lib/types";
import { formatRelativeTime, getModeLabel } from "../../lib/utils";
import { MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

interface AIInteractionLogProps {
  interactions: AIInteraction[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}

export function AIInteractionLog({
  interactions,
  expandedId,
  onToggle,
}: AIInteractionLogProps) {
  if (interactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-muted-foreground/40">
        <MessageSquare className="mb-3 h-6 w-6" />
        <p className="text-xs font-medium">No AI interactions</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 p-3">
      {interactions.map((interaction) => {
        const isExpanded = expandedId === interaction.id;
        return (
          <div
            key={interaction.id}
            className="rounded-lg border border-border/15 bg-card/30"
          >
            <button
              onClick={() => onToggle(interaction.id)}
              className="flex w-full items-center justify-between px-3 py-2 text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                  {getModeLabel(interaction.mode)}
                </span>
                <span className="truncate max-w-[200px] text-[11px] text-foreground/65">
                  {interaction.question_context}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] tabular-nums text-muted-foreground/40">
                  {interaction.latency_ms}ms
                </span>
                {isExpanded
                  ? <ChevronUp className="h-3 w-3 text-muted-foreground/40" />
                  : <ChevronDown className="h-3 w-3 text-muted-foreground/40" />}
              </div>
            </button>
            {isExpanded && (
              <div className="border-t border-border/10 px-3 py-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[9px] text-muted-foreground/40">
                  <span>{interaction.provider}/{interaction.model}</span>
                  <span>&middot;</span>
                  <span>{formatRelativeTime(interaction.timestamp)}</span>
                </div>
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/75">
                  {interaction.response}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
