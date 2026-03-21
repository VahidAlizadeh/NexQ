import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { TranscriptSegment } from "../lib/types";

export interface SearchMatch {
  segmentIndex: number;
  startOffset: number;
}

export interface TranscriptSearchState {
  query: string;
  setQuery: (q: string) => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  matches: SearchMatch[];
  currentMatchIndex: number;
  nextMatch: () => void;
  prevMatch: () => void;
  totalMatches: number;
}

export function useTranscriptSearch(
  segments: TranscriptSegment[]
): TranscriptSearchState {
  const [query, setQueryRaw] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const setQuery = useCallback((q: string) => {
    setQueryRaw(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(q), 200);
  }, []);

  // Clear debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const matches = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    const needle = debouncedQuery.toLowerCase();
    const result: SearchMatch[] = [];
    for (let i = 0; i < segments.length; i++) {
      const text = segments[i].text.toLowerCase();
      let pos = 0;
      while ((pos = text.indexOf(needle, pos)) !== -1) {
        result.push({ segmentIndex: i, startOffset: pos });
        pos += needle.length;
      }
    }
    return result;
  }, [segments, debouncedQuery]);

  // Reset current match when matches change
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [matches]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQueryRaw("");
    setDebouncedQuery("");
    setCurrentMatchIndex(0);
  }, []);

  const nextMatch = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const prevMatch = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  return {
    query,
    setQuery,
    isOpen,
    open,
    close,
    matches,
    currentMatchIndex,
    nextMatch,
    prevMatch,
    totalMatches: matches.length,
  };
}
