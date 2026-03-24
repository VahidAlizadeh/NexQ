import type { OpenRouterModel } from "../../lib/types";
import { Star } from "lucide-react";

// Meeting cost estimate: 30-min meeting ≈ 15K input, 2K output tokens
const MEETING_INPUT_TOKENS = 15_000;
const MEETING_OUTPUT_TOKENS = 2_000;

function estimateMeetingCost(pricing: OpenRouterModel["pricing"]): number {
  return (
    (MEETING_INPUT_TOKENS * pricing.prompt +
      MEETING_OUTPUT_TOKENS * pricing.completion) /
    1_000_000
  );
}

function isGoodForMeetings(model: OpenRouterModel): boolean {
  return (
    model.supports_tools &&
    (model.context_length ?? 0) >= 65536 &&
    model.pricing.prompt <= 10
  );
}

function formatContext(ctx: number | null): string {
  if (!ctx) return "—";
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`;
  return `${Math.round(ctx / 1000)}K`;
}

function formatPrice(price: number): string {
  if (price === 0) return "Free";
  if (price < 0.01) return `$${price.toFixed(4)}`;
  if (price < 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(price % 1 === 0 ? 0 : 2)}`;
}

// "NEW" if created within last 14 days
function isNew(created: number): boolean {
  const fourteenDays = 14 * 24 * 60 * 60;
  return Date.now() / 1000 - created < fourteenDays;
}

interface ModelCardProps {
  model: OpenRouterModel;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export function ModelCard({
  model,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: ModelCardProps) {
  const meetingCost = estimateMeetingCost(model.pricing);
  const goodForMeetings = isGoodForMeetings(model);

  return (
    <div
      onClick={() => onSelect(model.id)}
      className={`group relative rounded-lg border p-3 cursor-pointer transition-all duration-150 hover:border-border/60 hover:bg-accent/30 ${
        isSelected
          ? "border-primary/50 bg-primary/5"
          : "border-border/20 bg-card/30"
      }`}
    >
      {/* Favorite star */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(model.id);
        }}
        className={`absolute top-2.5 right-3 transition-all duration-150 cursor-pointer ${
          isFavorite
            ? "text-yellow-500 opacity-100"
            : "text-muted-foreground/20 opacity-0 group-hover:opacity-100 hover:!opacity-60"
        }`}
        style={{ opacity: isFavorite ? 1 : undefined }}
      >
        <Star className="h-3.5 w-3.5" fill={isFavorite ? "currentColor" : "none"} />
      </button>

      {/* Row 1: Name, provider, badges, tags */}
      <div className="flex items-center gap-2 mb-1 pr-6">
        <span className="text-[13.5px] font-semibold text-foreground truncate">
          {model.name}
        </span>
        <span className="text-[10px] text-muted-foreground/50 shrink-0">
          {model.provider_name}
        </span>
        {isNew(model.created) && (
          <span className="text-[9px] px-1.5 py-px rounded bg-emerald-500/12 text-emerald-500 shrink-0">
            NEW
          </span>
        )}
        {model.is_free && (
          <span className="text-[9px] px-1.5 py-px rounded bg-green-500/15 text-green-500 font-semibold shrink-0">
            FREE
          </span>
        )}
        {goodForMeetings && (
          <span className="text-[9px] px-1.5 py-px rounded bg-primary/12 text-primary shrink-0">
            Good for meetings
          </span>
        )}
        <div className="ml-auto flex gap-1 shrink-0">
          {model.supports_tools && (
            <span className="text-[9px] px-1.5 py-px rounded bg-yellow-500/12 text-yellow-500">
              tools
            </span>
          )}
          {model.supports_reasoning && (
            <span className="text-[9px] px-1.5 py-px rounded bg-emerald-500/12 text-emerald-500">
              reasoning
            </span>
          )}
          {model.supports_web_search && (
            <span className="text-[9px] px-1.5 py-px rounded bg-pink-500/12 text-pink-500">
              web
            </span>
          )}
        </div>
      </div>

      {/* Row 2: Description */}
      <p className="text-[11px] text-muted-foreground/45 leading-snug mb-1.5 truncate">
        {model.description}
      </p>

      {/* Row 3: Stats */}
      <div className="flex items-center gap-3.5 text-[11px] text-muted-foreground/65">
        {model.is_free ? (
          <span className="text-green-500 font-semibold">Free</span>
        ) : (
          <>
            <span>
              <b className="font-semibold">{formatPrice(model.pricing.prompt)}</b>
              <span className="opacity-50">/M in</span>
            </span>
            <span>
              <b className="font-semibold">{formatPrice(model.pricing.completion)}</b>
              <span className="opacity-50">/M out</span>
            </span>
          </>
        )}
        <span>
          <b className="font-semibold">{formatContext(model.context_length)}</b>
          <span className="opacity-50"> ctx</span>
        </span>
        {model.max_completion_tokens && (
          <span>
            <b className="font-semibold">
              {formatContext(model.max_completion_tokens)}
            </b>
            <span className="opacity-50"> max</span>
          </span>
        )}
        <span className="ml-auto text-[10px]">
          {model.is_free ? (
            <span className="text-green-500 font-medium">Free / meeting</span>
          ) : (
            <span className="text-primary font-medium">
              ~${meetingCost < 0.01 ? meetingCost.toFixed(4) : meetingCost.toFixed(2)} / meeting
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
