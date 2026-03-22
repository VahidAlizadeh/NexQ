# Speaker Labeling Fix — Design Spec

## Problem

In-person meeting mode with Deepgram diarization: all transcript lines display "Room" despite Deepgram correctly detecting multiple speakers. Speaker stats panel shows named speakers, but transcript labels never update.

## Root Causes

### 1. speaker_id Dropped in Per-Party Event Payload (Primary)

In-person mode uses `start_capture_per_party()` in `src-tauri/src/commands/audio_commands.rs` (not the legacy `STTRouter` path). The "Them" event emission block (lines 1000-1037) hardcodes `speaker: "Them"` and completely drops `result.speaker` from the Deepgram result. Deepgram's diarized speaker ID (`"speaker_0"`, `"speaker_1"`) is discarded — the frontend never receives it.

Note: the per-party path already has correct interim/final ID pairing (interims use `counter+1`, finals use `counter` after increment — they share the same ID). So segment ID mismatch is NOT the issue here.

### 2. Deepgram Interims Lack Diarization

Deepgram only includes per-word speaker IDs in final results, not interims. Even after fixing Root Cause 1, interims will arrive with `speaker_id: undefined`. The frontend's `processSpeaker` maps these to `"room"` in in-person mode. When the final arrives (with speaker_id), the matching ID allows in-place replacement — but during the interim window, the label needs a pending indicator rather than "Room".

### 3. Reactivity Gap in TranscriptLine

`TranscriptLine` selects `getSpeakerDisplayName` and `getSpeakerColor` — stable function references that never trigger re-renders when speaker data changes. Renaming a speaker in the store doesn't cause existing transcript lines to update their labels.

## Design

### Component 1: Propagate speaker_id in Per-Party Event Payload

**File:** `src-tauri/src/commands/audio_commands.rs`

**"Them" event emission block (lines 1000-1037):**
- Extract `speaker_id` from `result.speaker` using the same logic as `STTRouter` (lines 280-285 of `mod.rs`):
  ```rust
  let (speaker_label, speaker_id) = match result.speaker.as_deref() {
      Some(s) if s.starts_with("speaker_") => ("Them", Some(s.to_string())),
      _ => ("Them", None),
  };
  ```
- Add `speaker_id` to the JSON payload (only when `Some`):
  ```rust
  let mut seg = serde_json::json!({
      "id": seg_id,
      "text": result.text,
      "speaker": speaker_label,
      "timestamp_ms": result.timestamp_ms,
      "is_final": result.is_final,
      "confidence": result.confidence
  });
  if let Some(ref sid) = speaker_id {
      seg["speaker_id"] = serde_json::json!(sid);
  }
  let payload = serde_json::json!({ "segment": seg });
  ```

