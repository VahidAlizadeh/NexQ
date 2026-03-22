# Speaker Labeling Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix in-person meeting mode so diarized speaker labels appear correctly in transcripts instead of everything showing "Room".

**Architecture:** The per-party event payload in `audio_commands.rs` drops Deepgram's `speaker_id` — we propagate it. The frontend gets a pending indicator for interims (before diarization), a reactivity fix so renames propagate instantly, and a redesigned speaker prompt with merge support.

**Tech Stack:** Rust (Tauri 2 backend), React 18, Zustand 4.5, TypeScript 5.5

**Testing:** No unit test framework exists in this project. Verify each task with `npm run build` (TypeScript check) and manual testing via `npx tauri dev`. Rust changes verified via `cd src-tauri && cargo check`.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src-tauri/src/commands/audio_commands.rs` | Modify lines 1000-1037 | Add `speaker_id` to "Them" event payload |
| `src/stores/transcriptStore.ts` | Modify | Add `reassignSpeaker(fromId, toId)` action |
| `src/stores/speakerStore.ts` | Modify | Add `mergeSpeaker(fromId, intoId)` action |
| `src/hooks/useTranscript.ts` | Modify `processSpeaker` | Add `__pending` indicator for in-person interims |
| `src/overlay/TranscriptLine.tsx` | Modify | Reactivity fix, pending display, inline rename |
| `src/overlay/SpeakerNamingBanner.tsx` | Rewrite | Two-action design: name or merge |
| `src/lib/version.ts` | Modify | Bump version |

---

### Task 1: Propagate speaker_id in Rust Per-Party Payload

**Files:**
- Modify: `src-tauri/src/commands/audio_commands.rs:1000-1037`

**Context:** The "Them" event emission block hardcodes `"speaker": "Them"` and drops `result.speaker` from Deepgram. When Deepgram diarization is active, `result.speaker` contains `Some("speaker_0")`, `Some("speaker_1")`, etc. We need to extract this and include it as `speaker_id` in the JSON payload sent to the frontend.

- [ ] **Step 1: Modify the "Them" event emission block**

Replace lines 1024-1033 in `audio_commands.rs`:

```rust
// BEFORE (lines 1024-1033):
let payload = serde_json::json!({
    "segment": {
        "id": seg_id,
        "text": result.text,
        "speaker": "Them",
        "timestamp_ms": result.timestamp_ms,
        "is_final": result.is_final,
        "confidence": result.confidence
    }
});

// AFTER:
// Extract diarized speaker_id from result.speaker
// Deepgram sets speaker to "speaker_N" when diarize=true
let speaker_id_val = match result.speaker.as_deref() {
    Some(s) if s.starts_with("speaker_") => Some(s.to_string()),
    _ => None,
};
let mut seg = serde_json::json!({
    "id": seg_id,
    "text": result.text,
    "speaker": "Them",
    "timestamp_ms": result.timestamp_ms,
    "is_final": result.is_final,
    "confidence": result.confidence
});
if let Some(ref sid) = speaker_id_val {
    seg["speaker_id"] = serde_json::json!(sid);
}
let payload = serde_json::json!({ "segment": seg });
```

- [ ] **Step 2: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/audio_commands.rs
git commit -m "fix(stt): propagate speaker_id from Deepgram diarization in per-party payload"
```

---

### Task 2: Add reassignSpeaker Action to Transcript Store

**Files:**
- Modify: `src/stores/transcriptStore.ts`

**Context:** When merging a false speaker detection into an existing speaker, all stored transcript segments with the old `speaker_id` must be relabeled. This action iterates segments and replaces matching `speaker_id` values.

- [ ] **Step 1: Add the action to the interface and implementation**

In `transcriptStore.ts`, add to the `TranscriptState` interface (after `setAutoScroll`):

```typescript
reassignSpeaker: (fromId: string, toId: string) => void;
```

Add to the store implementation (after `setAutoScroll`):

```typescript
reassignSpeaker: (fromId, toId) =>
  set((state) => ({
    segments: state.segments.map((s) =>
      s.speaker_id === fromId ? { ...s, speaker_id: toId } : s
    ),
  })),
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/stores/transcriptStore.ts
git commit -m "feat(store): add reassignSpeaker action to transcript store"
```

