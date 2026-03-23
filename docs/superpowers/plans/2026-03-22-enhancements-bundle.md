# Enhancements Bundle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five independent improvements: AI-suggested bookmarks, speaker temporal timeline, export with speaker names + bookmarks, keyboard shortcuts, smart transcript merging.

**Architecture:** Each enhancement is self-contained. They share no state or components. Implement and commit each independently.

**Tech Stack:** TypeScript (React/Zustand), Rust (Tauri 2), Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-22-enhancements-bundle-design.md`

**Depends on:** SP1 + SP2 (for enhancements 1, 3). Enhancements 2, 4, 5 have no SP2/SP3 dependency.

---

### Task 1: Enhancement 3 — Export with Speaker Names + Bookmarks

Start with this one — smallest, immediate value once SP1 lands.

**Files:**
- Modify: `src/lib/export.ts`
- Modify: `src/launcher/meeting-details/MeetingDetailsContainer.tsx` (remove duplicate `meetingToMarkdown`)

- [ ] **Step 1: Add resolveSpeaker utility to export.ts**

```typescript
import type { SpeakerIdentity } from "./types";

function buildSpeakerMap(speakers?: SpeakerIdentity[]): Map<string, SpeakerIdentity> | null {
  if (!speakers || speakers.length === 0) return null;
  const map = new Map<string, SpeakerIdentity>();
  for (const s of speakers) map.set(s.id, s);
  return map;
}

function resolveSpeaker(
  seg: TranscriptSegment,
  speakerMap: Map<string, SpeakerIdentity> | null
): string {
  if (speakerMap && seg.speaker_id) {
    const s = speakerMap.get(seg.speaker_id);
    if (s) return s.display_name;
  }
  return getSpeakerLabel(seg.speaker);
}
```

- [ ] **Step 2: Update all export functions to use resolveSpeaker**

In `exportToMarkdown`: build `speakerMap` from `meeting.speakers`, replace `getSpeakerLabel(seg.speaker)` with `resolveSpeaker(seg, speakerMap)`.

In `exportToSRT`: change signature to `exportToSRT(segments, startMs, speakers?)`, build speakerMap, use `resolveSpeaker`. Update callers.

In `exportStudyNotes` and `exportMeetingMinutes`: same pattern — both have `getSpeakerLabel` calls that need replacing.

- [ ] **Step 3: Add bookmarks section to Markdown export**

In `exportToMarkdown`, after the action items section:

```typescript
  if (meeting.bookmarks && meeting.bookmarks.length > 0) {
    md += `## Bookmarks\n\n`;
    const sortedBookmarks = [...meeting.bookmarks].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
    for (const b of sortedBookmarks) {
      const ts = formatTimestamp(Math.max(0, b.timestamp_ms - startMs));
      md += b.note
        ? `- **[${ts}]** ${b.note}\n`
        : `- **[${ts}]** *(no note)*\n`;
    }
    md += "\n";
  }
```

- [ ] **Step 4: Remove duplicate meetingToMarkdown from MeetingDetailsContainer**

Delete the inline `meetingToMarkdown` function (lines 174-194) and its `handleExport` callback. Use the shared `exportMeetingAsMarkdown` from `export.ts` instead.

- [ ] **Step 5: Verify build and commit**

```bash
git add src/lib/export.ts src/launcher/meeting-details/MeetingDetailsContainer.tsx
git commit -m "fix(export): resolve speaker display names and include bookmarks in Markdown export"
```

---

### Task 2: Enhancement 5 — Smart Transcript Merging

**Files:**
- Create: `src/lib/mergeSegments.ts`
- Modify: `src/overlay/TranscriptPanel.tsx`
- Modify: `src/launcher/meeting-details/TranscriptView.tsx`

- [ ] **Step 1: Create mergeSegments utility**

```typescript
import type { TranscriptSegment } from "./types";

export interface MergedSegment extends TranscriptSegment {
  mergedCount: number;
  originalIds: string[];
}

const MERGE_GAP_MS = 3000;
const MERGE_MAX_CHARS = 300;

function speakerKey(seg: TranscriptSegment): string {
  return seg.speaker_id ?? seg.speaker;
}

