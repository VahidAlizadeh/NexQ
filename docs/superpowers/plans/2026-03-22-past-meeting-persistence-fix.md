# Past Meeting Persistence Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix past meeting pages to correctly display speaker names, bookmarks, action items, and topic sections — and fix the clipped export dropdown.

**Architecture:** Three-layer fix: (1) transform frontend store objects to match Rust struct shapes before saving, (2) extend Rust `get_meeting` to load from all feature tables and map speaker IDs back to frontend format, (3) restructure tab bar to fix dropdown clipping + add cascade delete on meeting deletion.

**Tech Stack:** TypeScript (React/Zustand), Rust (Tauri 2, rusqlite, serde)

**Spec:** `docs/superpowers/specs/2026-03-22-past-meeting-persistence-fix-design.md`

---

### Task 1: Fix Save Serialization in endMeetingFlow

**Files:**
- Modify: `src/stores/meetingStore.ts:340-389`

- [ ] **Step 1: Replace speakers save block (lines 342-352)**

Replace the current speakers persistence block that sends raw `SpeakerIdentity[]` (which fails Rust deserialization) with a transform that flattens stats, maps `id` → `speaker_id`, and adds `meeting_id`:

```typescript
      try {
        const { useSpeakerStore } = await import("./speakerStore");
        const speakers = useSpeakerStore.getState().getAllSpeakers();
        if (speakers.length > 0) {
          const { saveMeetingSpeakers } = await import("../lib/ipc");
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
          console.log(`[meetingStore] Persisted ${speakers.length} speaker(s) for ${meeting.id}`);
        }
      } catch (err) {
        console.error("[meetingStore] Failed to persist speakers:", err);
      }
```

- [ ] **Step 2: Replace bookmarks save block (lines 354-364)**

Add `meeting_id` to each bookmark:

```typescript
      try {
        const { useBookmarkStore } = await import("./bookmarkStore");
        const bookmarks = useBookmarkStore.getState().bookmarks;
        if (bookmarks.length > 0) {
          const { saveMeetingBookmarks } = await import("../lib/ipc");
          const payload = bookmarks.map((b) => ({ ...b, meeting_id: meeting.id }));
          await saveMeetingBookmarks(meeting.id, JSON.stringify(payload));
          console.log(`[meetingStore] Persisted ${bookmarks.length} bookmark(s) for ${meeting.id}`);
        }
      } catch (err) {
        console.error("[meetingStore] Failed to persist bookmarks:", err);
      }
```

- [ ] **Step 3: Replace action items save block (lines 366-376)**

```typescript
      try {
        const { useActionItemStore } = await import("./actionItemStore");
        const items = useActionItemStore.getState().items;
        if (items.length > 0) {
          const { saveMeetingActionItems } = await import("../lib/ipc");
          const payload = items.map((a) => ({ ...a, meeting_id: meeting.id }));
          await saveMeetingActionItems(meeting.id, JSON.stringify(payload));
          console.log(`[meetingStore] Persisted ${items.length} action item(s) for ${meeting.id}`);
        }
      } catch (err) {
        console.error("[meetingStore] Failed to persist action items:", err);
      }
```

- [ ] **Step 4: Replace topic sections save block (lines 378-388)**

```typescript
      try {
        const { useTopicSectionStore } = await import("./topicSectionStore");
        const sections = useTopicSectionStore.getState().sections;
        if (sections.length > 0) {
          const { saveMeetingTopicSections } = await import("../lib/ipc");
          const payload = sections.map((t) => ({ ...t, meeting_id: meeting.id }));
          await saveMeetingTopicSections(meeting.id, JSON.stringify(payload));
          console.log(`[meetingStore] Persisted ${sections.length} topic section(s) for ${meeting.id}`);
        }
      } catch (err) {
        console.error("[meetingStore] Failed to persist topic sections:", err);
      }
```

- [ ] **Step 5: Verify frontend builds**

