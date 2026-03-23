# Bookmarking System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhanced bookmarking with segment anchoring, notes via hybrid toast, hover/right-click on transcript lines, bookmark panel during live meetings, and full CRUD in past meeting pages.

**Architecture:** Data model adds `segment_id` to bookmarks. Four creation methods (Ctrl+B, hover icon, right-click menu, right-click "Add Note"). Standalone BookmarkToast for interactive note input. BookmarkPanel toggles from header button. TranscriptContextMenu shared between live and past meeting views. Past meeting editing uses individual IPC CRUD commands.

**Tech Stack:** TypeScript (React/Zustand), Rust (Tauri 2, rusqlite), Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-22-bookmarking-system-design.md`

**Depends on:** SP1 (Past Meeting Persistence Fix) must be implemented first.

---

### Task 1: Data Model — Add segment_id to Bookmarks

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src-tauri/src/db/meetings.rs` (MeetingBookmark struct + save query)
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Step 1: Add segment_id to TypeScript MeetingBookmark**

In `src/lib/types.ts`, find `interface MeetingBookmark` and add `segment_id`:

```typescript
export interface MeetingBookmark {
  id: string;
  timestamp_ms: number;
  segment_id?: string;   // Optional anchor to a specific transcript segment
  note?: string;
  created_at: string;
}
```

- [ ] **Step 2: Add segment_id to Rust MeetingBookmark struct**

