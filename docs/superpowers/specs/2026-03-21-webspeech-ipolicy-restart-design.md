# Web Speech IPolicy Re-application on Restart

**Date:** 2026-03-21
**Status:** Approved
**Scope:** Bug fix + logging improvement + monitoring bar smoothing

## Problem

When using Web Speech API with Audience Mix (a virtual mixer combining mic + system audio), transcription stops picking up system audio after ~3:47 minutes. Root cause: Chromium's Web Speech API has a hard ~227-second timeout on `continuous = true` sessions, firing `onend` and requiring a restart. The IPolicyConfig override (which redirects the OS default capture device to Audience Mix) is applied once at `start_capture_per_party()` but never re-verified. By the time Web Speech restarts, Windows may have silently reset the OS default back to the physical mic (confirmed by user testing: monitoring bar still shows Audience Mix activity from cpal capture, but Web Speech only transcribes physical mic after restart). The backend's cpal capture is unaffected because it opens devices by name, not through the OS default.

Secondary issue: the monitoring bar shows abrupt spikes with minimal fill for mixer-type inputs due to the bursty nature of combined audio streams.

## Solution: Approach A — Frontend IPC verification before each restart

### 1. New AppState field: `ipolicy_target_endpoint`

**File:** `src-tauri/src/state.rs`

Add a new field to `AppState`:
```rust
pub ipolicy_target_endpoint: Arc<Mutex<Option<String>>>,
```

This stores the resolved Windows endpoint ID of the IPolicy target device (e.g., Audience Mix). Set during the initial override in `start_capture_per_party()` alongside the existing `original_default_device`. Cleared on `stop_capture()` / `restore_default_device_if_overridden()`.

This avoids needing to re-resolve device names or access meeting audio config from the backend (which is not persisted in `AppState`).

### 2. New Rust command: `ensure_ipolicy_override`

**File:** `src-tauri/src/commands/audio_commands.rs`
**Registration:** `src-tauri/src/lib.rs`

```rust
#[command]
pub async fn ensure_ipolicy_override(app: AppHandle) -> Result<String, String>
```

Logic:
1. Read `state.original_default_device` (non-destructive peek via `.lock()` + `.clone()`, NOT `.take()`) — if `None`, override is not active
2. If no override active, return `{ "active": false, "was_drifted": false }`
3. Read `state.ipolicy_target_endpoint` (non-destructive peek) — this is the endpoint the OS default should be set to
4. Initialize COM via `CoInitializeEx(COINIT_MULTITHREADED)` with the same guard pattern used in `override_default_capture_device` (handle `S_FALSE` and `RPC_E_CHANGED_MODE`)
5. Read current OS default capture endpoint via `get_default_capture_endpoint_id()`
6. Compare current default vs stored target endpoint
7. If they differ (drifted): re-apply via `set_default_capture_endpoint(&target)`, log the drift
8. `CoUninitialize` if we initialized
9. Return `{ "active": true, "was_drifted": bool, "current_device": String }`

Does NOT modify `original_default_device` or `ipolicy_target_endpoint` — reads only. The original is already saved from the initial override.

Concurrent calls are idempotent and safe (verify + set is the same operation regardless of caller count).

### 3. Store target endpoint during initial override

**File:** `src-tauri/src/commands/audio_commands.rs` (in `start_capture_per_party`)

After the existing `override_default_capture_device()` call succeeds and stores the original, also resolve and store the target endpoint ID:
```rust
// After storing original_default_device...
let target_endpoint = find_capture_endpoint_id_by_name(target_device)?;
if let Ok(mut guard) = state.ipolicy_target_endpoint.lock() {
    *guard = Some(target_endpoint);
}
```

Clear `ipolicy_target_endpoint` in `restore_default_device_if_overridden()` alongside the existing `original_default_device.take()`.

### 4. Frontend IPC wrapper

**File:** `src/lib/types.ts` (single source of truth for types)

```typescript
export interface IpolicyStatus {
  active: boolean;
  was_drifted: boolean;
  current_device?: string;
}
```

**File:** `src/lib/ipc.ts`

```typescript
export async function ensureIpolicyOverride(): Promise<IpolicyStatus> {
  const result = await invoke<string>("ensure_ipolicy_override");
  return JSON.parse(result);
}
```

### 5. Updated `useSpeechRecognition` restart path

