import { useCallback, useEffect, useMemo, useState } from "react";
import { useStreamStore } from "../stores/streamStore";
import { useAIActionsStore } from "../stores/aiActionsStore";
import { generateAssist, cancelGeneration } from "../lib/ipc";
import { showToast } from "../stores/toastStore";
import type { IntelligenceMode } from "../lib/types";
import {
  Loader2,
  Sparkles,
  MessageSquare,
  Scissors,
  CornerUpRight,
  ListChecks,
  HelpCircle,
  Wand2,
  Send,
  X,
} from "lucide-react";

// Icon mapping for built-in modes
const MODE_ICONS: Record<string, typeof Sparkles> = {
  Assist: Sparkles,
  WhatToSay: MessageSquare,
  Shorten: Scissors,
  FollowUp: CornerUpRight,
  Recap: ListChecks,
  AskQuestion: HelpCircle,
};

// Built-in shortcuts
const MODE_SHORTCUTS: Record<string, string> = {
  Assist: "Space",
  WhatToSay: "1",
  Shorten: "2",
  FollowUp: "3",
  Recap: "4",
  AskQuestion: "5",
};

// Ordered built-in modes — AskQuestion now included
const BUILT_IN_ORDER = ["Assist", "WhatToSay", "Shorten", "FollowUp", "Recap", "AskQuestion"];

export function ModeButtons() {
  const currentMode = useStreamStore((s) => s.currentMode);
  const isStreaming = useStreamStore((s) => s.isStreaming);
  const actions = useAIActionsStore((s) => s.configs.actions);
  const [askInputText, setAskInputText] = useState("");
  const [askInputVisible, setAskInputVisible] = useState(false);

  // Listen for keyboard shortcut (Digit5) to toggle ask input
  useEffect(() => {
    const handler = () => setAskInputVisible((v) => !v);
    window.addEventListener("nexq:toggle-ask-input", handler);
    return () => window.removeEventListener("nexq:toggle-ask-input", handler);
  }, []);

  // Build ordered list: built-in modes first (in order), then custom actions
  const visibleModes = useMemo(() => {
    const result: { mode: string; label: string; shortcut: string; icon: typeof Sparkles; isCustom: boolean }[] = [];

    // Add built-in modes in order
    for (const modeKey of BUILT_IN_ORDER) {
      const cfg = actions[modeKey];
      if (cfg && cfg.visible) {
        result.push({
          mode: cfg.mode,
          label: cfg.name,
          shortcut: MODE_SHORTCUTS[modeKey] || "",
          icon: MODE_ICONS[modeKey] || Wand2,
          isCustom: false,
        });
      }
    }

    // Add custom actions
    for (const [key, cfg] of Object.entries(actions)) {
      if (!cfg.isBuiltIn && cfg.visible) {
        result.push({
          mode: cfg.mode,
          label: cfg.name,
          shortcut: "",
          icon: Wand2,
          isCustom: true,
        });
      }
    }

    return result;
  }, [actions]);

  const handleClick = useCallback(
    (mode: string) => {
      if (isStreaming) {
        if (currentMode === mode) cancelGeneration().catch(() => showToast("Failed to cancel", "error"));
        return;
      }
      // AskQuestion mode: toggle ask input instead of direct generation
      if (mode === "AskQuestion") {
        setAskInputVisible((v) => !v);
        return;
      }
      generateAssist(mode).catch((err) => showToast(err instanceof Error ? err.message : "Failed", "error"));
    },
    [isStreaming, currentMode]
  );

  const handleAskSubmit = useCallback(() => {
    const text = askInputText.trim();
    if (!text || isStreaming) return;
    generateAssist("AskQuestion", text).catch((err) =>
      showToast(err instanceof Error ? err.message : "Failed", "error")
    );
    setAskInputText("");
    setAskInputVisible(false);
  }, [askInputText, isStreaming]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-0.5">
        {visibleModes.map(({ mode, label, shortcut, icon: Icon, isCustom }) => {
          const isActive = currentMode === mode && isStreaming;
          const isAskActive = mode === "AskQuestion" && askInputVisible && !isStreaming;
          return (
            <button
              key={mode}
              onClick={() => handleClick(mode)}
              disabled={isStreaming && !isActive}
              title={shortcut ? `${label} (${shortcut})` : label}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium transition-all duration-150 cursor-pointer ${
                isActive
                  ? "bg-primary/15 text-primary ring-1 ring-primary/20"
                  : isAskActive
                    ? "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20"
                    : isCustom
                      ? "text-amber-400/60 hover:bg-amber-500/10 hover:text-amber-400 border border-amber-500/10"
                      : "text-muted-foreground/45 hover:bg-accent/50 hover:text-foreground"
              } ${isStreaming && !isActive ? "opacity-20 cursor-not-allowed" : ""}`}
            >
              {isActive ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Inline Ask input */}
      {askInputVisible && !isStreaming && (
        <div className="flex items-center gap-1.5 rounded-lg border border-blue-500/15 bg-blue-500/[0.04] px-2 py-1">
          <input
            type="text"
            value={askInputText}
            onChange={(e) => setAskInputText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { e.preventDefault(); handleAskSubmit(); }
              if (e.key === "Escape") { e.preventDefault(); setAskInputVisible(false); }
            }}
            placeholder="Type your question..."
            autoFocus
            className="flex-1 min-w-0 bg-transparent text-xs text-foreground/90 placeholder:text-muted-foreground/40 outline-none"
          />
          <button
            onClick={handleAskSubmit}
            disabled={!askInputText.trim()}
            className="rounded-md p-1 text-blue-400/60 hover:bg-blue-500/10 hover:text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Send (Enter)"
          >
            <Send className="h-3 w-3" />
          </button>
          <button
            onClick={() => setAskInputVisible(false)}
            className="rounded-md p-1 text-muted-foreground/40 hover:bg-accent hover:text-muted-foreground transition-colors"
            title="Close (Esc)"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
