import type { TranslationResult } from "../lib/types";
import { Copy, X } from "lucide-react";

interface TranslationPopupProps {
  result: TranslationResult;
  onClose: () => void;
}

export function TranslationPopup({ result, onClose }: TranslationPopupProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(result.translated_text);
  };

  return (
    <div className="mt-2 w-72 rounded-xl border border-border/30 bg-popover p-3 shadow-2xl">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-foreground leading-relaxed">
          {result.translated_text}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground/50">
        <span>{result.source_lang.toUpperCase()} &rarr; {result.target_lang.toUpperCase()}</span>
        <span className="text-border">&middot;</span>
        <span>{result.provider}</span>
        <button
          onClick={handleCopy}
          className="ml-auto flex items-center gap-1 text-primary/50 hover:text-primary transition-colors"
        >
          <Copy className="h-3 w-3" />
          Copy
        </button>
      </div>
    </div>
  );
}
