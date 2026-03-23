# Bookmarking System — Design Spec

## Problem

Current bookmarking is minimal: Ctrl+B adds a timestamp-only bookmark with a toast confirmation. No way to add notes, no bookmark panel during live meetings, no way to bookmark specific transcript lines, no way to add or edit bookmarks in past meeting pages.

## Dependency

**Requires SP1 (Past Meeting Persistence Fix) to be implemented first.** This spec assumes bookmarks are already saving and loading correctly via the fixed `endMeetingFlow` serialization and extended `get_meeting` loading.

## Design

### Data Model

Extend `MeetingBookmark` with optional segment anchor:

```typescript
export interface MeetingBookmark {
  id: string;
  timestamp_ms: number;
  segment_id?: string;   // Optional anchor to a specific transcript line
  note?: string;
  created_at: string;
}
```

**DB schema change:** Add `segment_id TEXT` column via `ALTER TABLE meeting_bookmarks ADD COLUMN segment_id TEXT;` in a new migration step in `src-tauri/src/db/migrations.rs`, guarded by a schema version check (increment to v4). Existing rows get `NULL` for `segment_id` which is correct (they have no segment anchor).

**Rust struct change:** Add `pub segment_id: Option<String>` to `MeetingBookmark`. Update `save_meeting_bookmarks` INSERT query to include the `segment_id` column.

### Bookmark Creation Methods

Four ways to create a bookmark during a live meeting:

1. **Ctrl+B** — timestamp bookmark (no segment_id). Hybrid toast appears.
2. **Hover transcript line → click bookmark icon** — segment-anchored bookmark (timestamp_ms + segment_id). Same hybrid toast.
3. **Right-click transcript line → "Bookmark"** — same as hover-click.
4. **Right-click transcript line → "Add Note"** — creates segment-anchored bookmark AND immediately expands the note input in the toast.

### Hybrid Toast

**Implementation:** Standalone component (`BookmarkToast.tsx`), NOT the generic `toastStore`. The hybrid toast needs interactive content (input, Save button, timer pause), singleton behavior (only one at a time, new bookmark replaces previous), and expandable state — none of which fit the current string-based toast system.

When a bookmark is created, the bookmark toast appears:

**Step 1 — Confirmation toast:**
- Green checkmark, "Bookmarked [timestamp]", "+ Note" button, dismiss (X)
- Auto-dismisses after 5 seconds if ignored
- Dismissing saves bookmark without a note

**Step 2 — If user clicks "+ Note":**
- Toast expands to show bookmark icon, timestamp, text input (autofocused), Save button
- Auto-dismiss timer pauses while input is focused
- Enter or Save → saves note, dismisses toast
- Escape → dismisses without note (bookmark still saved)

### Header Bookmark Button

**Current:** Click adds bookmark at current time.

**New:** Click toggles the bookmark panel open/closed (consistent with Speaker Stats and Action Items header button pattern). Icon is filled when panel is open.

Bookmarking is done exclusively via Ctrl+B, hover-click on transcript lines, or right-click context menu.

### Bookmark Panel (Live Meeting)

Appears below transcript, same position/pattern as ActionItemsPanel.

**Layout:**
- Header: "Bookmarks" label + count badge
- List: bookmarks sorted by timestamp (newest first)
- Each row:
  - Timestamp chip (clickable → scrolls transcript to that segment/time, briefly highlights the line)
  - Inline editable note field (placeholder: "Add note...")
  - Delete button (trash icon)
- Empty state: "No bookmarks yet. Press Ctrl+B or click a line to bookmark."

### Transcript Line Interaction

**Hover behavior:**
- Small bookmark icon appears at right edge of the line on hover
- If line is already bookmarked: icon is filled/active
- Click icon: toggles bookmark on/off for that segment. Removing a bookmark is silent (no toast) — the filled icon reverts to outline, and the inline note disappears. This mirrors how toggle actions work elsewhere in the app (mute, panel toggles).

**Right-click context menu** (custom, replaces browser default on transcript lines):
- "Bookmark" (or "Remove Bookmark" if already bookmarked)
- "Add Note" (creates bookmark if not bookmarked, opens note input)
- "Copy Text"

**Bookmarked line display:**
- Small filled bookmark indicator next to speaker label or at right edge
- Note text rendered below the transcript text in dimmed/italic style with a subtle background

### Past Meeting Experience

**Transcript tab:**
- Same hover/right-click interactions as live meeting
- Bookmarked lines show indicator + inline note
- Users can add new bookmarks and notes to past transcripts
- Changes persist to DB immediately via individual CRUD IPC commands
- After each CRUD call succeeds, update the local `meeting` state in `MeetingDetailsContainer` via `setMeeting(prev => ...)` (same optimistic update pattern used for live transcript subscription)

