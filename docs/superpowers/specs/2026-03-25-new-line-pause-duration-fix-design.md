# Fix: New Line Pause Duration Setting Not Applied in Per-Party Capture

**Date**: 2026-03-25
**Status**: Approved

## Problem

The "New Line Pause Duration" (`pauseThresholdMs`) setting has no effect on transcript line segmentation. Same-speaker speech is split into many short lines regardless of the slider value (0.5s–5.0s).

**Root cause**: The app has two audio capture paths:

1. `start_capture` (legacy) — routes STT results through `SegmentAccumulator`, which reads `pauseThresholdMs` and merges consecutive same-speaker segments when the gap is below the threshold. This path works correctly.
2. `start_capture_per_party` (current, used when `meetingAudioConfig` exists) — emits every STT result directly as a separate transcript event. **No accumulator, no merging.** The `pauseThresholdMs` setting is never read.

Since all modern meeting starts use `start_capture_per_party`, the setting is effectively dead code for most users.

## Design

### Approach: Add SegmentAccumulator to `start_capture_per_party`

Wire the existing `SegmentAccumulator` into the per-party capture function's transcript processing loops, mirroring the legacy path's implementation.

### "Them" STT (System Audio)

**File**: `src-tauri/src/commands/audio_commands.rs`, lines 1062–1105

Current flow:
```
Deepgram result → counter-based ID → emit transcript event
```

New flow:
```
Deepgram result → SegmentAccumulator.feed_result() → emit accumulated outputs
```

Changes:
- Clone `pause_threshold_ms: Arc<AtomicU64>` from `AppState` into the async task
- Create a `SegmentAccumulator::new(threshold)` before the receive loop
- On each result, load the current threshold from the atomic and call `set_pause_threshold()`
- Feed results through the accumulator; emit each `AccumulatorOutput` as a transcript event
- **ID namespacing**: Prefix accumulator output IDs with the party and session prefix before emitting (e.g., `format!("them_{}_{}", prefix, output.id)`) to avoid ID collisions with "You" accumulator and across sessions. The accumulator generates `acc_N` IDs internally; the prefix ensures uniqueness.
- Extract diarized `speaker_id` from the accumulator output's speaker field (not from the raw result)
- Push final accumulated segments to the intelligence engine via `engine.push_transcript()`
- **Flush on exit**: After the `while let` receive loop exits (channel closed on meeting end), call `accumulator.flush()` and emit/push the returned segment if any. This prevents the last spoken phrase from being silently dropped.

The accumulator handles:
- **Same speaker, gap < threshold**: merge text into current segment (same ID, updated text)
- **Same speaker, gap >= threshold**: finalize current segment, start new segment (new ID)
- **Speaker change**: finalize current segment, start new segment (new ID)
- **Interim results**: pass through with accumulated prefix for in-place display

### "You" STT (Microphone)

**File**: `src-tauri/src/commands/audio_commands.rs`, lines 1020–1058

Add a SegmentAccumulator conditionally:
- **Skip** for `web_speech` — browser handles its own segmentation
- **Skip** for `whisper_cpp` — dual-pass engine manages line breaking via its own `pause_secs` config
- **Use accumulator** for all other providers (Deepgram, Groq, cloud Whisper, etc.)

When the accumulator is active, the flow mirrors the "Them" path: feed results through the accumulator, emit accumulated outputs with `you_{prefix}_{output.id}` namespaced IDs. Do NOT push "You" finals to the intelligence engine — the frontend already handles "You" context via its own path.

When skipped, the current direct-emit behavior is preserved unchanged.

**Flush on exit**: Same as "Them" — call `accumulator.flush()` after the receive loop exits when the accumulator is active.

### Intelligence Engine Integration

The legacy `start_capture` path pushes accumulated "Them" finals to `engine.push_transcript()`. The per-party path currently does not push "Them" segments to the intelligence engine at all.

After adding the accumulator, push final accumulated "Them" segments to the intelligence engine — same pattern as the legacy path. This gives the AI longer, merged transcript lines for better question detection and context quality.

### What Does NOT Change

- **`SegmentAccumulator`** (`src-tauri/src/stt/segment_accumulator.rs`) — no modifications (ID prefixing is done externally at the emit site)
- **Frontend** (`transcriptStore.ts`, `useTranscript.ts`) — no changes; ID-based upsert already handles merged segments
- **Settings UI** (`STTSettings.tsx`) — slider and IPC path already work correctly
- **Deepgram endpointing** — remains independent; controls server-side finalization timing
- **`STTRouter`** (`stt/mod.rs`) — standalone testing path, not used during meetings
- **Legacy `start_capture`** — already works correctly

## Behavior Summary

| Condition | Result |
|-----------|--------|
| Same speaker, gap < pauseThresholdMs | Merge into current line |
| Same speaker, gap >= pauseThresholdMs | New line |
| Speaker change (diarization) | Always new line |
| Interim result | Display with accumulated prefix, same segment ID |

## Files to Modify

| File | Change |
|------|--------|
| `src-tauri/src/commands/audio_commands.rs` | Add SegmentAccumulator to "Them" and conditional "You" loops in `start_capture_per_party` |

## Testing

- Start a meeting with Deepgram (diarization on) and verify:
  - Same speaker continuous speech merges into longer lines
  - Speaker changes still create new lines
  - Changing the slider mid-meeting takes effect on the next segment
- Test with different pause threshold values (0.5s vs 5.0s) and confirm visible difference in line count
- Test with Web Speech "You" provider — verify no accumulator interference
- Test with whisper.cpp "You" provider — verify dual-pass line breaking still works independently