export function mergeConsecutiveSegments(segments: TranscriptSegment[]): MergedSegment[] {
  if (segments.length === 0) return [];

  const result: MergedSegment[] = [];
  let current: MergedSegment = {
    ...segments[0],
    mergedCount: 1,
    originalIds: [segments[0].id],
  };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const gap = seg.timestamp_ms - current.timestamp_ms;
    const sameKey = speakerKey(seg) === speakerKey(current);
    const wouldExceedLength = (current.text + " " + seg.text.trim()).length > MERGE_MAX_CHARS;

    if (sameKey && gap <= MERGE_GAP_MS && !wouldExceedLength && seg.is_final) {
      current = {
        ...current,
        text: current.text + " " + seg.text.trim(),
        confidence: Math.min(current.confidence, seg.confidence),
        mergedCount: current.mergedCount + 1,
        originalIds: [...current.originalIds, seg.id],
      };
    } else {
      result.push(current);
      current = {
        ...seg,
        mergedCount: 1,
        originalIds: [seg.id],
      };
    }
  }
  result.push(current);

  return result;
}
```

- [ ] **Step 2: Apply merging in TranscriptPanel (live meeting)**

In `src/overlay/TranscriptPanel.tsx`, wrap the segments with `useMemo`:

```typescript
import { mergeConsecutiveSegments } from "../lib/mergeSegments";

const mergedSegments = useMemo(
  () => mergeConsecutiveSegments(segments.filter((s) => s.is_final)),
  [segments]
);
```

Use `mergedSegments` for rendering and search filtering instead of raw `segments`.

- [ ] **Step 3: Apply merging in TranscriptView (past meeting)**

Same pattern in `src/launcher/meeting-details/TranscriptView.tsx`.

- [ ] **Step 4: Verify build and commit**

```bash
git add src/lib/mergeSegments.ts src/overlay/TranscriptPanel.tsx src/launcher/meeting-details/TranscriptView.tsx
git commit -m "feat(transcript): add smart merging of consecutive same-speaker segments"
```

---

### Task 3: Enhancement 2 — Speaker Temporal Timeline

**Files:**
- Create: `src/launcher/meeting-details/SpeakerTimeline.tsx`
- Modify: `src/launcher/meeting-details/SpeakersTab.tsx`
- Modify: `src/launcher/meeting-details/MeetingDetailsContainer.tsx`

- [ ] **Step 1: Check existing TimelineScrubber in TranscriptView.tsx**

Read the `TimelineScrubber` component in `TranscriptView.tsx` to understand its implementation. Extract reusable logic or reference its approach.

- [ ] **Step 2: Create SpeakerTimeline component**

Horizontal rows per speaker showing colored blocks where they talked. X-axis = meeting duration.

```typescript
interface SpeakerTimelineProps {
  segments: TranscriptSegment[];
  speakers: SpeakerIdentity[];
  meetingStartMs: number;
  meetingEndMs: number;
  onSegmentClick?: (segmentIndex: number) => void;
}
```

- Each speaker gets a 12px row
- Blocks positioned at `(seg.timestamp_ms - start) / duration * 100%`
- Block width = time to next segment or `wordCount * 200ms`
- Color from speaker data
- Hover tooltip: timestamp + first 50 chars of text
- Click fires `onSegmentClick`

- [ ] **Step 3: Render in SpeakersTab above the speaker list**

- [ ] **Step 4: Wire onSegmentClick to switch to Transcript tab + scroll**

Thread `setActiveTab` callback from `MeetingDetailsContainer` through `SpeakersTab`.

- [ ] **Step 5: Verify build and commit**

```bash
git add src/launcher/meeting-details/SpeakerTimeline.tsx src/launcher/meeting-details/SpeakersTab.tsx src/launcher/meeting-details/MeetingDetailsContainer.tsx
git commit -m "feat(speakers): add temporal timeline visualization showing when each speaker talked"
```

---

### Task 4: Enhancement 4 — Keyboard Shortcuts in Live Meeting

**Files:**
- Create: `src/hooks/useMeetingShortcuts.ts`
- Modify: `src/overlay/OverlayView.tsx`

- [ ] **Step 1: Create useMeetingShortcuts hook**

```typescript
import { useEffect } from "react";
import { useMeetingStore } from "../stores/meetingStore";

