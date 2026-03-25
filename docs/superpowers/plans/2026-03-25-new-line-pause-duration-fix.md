# Fix: New Line Pause Duration Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "New Line Pause Duration" (`pauseThresholdMs`) setting actually control transcript line segmentation in the `start_capture_per_party` code path by wiring in the existing `SegmentAccumulator`.

**Architecture:** The `SegmentAccumulator` already exists and works correctly in the legacy `start_capture` path. We add it to both the "Them" and conditional "You" transcript processing loops in `start_capture_per_party`, with ID namespacing to avoid collisions, and flush on meeting end to avoid losing the last segment.

**Tech Stack:** Rust (Tauri 2 backend), `SegmentAccumulator`, `Arc<AtomicU64>` for lock-free threshold reads.

**Spec:** `docs/superpowers/specs/2026-03-25-new-line-pause-duration-fix-design.md`

---

### Task 1: Add SegmentAccumulator to "Them" STT loop

**Files:**
- Modify: `src-tauri/src/commands/audio_commands.rs:1061-1106`

**Reference:** The legacy path at lines 155–206 of the same file shows the exact pattern to follow.

- [ ] **Step 1: Replace the "Them" transcript processing loop**

Replace lines 1061–1106 (the `if them_stt_provider.is_some() { ... }` block) with accumulator-based processing:

```rust
    // Emit transcript events from "Them" STT (speaker = "Them")
    // Uses SegmentAccumulator to merge consecutive same-speaker segments
    // within the configurable pause threshold, producing longer lines.
    if them_stt_provider.is_some() {
        let stt_app = app.clone();
        let prefix = session_prefix.clone();
        let intel_arc = app.state::<AppState>().intelligence.clone();
        let pause_threshold = app.state::<AppState>().pause_threshold_ms.clone();
        tokio::spawn(async move {
            use std::sync::atomic::Ordering;
            let threshold = pause_threshold.load(Ordering::Relaxed);
            let mut accumulator =
                crate::stt::segment_accumulator::SegmentAccumulator::new(threshold);

            while let Some(result) = them_stt_rx.recv().await {
                // Live-update threshold from settings changes
                let current_threshold = pause_threshold.load(Ordering::Relaxed);
                accumulator.set_pause_threshold(current_threshold);

                let outputs = accumulator.feed_result(result);
                for output in outputs {
                    let event_name = if output.is_final {
                        "transcript_final"
                    } else {
                        "transcript_update"
                    };
                    // Namespace IDs to avoid collision with "You" accumulator
                    let seg_id = format!("them_{}_{}", prefix, output.id);
                    // Extract diarized speaker_id from accumulator output
                    let speaker_id_val = if output.speaker.starts_with("speaker_") {
                        Some(output.speaker.clone())
                    } else {
                        None
                    };
                    let mut seg = serde_json::json!({
                        "id": seg_id,
                        "text": output.text,
                        "speaker": "Them",
                        "timestamp_ms": output.timestamp_ms,
                        "is_final": output.is_final,
                        "confidence": output.confidence
                    });
                    if let Some(ref sid) = speaker_id_val {
                        seg["speaker_id"] = serde_json::json!(sid);
                    }
                    let payload = serde_json::json!({ "segment": seg });
                    let _ = stt_app.emit(event_name, &payload);

                    // Push final segments to the intelligence engine
                    if output.is_final {
                        if let Some(ref intel) = intel_arc {
                            if let Ok(mut engine) = intel.lock() {
                                engine.push_transcript(
                                    output.text.clone(),
                                    "Them".to_string(),
                                    output.timestamp_ms,
                                    true,
                                );
                            }
                        }
                    }
                }
            }

            // Flush remaining accumulated segment on meeting end
            if let Some(output) = accumulator.flush() {
                let seg_id = format!("them_{}_{}", prefix, output.id);
                let speaker_id_val = if output.speaker.starts_with("speaker_") {
                    Some(output.speaker.clone())
                } else {
                    None
                };
                let mut seg = serde_json::json!({
                    "id": seg_id,
                    "text": output.text,
                    "speaker": "Them",
                    "timestamp_ms": output.timestamp_ms,
                    "is_final": output.is_final,
                    "confidence": output.confidence
                });
                if let Some(ref sid) = speaker_id_val {
                    seg["speaker_id"] = serde_json::json!(sid);
                }
                let payload = serde_json::json!({ "segment": seg });
                let _ = stt_app.emit("transcript_final", &payload);

                if let Some(ref intel) = intel_arc {
                    if let Ok(mut engine) = intel.lock() {
                        engine.push_transcript(
                            output.text.clone(),
                            "Them".to_string(),
                            output.timestamp_ms,
                            true,
                        );
                    }
                }
            }
        });
    }
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | head -30`
Expected: No errors related to `audio_commands.rs`

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/audio_commands.rs
git commit -m "fix(stt): add SegmentAccumulator to Them loop in start_capture_per_party

