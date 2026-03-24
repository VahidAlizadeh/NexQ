# Audio Recording & Playback — Design Spec

## Overview

Add audio recording during meetings and a rich playback experience in the post-meeting view. Recordings are saved as WAV during capture (reliability), compressed to Opus post-meeting (size), and played back with waveform visualization, bidirectional transcript sync, and keyboard shortcuts.

## Scope

**In scope:**
- Move recording toggle from Settings to MeetingSetupModal
- Record mixed mono audio (mic + system) during meeting
- Post-meeting WAV → Opus compression + waveform peak extraction
- Spotify-style persistent bottom-bar audio player with waveform
- Visual markers on waveform (bookmarks, topic sections)
- Bidirectional transcript-audio sync
- All existing navigation (bookmarks, speaker timeline, topics, actions, search) plugs into audio seek during playback
- Playback speed control (0.5x–2x)
- Keyboard shortcuts for playback
- Download recording + file size display

**Out of scope:**
- Separate channel recording (stereo mic/system)
- Skip-silence feature
- Audio editing/trimming
- Cloud storage of recordings
- Streaming audio to other devices

---

## 1. Data Model & Backend Pipeline

### Database Changes

Add columns to `meetings` table:

```sql
recording_path      TEXT,      -- relative path, e.g. "recordings/abc-123.opus"
recording_size      INTEGER,   -- file size in bytes
waveform_path       TEXT,      -- e.g. "recordings/abc-123.waveform.json"
recording_offset_ms INTEGER    -- delta between recording start and meeting start_time
```

`recording_offset_ms` captures the gap between creating the meeting DB record and starting audio capture. Required for accurate transcript-audio sync: `audio_position = segment.timestamp_ms - meeting_start_ms - recording_offset_ms`.

### TypeScript Type Additions (`types.ts`)

```typescript
interface RecordingInfo {
  path: string;
  size_bytes: number;
  duration_ms: number;
  waveform_path: string;
  offset_ms: number;
}

// Extend Meeting interface:
recording_info?: RecordingInfo | null;
```

### Waveform JSON Format

```json
{
  "sample_rate": 200,
  "duration_ms": 3600000,
  "peaks": [[min, max], [min, max], ...]
}
```

Peaks are `[min, max]` pairs of normalized floats (-1.0 to 1.0). Resolution: ~200 peaks per minute (~3.3 peaks/second). A 1-hour meeting produces ~12,000 pairs — roughly 150KB JSON, compresses well.

### Post-Meeting Rust Pipeline

Triggered during `endMeeting` flow, after `recorder.stop()`:

1. Finalize WAV → get file path
2. Read WAV samples → extract waveform peaks (downsample to ~200 peaks/minute)
3. Write `{meeting_id}.waveform.json`
4. Encode WAV → Opus via `opus` crate → write `{meeting_id}.opus`
5. Delete original WAV file
6. Update meeting DB record with `recording_path`, `recording_size`, `waveform_path`, `recording_offset_ms`
7. Emit `recording_ready` event to frontend

This runs asynchronously — the UI shows a processing skeleton until the `recording_ready` event arrives.

### New IPC Commands

| Command | Signature | Description |
|---------|-----------|-------------|
| `get_recording_info` | `(meeting_id: String) → Option<RecordingInfo>` | Returns recording metadata or null |
| `get_recording_file_url` | `(meeting_id: String) → String` | Returns `convertFileSrc`-compatible URL |
| `delete_recording` | `(meeting_id: String) → ()` | Removes opus + waveform files, clears DB |

### New Rust Dependencies

- `opus` crate — Opus encoding
- No new crate needed for peak extraction (reuse existing `hound` for WAV reading, compute peaks manually)

---

## 2. Recording Toggle Relocation

### Remove from Settings

Remove the "Record audio to file" toggle from `AudioSettings.tsx` (lines 226-243).

### Add to MeetingSetupModal

Add a dedicated toggle row between the Scenario picker and the "Remember settings" checkbox.

**Design:**
- Own bordered row with subtle red accent (`border-red-500/20`, `bg-red-500/04`)
- Small red dot indicator (left side)
- Label: "Record Audio" / sublabel: "Save as file for playback"
- Toggle switch (red when ON, matching destructive color)
- Toggle defaults to last-used state (persisted in `configStore.recordingEnabled`)

**Compact view (remembered setup):**
- When user has saved preferences, show a `REC` badge pill alongside the Audio Mode and Scenario badges
- Badge uses same red styling as the full toggle

**State persistence:**
- `recordingEnabled` persists in `configStore` independently of "Remember settings"
- The toggle state is always remembered, even if the user doesn't check "Remember settings"
- On meeting start: if toggle is ON, call `setRecordingEnabled(true)` IPC before starting capture

---

## 3. During-Meeting Recording Badge

### Current State

A REC badge already exists in `OverlayView.tsx:100-105` with pulsing red dot animation. Currently shows based on `isRecording` (meeting active state), which means it shows for ALL meetings regardless of audio recording.

### Changes

