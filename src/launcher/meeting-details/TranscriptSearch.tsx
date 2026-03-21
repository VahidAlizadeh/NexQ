import { useRef, useEffect } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import type { TranscriptSearchState } from "../../hooks/useTranscriptSearch";

interface TranscriptSearchProps {
  search: TranscriptSearchState;
}

export function TranscriptSearch({ search }: TranscriptSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (search.isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [search.isOpen]);

  if (!search.isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (e.shiftKey) search.prevMatch();
      else search.nextMatch();
    } else if (e.key === "Escape") {
      search.close();
    }
  };

  return (
    <div className="absolute right-4 top-2 z-10 flex items-center gap-1.5 rounded-xl border border-border/20 bg-card/80 px-3 py-1.5 shadow-xl backdrop-blur-xl">
      <Search className="h-3 w-3 text-muted-foreground/60" />
      <input
        ref={inputRef}
        type="text"
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search transcript..."
        className="w-[180px] bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
      />
      {search.totalMatches > 0 && (
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
          {search.currentMatchIndex + 1} of {search.totalMatches}
        </span>
      )}
      {search.query && search.totalMatches === 0 && (
        <span className="shrink-0 text-[10px] text-red-400/70">No matches</span>
      )}
      <div className="flex items-center gap-0.5">
        <button
          onClick={search.prevMatch}
          disabled={search.totalMatches === 0}
          className="rounded p-0.5 text-muted-foreground/60 hover:bg-secondary hover:text-foreground disabled:opacity-30 cursor-pointer"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          onClick={search.nextMatch}
          disabled={search.totalMatches === 0}
          className="rounded p-0.5 text-muted-foreground/60 hover:bg-secondary hover:text-foreground disabled:opacity-30 cursor-pointer"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          onClick={search.close}
          className="rounded p-0.5 text-muted-foreground/60 hover:bg-secondary hover:text-foreground cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
