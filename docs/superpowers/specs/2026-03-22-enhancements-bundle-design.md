# Enhancements Bundle — Design Spec

Five independent improvements bundled into one spec. Each can be implemented and committed separately.

## Dependency

**Requires SP1 (Past Meeting Persistence Fix)** — speaker names and bookmarks must be loading correctly.
**Requires SP2 (Bookmarking System)** — for AI-suggested bookmarks and export with bookmarks.

---

## Enhancement 1: AI-Suggested Bookmarks

### Problem

After a meeting, users must manually review the transcript to find key moments. The LLM can identify decisions, agreements, topic changes, and important statements automatically.

### Design

**Pattern:** Same as action items extraction (SP3) — on-demand LLM call from past meeting page.

**Trigger:** "Suggest Bookmarks" button in the Bookmarks tab (next to the empty state or at the top of the bookmark list).

**Flow:**
1. User clicks "Suggest Bookmarks"
2. LLM analyzes full transcript and identifies key moments (decisions, agreements, topic transitions, important statements)
3. Results displayed as a "Suggested Bookmarks" section — each with:
   - Timestamp chip
   - AI-generated note describing why this moment is important
   - Accept button (creates a real bookmark) / Dismiss button (removes suggestion)
   - "Accept All" bulk action
4. Accepted suggestions become regular bookmarks (saved to DB)
5. Dismissed suggestions disappear (not persisted)

**LLM invocation:** Uses `generate_assist` with a new `IntelligenceMode: "BookmarkSuggestions"`. Prompt instructs LLM to return JSON array:
```json
[{ "timestamp_ms": 123456, "segment_id": "seg_abc", "note": "Key decision: deadline extended to March 28" }]
```

**Hook:** `useBookmarkSuggestions(meeting, onSuggestionsReceived)` — mirrors `useSummaryGeneration` pattern (stream events, accumulate, parse JSON, defensive extraction).

**UI distinction:** Suggested bookmarks appear with a subtle AI sparkle icon and dashed border to distinguish from user-created bookmarks. Once accepted, they look identical to normal bookmarks.

### Files Affected

**New:** `src/hooks/useBookmarkSuggestions.ts`
**Modified:** `src/launcher/meeting-details/BookmarksTab.tsx`, `src/lib/types.ts` (add `"BookmarkSuggestions"` to `IntelligenceMode`; `segment_id` already added by SP2), `src-tauri/src/intelligence/` (prompt template + mode handling in `mod.rs`), `src/lib/ipc.ts`

**Note:** `segment_id` on `MeetingBookmark` is added by SP2. This enhancement depends on SP2 being implemented first.

---

## Enhancement 2: Speaker Temporal Timeline

### Problem

The SpeakersTab shows total talk time percentages but not WHEN speakers talked during the meeting. A temporal timeline reveals meeting dynamics — who dominated early, where handoffs occurred, silent periods.

### Design

**Location:** `src/launcher/meeting-details/SpeakersTab.tsx` — add timeline visualization above the speaker list.

**Layout:** One horizontal row per speaker, stacked vertically. X-axis = meeting duration (0 to end). Each row shows colored blocks where that speaker has transcript segments.

```
Speaker 1  ████  ██  ████████    ██
Speaker 2       ██████     ██  ████████
Room       ██                          ██
           |         |         |         |
           0m       10m       20m       30m
```

**Data source:** Iterate `meeting.transcript` segments. For each segment, map `speaker_id` to speaker, render a block at `(timestamp_ms - meeting_start) / total_duration` position. Block width = estimated duration (next segment start or word_count * 200ms).

**Interaction:**
- Hover a block → tooltip shows timestamp + first few words of transcript
- Click a block → switches to Transcript tab and scrolls to that segment

**Visual:**
- Each row height: 12px
- Block color: speaker's color from saved speakers
- Background: `bg-muted/10` with subtle time axis markers every 5 or 10 minutes
- Compact — should not dominate the page (max ~100px total height)

