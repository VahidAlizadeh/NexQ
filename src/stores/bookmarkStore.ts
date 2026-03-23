import { create } from "zustand";
import type { MeetingBookmark } from "../lib/types";

interface BookmarkState {
  bookmarks: MeetingBookmark[];

  addBookmark: (timestampMs: number, note?: string, segmentId?: string) => MeetingBookmark;
  removeBookmark: (id: string) => void;
  toggleBookmark: (segmentId: string, timestampMs: number) => MeetingBookmark | null;
  updateBookmarkNote: (id: string, note: string) => void;
  getBookmarkForSegment: (segmentId: string) => MeetingBookmark | undefined;
  clearBookmarks: () => void;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarks: [],

  addBookmark: (timestampMs, note, segmentId) => {
    const bookmark: MeetingBookmark = {
      id: `bookmark_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp_ms: timestampMs,
      segment_id: segmentId,
      note,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ bookmarks: [...s.bookmarks, bookmark] }));
    return bookmark;
  },

  removeBookmark: (id) => {
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }));
  },

  toggleBookmark: (segmentId, timestampMs) => {
    const existing = get().bookmarks.find((b) => b.segment_id === segmentId);
    if (existing) {
      get().removeBookmark(existing.id);
      return null;
    }
    return get().addBookmark(timestampMs, undefined, segmentId);
  },

  getBookmarkForSegment: (segmentId) => {
    return get().bookmarks.find((b) => b.segment_id === segmentId);
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
