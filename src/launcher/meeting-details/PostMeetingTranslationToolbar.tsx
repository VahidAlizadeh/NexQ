import type { TranslationDisplayMode } from "../../lib/types";
import { Globe, Eye, EyeOff, RefreshCw } from "lucide-react";

interface PostMeetingTranslationToolbarProps {
  translatedCount: number;
  totalSegments: number;
  mismatchedCount: number;
  displayMode: TranslationDisplayMode;
  onDisplayModeChange: (mode: TranslationDisplayMode) => void;
  onRetranslateAll: () => void;
  visible: boolean;
  onToggleVisibility: () => void;
  retranslating?: boolean;
}

export function PostMeetingTranslationToolbar({
  translatedCount,
  totalSegments,
  mismatchedCount,
  displayMode,
  onDisplayModeChange,
  onRetranslateAll,
  visible,
  onToggleVisibility,
  retranslating,
}: PostMeetingTranslationToolbarProps) {
  const coveragePct = totalSegments > 0 ? (translatedCount / totalSegments) * 100 : 0;

  return (
    <div className="flex items-center gap-2.5 mx-2 my-1 px-3 py-1.5 rounded-lg bg-primary/[0.04] border border-primary/[0.12] text-[11px]">
      {/* Left: Label + coverage */}
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-primary/70" />
        <span className="font-semibold text-primary/80">Translations</span>
        <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5">
          <span className="font-semibold tabular-nums text-primary/80">
            {translatedCount} / {totalSegments}
          </span>
          <div className="h-[3px] w-10 rounded-full bg-primary/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/70 transition-all duration-300"
              style={{ width: `${coveragePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Center: Display mode toggle */}
      <div className="ml-auto flex rounded-md border border-border/30 overflow-hidden">
        <button
          onClick={() => onDisplayModeChange("inline")}
          className={`px-2.5 py-1 text-[10px] font-semibold transition-colors cursor-pointer ${
            displayMode === "inline"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-secondary/30"
          }`}
        >
          Inline
        </button>
        <button
          onClick={() => onDisplayModeChange("hover")}
          className={`px-2.5 py-1 text-[10px] font-semibold transition-colors cursor-pointer ${
            displayMode === "hover"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-secondary/30"
          }`}
        >
          Hover
        </button>
      </div>

      {/* Right: Retranslate all + eye toggle */}
      <div className="ml-auto flex items-center gap-2">
        {mismatchedCount > 0 && (
          <button
            onClick={onRetranslateAll}
            disabled={retranslating}
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold bg-amber-500/[0.08] border border-amber-500/20 text-amber-400 hover:bg-amber-500/15 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-2.5 w-2.5 ${retranslating ? "animate-spin" : ""}`} />
            Retranslate {mismatchedCount} mismatched
          </button>
        )}
        <button
          onClick={onToggleVisibility}
          className="rounded-md p-1.5 text-primary/60 hover:bg-primary/10 transition-colors cursor-pointer"
          title={visible ? "Hide translations" : "Show translations"}
        >
          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