### Files Affected

**Note:** `TranscriptView.tsx` already has a `TimelineScrubber` component with speaker-colored blocks. Extract the existing timeline logic into a shared component and reuse it here rather than building from scratch. Use the same color source as `SpeakersTab` rows for visual consistency.

**New:** `src/launcher/meeting-details/SpeakerTimeline.tsx` (extracted from existing `TimelineScrubber` logic in `TranscriptView.tsx`)
**Modified:** `src/launcher/meeting-details/SpeakersTab.tsx` (render timeline above speaker list), `src/launcher/meeting-details/MeetingDetailsContainer.tsx` (thread `setActiveTab` + scroll-to-segment callback through SpeakersTab → SpeakerTimeline for click-to-jump)

---

## Enhancement 3: Export with Speaker Names + Bookmarks

### Problem

Current Markdown and SRT exports use `getSpeakerLabel(seg.speaker)` which returns "Them"/"User" instead of diarized speaker names. Bookmarks are not included in text exports (only in JSON export).

### Design

**File:** `src/lib/export.ts`

**Speaker name resolution:** Build a `speakerMap` from `meeting.speakers` (same pattern as `TranscriptView`), then use it in all export functions:

```typescript
function resolveSpeaker(seg: TranscriptSegment, speakerMap: Map<string, SpeakerIdentity> | null): string {
  if (speakerMap && seg.speaker_id) {
    const s = speakerMap.get(seg.speaker_id);
    if (s) return s.display_name;
  }
  return getSpeakerLabel(seg.speaker);
}
```

**Apply to:**
- `exportToMarkdown` (line 55): `getSpeakerLabel(seg.speaker)` → `resolveSpeaker(seg, speakerMap)`
- `exportToSRT` (line 98): same change. Signature must change to accept `speakers?: SpeakerIdentity[]` since it currently only receives `segments` and `startMs`
- `exportStudyNotes`: same change
- `exportMeetingMinutes`: two call sites for `getSpeakerLabel` — both must be updated

**Bookmarks in Markdown export:** Add a "Bookmarks" section after Action Items:

```markdown
## Bookmarks

- **[12:34]** Key decision about Q3 deadline
- **[18:02]** *(no note)*
```

Only include if `meeting.bookmarks` is non-empty.

**SRT export:** No bookmark inclusion (not appropriate for subtitle format).

### Files Affected

**Modified:** `src/lib/export.ts` (speaker resolution + bookmark section in Markdown exports), `src/launcher/meeting-details/MeetingDetailsContainer.tsx` (remove duplicate `meetingToMarkdown` inline function at lines 174-194, use shared `exportToMarkdown` instead)

---

## Enhancement 4: Keyboard Shortcuts in Live Meeting

### Problem

During a live meeting, common actions require mouse clicks on small header buttons. Power users benefit from keyboard shortcuts for frequently used actions.

### Design

**New file:** `src/hooks/useMeetingShortcuts.ts`

Single hook that registers all live meeting keyboard shortcuts. Respects the existing guard: shortcuts disabled when focus is in an input/textarea/contentEditable element.

**Shortcuts:**

| Key | Action | Notes |
|-----|--------|-------|
| `B` | Add bookmark | Same as Ctrl+B but single key (already guarded for inputs) |
| `S` | Toggle speaker stats panel | |
| `K` | Toggle bookmark panel (SP2) | Requires SP2 bookmark panel in overlay |
| `M` | Toggle mute mic (You) | Mic only, not system audio |
| `Escape` | Close all open panels | Closes ALL open panels at once (stats, bookmarks, etc.) |

**Implementation:**
- Single `keydown` listener in the hook
- Check `isRecording` before any action
- Check `isInputFocused()` guard (same logic as `useBookmarkHotkey`)
- Actions call existing store methods / state toggles from `OverlayView`