Run: `npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/stores/meetingStore.ts
git commit -m "fix(persistence): transform feature store data to match Rust struct shapes before saving"
```

---

### Task 2: Add List Functions for Feature Tables (Rust)

**Files:**
- Modify: `src-tauri/src/db/meetings.rs`

Add 4 query functions after the existing save functions. Each fetches rows from a feature table for a given meeting ID.

- [ ] **Step 1: Add `list_meeting_speakers` function**

Add after line 416 (after the `rename_speaker` function):

```rust
/// List all speakers for a meeting.
pub fn list_meeting_speakers(
    conn: &Connection,
    meeting_id: &str,
) -> Result<Vec<MeetingSpeaker>, DatabaseError> {
    let mut stmt = conn.prepare(
        "SELECT id, meeting_id, speaker_id, display_name, source, color, segment_count, word_count, talk_time_ms
         FROM meeting_speakers
         WHERE meeting_id = ?1",
    )?;

    let rows = stmt
        .query_map(params![meeting_id], |row| {
            Ok(MeetingSpeaker {
                id: row.get(0)?,
                meeting_id: row.get(1)?,
                speaker_id: row.get(2)?,
                display_name: row.get(3)?,
                source: row.get(4)?,
                color: row.get(5)?,
                segment_count: row.get(6)?,
                word_count: row.get(7)?,
                talk_time_ms: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}
```

- [ ] **Step 2: Add `list_meeting_bookmarks` function**

Add after `save_meeting_bookmarks`:

```rust
/// List all bookmarks for a meeting.
pub fn list_meeting_bookmarks(
    conn: &Connection,
    meeting_id: &str,
) -> Result<Vec<MeetingBookmark>, DatabaseError> {
    let mut stmt = conn.prepare(
        "SELECT id, meeting_id, timestamp_ms, note, created_at
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
                note: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}
```

- [ ] **Step 3: Add `list_meeting_action_items` function**

Add after `save_meeting_action_items`:

```rust
/// List all action items for a meeting.
pub fn list_meeting_action_items(
    conn: &Connection,
    meeting_id: &str,
) -> Result<Vec<MeetingActionItem>, DatabaseError> {
    let mut stmt = conn.prepare(
        "SELECT id, meeting_id, text, assignee_speaker_id, timestamp_ms, completed
         FROM meeting_action_items
         WHERE meeting_id = ?1
         ORDER BY timestamp_ms ASC",
    )?;

    let rows = stmt
        .query_map(params![meeting_id], |row| {
            Ok(MeetingActionItem {
                id: row.get(0)?,
                meeting_id: row.get(1)?,
                text: row.get(2)?,
                assignee_speaker_id: row.get(3)?,
                timestamp_ms: row.get(4)?,
                completed: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}
```

- [ ] **Step 4: Add `list_meeting_topic_sections` function**

Add after `save_meeting_topic_sections`:

```rust
/// List all topic sections for a meeting.
pub fn list_meeting_topic_sections(
    conn: &Connection,
    meeting_id: &str,
) -> Result<Vec<MeetingTopicSection>, DatabaseError> {
    let mut stmt = conn.prepare(
        "SELECT id, meeting_id, title, start_ms, end_ms
         FROM meeting_topic_sections
         WHERE meeting_id = ?1
         ORDER BY start_ms ASC",
    )?;

    let rows = stmt
        .query_map(params![meeting_id], |row| {
            Ok(MeetingTopicSection {
                id: row.get(0)?,
                meeting_id: row.get(1)?,
                title: row.get(2)?,
                start_ms: row.get(3)?,
                end_ms: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}
```

- [ ] **Step 5: Verify Rust builds**