- Change condition from `isRecording` to `recordingEnabled` from `useConfigStore`
- Keep existing pill design: pulsing red dot + "REC" text in destructive color
- Enhance animation: add a subtle breathing ring effect (scale 1.0→1.05 over 2s ease-in-out) on the outer container, in addition to the existing pulse on the dot

---

## 4. Post-Meeting Audio Player

### Placement: Sticky Bottom Bar

Spotify-style fixed footer that persists across all tab switches in the meeting details view.

### Layout (single row)

```
[Play/Pause] [CurrentTime] [====Waveform====] [TotalTime] [Speed] [Download] [Size]
```

### Component: `AudioPlayer.tsx`

**Position:** Fixed to bottom of `MeetingDetailsContainer`, outside the tab content scroll area. `backdrop-blur(12px)` with `bg-card/95` for glassmorphic effect. Top border `border-border/08`.

**Play/Pause button:** 30px circle, indigo background on hover, icon toggles between play triangle and pause bars.

**Time displays:** Tabular-nums font variant, `text-muted-foreground`. Current time at left, total duration at right of waveform.

**Waveform:** Canvas-rendered bar visualization.
- Played portion: indigo (`#818cf8`)
- Unplayed portion: `rgba(255,255,255,0.1)`
- Playhead: 2px indigo vertical line with `box-shadow` glow
- Height: 24px
- Click anywhere on waveform to seek
- Drag playhead for scrubbing

**Visual markers on waveform:**
- Bookmark pins: amber dots (`#f59e0b`) at top edge, 5px diameter, with subtle glow
- Topic section dividers: green dashed vertical lines (`#10b981`, 40% opacity)
- Markers are positioned proportionally: `left = (marker_timestamp_ms - meeting_start_ms) / duration_ms * 100%`
- Hover on marker shows tooltip with bookmark note or topic title

**Speed control:** Pill button showing current speed (e.g., "1.5x"). Click cycles through: 1x → 1.25x → 1.5x → 2x → 0.5x → 0.75x → 1x. Styling: `bg-white/06` with `text-muted-foreground`, `font-weight:600`.

**Download button:** Down-arrow icon, triggers browser download of the Opus file.

**File size:** Small muted text showing recording size (e.g., "4.2 MB").

### States

- **No recording:** Bottom bar does not render. Clean absence.
- **Processing (Opus conversion):** Skeleton bottom bar with "Processing audio..." label and subtle pulse animation.
- **Ready:** Full player with waveform.
- **Playing:** Playhead moves, active transcript line highlighted.
- **Paused:** Playhead frozen, highlight stays on last active segment.

### Waveform Rendering

Use an HTML5 `<canvas>` element:
1. On mount: load `waveform.json` via IPC
2. Draw bars: each peak pair `[min, max]` → one vertical bar, width = canvas_width / num_peaks
3. Split rendering at playhead position: left side indigo, right side gray
4. Overlay markers from meeting bookmarks and topic sections
5. Re-render on resize (responsive) and on `currentTimeMs` changes (playhead movement)

---

## 5. Bidirectional Transcript-Audio Sync

### New Store: `useAudioPlayerStore`

```typescript
interface AudioPlayerState {
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  playbackSpeed: number;
  activeSegmentId: string | null;
  audioElement: HTMLAudioElement | null;

  // Actions
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seekToTime: (ms: number) => void;
  seekToTimestamp: (absoluteTimestampMs: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  cycleSpeed: (direction: 'up' | 'down') => void;
  setAudioElement: (el: HTMLAudioElement) => void;
}
```

### Direction 1: Audio → Transcript Highlight

- `<audio>` element `timeupdate` events (~4 Hz) supplemented with `requestAnimationFrame` for smoother tracking (~60 Hz when playing)
- On each tick: update `currentTimeMs` in store
- Derive `activeSegmentId`: find the last segment where `(segment.timestamp_ms - meetingStartMs - recordingOffsetMs) <= currentTimeMs`
- Transcript view subscribes to `activeSegmentId`:
  - Active segment gets highlight styling: indigo left border (2px `#818cf8`) + tinted background (`rgba(129,140,248,0.08)`)
  - Auto-scroll: `scrollIntoView({ behavior: "smooth", block: "center" })`
  - Auto-scroll pauses if user manually scrolls away (same pattern as live transcript auto-scroll). Resumes when user scrolls back near the active segment.

### Direction 2: Transcript Click → Audio Seek

- Every transcript line click handler checks `useAudioPlayerStore.isPlaying`
- If playing: call `seekToTimestamp(segment.timestamp_ms)` which computes `seekMs = timestamp - meetingStartMs - offsetMs` and sets `audio.currentTime = seekMs / 1000`. Playback continues from new position.
- If NOT playing: existing behavior only (scroll/navigate, no audio interaction)

### Direction 3: All Navigation → Audio Seek

Single function `seekToTimestamp(absoluteTimestampMs)` wired into all existing navigation handlers. Only activates when `isPlaying` is true:

