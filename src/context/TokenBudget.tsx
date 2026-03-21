import { useContextStore } from "../stores/contextStore";
import { AlertTriangle } from "lucide-react";

export function TokenBudget() {
  const tokenBudget = useContextStore((s) => s.tokenBudget);

  if (!tokenBudget || tokenBudget.limit === 0) {
    return null;
  }

  const usedTokens = tokenBudget.total;
  const limit = tokenBudget.limit;
  const usagePercent = Math.min((usedTokens / limit) * 100, 100);
  const isWarning = usagePercent > 80;
  const isCritical = usagePercent > 95;

  // Filter out headroom for the visual bar segments
  const visibleSegments = tokenBudget.segments.filter(
    (s) => s.category !== "headroom" && s.tokens > 0
  );

  const borderClass = isCritical
    ? "border-destructive/60"
    : isWarning
      ? "border-warning/60"
      : "border-border/50";

  return (
    <div
      className={`w-full rounded-xl border ${borderClass} bg-secondary/30 p-4`}
    >
      {/* Header row */}
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Token Budget
          </span>
          {(isWarning || isCritical) && (
            <AlertTriangle
              className={`h-3.5 w-3.5 ${
                isCritical ? "text-destructive" : "text-warning"
              }`}
            />
          )}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatNumber(usedTokens)} / {formatNumber(limit)} tokens used (
          {usagePercent.toFixed(0)}%)
        </span>
      </div>

      {/* Stacked bar */}
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted/40"
        role="meter"
        aria-label="Token budget usage"
        aria-valuenow={usedTokens}
        aria-valuemin={0}
        aria-valuemax={limit}
      >
        <div className="flex h-full">
          {visibleSegments.map((segment, i) => {
            const widthPercent = (segment.tokens / limit) * 100;
            if (widthPercent < 0.1) return null;
            return (
              <div
                key={`${segment.category}-${i}`}
                className="h-full transition-all duration-300"
                style={{
                  width: `${widthPercent}%`,
                  backgroundColor: segment.color,
                  minWidth: widthPercent > 0 ? "2px" : "0",
                }}
                title={`${segment.label}: ~${formatNumber(segment.tokens)} tokens`}
              />
            );
          })}
        </div>
      </div>

      {/* Legend */}
      {visibleSegments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-3">
          {visibleSegments.map((segment, i) => (
            <div
              key={`legend-${segment.category}-${i}`}
              className="flex items-center gap-1.5"
            >
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-meta tabular-nums text-muted-foreground">
                {segment.label}: ~{formatNumber(segment.tokens)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  return n.toString();
}