Run: `cd src-tauri && cargo check`
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db/meetings.rs
git commit -m "feat(db): add list functions for meeting speakers, bookmarks, action items, topic sections"
```

---

### Task 3: Extend Meeting Struct and get_meeting to Load Feature Tables

**Files:**
- Modify: `src-tauri/src/db/meetings.rs:9-20` (Meeting struct)
- Modify: `src-tauri/src/db/meetings.rs:87-130` (get_meeting function)

- [ ] **Step 1: Add response structs for speaker ID mapping**

Add after the `Meeting` struct (after line 20):

```rust
/// Response struct that maps MeetingSpeaker back to frontend SpeakerIdentity format.
/// `id` = speaker_id (not record UUID), stats nested under `stats`.
#[derive(Debug, Clone, Serialize)]
pub struct MeetingSpeakerResponse {
    pub id: String,
    pub display_name: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub stats: SpeakerStatsResponse,
}

#[derive(Debug, Clone, Serialize)]
pub struct SpeakerStatsResponse {
    pub segment_count: i64,
    pub word_count: i64,
    pub talk_time_ms: i64,
    pub last_spoke_ms: i64,
}

impl From<MeetingSpeaker> for MeetingSpeakerResponse {
    fn from(s: MeetingSpeaker) -> Self {
        MeetingSpeakerResponse {
            id: s.speaker_id,
            display_name: s.display_name,
            source: s.source,
            color: s.color,
            stats: SpeakerStatsResponse {
                segment_count: s.segment_count,
                word_count: s.word_count,
                talk_time_ms: s.talk_time_ms,
                last_spoke_ms: 0, // live-session-only field, not persisted
            },
        }
    }
}
```

- [ ] **Step 2: Extend Meeting struct with feature fields**

Add optional feature fields to the `Meeting` struct (lines 9-20):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub speakers: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub bookmarks: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub action_items: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub topic_sections: Option<serde_json::Value>,
}
```

Note: Using `serde_json::Value` for the new fields avoids needing `Deserialize` on response-only structs. The `#[serde(default)]` ensures deserialization doesn't break when these fields are absent in existing data.

- [ ] **Step 3: Update get_meeting to load feature tables**

Replace lines 121-129 (the segment merge block) with an expanded version that also loads feature data:

```rust
    // Also fetch and merge transcript segments into the transcript array
    let segments = list_transcript_segments(conn, id)?;
    let mut meeting = meeting;
    if !segments.is_empty() {
        meeting.transcript = serde_json::to_value(&segments).unwrap_or(serde_json::json!([]));
    }

    // Load feature tables
    let speakers = list_meeting_speakers(conn, id)?;
    if !speakers.is_empty() {
        let speaker_responses: Vec<MeetingSpeakerResponse> =
            speakers.into_iter().map(|s| s.into()).collect();
        meeting.speakers = Some(serde_json::to_value(&speaker_responses).unwrap_or(serde_json::json!([])));
    }

    let bookmarks = list_meeting_bookmarks(conn, id)?;
    if !bookmarks.is_empty() {
        meeting.bookmarks = Some(serde_json::to_value(&bookmarks).unwrap_or(serde_json::json!([])));
    }

    let action_items = list_meeting_action_items(conn, id)?;
    if !action_items.is_empty() {
        meeting.action_items = Some(serde_json::to_value(&action_items).unwrap_or(serde_json::json!([])));
    }

    let topic_sections = list_meeting_topic_sections(conn, id)?;
    if !topic_sections.is_empty() {
        meeting.topic_sections = Some(serde_json::to_value(&topic_sections).unwrap_or(serde_json::json!([])));
    }

    Ok(meeting)
```

- [ ] **Step 4: Verify Rust builds**

