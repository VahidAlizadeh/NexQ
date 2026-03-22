import { create } from "zustand";
import type { MeetingBookmark } from "../lib/types";

interface BookmarkState {
  bookmarks: MeetingBookmark[];

  addBookmark: (timestampMs: number, note?: string) => void;
  removeBookmark: (id: string) => void;
  updateBookmarkNote: (id: string, note: string) => void;
  clearBookmarks: () => void;
}

export const useBookmarkStore = create<BookmarkState>((set) => ({
  bookmarks: [],

  addBookmark: (timestampMs, note) => {
    const bookmark: MeetingBookmark = {
      id: `bookmark_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp_ms: timestampMs,
      note,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ bookmarks: [...s.bookmarks, bookmark] }));
  },

  removeBookmark: (id) => {
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }));
  },

  updateBookmarkNote: (id, note) => {
    set((s) => ({
      bookmarks: s.bookmarks.map((b) =>
        b.id === id ? { ...b, note } : b
      ),
    }));
  },

  clearBookmarks: () => {
    set({ bookmarks: [] });
  },
}));