**Effect:** Finals from Deepgram now carry `speaker_id: "speaker_0"` to the frontend. Interims still lack it (Deepgram doesn't provide diarization on interims). The existing ID pairing ensures the final replaces the interim in-place via `updateInterimSegment`.

**"You" event emission block (lines 962-998):** No change needed — "You" source doesn't use diarization. Speaker is always "User".

### Component 2: Pending Speaker Indicator

**Files:** `src/hooks/useTranscript.ts`, `src/overlay/TranscriptLine.tsx`

**processSpeaker (useTranscript.ts):**
- When in-person mode, diarization enabled, and `segment.speaker_id` is absent (interim): set `speaker_id: "__pending"`.
- When diarization is disabled: skip `__pending`, map directly to `"room"` for both interims and finals (no flickering).
- Do NOT call `addSpeaker("__pending")` — skip registration and stats for pending segments.
- When `segment.speaker_id` is present (final with diarization): use it directly (`"speaker_0"`, `"speaker_1"`, etc.).

**How processSpeaker knows if diarization is enabled:**
- Read `useConfigStore.getState().diarizationEnabled` (already exists in config).
- Only apply `__pending` when `isInPerson && diarizationEnabled && !segment.speaker_id`.

**TranscriptLine (TranscriptLine.tsx):**
- When `speakerId === "__pending"`: render a dimmed `"..."` label in neutral gray (`text-muted-foreground/30`). No speaker color, no border-left highlight.
- When the final replaces the interim (same segment ID), `"__pending"` disappears — replaced by the real speaker_id which resolves to the display name.

### Component 3: Speaker Detection Prompt Redesign

**File:** `src/overlay/SpeakerNamingBanner.tsx`

**Depends on:** Component 4 (mergeSpeaker action) must be implemented first.

Replace the current single-action banner (name input + Save + dismiss) with a two-action design:

**Left action — "Name this speaker":**
- Text input + Save button.
- On submit: `renameSpeaker(pendingId, enteredName)`. All past and future segments with this speaker_id show the new name (via reactivity fix in Component 6).

**Right action — "Actually this is...":**
- Render a button for each existing speaker (from `speakerOrder`, excluding the pending speaker itself), showing their color dot and display name.
- On click: call `transcriptStore.reassignSpeaker(pendingId, clickedSpeakerId)` first (relabel segments while both speakers still exist), THEN `speakerStore.mergeSpeaker(pendingId, clickedSpeakerId)` (transfer stats and remove the false detection).

**Shared behavior:**
- Timer bar (CSS animation, visual countdown). Auto-dismiss after 10 seconds.
- Dismiss (X button) keeps the default name ("Speaker N"). No merge, no rename.

### Component 4: Merge Speaker Action

**Files:** `src/stores/speakerStore.ts`, `src/stores/transcriptStore.ts`

**transcriptStore — new action `reassignSpeaker(fromId, toId)`:**
1. Iterate all segments. For any segment with `speaker_id === fromId`, replace with `toId`.
2. Return new segments array (triggers re-render of all transcript lines).

**speakerStore — new action `mergeSpeaker(fromId, intoId)`:**
1. Transfer stats: add `fromId`'s `word_count`, `segment_count`, `talk_time_ms` to `intoId`'s stats. Use the more recent `last_spoke_ms`.
2. Remove `fromId` from `speakers` record and `speakerOrder` array.
3. Clear `pendingNaming` if it was `fromId`.

**Call order (in SpeakerNamingBanner):** `transcriptStore.reassignSpeaker()` THEN `speakerStore.mergeSpeaker()`. This prevents a window where transcript lines reference a removed speaker.

### Component 5: Inline Rename in Transcript Panel

**File:** `src/overlay/TranscriptLine.tsx`

- Clicking a speaker label toggles an inline text input (same position, replaces the label text).
- On Enter or blur: call `speakerStore.renameSpeaker(speakerId, newName)`.
- On Escape: cancel, revert to original label.
- Do not allow rename for `"__pending"` or `"room"` speakers.
- All other transcript lines with the same `speaker_id` update immediately (via reactivity fix in Component 6).

### Component 6: Reactivity Fix

**File:** `src/overlay/TranscriptLine.tsx`

**Current (broken):**
```tsx
const getSpeakerColor = useSpeakerStore((s) => s.getSpeakerColor);
const getSpeakerDisplayName = useSpeakerStore((s) => s.getSpeakerDisplayName);
// Stable function refs — never trigger re-renders on speaker changes
```

**Fixed:**
```tsx
const speakerId = segment.speaker_id ?? (segment.speaker === "User" ? "you" : "them");
const speaker = useSpeakerStore((s) => s.speakers[speakerId]);
const speakerLabel = speaker?.display_name ?? speakerId;
const speakerHex = speaker?.color ?? "#6b7280"; // Neutral gray fallback
```

Selecting `speakers[speakerId]` (actual state slice) triggers re-renders when that speaker's data changes. The color fallback uses a literal gray instead of calling the store getter (which would reintroduce the non-reactive pattern).

## Data Flow (End-to-End)

### Interim Path (before diarization)
```
Deepgram WebSocket interim (is_final=false, no speaker words)
  → parse_response(): no diarization data → speaker = "Them" (party label)
  → TranscriptResult { speaker: "Them", is_final: false }

audio_commands.rs per-party "Them" block
  → speaker_id = None (no "speaker_" prefix)
  → Payload { id: "them_abc_2", speaker: "Them", is_final: false }
  → Emit "transcript_update"

Frontend useTranscript hook
  → processSpeaker(): no speaker_id + in-person + diarization enabled → speaker_id = "__pending"
  → Skip addSpeaker, skip stats
  → Return { ...segment, speaker_id: "__pending" }

TranscriptLine render
  → speakerId === "__pending" → render dimmed "..." in gray
```

### Final Path (with diarization)
```
Deepgram WebSocket final (is_final=true, words have speaker IDs)
  → parse_response(): dominant speaker = "speaker_0"
  → TranscriptResult { speaker: "speaker_0", is_final: true }

audio_commands.rs per-party "Them" block
  → "speaker_0".starts_with("speaker_") → speaker_id = Some("speaker_0")
  → ID: counter incremented → "them_abc_2" (same as interim!)
  → Payload { id: "them_abc_2", speaker: "Them", speaker_id: "speaker_0", is_final: true }
  → Emit "transcript_final"

Frontend useTranscript hook
  → processSpeaker(): speaker_id = "speaker_0" → use directly
  → addSpeaker("speaker_0") if new → triggers SpeakerNamingBanner
  → Update stats
  → Return { ...segment, speaker_id: "speaker_0" }

transcriptStore.updateInterimSegment()
  → Find segment by id "them_abc_2" → replace interim (__pending) in-place
  → Segment now has speaker_id: "speaker_0"

TranscriptLine render
  → speakers["speaker_0"] → { display_name: "Professor Smith", color: "#22c55e" }
  → Render: "Professor Smith" in green
```

## Edge Cases

- **Diarization disabled:** `processSpeaker` maps all segments to `"room"` (no `__pending`). Single "Room" label for all speech.
- **Future Deepgram models with diarization on interims:** `processSpeaker` checks `speaker_id` first — if present on an interim, it uses it directly. The `__pending` path is only hit when `speaker_id` is absent.
- **Very short utterances:** If Deepgram sends a final without diarization data (too short for speaker identification), `result.speaker` stays as "Them" (no "speaker_" prefix) → `speaker_id = None` → maps to `"room"`.
- **Rapid speaker changes:** Each utterance gets its own final with its own speaker_id. No cross-contamination because interim/final pairing is per-utterance.

## Out of Scope

- Speaker stats scrollability (fixed in prior commit)
- Monitoring bars for in-person mode (fixed in prior commit)
- Settings persistence / auto-reset (fixed in prior commit)
- Diarization toggle visibility (fixed in prior commit)
- Past meeting speaker label restoration (separate concern)
