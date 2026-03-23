# Past Meeting Persistence Fix — Design Spec

## Problem

After ending an in-person meeting:
1. Past meeting transcript shows all segments as "Them" instead of diarized speaker names
2. Bookmarks, action items, and topic sections are empty in past meeting pages
3. Export dropdown is clipped/hidden behind other elements

## Root Causes

### 1. Save Serialization Mismatch (speakers, bookmarks, action items, topic sections)

Frontend `endMeetingFlow` (meetingStore.ts:340-389) serializes Zustand store objects directly via `JSON.stringify()`, but the Rust backend expects different shapes.

**Speakers — 3 mismatches:**
- Frontend `SpeakerIdentity.id` = speaker key (e.g. `"speaker_0"`). Rust `MeetingSpeaker.id` = record UUID, with separate `speaker_id` field.
- Frontend nests stats under `stats: { segment_count, word_count, talk_time_ms }`. Rust expects flat fields.
- Frontend omits `meeting_id`. Rust struct requires it.

Result: `serde_json::from_str::<Vec<MeetingSpeaker>>()` fails → speakers never saved.

**Bookmarks — 1 mismatch:**
- Frontend `MeetingBookmark` omits `meeting_id`. Rust `MeetingBookmark` requires it.

**Action items — 1 mismatch:**
- Frontend `ActionItem` omits `meeting_id`. Rust `MeetingActionItem` requires it.

**Topic sections — 1 mismatch:**
- Frontend `TopicSection` omits `meeting_id`. Rust `MeetingTopicSection` requires it.

### 2. Meeting Load Doesn't Include Feature Data

Rust `get_meeting` (meetings.rs:87-130) only queries the `meetings` table and `transcript_segments`. It never fetches from `meeting_speakers`, `meeting_bookmarks`, `meeting_action_items`, or `meeting_topic_sections`.

Frontend `Meeting` type expects optional `speakers`, `bookmarks`, `action_items`, `topic_sections` fields — they're always `undefined`.

`TranscriptView.resolveSpeakerLabel()` checks `speakerMap` (built from `meeting.speakers`) — when null, falls through to `getSpeakerLabel(seg.speaker)` which returns `"Them"`.

### 3. Export Dropdown Clipped

`MeetingTabBar` (line 19) has `overflow-x-auto`. Per CSS spec, when `overflow-x` is not `visible`, browsers coerce `overflow-y` to `auto`. The `ExportDropdown` uses `bottom-full` (opens upward) inside this container — gets clipped.

## Design

### Component 1: Fix Save Serialization in endMeetingFlow

**File:** `src/stores/meetingStore.ts` (Phase 7b, lines 340-389)

Transform frontend store objects into the shape Rust expects before `JSON.stringify()`.

**Speakers (line 344-349):**
```typescript
const speakers = useSpeakerStore.getState().getAllSpeakers();
if (speakers.length > 0) {
  const payload = speakers.map((s) => ({
    id: crypto.randomUUID(),
    meeting_id: meeting.id,
    speaker_id: s.id,
    display_name: s.display_name,
    source: s.source,
    color: s.color ?? null,
    segment_count: s.stats.segment_count,
    word_count: s.stats.word_count,
    talk_time_ms: s.stats.talk_time_ms,
  }));
  await saveMeetingSpeakers(meeting.id, JSON.stringify(payload));
}
```

**Bookmarks (line 356-361):**
```typescript
const bookmarks = useBookmarkStore.getState().bookmarks;
if (bookmarks.length > 0) {
  const payload = bookmarks.map((b) => ({ ...b, meeting_id: meeting.id }));
  await saveMeetingBookmarks(meeting.id, JSON.stringify(payload));
}
```

**Action items (line 368-373):**
```typescript
const items = useActionItemStore.getState().items;
if (items.length > 0) {
  const payload = items.map((a) => ({ ...a, meeting_id: meeting.id }));
  await saveMeetingActionItems(meeting.id, JSON.stringify(payload));
}
```

**Topic sections (line 380-385):**
```typescript
const sections = useTopicSectionStore.getState().sections;
if (sections.length > 0) {
  const payload = sections.map((t) => ({ ...t, meeting_id: meeting.id }));
  await saveMeetingTopicSections(meeting.id, JSON.stringify(payload));
}
```

### Component 2: Extend Rust `get_meeting` to Load Feature Tables

**File:** `src-tauri/src/db/meetings.rs`

**Extend `Meeting` struct:**
```rust
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration_seconds: Option<i64>,
    pub transcript: serde_json::Value,
    pub ai_interactions: serde_json::Value,
    pub summary: Option<String>,
    pub config_snapshot: Option<serde_json::Value>,
    // New fields:
    pub speakers: Option<Vec<MeetingSpeaker>>,
    pub bookmarks: Option<Vec<MeetingBookmark>>,
    pub action_items: Option<Vec<MeetingActionItem>>,
    pub topic_sections: Option<Vec<MeetingTopicSection>>,
}
```

Use `#[serde(skip_serializing_if = "Option::is_none")]` on each new field to keep backward compatibility.

**Add 4 list functions:**
```rust
fn list_meeting_speakers(conn: &Connection, meeting_id: &str) -> Result<Vec<MeetingSpeaker>, DatabaseError>;
fn list_meeting_bookmarks(conn: &Connection, meeting_id: &str) -> Result<Vec<MeetingBookmark>, DatabaseError>;
fn list_meeting_action_items(conn: &Connection, meeting_id: &str) -> Result<Vec<MeetingActionItem>, DatabaseError>;
fn list_meeting_topic_sections(conn: &Connection, meeting_id: &str) -> Result<Vec<MeetingTopicSection>, DatabaseError>;
```

