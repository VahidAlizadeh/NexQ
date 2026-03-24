import type { OpenRouterModel } from "../../lib/types";
import { X } from "lucide-react";

interface RecentlyUsedSectionProps {
  recentIds: string[];
  models: OpenRouterModel[];
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

export function RecentlyUsedSection({
  recentIds,
  models,
  onSelect,
  onRemove,
  onClearAll,
}: RecentlyUsedSectionProps) {
  const recentModels = recentIds
    .map((id) => models.find((m) => m.id === id))
    .filter(Boolean) as OpenRouterModel[];

  if (recentModels.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground/40 pl-0.5">
          Recently Used
        </h4>
        <button
          onClick={onClearAll}
          className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors cursor-pointer"
        >
          Clear all
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {recentModels.map((m) => (
          <div
            key={m.id}
            className="group/chip flex items-center gap-1 rounded-lg border border-border/15 bg-card/30 text-xs text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all duration-150"
          >
            <button
              onClick={() => onSelect(m.id)}
              className="pl-3 py-1.5 cursor-pointer flex items-center gap-1.5"
            >
              {m.name}
              <span className={`text-[10px] ${m.is_free ? "text-green-500" : "text-muted-foreground/40"}`}>
                {m.is_free
                  ? "Free"
                  : `$${m.pricing.prompt < 1 ? m.pricing.prompt.toFixed(2) : m.pricing.prompt.toFixed(0)}/$${m.pricing.completion < 1 ? m.pricing.completion.toFixed(2) : m.pricing.completion.toFixed(0)}`}
              </span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(m.id);
              }}
              className="pr-2 pl-0.5 py-1.5 text-muted-foreground/20 hover:text-muted-foreground/60 transition-colors cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
