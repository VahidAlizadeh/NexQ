import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslationStore } from "../stores/translationStore";
import { translateText } from "../lib/ipc";
import type { TranslationResult } from "../lib/types";
import { Languages, Copy } from "lucide-react";
import { TranslationPopup } from "./TranslationPopup";

export function SelectionToolbar() {
  const enabled = useTranslationStore((s) => s.selectionToolbarEnabled);
  const targetLang = useTranslationStore((s) => s.targetLang);
  const sourceLang = useTranslationStore((s) => s.sourceLang);

  const [selectedText, setSelectedText] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    if (!enabled) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || text.length < 2) {
      // Don't dismiss immediately — let click-outside handle it
      return;
    }
    const range = sel?.getRangeAt(0);
    if (!range) return;
    const rect = range.getBoundingClientRect();
    setSelectedText(text);
    setPosition({
      top: rect.top + window.scrollY - 40,
      left: rect.left + window.scrollX + rect.width / 2,
    });
    setTranslationResult(null);
  }, [enabled]);

  // Dismiss on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setPosition(null);
        setTranslationResult(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPosition(null);
        setTranslationResult(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const handleTranslate = async () => {
    if (!selectedText) return;
    setIsTranslating(true);
    try {
      const result = await translateText(
        selectedText,
        targetLang,
        sourceLang === "auto" ? undefined : sourceLang
      );
      setTranslationResult(result);
    } catch (err) {
      console.error("[SelectionToolbar] Translation failed:", err);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedText);
    setPosition(null);
  };

  if (!position || !enabled) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-[9999]"
      style={{ top: position.top, left: position.left, transform: "translateX(-50%)" }}
    >
      {/* Mini toolbar */}
      <div className="flex gap-0.5 rounded-lg border border-border/40 bg-popover p-1 shadow-xl">
        <button
          onClick={handleTranslate}
          disabled={isTranslating}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <Languages className="h-3 w-3" />
          {isTranslating ? "..." : "Translate"}
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>

      {/* Translation popup */}
      {translationResult && (
        <TranslationPopup
          result={translationResult}
          onClose={() => setTranslationResult(null)}
        />
      )}
    </div>
  );
}
