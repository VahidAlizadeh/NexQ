# Web Speech IPolicy Re-application on Restart

**Date:** 2026-03-21
**Status:** Approved
**Scope:** Bug fix + logging improvement + monitoring bar smoothing

## Problem

When using Web Speech API with Audience Mix (a virtual mixer combining mic + system audio), transcription stops picking up system audio after ~3:47 minutes. Root cause: Chromium's Web Speech API has a hard ~227-second timeout on `continuous = true` sessions, firing `onend` and requiring a restart. The IPolicyConfig override (which redirects the OS default capture device to Audience Mix) is applied once at `start_capture_per_party()` but never re-verified. By the time Web Speech restarts, Windows may have silently reset the OS default back to the physical mic. The backend's cpal capture is unaffected because it opens devices by name, not through the OS default.

Secondary issue: the monitoring bar shows abrupt spikes with minimal fill for mixer-type inputs due to the bursty nature of combined audio streams.

## Solution: Approach A — Frontend IPC verification before each restart

### 1. New Rust command: `ensure_ipolicy_override`

**File:** `src-tauri/src/commands/audio_commands.rs`
**Registration:** `src-tauri/src/lib.rs`

```rust
#[command]
pub async fn ensure_ipolicy_override(app: AppHandle) -> Result<String, String>
```

Logic:
1. Check if `state.original_default_device` has a stored value (override is active)
2. If no override active, return `{ "active": false, "was_drifted": false }`
3. Read current OS default capture endpoint via `get_default_capture_endpoint_id()`
4. Read the target device from the current meeting audio config (whichever party uses web_speech/windows_native)
5. Resolve target device name to endpoint ID via `find_capture_endpoint_id_by_name()`
6. Compare current default vs target endpoint
7. If they differ (drifted): re-apply via `set_default_capture_endpoint()`, log the drift
8. Return `{ "active": true, "was_drifted": bool, "current_device": String }`

Does NOT store a new original — the original is already saved from the initial override.

### 2. Frontend IPC wrapper

**File:** `src/lib/ipc.ts`

```typescript
export interface IpolicyStatus {
  active: boolean;
  was_drifted: boolean;
  current_device?: string;
}

export async function ensureIpolicyOverride(): Promise<IpolicyStatus> {
  const result = await invoke<string>("ensure_ipolicy_override");
  return JSON.parse(result);
}
```

### 3. Updated `useSpeechRecognition` restart path

**File:** `src/hooks/useSpeechRecognition.ts`

The `onend` handler's `setTimeout` callback becomes async:

```
onend fires
  → setTimeout(async () => {
      const ipolicy = await ensureIpolicyOverride();
      log ipolicy result
      recognition.start()  // OS default is now correct
    }, delay)
```

Same IPolicy verification applies to the fresh-instance fallback path.

### 4. Monitoring bar EMA smoothing

**File:** `src/hooks/useAudioLevel.ts`

Add exponential moving average to `level` values:
- `smoothed = prev * 0.7 + current * 0.3` (alpha = 0.7)
- Applied in the event handler before `setState`
- Uses refs to track previous smoothed values (no extra re-renders)
- `peak` values keep their existing 0.95 decay — no change

### 5. Logging improvements

**Rust (`audio_commands.rs`):**
- `log::info!` when IPolicy verification is requested
- `log::warn!` when drift is detected and corrected
- `log::debug!` with endpoint IDs for diagnostics

**Frontend (`useSpeechRecognition.ts`):**
- Log restart reason context: `[STT] Web Speech onend | restart #N, delay Xms`
- Log IPolicy check result: `[STT] IPolicy verified (no drift)` or `[STT] IPolicy drift corrected`
- Log fresh-instance path: `[STT] Web Speech creating fresh instance (restart failed)`
- Prefix all logs with `[STT]` consistently

### 6. Version bump

**File:** `src/lib/version.ts`
- `NEXQ_VERSION`: `1.20.0` → `1.21.0`
- `NEXQ_BUILD_DATE`: updated to `2026-03-21`
- Comment: `v1.21.0: Fix Web Speech IPolicy drift on Chromium timeout restart`

## Files changed

| File | Change |
|------|--------|
| `src-tauri/src/commands/audio_commands.rs` | Add `ensure_ipolicy_override` command |
| `src-tauri/src/lib.rs` | Register new command |
| `src/lib/ipc.ts` | Add `ensureIpolicyOverride()` wrapper + `IpolicyStatus` type |
| `src/lib/types.ts` | Add `IpolicyStatus` type (if needed for reuse) |
| `src/hooks/useSpeechRecognition.ts` | Async restart with IPolicy verification + improved logging |
| `src/hooks/useAudioLevel.ts` | EMA smoothing on level values |
| `src/lib/version.ts` | Version bump to 1.21.0 |

## What this does NOT change

- No changes to `device_default.rs` — the IPolicy primitives are correct
- No changes to the monitoring bar's visual design (CSS, layout)
- No changes to cpal capture or backend audio pipeline
- No changes to other STT providers
- No periodic polling or watchdog — verification is on-demand only