**Bookmarks tab (enhanced):**
- Same list layout as live panel but with full page width
- Click timestamp → switches to transcript tab and auto-scrolls to bookmarked line
- Inline editable notes, delete button
- Empty state: "No bookmarks yet. You can add bookmarks from the Transcript tab."

### IPC Commands (New)

Past meeting bookmark editing requires individual CRUD commands (not the bulk save used at meeting end):

```rust
// Add a single bookmark to a past meeting
add_meeting_bookmark(meeting_id: String, bookmark_json: String) -> Result<(), String>

// Update a bookmark's note (or segment_id)
update_meeting_bookmark(bookmark_id: String, note: Option<String>) -> Result<(), String>

// Delete a single bookmark
delete_meeting_bookmark(bookmark_id: String) -> Result<(), String>
```

Frontend typed wrappers added to `src/lib/ipc.ts`.

### Bookmark Navigation

Clicking a bookmark's timestamp (in panel or Bookmarks tab) triggers scroll-to behavior:

**During live meeting:**
- Find segment by `segment_id` if present, else find nearest segment by `timestamp_ms`
- Scroll transcript to that segment, briefly highlight with a fade animation

**In past meeting (Bookmarks tab → Transcript tab):**
- Switch active tab to "transcript"
- After tab switch, scroll to the bookmarked segment
- Same highlight animation

### Files Affected

**New files:**
- `src/overlay/BookmarkPanel.tsx` — live meeting bookmark panel
- `src/overlay/BookmarkToast.tsx` — standalone hybrid toast (singleton, expandable note input)
- `src/overlay/TranscriptContextMenu.tsx` — shared context menu for transcript lines (used in both live and past meeting). Receives a `mode` callback prop: live mode mutates Zustand store, past mode calls IPC directly. Dismiss on click-outside, Escape, or item selection.

**Modified files:**
- `src/lib/types.ts` — add `segment_id` to `MeetingBookmark`
- `src/stores/bookmarkStore.ts` — add `segment_id` support, `updateBookmarkNote`, `toggleBookmark(segmentId, timestampMs)`
- `src/hooks/useBookmarkHotkey.ts` — update toast to hybrid design
- `src/overlay/OverlayView.tsx` — header button becomes panel toggle, add BookmarkPanel
- `src/overlay/TranscriptLine.tsx` — add hover bookmark icon, right-click handler, bookmarked line indicator + note display
- `src/overlay/TranscriptPanel.tsx` — integrate context menu
- `src/launcher/meeting-details/TranscriptView.tsx` — same hover/right-click/indicator as live, CRUD via IPC
- `src/launcher/meeting-details/BookmarksTab.tsx` — enhance with editing, navigation
- `src/launcher/meeting-details/MeetingDetailsContainer.tsx` — tab switching on bookmark click
- `src/lib/ipc.ts` — add individual bookmark CRUD wrappers
- `src-tauri/src/db/meetings.rs` — add `segment_id` to struct, add CRUD functions, update save INSERT query
- `src-tauri/src/db/migrations.rs` — add migration step for `segment_id` column (schema v4)
- `src-tauri/src/commands/meeting_commands.rs` — add CRUD command handlers
- `src-tauri/src/lib.rs` — register new commands
- `src/lib/version.ts` — version bump

## Edge Cases

- **Bookmark without segment_id:** Global Ctrl+B creates timestamp-only bookmarks. Navigation finds nearest segment by timestamp.
- **Deleted segment:** If a segment is removed (e.g., by merging), bookmark keeps `segment_id` but falls back to timestamp navigation.
- **Rapid bookmarking:** Debounce hover-click to prevent double-creates. BookmarkToast is singleton — new bookmark replaces the previous toast.
- **Un-bookmark:** Toggle off is silent (no toast), icon reverts, inline note disappears.
- **Note length:** Max 500 characters in inline editors to prevent accidental paste of huge text.
- **Bookmark panel + Action Items panel:** Both can be open simultaneously — they stack vertically in the bottom area.
- **Panel auto-scroll:** When a new bookmark is created while panel is open, panel scrolls to show the new entry at the top.
- **Past meeting without saved bookmarks:** Empty state in both transcript (no indicators) and Bookmarks tab.
- **Online mode meetings:** Same bookmark interactions — no dependency on diarization or in-person mode.

## Out of Scope

- Bookmark export (covered by existing JSON/Markdown export once persistence is fixed in SP1)
- Bookmark sharing or collaboration
- AI-suggested bookmarks (could be an SP5 innovation)