---

### Task 3: Add mergeSpeaker Action to Speaker Store

**Files:**
- Modify: `src/stores/speakerStore.ts`

**Context:** When the user clicks "Actually this is [existing speaker]" in the naming prompt, the false detection speaker must be absorbed into the target: stats transferred, source speaker removed. This action must be called AFTER `transcriptStore.reassignSpeaker` to prevent a window where segments reference a removed speaker.

- [ ] **Step 1: Add the action to the interface**

In `speakerStore.ts`, add to the `SpeakerState` interface (after `dismissNaming`):

```typescript
mergeSpeaker: (fromId: string, intoId: string) => void;
```

- [ ] **Step 2: Add the implementation**

Add to the store implementation (after the `dismissNaming` action):

```typescript
mergeSpeaker: (fromId, intoId) => {
  set((s) => {
    const source = s.speakers[fromId];
    const target = s.speakers[intoId];
    if (!source || !target) return s;

    // Transfer stats from source into target
    const mergedStats = {
      segment_count: target.stats.segment_count + source.stats.segment_count,
      word_count: target.stats.word_count + source.stats.word_count,
      talk_time_ms: target.stats.talk_time_ms + source.stats.talk_time_ms,
      last_spoke_ms: Math.max(target.stats.last_spoke_ms, source.stats.last_spoke_ms),
    };

    // Remove source, update target stats
    const { [fromId]: _removed, ...remainingSpeakers } = s.speakers;
    return {
      speakers: {
        ...remainingSpeakers,
        [intoId]: { ...target, stats: mergedStats },
      },
      speakerOrder: s.speakerOrder.filter((id) => id !== fromId),
      pendingNaming: s.pendingNaming === fromId ? null : s.pendingNaming,
    };
  });
},
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npm run build`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/stores/speakerStore.ts
git commit -m "feat(store): add mergeSpeaker action to speaker store"
```

---

### Task 4: Add Pending Speaker Indicator to processSpeaker

**Files:**
- Modify: `src/hooks/useTranscript.ts`

**Context:** Deepgram interims lack diarization data — `speaker_id` is absent. Currently, `processSpeaker` maps these to `"room"`, causing all interims to show "Room". Instead, when diarization is enabled, interims should get a `"__pending"` sentinel that renders as a dimmed "..." in the UI. When the final arrives (with diarization), it replaces the interim in-place (same segment ID) with the correct speaker_id.

- [ ] **Step 1: Add configStore import**

At the top of `useTranscript.ts`, add alongside the existing imports:

```typescript
import { useConfigStore } from "../stores/configStore";
```

- [ ] **Step 2: Modify the processSpeaker function**

Replace the `else if (isInPerson)` branch (lines 45-49) with pending logic:

```typescript
// BEFORE (lines 42-53):
if (segment.speaker_id) {
  speakerId = segment.speaker_id;
} else if (isInPerson) {
  speakerId = "room";
} else {
  speakerId = segment.speaker === "User" ? "you" : "them";
}

// AFTER:
if (segment.speaker_id) {
  // Diarized segment from Deepgram — use the speaker_id directly
  speakerId = segment.speaker_id;
} else if (isInPerson) {
  // In-person mode interim without diarization data
  const diarizationEnabled = useConfigStore.getState().diarizationEnabled;
  if (diarizationEnabled) {
    // Pending: diarization will resolve speaker on the final result
    speakerId = "__pending";
  } else {
    // No diarization: everything is "room"
    speakerId = "room";
  }
} else {
  speakerId = segment.speaker === "User" ? "you" : "them";
}
```

- [ ] **Step 3: Skip registration and stats for pending segments**

Replace lines 55-64 (the auto-register and stats block):

```typescript
// BEFORE:
if (!speakerStore.getSpeaker(speakerId)) {
  speakerStore.addSpeaker(speakerId);
}
if (segment.is_final) {
  const wordCount = segment.text.split(/\s+/).filter(Boolean).length;
  speakerStore.updateStats(speakerId, wordCount, 0);
}

