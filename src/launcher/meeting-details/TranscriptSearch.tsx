import { useRef, useEffect } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import type { TranscriptSearchState } from "../../hooks/useTranscriptSearch";

interface TranscriptSearchProps {
  search: TranscriptSearchState;
}

export function TranscriptSearch({ search }: TranscriptSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (search.isOpen && inputRef.current) inputRef.current.focus();
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
    <div className="absolute right-4 top-2 z-10 flex items-center gap-2 rounded-xl border border-border/20 bg-card/90 px-4 py-2 shadow-2xl backdrop-blur-xl">
      <Search className="h-4 w-4 text-muted-foreground/50" />
      <input
        ref={inputRef}
        type="text"
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search transcript..."
        maxLength={200}
        className="w-[200px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
      />
      {search.totalMatches > 0 && (
        <span className="shrink-0 text-xs tabular-nums font-medium text-muted-foreground/60">
          {search.currentMatchIndex + 1} of {search.totalMatches}
        </span>
      )}
      {search.query && search.totalMatches === 0 && (
        <span className="shrink-0 text-xs text-red-400/60">No matches</span>
      )}
      <div className="flex items-center gap-0.5 border-l border-border/20 pl-2">
        <button
          onClick={search.prevMatch}
          disabled={search.totalMatches === 0}
          className="rounded-md p-1 text-muted-foreground/50 hover:bg-secondary hover:text-foreground disabled:opacity-25 cursor-pointer"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          onClick={search.nextMatch}
          disabled={search.totalMatches === 0}
          className="rounded-md p-1 text-muted-foreground/50 hover:bg-secondary hover:text-foreground disabled:opacity-25 cursor-pointer"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <button
          onClick={search.close}
          className="rounded-md p-1 text-muted-foreground/50 hover:bg-secondary hover:text-foreground cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