**Discoverability:** Tooltips on header buttons already exist — append shortcut hint: "Speaker Stats (S)", "Bookmarks (K)", etc.

**Ctrl+B still works** — the single-key `B` is an additional shortcut, not a replacement.

### Files Affected

**Note:** This hook consolidates all overlay keyboard handling (absorb existing Ctrl+Shift+L dev log shortcut from `OverlayView` and Ctrl+B from `useBookmarkHotkey`) into a single listener to avoid proliferation.

**New:** `src/hooks/useMeetingShortcuts.ts`
**Modified:** `src/overlay/OverlayView.tsx` (register hook, pass toggle functions, update tooltips, remove inline keydown listener)

---

## Enhancement 5: Smart Transcript Merging

### Problem

Deepgram sends many short fragments back-to-back from the same speaker, resulting in cluttered transcripts with repetitive speaker labels and timestamps that don't add value. However, merging too aggressively creates huge paragraphs that lose temporal precision.

### Design

**Merge rule:** Consecutive final segments from the same `speaker_id` are merged if:
1. Same speaker identity: match on `speaker_id` when present, fall back to `speaker` field for non-diarized meetings where `speaker_id` is undefined
2. Time gap between segments ≤ 3 seconds (configurable constant)
3. Merged text length would not exceed 300 characters (prevents huge paragraphs)

If any condition fails, start a new line.

**Result:** The merged segment keeps:
- `id` of the first segment in the group
- `timestamp_ms` of the first segment (preserves temporal anchor)
- `text` = concatenation of all segment texts (trimmed) with single space separator
- `speaker` / `speaker_id` from the first segment
- `is_final: true`, `confidence` = minimum of merged segments (preserves low-confidence signal)

**Where to merge:**

**Option A (display-only):** Merge in the UI layer (`TranscriptLine` / `TranscriptView`) using a `useMemo` that groups consecutive same-speaker segments. Original segments stay untouched in the store and DB. This is safer — no data loss, and search still works on individual segments.

**Option B (store-level):** Merge in `useTranscript.ts` processSpeaker before storing. Fewer segments in store = better performance, but loses individual segment granularity.

**Recommended: Option A (display-only).** A `mergeConsecutiveSegments(segments)` utility function used in both live `TranscriptPanel` and past meeting `TranscriptView`. The raw segments remain in the store for search, bookmarking, and export.

**Merge utility:**
```typescript
function mergeConsecutiveSegments(segments: TranscriptSegment[]): MergedSegment[] {
  // Group consecutive same-speaker segments within time/length thresholds
  // Return MergedSegment[] with originalIds[] for search highlighting
}

interface MergedSegment extends TranscriptSegment {
  mergedCount: number;       // How many segments were merged
  originalIds: string[];     // For search hit mapping and bookmark anchoring
}
```

**Search integration:** Search runs on the merged text (since that's what the user sees). When a match is found in a merged line, it highlights normally. The `originalIds` array is used for bookmark indicator mapping, not search — search operates on the display layer after merging.

**Bookmark integration:** Bookmarks anchor to individual `segment_id`s. The merged display shows the bookmark indicator if any of its `originalIds` match a bookmarked segment.

**Constants:**
```typescript
const MERGE_GAP_MS = 3000;       // Max time gap between mergeable segments
const MERGE_MAX_CHARS = 300;     // Max merged text length before forcing new line
```

### Files Affected

**New:** `src/lib/mergeSegments.ts` (pure utility function)
**Modified:** `src/overlay/TranscriptPanel.tsx` (apply merge to display), `src/launcher/meeting-details/TranscriptView.tsx` (same), `src/overlay/TranscriptLine.tsx` (handle `mergedCount` display)

---

## Notes

- Each enhancement is independently implementable and committable
- Version bump (`src/lib/version.ts`) after each enhancement or once at the end
- Enhancements 1, 3 depend on SP1+SP2. Enhancements 2, 4, 5 can be implemented in parallel with SP2/SP3.