interface ShortcutActions {
  addBookmark: () => void;
  toggleStats: () => void;
  toggleBookmarks: () => void;
  toggleMute: () => void;
  closeAllPanels: () => void;
  toggleDevLog: () => void;
}

export function useMeetingShortcuts(actions: ShortcutActions) {
  const isRecording = useMeetingStore((s) => s.isRecording);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isRecording) return;

      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // Escape always works (even in inputs)
      if (e.key === "Escape") {
        actions.closeAllPanels();
        return;
      }

      // Single-key shortcuts only outside inputs
      if (isInput) return;

      // Ctrl+B: bookmark (existing behavior)
      if (e.ctrlKey && e.key === "b" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        actions.addBookmark();
        return;
      }

      // Ctrl+Shift+L: dev log (existing behavior, consolidated here)
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        e.preventDefault();
        actions.toggleDevLog();
        return;
      }

      // Single-key shortcuts
      switch (e.key.toLowerCase()) {
        case "b": actions.addBookmark(); break;
        case "s": actions.toggleStats(); break;
        case "k": actions.toggleBookmarks(); break;
        case "m": actions.toggleMute(); break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isRecording, actions]);
}
```

- [ ] **Step 2: Wire into OverlayView and remove old keyboard listeners**

1. Remove the existing inline `keydown` listener for Ctrl+Shift+L
2. Remove `useBookmarkHotkey` usage (consolidated into this hook)
3. Call `useMeetingShortcuts({ addBookmark, toggleStats, toggleBookmarks, toggleMute, closeAllPanels, toggleDevLog })`
4. Update header button tooltips: "Speaker Stats (S)", "Bookmarks (K)", etc.

- [ ] **Step 3: Verify build and commit**

```bash
git add src/hooks/useMeetingShortcuts.ts src/overlay/OverlayView.tsx
git commit -m "feat(shortcuts): add single-key keyboard shortcuts for live meeting actions"
```

---

### Task 5: Enhancement 1 — AI-Suggested Bookmarks

**Depends on:** SP2 (bookmarking system) + SP3 (action items extraction pattern).

**Files:**
- Create: `src/hooks/useBookmarkSuggestions.ts`
- Modify: `src/launcher/meeting-details/BookmarksTab.tsx`
- Modify: `src/lib/types.ts` (add IntelligenceMode)
- Modify: `src-tauri/src/intelligence/` (prompt template)

- [ ] **Step 1: Add BookmarkSuggestions mode**

Add `"BookmarkSuggestions"` to `IntelligenceMode` in `types.ts`. Add prompt template to Rust intelligence engine.

- [ ] **Step 2: Create useBookmarkSuggestions hook**

Same streaming pattern as `useActionItemsExtraction`. Returns suggested bookmarks as transient state (not saved to DB until accepted).

```typescript
interface BookmarkSuggestion {
  timestamp_ms: number;
  segment_id?: string;
  note: string;
}

interface BookmarkSuggestionsState {
  isSuggesting: boolean;
  suggestions: BookmarkSuggestion[];
  suggest: () => Promise<void>;
  cancel: () => void;
  acceptSuggestion: (index: number) => void;
  dismissSuggestion: (index: number) => void;
  acceptAll: () => void;
  error: string | null;
}
```

- [ ] **Step 3: Add suggestions UI to BookmarksTab**

Add "Suggest Bookmarks" button (sparkle icon). When suggestions exist, render them in a separate section with dashed border, AI sparkle icon, Accept/Dismiss buttons per item, and "Accept All" bulk action.

On accept: call `addMeetingBookmark` IPC, update local meeting state.

- [ ] **Step 4: Verify build and commit**

```bash
git add src/hooks/useBookmarkSuggestions.ts src/launcher/meeting-details/BookmarksTab.tsx src/lib/types.ts src-tauri/src/intelligence/
git commit -m "feat(bookmarks): add AI-suggested bookmarks via LLM extraction"
```

---

### Task 6: Version Bump and Final Verification

- [ ] **Step 1: Bump version in `src/lib/version.ts`**
- [ ] **Step 2: Full build verification**

Run: `npm run build && cd src-tauri && cargo check`

- [ ] **Step 3: Commit**

```bash
git add src/lib/version.ts
git commit -m "chore: bump version for enhancements bundle"
```