Run: `cd src-tauri && cargo check`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/meetings.rs
git commit -m "feat(db): extend Meeting struct and get_meeting to load all feature tables with speaker ID mapping"
```

---

### Task 4: Add Cascade Delete for Feature Tables

**Files:**
- Modify: `src-tauri/src/db/meetings.rs:236-252` (delete_meeting function)

- [ ] **Step 1: Add DELETE statements for feature tables**

Insert before the existing `DELETE FROM transcript_segments` line (line 238):

```rust
pub fn delete_meeting(conn: &Connection, id: &str) -> Result<(), DatabaseError> {
    // Delete from feature tables first
    conn.execute(
        "DELETE FROM meeting_speakers WHERE meeting_id = ?1",
        params![id],
    )?;
    conn.execute(
        "DELETE FROM meeting_bookmarks WHERE meeting_id = ?1",
        params![id],
    )?;
    conn.execute(
        "DELETE FROM meeting_action_items WHERE meeting_id = ?1",
        params![id],
    )?;
    conn.execute(
        "DELETE FROM meeting_topic_sections WHERE meeting_id = ?1",
        params![id],
    )?;

    // Delete segments
    conn.execute(
        "DELETE FROM transcript_segments WHERE meeting_id = ?1",
        params![id],
    )?;

    let rows = conn.execute("DELETE FROM meetings WHERE id = ?1", params![id])?;
    if rows == 0 {
        return Err(DatabaseError::NotFound(format!(
            "Meeting {} not found",
            id
        )));
    }

    Ok(())
}
```

- [ ] **Step 2: Verify Rust builds**

Run: `cd src-tauri && cargo check`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/db/meetings.rs
git commit -m "fix(db): cascade delete to feature tables when deleting a meeting"
```

---

### Task 5: Fix Export Dropdown Clipping

**Files:**
- Modify: `src/launcher/meeting-details/MeetingTabBar.tsx:19`
- Modify: `src/launcher/meeting-details/ExportDropdown.tsx:120`

- [ ] **Step 1: Restructure MeetingTabBar to isolate overflow**

Replace line 19 (the container div) with a structure that wraps only tabs in the scrollable area:

```tsx
    <div className="relative flex items-center border-b border-border/20 px-3 py-1.5" role="tablist">
      <div className="flex items-center gap-1 overflow-x-auto">
```

Then move the closing `</div>` for the inner wrapper to just before the `{/* Spacer + Export */}` comment (before line 63). The export dropdown container stays in the outer non-overflow div.

- [ ] **Step 2: Change export dropdown direction**

In `ExportDropdown.tsx` line 120, change `bottom-full` and `mb-1.5` to `top-full` and `mt-1.5`:

```tsx
          className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-border/30 bg-card shadow-xl shadow-black/20"
```

- [ ] **Step 3: Verify frontend builds**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/launcher/meeting-details/MeetingTabBar.tsx src/launcher/meeting-details/ExportDropdown.tsx
git commit -m "fix(ui): restructure tab bar overflow and change export dropdown to open downward"
```

---

### Task 6: Version Bump and Build Verification

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Bump version**

```typescript
export const NEXQ_VERSION = "2.2.0";
export const NEXQ_BUILD_DATE = "2026-03-22"; // v2.2.0: Fix past meeting persistence — speaker names, bookmarks, action items, export dropdown
```

- [ ] **Step 2: Full build verification**

Run: `npm run build && cd src-tauri && cargo check`
Expected: Both pass cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/lib/version.ts
git commit -m "chore: bump version to v2.2.0"
```

---

### Task 7: Manual Integration Test

- [ ] **Step 1: Test save + load cycle**

1. Run `npx tauri dev`
2. Start an in-person meeting with Deepgram + diarization
3. Talk to generate transcript with multiple speakers
4. Add a bookmark (Ctrl+B)
5. End the meeting
6. Open the past meeting page
7. Verify: transcript shows diarized speaker names (not "Them")
8. Verify: Speakers tab shows saved speakers with stats
9. Verify: Bookmarks tab shows the bookmark
10. Verify: Export dropdown opens downward and is fully visible

- [ ] **Step 2: Test delete cascade**

1. Delete the test meeting from the past meetings list
2. Verify: no errors in console
3. Verify: meeting is removed from list
