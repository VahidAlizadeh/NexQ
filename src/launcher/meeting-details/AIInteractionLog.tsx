import type { AIInteraction } from "../../lib/types";
import { formatRelativeTime, getModeLabel } from "../../lib/utils";
import { MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

interface AIInteractionLogProps {
  interactions: AIInteraction[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}

export function AIInteractionLog({ interactions, expandedId, onToggle }: AIInteractionLogProps) {
  if (interactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40">
        <MessageSquare className="mb-3 h-8 w-8" />
        <p className="text-sm font-medium">No AI interactions</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 p-4">
      {interactions.map((interaction) => {
        const isExpanded = expandedId === interaction.id;
        return (
          <div key={interaction.id} className="rounded-xl border border-border/15 bg-card/30">
            <button
              onClick={() => onToggle(interaction.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {getModeLabel(interaction.mode)}
                </span>
                <span className="truncate max-w-[250px] text-sm text-foreground/65">
                  {interaction.question_context}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-xs tabular-nums text-muted-foreground/50">{interaction.latency_ms}ms</span>
                {isExpanded
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground/40" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground/40" />}
              </div>
            </button>
            {isExpanded && (
              <div className="border-t border-border/10 px-4 py-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground/50">
                  <span>{interaction.provider}/{interaction.model}</span>
                  <span>&middot;</span>
                  <span>{formatRelativeTime(interaction.timestamp)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
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