// AFTER:
// Skip registration and stats for pending segments
if (speakerId !== "__pending") {
  if (!speakerStore.getSpeaker(speakerId)) {
    speakerStore.addSpeaker(speakerId);
  }
  if (segment.is_final) {
    const wordCount = segment.text.split(/\s+/).filter(Boolean).length;
    speakerStore.updateStats(speakerId, wordCount, 0);
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npm run build`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTranscript.ts
git commit -m "feat(transcript): add __pending speaker indicator for in-person interims"
```

---

### Task 5: Fix TranscriptLine — Reactivity, Pending Display, Inline Rename

**Files:**
- Modify: `src/overlay/TranscriptLine.tsx`

**Context:** Three changes to TranscriptLine:
1. **Reactivity fix:** Replace non-reactive function selectors (`getSpeakerColor`, `getSpeakerDisplayName`) with a direct state slice selector (`speakers[speakerId]`) that triggers re-renders when speaker data changes.
2. **Pending display:** When `speakerId === "__pending"`, render dimmed "..." instead of a speaker name.
3. **Inline rename:** Clicking a speaker label opens an inline text input to rename the speaker.

- [ ] **Step 1: Add useRef to the React import**

At the top of `TranscriptLine.tsx`, change the React import (line 5):

```typescript
// BEFORE:
import { useState } from "react";

// AFTER:
import { useState, useRef } from "react";
```

- [ ] **Step 2: Replace the state and speaker resolution block**

Replace the interior of the function — lines 26-52 (from `const [isHovered` through `const speakerLabel`). Do NOT include the function signature line 25 — only the body contents.

Find this block:

```typescript
  const [isHovered, setIsHovered] = useState(false);
  const meetingStartTime = useMeetingStore((s) => s.meetingStartTime);
  const getSpeakerColor = useSpeakerStore((s) => s.getSpeakerColor);
  const getSpeakerDisplayName = useSpeakerStore((s) => s.getSpeakerDisplayName);
  const confidenceThreshold = useConfigStore((s) => s.confidenceThreshold);
  const confidenceHighlightEnabled = useConfigStore((s) => s.confidenceHighlightEnabled);

  // ... timestamp calculation ...

  // Resolve speaker ID — prefer explicit speaker_id, fall back to speaker field
  const speakerId = segment.speaker_id ?? (segment.speaker === "User" ? "you" : "them");
  const speakerHex = getSpeakerColor(speakerId);
  const speakerLabel = getSpeakerDisplayName(speakerId);
```

Replace with:

```typescript
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const meetingStartTime = useMeetingStore((s) => s.meetingStartTime);
  const confidenceThreshold = useConfigStore((s) => s.confidenceThreshold);
  const confidenceHighlightEnabled = useConfigStore((s) => s.confidenceHighlightEnabled);

  // Resolve speaker ID — prefer explicit speaker_id, fall back to speaker field
  const speakerId = segment.speaker_id ?? (segment.speaker === "User" ? "you" : "them");
  const isPending = speakerId === "__pending";

  // Reactive: select the actual speaker object — triggers re-render on rename/merge
  const speaker = useSpeakerStore((s) => isPending ? undefined : s.speakers[speakerId]);
  const renameSpeaker = useSpeakerStore((s) => s.renameSpeaker);

  const speakerLabel = isPending ? "..." : (speaker?.display_name ?? speakerId);
  const speakerHex = isPending ? "#6b7280" : (speaker?.color ?? "#6b7280");
```

Note: the timestamp calculation block (lines 33-47) stays unchanged between these replacements.

- [ ] **Step 3: Add inline rename handlers**

Add after the `speakerHex` line, before the timestamp calculation:

```typescript
  // Inline rename: don't allow for pending or fixed speakers (you, them, room)
  const canRename = !isPending && speakerId !== "you" && speakerId !== "them" && speakerId !== "room";

  const startEditing = () => {
    if (!canRename) return;
    setEditName(speakerLabel);
    setIsEditing(true);
    setTimeout(() => editRef.current?.select(), 0);
  };

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== speakerLabel) {
      renameSpeaker(speakerId, trimmed);
    }
    setIsEditing(false);
  };

  const cancelRename = () => {
    setIsEditing(false);
  };
```

- [ ] **Step 4: Update the speaker label JSX**

Find and replace the speaker label `<span>` block (search for `{/* Speaker label */}`). Note: line numbers will have shifted from the original file due to Step 2 insertions.

```tsx
      {/* Speaker label — click to rename */}
      {isEditing ? (
        <input
          ref={editRef}
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") cancelRename();
          }}
          maxLength={40}
          className="mt-0.5 shrink-0 w-20 rounded bg-white/5 border border-purple-400/30 px-1 py-0 text-meta font-semibold outline-none"
          style={{ color: speakerHex }}
        />
      ) : (
        <span
          className={`mt-0.5 shrink-0 text-meta font-semibold ${canRename ? "cursor-pointer hover:underline" : ""} ${isPending ? "animate-pulse" : ""}`}
          style={{ color: speakerHex }}
          onClick={startEditing}
          title={canRename ? "Click to rename" : undefined}
        >
          {speakerLabel}
        </span>
      )}
```

- [ ] **Step 5: Update border-left for pending segments**

In the outer `<div>`, find `borderLeftColor:` and update:

```tsx
      style={{ borderLeftColor: isPending ? "transparent" : `${speakerHex}80` }}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npm run build`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/overlay/TranscriptLine.tsx
git commit -m "fix(ui): reactive speaker labels, pending indicator, inline rename in TranscriptLine"
```

---

### Task 6: Redesign SpeakerNamingBanner with Merge Support

**Files:**
- Modify: `src/overlay/SpeakerNamingBanner.tsx`

**Context:** Replace the single-action banner (name + dismiss) with a two-action design:
- Left: "Name this speaker" — text input + Save
- Right: "Actually this is..." — buttons for each existing speaker, clicking merges
The banner must call `transcriptStore.reassignSpeaker()` BEFORE `speakerStore.mergeSpeaker()` to avoid a window where segments reference a removed speaker.

- [ ] **Step 1: Rewrite SpeakerNamingBanner.tsx**

Replace the entire file content:

```tsx
import { useState, useEffect, useRef } from "react";
import { useSpeakerStore } from "../stores/speakerStore";
import { useTranscriptStore } from "../stores/transcriptStore";
import { UserPlus, X } from "lucide-react";

export function SpeakerNamingBanner() {
  const pendingNaming = useSpeakerStore((s) => s.pendingNaming);
  const renameSpeaker = useSpeakerStore((s) => s.renameSpeaker);
  const dismissNaming = useSpeakerStore((s) => s.dismissNaming);
  const mergeSpeaker = useSpeakerStore((s) => s.mergeSpeaker);
  const speakers = useSpeakerStore((s) => s.speakers);
  const speakerOrder = useSpeakerStore((s) => s.speakerOrder);
  const reassignSpeaker = useTranscriptStore((s) => s.reassignSpeaker);

  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const [timerProgress, setTimerProgress] = useState(100);
  // Ref to guard against stale closures during rapid speaker detection
  const pendingRef = useRef(pendingNaming);
  pendingRef.current = pendingNaming;

  // Reset input and restart auto-dismiss timer when pendingNaming changes
  useEffect(() => {
    if (!pendingNaming) return;
    setName("");
    setTimerProgress(100);
    startTimeRef.current = Date.now();
    inputRef.current?.focus();

    const TIMEOUT_MS = 10000;

    // Animate timer bar
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / TIMEOUT_MS) * 100);
      setTimerProgress(remaining);
    }, 100);

    timerRef.current = setTimeout(() => {
      dismissNaming();
    }, TIMEOUT_MS);

    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pendingNaming, dismissNaming]);

  if (!pendingNaming) return null;

  const pendingSpeaker = speakers[pendingNaming];
  const defaultName = pendingSpeaker?.display_name ?? pendingNaming;

  // Existing speakers available for merge (exclude the pending speaker itself)
  const mergeTargets = speakerOrder
    .filter((id) => id !== pendingNaming && id in speakers)
    .map((id) => speakers[id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const current = pendingRef.current;
    if (!current) return;
    const trimmed = name.trim();
    if (trimmed) {
      renameSpeaker(current, trimmed);
    } else {
      dismissNaming();
    }
  };

  const handleMerge = (targetId: string) => {
    const current = pendingRef.current;
    if (!current) return;
    // Order matters: reassign segments FIRST, then remove the speaker
    reassignSpeaker(current, targetId);
    mergeSpeaker(current, targetId);
  };

  return (
    <div className="mx-1 mb-1.5 rounded-lg border border-purple-400/20 bg-purple-400/5 px-3 py-2 animate-in slide-in-from-bottom-2 duration-200">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <UserPlus className="h-3.5 w-3.5 shrink-0 text-purple-400" />
        <span className="text-xs text-muted-foreground/80">
          New speaker detected:
          <span className="ml-1 font-semibold text-purple-400">{defaultName}</span>
        </span>
        <button
          type="button"
          onClick={dismissNaming}
          className="ml-auto shrink-0 rounded-md p-0.5 text-muted-foreground/50 hover:text-muted-foreground/80 hover:bg-white/5 transition-colors cursor-pointer"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Two-action row */}
      <div className="flex gap-2">
        {/* Left: Name this speaker */}
        <div className="flex-1 rounded-md bg-white/[0.03] border border-white/[0.06] p-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-1.5">
            Name this speaker
          </div>
          <form onSubmit={handleSubmit} className="flex gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Professor Smith"
              maxLength={40}
              className="flex-1 min-w-0 rounded-md bg-white/5 border border-purple-400/20 px-2 py-1 text-xs text-foreground/90 placeholder:text-muted-foreground/40 outline-none focus:border-purple-400/40"
            />
            <button
              type="submit"
              className="shrink-0 rounded-md bg-purple-400/15 px-2.5 py-1 text-xs font-medium text-purple-400 hover:bg-purple-400/25 transition-colors cursor-pointer"
            >
              Save
            </button>
          </form>
        </div>

        {/* Right: Merge into existing */}
        {mergeTargets.length > 0 && (
          <div className="flex-1 rounded-md bg-white/[0.03] border border-white/[0.06] p-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-1.5">
              Actually this is...
            </div>
            <div className="flex flex-wrap gap-1">
              {mergeTargets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => handleMerge(target.id)}
                  className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-muted-foreground/70 hover:bg-white/[0.08] hover:text-foreground/80 transition-colors cursor-pointer"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: target.color ?? "#6b7280" }}
                  />
                  {target.display_name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Timer bar */}
      <div className="mt-2 h-[2px] rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-purple-400/30 transition-all duration-100"
          style={{ width: `${timerProgress}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/overlay/SpeakerNamingBanner.tsx
git commit -m "feat(ui): redesign speaker naming banner with merge support"
```

---

### Task 7: Version Bump and Integration Verification

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Bump version**

In `src/lib/version.ts`, update:
```typescript
export const NEXQ_VERSION = "2.1.0";
export const NEXQ_BUILD_DATE = "2026-03-22";
```

- [ ] **Step 2: Full build verification**

Run: `npm run build`
Expected: no errors — all TypeScript types consistent

Run: `cd src-tauri && cargo check`
Expected: no errors — Rust compiles cleanly

- [ ] **Step 3: Manual integration test**

Run: `npx tauri dev`

Test checklist:
1. Start an in-person meeting with Deepgram + diarization enabled
2. Verify interims show "..." (dimmed) instead of "Room"
3. Verify finals replace interims with correct speaker labels (Speaker 1, Speaker 2, etc.)
4. Verify speaker detection prompt shows two actions: Name + Merge
5. Name a speaker → verify all past/future transcript lines update
6. Trigger a false detection → click "Actually this is [existing speaker]" → verify merge works
7. Click a speaker label in transcript → verify inline rename works
8. Verify speaker stats panel stays in sync with transcript labels
9. Start an online meeting → verify "You"/"Them" labels still work (regression check)

- [ ] **Step 4: Commit**

```bash
git add src/lib/version.ts
git commit -m "chore: bump version to v2.1.0"
```
