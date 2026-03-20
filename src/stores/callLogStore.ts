import { create } from "zustand";
import type { LogEntry, LogEntryStatus, LogFilterKind } from "../lib/types";
import { stripThinkTags } from "../lib/utils";

const MAX_ENTRIES = 100;

interface CallLogState {
  entries: LogEntry[];
  isOpen: boolean;
  activeFilter: LogFilterKind;
  expandedEntryId: string | null;

  // Lifecycle actions (called by useCallLogCapture)
  beginEntry: (entry: LogEntry) => void;
  appendToken: (id: string, token: string) => void;
  completeEntry: (id: string, totalTokens: number, latencyMs: number) => void;
  failEntry: (id: string, message: string) => void;

  // UI actions
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setFilter: (filter: LogFilterKind) => void;
  setExpandedEntry: (id: string | null) => void;
  clearAll: () => void;
}

export const useCallLogStore = create<CallLogState>((set, get) => ({
  entries: [],
  isOpen: false,
  activeFilter: "all",
  expandedEntryId: null,

  beginEntry: (entry) =>
    set((state) => ({
      entries: [entry, ...state.entries].slice(0, MAX_ENTRIES),
    })),

  appendToken: (id, token) =>
    set((state) => ({
      entries: state.entries.map((e) => {
        if (e.id !== id) return e;
        const raw = e.responseContent + token;
        return {
          ...e,
          status: "streaming" as LogEntryStatus,
          responseContent: raw,
          responseContentClean: stripThinkTags(raw),
          firstTokenAt: e.firstTokenAt ?? Date.now(),
        };
      }),
    })),

  completeEntry: (id, totalTokens, latencyMs) =>
    set((state) => ({
      entries: state.entries.map((e) => {
        if (e.id !== id) return e;
        return {
          ...e,
          status: "complete" as LogEntryStatus,
          completedAt: Date.now(),
          totalTokens,
          latencyMs,
          responseContentClean: stripThinkTags(e.responseContent),
        };
      }),
    })),

  failEntry: (id, message) =>
    set((state) => ({
      entries: state.entries.map((e) => {
        if (e.id !== id) return e;
        return {
          ...e,
          status: "error" as LogEntryStatus,
          completedAt: Date.now(),
          errorMessage: message,
        };
      }),
    })),

  setOpen: (open) => set({ isOpen: open }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  setFilter: (filter) => set({ activeFilter: filter }),
  setExpandedEntry: (id) =>
    set((state) => ({
      expandedEntryId: state.expandedEntryId === id ? null : id,
    })),
  clearAll: () => set({ entries: [], expandedEntryId: null }),
}));