Each is a simple `SELECT * FROM <table> WHERE meeting_id = ?1` with ordering: speakers by insertion order, bookmarks by `timestamp_ms ASC`, action items by `timestamp_ms ASC`, topic sections by `start_ms ASC`.

**Update `get_meeting`:** After fetching base meeting and transcript segments, call the 4 list functions. Set each as `Some(vec)` if non-empty, `None` if empty.

**Speaker ID mapping for frontend:** The `MeetingSpeaker` struct has both `id` (record UUID) and `speaker_id` (the key). The frontend `SpeakerIdentity` expects `id` to be the speaker key. Options:
- A: Rename `speaker_id` → `id` in serialization via `#[serde(rename)]`
- B: Add a separate serialization step in the command handler

Approach A is cleanest. Add a custom serialization for the meeting response that maps `speaker_id` → `id` and nests stats back under `stats`. This can be done with a `MeetingSpeakerResponse` struct:

```rust
#[derive(Serialize)]
struct MeetingSpeakerResponse {
    id: String,           // speaker_id value
    display_name: String,
    source: String,
    color: Option<String>,
    stats: SpeakerStatsResponse,
}

#[derive(Serialize)]
struct SpeakerStatsResponse {
    segment_count: i64,
    word_count: i64,
    talk_time_ms: i64,
    last_spoke_ms: i64, // always 0 — live-session-only field, not persisted to DB
}
```

Convert `MeetingSpeaker` → `MeetingSpeakerResponse` in `get_meeting` before returning.

### Component 3: Fix Export Dropdown Clipping

**Files:** `src/launcher/meeting-details/MeetingTabBar.tsx`, `src/launcher/meeting-details/ExportDropdown.tsx`

Two changes:

**A) Restructure MeetingTabBar** to isolate the overflow container from the export button. Wrap only the tab buttons in a scrollable inner div, keeping the export button outside:

```tsx
<div className="relative flex items-center border-b border-border/20 px-3 py-1.5">
  {/* Scrollable tabs */}
  <div className="flex items-center gap-1 overflow-x-auto">
    <TabButton ... />
    ...
  </div>
  {/* Export — outside scroll container */}
  <div className="ml-auto flex items-center pl-2">
    <ExportDropdown meeting={meeting} />
  </div>
</div>
```

**B) Change dropdown direction** (ExportDropdown.tsx line 120):
```tsx
// Before: bottom-full (opens up)
// After:  top-full (opens down — ample space in the content area below)
className="absolute right-0 top-full z-50 mt-1.5 w-52 ..."
```

### Component 4: Cascade Delete for Feature Tables

**File:** `src-tauri/src/db/meetings.rs` — `delete_meeting` function

Currently only deletes from `transcript_segments` and `meetings`. Now that feature tables will have data, add cleanup:

```rust
conn.execute("DELETE FROM meeting_speakers WHERE meeting_id = ?1", params![id])?;
conn.execute("DELETE FROM meeting_bookmarks WHERE meeting_id = ?1", params![id])?;
conn.execute("DELETE FROM meeting_action_items WHERE meeting_id = ?1", params![id])?;
conn.execute("DELETE FROM meeting_topic_sections WHERE meeting_id = ?1", params![id])?;
```

Run these before deleting the meeting record to prevent orphaned rows.

## Data Flow (End-to-End After Fix)

### Save Path (meeting ends)
```
endMeetingFlow Phase 7b
  → Transform SpeakerIdentity[] to MeetingSpeaker[] format (flatten stats, add meeting_id, map id → speaker_id)
  → Transform MeetingBookmark[] (add meeting_id)
  → Transform ActionItem[] (add meeting_id)
  → Transform TopicSection[] (add meeting_id)
  → saveMeetingSpeakers(meeting_id, JSON)
  → saveMeetingBookmarks(meeting_id, JSON)
  → saveMeetingActionItems(meeting_id, JSON)
  → saveMeetingTopicSections(meeting_id, JSON)
  → All INSERT into respective tables ✓
```

### Load Path (past meeting page)
```
getMeeting(meetingId)
  → Rust get_meeting():
    → SELECT from meetings table
    → SELECT from transcript_segments (with speaker_id)
    → SELECT from meeting_speakers → convert to SpeakerIdentity format
    → SELECT from meeting_bookmarks
    → SELECT from meeting_action_items
    → SELECT from meeting_topic_sections
  → Return complete Meeting JSON

Frontend MeetingDetails:
  → meeting.speakers → SpeakerIdentity[] → speakerMap
  → TranscriptView: seg.speaker_id → speakerMap.get() → display_name ✓
  → BookmarksTab: meeting.bookmarks → display ✓
  → ActionItemsTab: meeting.action_items → display ✓
  → SpeakersTab: meeting.speakers → display ✓
```

## Out of Scope

- Action item detection (Sub-project 3)
- Enhanced bookmarking flow (Sub-project 2)
- Past meeting transcript search (Sub-project 4)
- Live meeting bugs (addressed in prior speaker-labeling-fix spec)

## Notes

- **`last_spoke_ms`** is a live-session-only field. The DB `meeting_speakers` table does not store it. Loaded speakers get `last_spoke_ms: 0`. No frontend code for past meetings reads this field.
- **Version bump required:** Update `src/lib/version.ts` (NEXQ_VERSION + NEXQ_BUILD_DATE) after implementation.
