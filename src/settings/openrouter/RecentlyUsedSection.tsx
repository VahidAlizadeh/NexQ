import type { OpenRouterModel } from "../../lib/types";

interface RecentlyUsedSectionProps {
  recentIds: string[];
  models: OpenRouterModel[];
  onSelect: (id: string) => void;
}

export function RecentlyUsedSection({
  recentIds,
  models,
  onSelect,
}: RecentlyUsedSectionProps) {
  const recentModels = recentIds
    .map((id) => models.find((m) => m.id === id))
    .filter(Boolean) as OpenRouterModel[];

  if (recentModels.length === 0) return null;

  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground/40 mb-2 pl-0.5">
        Recently Used
      </h4>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {recentModels.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/15 bg-card/30 text-xs text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all duration-150 cursor-pointer"
          >
            {m.name}
            <span className={`text-[10px] ${m.is_free ? "text-green-500" : "text-muted-foreground/40"}`}>
              {m.is_free
                ? "Free"
                : `$${m.pricing.prompt < 1 ? m.pricing.prompt.toFixed(2) : m.pricing.prompt.toFixed(0)}/$${m.pricing.completion < 1 ? m.pricing.completion.toFixed(2) : m.pricing.completion.toFixed(0)}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
