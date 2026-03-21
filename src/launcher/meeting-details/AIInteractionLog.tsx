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
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/60">
        <MessageSquare className="mb-4 h-7 w-7" />
        <p className="text-sm font-medium">No AI interactions recorded</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-5">
      {interactions.map((interaction) => {
        const isExpanded = expandedId === interaction.id;
        return (
          <div
            key={interaction.id}
            className="rounded-xl border border-border/20 bg-card/40"
          >
            <button
              onClick={() => onToggle(interaction.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {getModeLabel(interaction.mode)}
                </span>
                <span className="truncate max-w-[220px] text-xs text-foreground/75">
                  {interaction.question_context}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] tabular-nums text-muted-foreground/60">
                  {interaction.latency_ms}ms
                </span>
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/60" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                )}
              </div>
            </button>
            {isExpanded && (
              <div className="border-t border-border/10 px-4 py-3.5">
                <div className="mb-2.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                  <span>
                    {interaction.provider}/{interaction.model}
                  </span>
                  <span className="text-muted-foreground/60">&middot;</span>
                  <span>{formatRelativeTime(interaction.timestamp)}</span>
                </div>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
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
