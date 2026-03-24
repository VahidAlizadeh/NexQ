import type { OpenRouterModel } from "../../lib/types";
import { ModelCard } from "./ModelCard";

interface FavoritesSectionProps {
  favoriteIds: string[];
  models: OpenRouterModel[];
  selectedModelId: string;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export function FavoritesSection({
  favoriteIds,
  models,
  selectedModelId,
  onSelect,
  onToggleFavorite,
}: FavoritesSectionProps) {
  const favoriteModels = favoriteIds
    .map((id) => models.find((m) => m.id === id))
    .filter(Boolean) as OpenRouterModel[];

  if (favoriteModels.length === 0) return null;

  return (
    <div>
      <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground/40 mb-2 pl-0.5">
        ★ Favorites
      </h4>
      <div className="flex flex-col gap-1.5">
        {favoriteModels.map((m) => (
          <ModelCard
            key={m.id}
            model={m}
            isSelected={selectedModelId === m.id}
            isFavorite={true}
            onSelect={onSelect}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    </div>
  );
}
