// Global dev log store — collects STT debug/status events at all times
// so the DevLog panel always has history regardless of when it's opened.

import { create } from "zustand";

export interface DevLogEntry {
  id: number;
  level: string; // "info" | "warn" | "error"
  source: string;
  message: string;
  timestamp: Date;
  /** Optional key for update-in-place entries (e.g. audio stats). */
  replaceKey?: string;
}

const MAX_ENTRIES = 500;
let nextId = 0;

interface DevLogState {
  entries: DevLogEntry[];
  addEntry: (level: string, source: string, message: string, replaceKey?: string) => void;
  clear: () => void;
}

export const useDevLogStore = create<DevLogState>((set) => ({
  entries: [],
  addEntry: (level, source, message, replaceKey) =>
    set((state) => {
      // If replaceKey is set, update existing entry with that key in-place
      if (replaceKey) {
        let idx = -1;
        for (let i = state.entries.length - 1; i >= 0; i--) {
          if (state.entries[i].replaceKey === replaceKey) { idx = i; break; }
        }
        if (idx >= 0) {
          const updated = [...state.entries];
          updated[idx] = { ...updated[idx], level, message, timestamp: new Date() };
          return { entries: updated };
        }
      }
      const next = [
        ...state.entries,
        { id: nextId++, level, source, message, timestamp: new Date(), replaceKey },
      ];
      return {
        entries:
          next.length > MAX_ENTRIES
            ? next.slice(next.length - MAX_ENTRIES)
            : next,
      };
    }),
  clear: () => set({ entries: [] }),
}));
