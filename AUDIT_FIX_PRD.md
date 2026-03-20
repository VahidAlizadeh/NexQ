# NexQ Audit Fix PRD — Post-v1.0 Pipeline & Stub Remediation

## Context
Full codebase audit revealed 22 issues across 4 severity levels after the initial 12-sub-PRD parallel build. Core audio/STT pipeline was disconnected (now partially fixed), but many stubs, broken wiring, and missing persistence remain.

## Phases

### Phase 1: Backend Core Wiring (CRITICAL + HIGH)
**Goal:** Fix broken data pipelines in Rust backend.

| ID | Fix | File(s) | What |
|----|-----|---------|------|
| C3 | STT provider selection | `commands/audio_commands.rs` | Read user's configured STT provider from STTRouter instead of hardcoding WindowsNative |
| M4 | Audio recording pipeline | `commands/audio_commands.rs` | When recording enabled, write audio chunks to recorder in the capture task |
| H4 | Deepgram silence threshold | `stt/deepgram.rs` | Use chunk.is_speech (VAD result) instead of hardcoded RMS < 100 |
| H5 | Batch STT final flush | `stt/whisper_api.rs`, `azure_speech.rs`, `groq_whisper.rs` | Await final audio segment in stop_stream instead of fire-and-forget |
| H6 | Ollama context window | `llm/ollama.rs` | Parse context_length from model details API |
| C2 | Fix STTRouter.start_processing | `stt/mod.rs` | Spawn task to consume _audio_rx and feed provider |

### Phase 2: Frontend Settings Persistence (HIGH)
**Goal:** Settings changes actually propagate to backend services.

| ID | Fix | File(s) | What |
|----|-----|---------|------|
| H3 | Context window → backend | `settings/GeneralSettings.tsx` | Call `setContextWindowSeconds()` IPC on slider change |
| M6 | Auto-trigger → backend | `settings/GeneralSettings.tsx` | Call `setAutoTrigger()` IPC on toggle change |
| H1 | Data directory picker | `settings/GeneralSettings.tsx` | Implement via `@tauri-apps/plugin-dialog` open() |
| H2 | Hotkey persistence | `settings/HotkeySettings.tsx` | Register new bindings with `tauri-plugin-global-shortcut` |
| H7 | Model refresh button | `settings/LLMSettings.tsx` | Add "Refresh" button next to model dropdown |
| H8 | Recording toast feedback | `settings/AudioSettings.tsx` | Show toast on recording enable/disable |

### Phase 3: UI Completeness (MEDIUM)
**Goal:** Fill remaining UI gaps visible to users.

| ID | Fix | File(s) | What |
|----|-----|---------|------|
| M1 | MeetingDetails live update | `launcher/MeetingDetails.tsx` | Subscribe to transcript events during active meeting |
| M2 | StatusBar live latency | `overlay/StatusBar.tsx` | Read latency from streamStore (already tracked there) |
| M5 | QuestionDetector click | `overlay/QuestionDetector.tsx` | Click detected question → populate AskInput + trigger assist |
| M7 | Auto-start on login | `App.tsx` or `LauncherView.tsx` | If startOnLogin enabled, auto-trigger startMeetingFlow on mount |

### Phase 4: Cleanup (LOW)
**Goal:** Remove dead code and fix cosmetics.

| ID | Fix | File(s) | What |
|----|-----|---------|------|
| L1 | Remove unused get_audio_levels | `audio/mod.rs` | Dead method, levels computed in task |
| L4 | Remove legacy test_device stub | `device_manager.rs`, `audio_commands.rs`, `lib.rs`, `ipc.ts` | Superseded by start_audio_test/stop_audio_test |
| L2 | ReadyStep dynamic shortcuts | `wizard/ReadyStep.tsx` | Read from configStore instead of hardcoding |
| L3 | TokenBudget theme colors | `context/TokenBudget.tsx` | Use CSS variables instead of hardcoded hex |

## Success Criteria
- `cargo check` passes with no new warnings
- `npx tsc --noEmit` passes clean
- All settings changes persist to backend AND survive restart
- Audio recording produces valid WAV when enabled
- STT provider selection respects user config