In `src-tauri/src/db/meetings.rs`, update the struct (line 420-427):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingBookmark {
    pub id: String,
    pub meeting_id: String,
    pub timestamp_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segment_id: Option<String>,
    pub note: Option<String>,
    pub created_at: String,
}
```

- [ ] **Step 3: Update save_meeting_bookmarks INSERT to include segment_id**

Update the INSERT query in `save_meeting_bookmarks` (line 441):

```rust
    let mut stmt = conn.prepare(
        "INSERT INTO meeting_bookmarks (id, meeting_id, timestamp_ms, segment_id, note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )?;

    for b in bookmarks {
        stmt.execute(params![
            b.id,
            meeting_id,
            b.timestamp_ms,
            b.segment_id,
            b.note,
            b.created_at,
        ])?;
    }
```

Also update `list_meeting_bookmarks` (added in SP1) to read `segment_id`:

```rust
pub fn list_meeting_bookmarks(
    conn: &Connection,
    meeting_id: &str,
) -> Result<Vec<MeetingBookmark>, DatabaseError> {
    let mut stmt = conn.prepare(
        "SELECT id, meeting_id, timestamp_ms, segment_id, note, created_at
         FROM meeting_bookmarks
         WHERE meeting_id = ?1
         ORDER BY timestamp_ms ASC",
    )?;

    let rows = stmt
        .query_map(params![meeting_id], |row| {
            Ok(MeetingBookmark {
                id: row.get(0)?,
                meeting_id: row.get(1)?,
                timestamp_ms: row.get(2)?,
                segment_id: row.get(3)?,
                note: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}
```

- [ ] **Step 4: Add DB migration for segment_id column**

In `src-tauri/src/db/migrations.rs`, add after the v3 migration:

```rust
// v4: Add segment_id to meeting_bookmarks
conn.execute_batch(
    "ALTER TABLE meeting_bookmarks ADD COLUMN segment_id TEXT;"
)?;
```

Guard with a version check or use `IF NOT EXISTS` pattern matching the codebase's existing migration style.

- [ ] **Step 5: Verify both builds**

Run: `npm run build && cd src-tauri && cargo check`

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src-tauri/src/db/meetings.rs src-tauri/src/db/migrations.rs
git commit -m "feat(bookmarks): add segment_id field for segment-anchored bookmarks"
```

---

### Task 2: Update BookmarkStore for Segment Anchoring

**Files:**
- Modify: `src/stores/bookmarkStore.ts`

- [ ] **Step 1: Add segment_id support and toggleBookmark action**

Rewrite the store to support segment-anchored bookmarks:

```typescript
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
```

- [ ] **Step 2: Verify frontend builds**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/stores/bookmarkStore.ts
git commit -m "feat(bookmarks): update store with segment anchoring, toggle, and lookup"
```

---

### Task 3: BookmarkToast — Standalone Hybrid Toast Component

**Files:**
- Create: `src/overlay/BookmarkToast.tsx`

- [ ] **Step 1: Create the BookmarkToast component**

This is a singleton interactive toast that appears when a bookmark is created. Shows confirmation with optional "+ Note" expansion. NOT the generic toast system.

```typescript
import { useState, useEffect, useRef, useCallback } from "react";
import { Bookmark, X } from "lucide-react";
import { useBookmarkStore } from "../stores/bookmarkStore";
import { formatDuration } from "../lib/utils";

interface BookmarkToastState {
  bookmarkId: string;
  timestampMs: number;
}

export function BookmarkToast() {
  const [active, setActive] = useState<BookmarkToastState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [progress, setProgress] = useState(100);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);
  const updateBookmarkNote = useBookmarkStore((s) => s.updateBookmarkNote);

  // Expose a global trigger for other components to show the toast
  useEffect(() => {
    const handler = (e: CustomEvent<BookmarkToastState>) => {
      setActive(e.detail);
      setExpanded(false);
      setNoteText("");
      setProgress(100);
      pausedRef.current = false;
    };
    window.addEventListener("bookmark-toast-show" as any, handler as any);
    return () => window.removeEventListener("bookmark-toast-show" as any, handler as any);
  }, []);

  // Auto-dismiss timer (5 seconds)
  useEffect(() => {
    if (!active) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const startTime = Date.now();
    const duration = 5000;
    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        setActive(null);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 50);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active]);

  const dismiss = useCallback(() => {
    setActive(null);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const handleExpand = useCallback(() => {
    setExpanded(true);
    pausedRef.current = true;
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSaveNote = useCallback(() => {
    if (active && noteText.trim()) {
      updateBookmarkNote(active.bookmarkId, noteText.trim());
    }
    dismiss();
  }, [active, noteText, updateBookmarkNote, dismiss]);

  if (!active) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-border/30 bg-card/95 shadow-2xl backdrop-blur-xl">
      {!expanded ? (
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className="text-success text-sm">✓</span>
          <span className="text-xs text-foreground">
            Bookmarked <span className="font-semibold text-primary">{formatDuration(active.timestampMs)}</span>
          </span>
          <button
            onClick={handleExpand}
            className="ml-auto rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 cursor-pointer"
          >
            + Note
          </button>
          <button onClick={dismiss} className="text-muted-foreground/50 hover:text-foreground cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2 mb-2">
            <Bookmark className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground">Bookmark at {formatDuration(active.timestampMs)}</span>
          </div>
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveNote(); if (e.key === "Escape") dismiss(); }}
              onFocus={() => { pausedRef.current = true; }}
              placeholder="Type your note..."
              maxLength={500}
              className="flex-1 rounded-md border border-primary/20 bg-background/50 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/40"
            />
            <button
              onClick={handleSaveNote}
              className="rounded-md bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/25 cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      )}
      {/* Timer progress bar */}
      <div className="h-0.5 overflow-hidden rounded-b-xl bg-border/10">
        <div
          className="h-full bg-primary/30 transition-all duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// Helper to trigger the toast from anywhere
export function showBookmarkToast(bookmarkId: string, timestampMs: number) {
  window.dispatchEvent(
    new CustomEvent("bookmark-toast-show", { detail: { bookmarkId, timestampMs } })
  );
}
```

- [ ] **Step 2: Verify frontend builds**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/overlay/BookmarkToast.tsx
git commit -m "feat(bookmarks): add standalone hybrid BookmarkToast with note expansion"
```

---

### Task 4: TranscriptContextMenu — Shared Right-Click Menu

**Files:**
- Create: `src/overlay/TranscriptContextMenu.tsx`

- [ ] **Step 1: Create the context menu component**

Shared between live and past meeting transcript lines. Receives callbacks for bookmark/note/copy actions.

```typescript
import { useEffect, useRef } from "react";
import { Bookmark, BookmarkX, MessageSquarePlus, Copy } from "lucide-react";

interface TranscriptContextMenuProps {
  x: number;
  y: number;
  isBookmarked: boolean;
  onBookmark: () => void;
  onAddNote: () => void;
  onCopy: () => void;
  onClose: () => void;
}

export function TranscriptContextMenu({
  x, y, isBookmarked, onBookmark, onAddNote, onCopy, onClose,
}: TranscriptContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [onClose]);

  const items = [
    {
      icon: isBookmarked ? <BookmarkX className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />,
      label: isBookmarked ? "Remove Bookmark" : "Bookmark",
      onClick: () => { onBookmark(); onClose(); },
    },
    {
      icon: <MessageSquarePlus className="h-3.5 w-3.5" />,
      label: "Add Note",
      onClick: () => { onAddNote(); onClose(); },
    },
    {
      icon: <Copy className="h-3.5 w-3.5" />,
      label: "Copy Text",
      onClick: () => { onCopy(); onClose(); },
    },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-50 w-44 rounded-lg border border-border/20 bg-card/95 py-1 shadow-xl backdrop-blur-xl"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.onClick}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground/70 hover:bg-secondary/30 hover:text-foreground cursor-pointer"
        >
          <span className="text-muted-foreground/50">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/overlay/TranscriptContextMenu.tsx
git commit -m "feat(bookmarks): add shared TranscriptContextMenu for right-click actions"
```

---

### Task 5: BookmarkPanel — Live Meeting Bookmark List

**Files:**
- Create: `src/overlay/BookmarkPanel.tsx`

- [ ] **Step 1: Create the panel component**

Follows the same pattern as `ActionItemsPanel` / `SpeakerStatsPanel` — rendered below transcript when toggled.

```typescript
import { useBookmarkStore } from "../stores/bookmarkStore";
import { useMeetingStore } from "../stores/meetingStore";
import { formatDuration } from "../lib/utils";
import { Bookmark, Trash2 } from "lucide-react";
import { useState } from "react";

export function BookmarkPanel() {
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);
  const updateBookmarkNote = useBookmarkStore((s) => s.updateBookmarkNote);
  const sorted = [...bookmarks].sort((a, b) => b.timestamp_ms - a.timestamp_ms);

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground/40">
        <p className="text-xs">No bookmarks yet. Press Ctrl+B or click a line to bookmark.</p>
      </div>
    );
  }

  return (
    <div className="max-h-40 overflow-y-auto px-2 py-1.5">
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <Bookmark className="h-3 w-3 text-primary/60" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
          Bookmarks ({sorted.length})
        </span>
      </div>
      <div className="space-y-0.5">
        {sorted.map((b) => (
          <BookmarkRow
            key={b.id}
            bookmark={b}
            onUpdateNote={(note) => updateBookmarkNote(b.id, note)}
            onRemove={() => removeBookmark(b.id)}
          />
        ))}
      </div>
    </div>
  );
}

function BookmarkRow({
  bookmark,
  onUpdateNote,
  onRemove,
}: {
  bookmark: import("../lib/types").MeetingBookmark;
  onUpdateNote: (note: string) => void;
  onRemove: () => void;
}) {
  const [editNote, setEditNote] = useState(bookmark.note ?? "");
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/20">
      <div className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5">
        <span className="tabular-nums text-[10px] font-semibold text-primary">
          {formatDuration(bookmark.timestamp_ms)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            onBlur={() => { onUpdateNote(editNote); setEditing(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onUpdateNote(editNote); setEditing(false); }
              if (e.key === "Escape") setEditing(false);
            }}
            maxLength={500}
            placeholder="Add note..."
            className="w-full bg-transparent text-xs text-foreground/80 placeholder:text-muted-foreground/30 outline-none"
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            className="block truncate text-xs text-foreground/60 hover:text-foreground/80 cursor-text"
          >
            {bookmark.note || <span className="italic text-muted-foreground/30">Add note...</span>}
          </span>
        )}
      </div>
      <button onClick={onRemove} className="shrink-0 text-muted-foreground/30 hover:text-destructive cursor-pointer">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/overlay/BookmarkPanel.tsx
git commit -m "feat(bookmarks): add BookmarkPanel for live meeting bookmark list"
```

---

### Task 6: Wire Bookmark Components into Overlay

**Files:**
- Modify: `src/overlay/OverlayView.tsx`
- Modify: `src/hooks/useBookmarkHotkey.ts`

- [ ] **Step 1: Change header bookmark button from add-action to panel toggle**

In `OverlayView.tsx` line 117, change the bookmark header button:

```typescript
// Before:
<HeaderBtn icon={<Bookmark className="h-3.5 w-3.5" />} onClick={addBookmarkAtNow} tooltip="Add Bookmark (Ctrl+B)" />

// After:
<HeaderBtn icon={<Bookmark className="h-3.5 w-3.5" />} active={bookmarksOpen} onClick={() => setBookmarksOpen(p => !p)} tooltip="Bookmarks (Ctrl+B to add)" />
```

Add `bookmarksOpen` state: `const [bookmarksOpen, setBookmarksOpen] = useState(false);`

- [ ] **Step 2: Render BookmarkToast and BookmarkPanel**

Add imports and render:
- `BookmarkToast` — render once at the top level of overlay (always present, shows/hides itself)
- `BookmarkPanel` — render conditionally when `bookmarksOpen` is true, in the same area as `ActionItemsPanel`/`SpeakerStatsPanel`

- [ ] **Step 3: Update useBookmarkHotkey to use showBookmarkToast**

In `useBookmarkHotkey.ts`, replace `showToast(...)` with `showBookmarkToast(bookmark.id, offsetMs)`:

```typescript
import { showBookmarkToast } from "../overlay/BookmarkToast";

const addBookmarkAtNow = useCallback(() => {
  if (!isRecording || !meetingStartTime) return;
  const offsetMs = Date.now() - meetingStartTime;
  const bookmark = addBookmark(offsetMs);
  showBookmarkToast(bookmark.id, offsetMs);
}, [isRecording, meetingStartTime, addBookmark]);
```

Note: `addBookmark` now returns the created bookmark (updated in Task 2).

- [ ] **Step 4: Verify frontend builds**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/overlay/OverlayView.tsx src/hooks/useBookmarkHotkey.ts
git commit -m "feat(bookmarks): wire bookmark panel toggle, toast, and panel into overlay"
```

---

### Task 7: Add Hover Bookmark Icon and Right-Click to TranscriptLine

**Files:**
- Modify: `src/overlay/TranscriptLine.tsx`

- [ ] **Step 1: Add bookmark hover icon and context menu integration**

Add to `TranscriptLine`:
1. Import `useBookmarkStore`, `TranscriptContextMenu`, `showBookmarkToast`
2. Add state for context menu: `const [contextMenu, setContextMenu] = useState<{x: number, y: number} | null>(null)`
3. Check if segment is bookmarked: `const bookmark = useBookmarkStore((s) => s.getBookmarkForSegment(segment.id))`
4. On hover: show a bookmark icon at right edge (filled if bookmarked)
5. On icon click: `toggleBookmark(segment.id, segment.timestamp_ms)` + show toast if created
6. On right-click (`onContextMenu`): show `TranscriptContextMenu` at cursor position
7. If bookmarked and has a note: render note text below the segment text in dimmed style

- [ ] **Step 2: Verify frontend builds**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/overlay/TranscriptLine.tsx
git commit -m "feat(bookmarks): add hover bookmark icon and right-click context menu to TranscriptLine"
```

---

### Task 8: Past Meeting Bookmark CRUD — Rust Backend

**Files:**
- Modify: `src-tauri/src/db/meetings.rs`
- Modify: `src-tauri/src/commands/meeting_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/ipc.ts`

- [ ] **Step 1: Add CRUD functions to meetings.rs**

```rust
/// Add a single bookmark to a meeting.
pub fn add_meeting_bookmark(
    conn: &Connection,
    bookmark: &MeetingBookmark,
) -> Result<(), DatabaseError> {
    conn.execute(
        "INSERT INTO meeting_bookmarks (id, meeting_id, timestamp_ms, segment_id, note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            bookmark.id,
            bookmark.meeting_id,
            bookmark.timestamp_ms,
            bookmark.segment_id,
            bookmark.note,
            bookmark.created_at,
        ],
    )?;
    Ok(())
}

/// Update a bookmark's note.
pub fn update_meeting_bookmark_note(
    conn: &Connection,
    bookmark_id: &str,
    note: Option<&str>,
) -> Result<(), DatabaseError> {
    conn.execute(
        "UPDATE meeting_bookmarks SET note = ?1 WHERE id = ?2",
        params![note, bookmark_id],
    )?;
    Ok(())
}

/// Delete a single bookmark.
pub fn delete_meeting_bookmark(
    conn: &Connection,
    bookmark_id: &str,
) -> Result<(), DatabaseError> {
    conn.execute(
        "DELETE FROM meeting_bookmarks WHERE id = ?1",
        params![bookmark_id],
    )?;
    Ok(())
}
```

- [ ] **Step 2: Add command handlers in meeting_commands.rs**

Add three new `#[command]` functions that call the DB functions above.

- [ ] **Step 3: Register commands in lib.rs**

Add `meeting_commands::add_meeting_bookmark`, `meeting_commands::update_meeting_bookmark`, `meeting_commands::delete_meeting_bookmark` to the command registration.

- [ ] **Step 4: Add IPC wrappers in ipc.ts**

```typescript
export async function addMeetingBookmark(bookmarkJson: string): Promise<void> {
  await invoke("add_meeting_bookmark", { bookmarkJson });
}

export async function updateMeetingBookmark(bookmarkId: string, note: string | null): Promise<void> {
  await invoke("update_meeting_bookmark", { bookmarkId, note });
}

export async function deleteMeetingBookmark(bookmarkId: string): Promise<void> {
  await invoke("delete_meeting_bookmark", { bookmarkId });
}
```

- [ ] **Step 5: Verify both builds**

Run: `npm run build && cd src-tauri && cargo check`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db/meetings.rs src-tauri/src/commands/meeting_commands.rs src-tauri/src/lib.rs src/lib/ipc.ts
git commit -m "feat(bookmarks): add individual CRUD IPC commands for past meeting bookmark editing"
```

---

### Task 9: Enhance BookmarksTab for Past Meeting Editing

**Files:**
- Modify: `src/launcher/meeting-details/BookmarksTab.tsx`
- Modify: `src/launcher/meeting-details/MeetingDetailsContainer.tsx`

- [ ] **Step 1: Rewrite BookmarksTab with editing, delete, and navigation**

Add inline note editing (same pattern as `BookmarkPanel`), delete button, and clickable timestamps that switch to transcript tab + scroll. Accept callbacks from `MeetingDetailsContainer` for tab switching and state updates.

- [ ] **Step 2: Wire state updates in MeetingDetailsContainer**

After each CRUD IPC call succeeds, update local `meeting` state:
```typescript
setMeeting((prev) => prev ? { ...prev, bookmarks: updatedBookmarks } : prev);
```

- [ ] **Step 3: Verify frontend builds**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/launcher/meeting-details/BookmarksTab.tsx src/launcher/meeting-details/MeetingDetailsContainer.tsx
git commit -m "feat(bookmarks): enhance BookmarksTab with editing, delete, and navigation"
```

---

### Task 10: Add Bookmark Interactions to Past Meeting TranscriptView

**Files:**
- Modify: `src/launcher/meeting-details/TranscriptView.tsx`

- [ ] **Step 1: Add hover bookmark icon and right-click context menu**

Same interactions as live `TranscriptLine` but using IPC CRUD instead of Zustand store:
- Hover: bookmark icon on right edge
- Right-click: `TranscriptContextMenu` with bookmark/note/copy
- Bookmarked lines: show indicator + inline note
- On bookmark create: call `addMeetingBookmark` IPC, update local state
- On bookmark remove: call `deleteMeetingBookmark` IPC, update local state

Pass the meeting's bookmarks array and CRUD callbacks as props.

- [ ] **Step 2: Verify frontend builds**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/launcher/meeting-details/TranscriptView.tsx
git commit -m "feat(bookmarks): add hover/right-click bookmark interactions to past meeting transcript"
```

---

### Task 11: Version Bump and Manual Test

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Bump version**

- [ ] **Step 2: Full build verification**

Run: `npm run build && cd src-tauri && cargo check`

- [ ] **Step 3: Commit**

- [ ] **Step 4: Manual integration test**

1. Start a meeting, create bookmarks (Ctrl+B + line clicks)
2. Verify hybrid toast appears with "+ Note" option
3. Verify bookmark panel shows bookmarks (header toggle)
4. End meeting, open past meeting
5. Verify bookmarks appear in Bookmarks tab
6. Edit a note in past meeting, delete a bookmark
7. Verify right-click context menu works in past meeting transcript