The pauseThresholdMs setting was ignored because start_capture_per_party
emitted every STT result directly without merging. Now routes Them results
through SegmentAccumulator with ID namespacing, intelligence engine push,
and flush on meeting end."
```

---

### Task 2: Add conditional SegmentAccumulator to "You" STT loop

**Files:**
- Modify: `src-tauri/src/commands/audio_commands.rs:1020-1059`

- [ ] **Step 1: Replace the "You" transcript processing loop**

Replace lines 1020–1059 (the `if you_stt_provider.is_some() { ... }` block) with conditional accumulator-based processing. The `you.stt_provider` string is available in scope (parsed at line 791).

```rust
    // Emit transcript events from "You" STT (speaker = "User")
    // Uses SegmentAccumulator for cloud providers (Deepgram, Groq, etc.)
    // Skips accumulator for web_speech (browser handles segmentation)
    // and whisper_cpp (dual-pass engine manages its own line breaking).
    if you_stt_provider.is_some() {
        let stt_app = app.clone();
        let prefix = session_prefix.clone();
        let use_accumulator = you.stt_provider != "web_speech"
            && you.stt_provider != "whisper_cpp";
        let pause_threshold = if use_accumulator {
            Some(app.state::<AppState>().pause_threshold_ms.clone())
        } else {
            None
        };
        tokio::spawn(async move {
            if let Some(pause_threshold) = pause_threshold {
                // Accumulator path: merge same-speaker segments
                use std::sync::atomic::Ordering;
                let threshold = pause_threshold.load(Ordering::Relaxed);
                let mut accumulator =
                    crate::stt::segment_accumulator::SegmentAccumulator::new(threshold);

                while let Some(result) = you_stt_rx.recv().await {
                    let current_threshold = pause_threshold.load(Ordering::Relaxed);
                    accumulator.set_pause_threshold(current_threshold);

                    let outputs = accumulator.feed_result(result);
                    for output in outputs {
                        let event_name = if output.is_final {
                            "transcript_final"
                        } else {
                            "transcript_update"
                        };
                        let seg_id = format!("you_{}_{}", prefix, output.id);
                        let payload = serde_json::json!({
                            "segment": {
                                "id": seg_id,
                                "text": output.text,
                                "speaker": "User",
                                "timestamp_ms": output.timestamp_ms,
                                "is_final": output.is_final,
                                "confidence": output.confidence
                            }
                        });
                        let _ = stt_app.emit(event_name, &payload);
                    }
                }

                // Flush remaining accumulated segment on meeting end
                if let Some(output) = accumulator.flush() {
                    let seg_id = format!("you_{}_{}", prefix, output.id);
                    let payload = serde_json::json!({
                        "segment": {
                            "id": seg_id,
                            "text": output.text,
                            "speaker": "User",
                            "timestamp_ms": output.timestamp_ms,
                            "is_final": true,
                            "confidence": output.confidence
                        }
                    });
                    let _ = stt_app.emit("transcript_final", &payload);
                }
            } else {
                // Direct path: web_speech / whisper_cpp handle their own segmentation
                let mut counter = 0u64;
                while let Some(result) = you_stt_rx.recv().await {
                    let seg_id = if let Some(ref custom_id) = result.segment_id {
                        format!("you_{}_{}", prefix, custom_id)
                    } else {
                        if result.is_final {
                            counter += 1;
                        }
                        if result.is_final {
                            format!("you_{}_{}", prefix, counter)
                        } else {
                            format!("you_{}_{}", prefix, counter + 1)
                        }
                    };
                    let event_name = if result.is_final {
                        "transcript_final"
                    } else {
                        "transcript_update"
                    };
                    let payload = serde_json::json!({
                        "segment": {
                            "id": seg_id,
                            "text": result.text,
                            "speaker": "User",
                            "timestamp_ms": result.timestamp_ms,
                            "is_final": result.is_final,
                            "confidence": result.confidence
                        }
                    });
                    let _ = stt_app.emit(event_name, &payload);
                }
            }
        });
    }
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/audio_commands.rs
git commit -m "fix(stt): add conditional SegmentAccumulator to You loop in start_capture_per_party

Cloud STT providers (Deepgram, Groq) now get segment merging via
SegmentAccumulator. Web Speech and whisper_cpp are skipped since they
handle their own line-breaking. Includes flush on meeting end."
```

---

### Task 3: Bump version and final compile check

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Bump version**

In `src/lib/version.ts`, increment the patch version and update the build date to `2026-03-25`.

- [ ] **Step 2: Full build check**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: `Finished` with no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/version.ts
git commit -m "chore: bump version for pause duration fix"
```