**File:** `src/hooks/useSpeechRecognition.ts`

The `onend` handler's `setTimeout` callback becomes async. The IPC call is wrapped in try/catch so that Web Speech always restarts even if IPolicy verification fails:

```
onend fires
  → setTimeout(async () => {
      // Verify IPolicy before restarting — but never block restart on failure
      try {
        const ipolicy = await ensureIpolicyOverride();
        if (ipolicy.was_drifted) {
          console.warn("[STT] IPolicy drift corrected before restart");
        } else if (ipolicy.active) {
          console.log("[STT] IPolicy verified (no drift)");
        }
      } catch (err) {
        console.warn("[STT] IPolicy verification failed, proceeding anyway:", err);
      }
      recognition.start()  // OS default is now correct (or best-effort)
    }, delay)
```

Same try/catch + IPolicy verification applies to the fresh-instance fallback path (the `catch` block that creates a new `SpeechRecognition` instance).

### 6. Monitoring bar EMA smoothing

**File:** `src/hooks/useAudioLevel.ts`

Add exponential moving average to `level` values:
- `smoothed = prev * 0.7 + current * 0.3` at 20Hz (~150ms time constant, reaches 95% of step change in ~500ms)
- Applied in the event handler before `setState`
- Uses refs (`micSmoothedRef`, `systemSmoothedRef`) to track previous smoothed values — no extra re-renders
- Initialized to 0 — first few frames ramp up from zero, creating a brief fade-in on session start (intentional)
- `peak` values keep their existing 0.95 decay — no change

### 7. Logging improvements

**Rust (`audio_commands.rs`):**
- `log::info!` when IPolicy verification is requested
- `log::warn!` when drift is detected and corrected, including endpoint IDs
- `log::debug!` with current and target endpoint IDs for diagnostics

**Frontend (`useSpeechRecognition.ts`):**
- Log restart reason context: `[STT] Web Speech onend | restart #N, delay Xms`
- Log IPolicy check result: `[STT] IPolicy verified (no drift)` or `[STT] IPolicy drift corrected`
- Log fresh-instance path: `[STT] Web Speech creating fresh instance (restart failed)`
- Log IPolicy verification failure: `[STT] IPolicy verification failed, proceeding anyway`
- Prefix all logs with `[STT]` consistently

### 8. Version bump

**File:** `src/lib/version.ts`
- `NEXQ_VERSION`: `1.20.0` → `1.21.0`
- `NEXQ_BUILD_DATE`: updated to `2026-03-21`
- Comment: `v1.21.0: Fix Web Speech IPolicy drift on Chromium timeout restart`

## Files changed

| File | Change |
|------|--------|
| `src-tauri/src/state.rs` | Add `ipolicy_target_endpoint: Arc<Mutex<Option<String>>>` field |
| `src-tauri/src/commands/audio_commands.rs` | Add `ensure_ipolicy_override` command; store target endpoint in `start_capture_per_party`; clear in restore helper |
| `src-tauri/src/lib.rs` | Register `ensure_ipolicy_override` command |
| `src/lib/types.ts` | Add `IpolicyStatus` type |
| `src/lib/ipc.ts` | Add `ensureIpolicyOverride()` wrapper |
| `src/hooks/useSpeechRecognition.ts` | Async restart with IPolicy verification (try/catch) + improved logging |
| `src/hooks/useAudioLevel.ts` | EMA smoothing on level values |
| `src/lib/version.ts` | Version bump to 1.21.0 |

## Edge cases

- **IPolicy verification fails (COM error, device disconnected):** Frontend catches the error and proceeds with `recognition.start()` anyway — partial functionality is better than no restart
- **Concurrent hot-swap during verification:** The command only reads `original_default_device` and `ipolicy_target_endpoint` (non-destructive peek), so hot-swap's `.take()` does not race destructively
- **Multiple rapid restarts:** `ensure_ipolicy_override` is idempotent — concurrent calls are safe
- **Target device disconnected:** `set_default_capture_endpoint` will fail, command returns error, frontend catches and proceeds

## What this does NOT change

- No changes to `device_default.rs` — the IPolicy primitives are correct
- No changes to the monitoring bar's visual design (CSS, layout)
- No changes to cpal capture or backend audio pipeline
- No changes to other STT providers
- No periodic polling or watchdog — verification is on-demand only