| Navigation Source | Current Handler | Addition |
|---|---|---|
| Speaker timeline click | `onSegmentClick(index)` | + `seekToTimestamp(segment.timestamp_ms)` |
| Bookmark click | Navigate to segment | + `seekToTimestamp(bookmark.timestamp_ms)` |
| Topic section click | Navigate to segment | + `seekToTimestamp(section.start_ms)` |
| Action item click | Show timestamp | + `seekToTimestamp(item.timestamp_ms)` |
| Search result navigation | Scroll to match | + `seekToTimestamp(matchedSegment.timestamp_ms)` |
| Waveform click/drag | N/A (new) | Direct `audio.currentTime` set |

### Edge Cases

- Audio reaches end → `isPlaying` = false, highlight stays on last segment
- Segment timestamp before recording started → seek to 0
- User drags waveform playhead → transcript follows via same `activeSegmentId` derivation
- Speed change during playback → `audio.playbackRate` update, no sync logic change
- Meeting without recording → entire sync system inactive, no store subscriptions

---

## 6. Keyboard Shortcuts

Active when meeting details view has focus AND a recording exists.

| Key | Action |
|-----|--------|
| `Space` | Play / Pause toggle |
| `Left Arrow` | Skip back 5 seconds |
| `Right Arrow` | Skip forward 5 seconds |
| `Shift+Left` | Skip back 15 seconds |
| `Shift+Right` | Skip forward 15 seconds |
| `[` | Decrease playback speed |
| `]` | Increase playback speed |

### Implementation

New hook: `useAudioKeyboardShortcuts()`
- Registers `keydown` listener on mount
- Guards: only active when `audioPlayerStore.audioElement` exists (recording loaded)
- `Space` prevented from scrolling via `e.preventDefault()`
- No conflicts: existing shortcuts (`Ctrl+F`, `Ctrl+S`, `Ctrl+B`) all use modifier keys

---

## 7. File Structure

### New Files

| File | Purpose |
|------|---------|
| `src/stores/audioPlayerStore.ts` | Zustand store for playback state |
| `src/components/AudioPlayer.tsx` | Bottom bar player component |
| `src/components/WaveformCanvas.tsx` | Canvas-based waveform renderer |
| `src/hooks/useAudioKeyboardShortcuts.ts` | Keyboard shortcut handler |
| `src/hooks/useAudioTranscriptSync.ts` | Audio ↔ transcript sync logic |
| `src-tauri/src/audio/encoder.rs` | WAV → Opus encoding |
| `src-tauri/src/audio/waveform.rs` | Peak extraction from WAV |
| `src-tauri/src/commands/recording_commands.rs` | New IPC commands |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `RecordingInfo` type, extend `Meeting` |
| `src/lib/ipc.ts` | Add recording IPC wrappers |
| `src/stores/meetingStore.ts` | Wire recording into `endMeetingFlow` |
| `src/stores/configStore.ts` | Ensure `recordingEnabled` persists independently |
| `src/launcher/MeetingSetupModal.tsx` | Add recording toggle row |
| `src/launcher/meeting-details/MeetingDetailsContainer.tsx` | Add `AudioPlayer` + sync hooks |
| `src/launcher/meeting-details/TranscriptView.tsx` | Active segment highlighting + click-to-seek |
| `src/launcher/meeting-details/BookmarksTab.tsx` | Wire `seekToTimestamp` |
| `src/launcher/meeting-details/SpeakersTab.tsx` | Wire `seekToTimestamp` |
| `src/launcher/meeting-details/ActionItemsTab.tsx` | Wire `seekToTimestamp` |
| `src/overlay/OverlayView.tsx` | Fix REC badge condition to `recordingEnabled` |
| `src/settings/AudioSettings.tsx` | Remove recording toggle |
| `src-tauri/src/audio/mod.rs` | Add encoder + waveform modules |
| `src-tauri/src/audio/recorder.rs` | Store `recording_offset_ms` |
| `src-tauri/src/commands/meeting_commands.rs` | Post-meeting encoding pipeline |
| `src-tauri/src/db/meetings.rs` | New columns + queries |
| `src-tauri/src/db/migrations.rs` | Schema migration v5 |
| `src-tauri/src/lib.rs` | Register new command module |
| `src-tauri/Cargo.toml` | Add `opus` crate dependency |
| `src/lib/version.ts` | Version bump |

---

## 8. Technical Considerations

### Audio File Access in Tauri WebView

Use `convertFileSrc()` from `@tauri-apps/api` to create a WebView-accessible URL from the local filesystem path. The HTML5 `<audio>` element can then load and play the file directly. No custom streaming needed.

### Waveform Performance

- ~12,000 peak pairs for a 1-hour meeting
- Canvas rendering at 60fps is trivial for this data volume
- Only re-render the playhead region on tick updates (dirty rect optimization)
- Full re-render only on resize or seek

### Opus Encoding

- Target bitrate: 32kbps (mono voice, excellent quality)
- Expected file size: ~14 MB/hour (vs 115 MB/hour WAV)
- Encoding time: <2 seconds for a 1-hour meeting on modern hardware
- HTML5 `<audio>` natively supports Opus in WebView2 (Chromium-based)

### Recording Offset Accuracy

Capture `recording_offset_ms` as: `timestamp of first audio chunk received - meeting start_time`. This is measured in the Rust backend where both values are available. Typical offset: 50-200ms depending on audio device initialization.
