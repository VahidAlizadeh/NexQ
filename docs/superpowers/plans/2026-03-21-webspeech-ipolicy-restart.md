# Web Speech IPolicy Restart Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Web Speech losing the Audience Mix audio device after Chromium's ~227s timeout restart by verifying/re-applying IPolicyConfig before each restart.

**Architecture:** New Rust IPC command `ensure_ipolicy_override` verifies the OS default capture device matches the IPolicy target and re-applies if drifted. Frontend's `useSpeechRecognition` hook calls this before every `recognition.start()` in the restart path. Also adds EMA smoothing to the audio monitoring bar.

**Tech Stack:** Rust (Windows COM/IPolicyConfig), TypeScript/React (Tauri IPC), Zustand hooks

**Spec:** `docs/superpowers/specs/2026-03-21-webspeech-ipolicy-restart-design.md`

---

### Task 1: Add `ipolicy_target_endpoint` field to AppState

**Files:**
- Modify: `src-tauri/src/state.rs:23-50` (AppState struct)
- Modify: `src-tauri/src/state.rs:52-73` (AppState::new)

- [ ] **Step 1: Add the field to the AppState struct**

In `src-tauri/src/state.rs`, add after `original_default_device` (line 49):

```rust
    /// Resolved Windows endpoint ID of the IPolicyConfig target device.
    /// Set alongside original_default_device; used by ensure_ipolicy_override
    /// to verify the OS default hasn't drifted.
    pub ipolicy_target_endpoint: Arc<Mutex<Option<String>>>,
```

- [ ] **Step 2: Initialize the field in AppState::new()**

In the `Self { ... }` block, add after `original_default_device: Arc::new(Mutex::new(None)),` (line 70):

```rust
            ipolicy_target_endpoint: Arc::new(Mutex::new(None)),
```

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check 2>&1 | head -5`
Expected: compiles successfully (no errors)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/state.rs
git commit -m "feat(state): add ipolicy_target_endpoint field to AppState"
```

---

### Task 2: Store target endpoint during initial IPolicy override

**Files:**
- Modify: `src-tauri/src/commands/audio_commands.rs:808-828` (start_capture_per_party IPolicy section)

- [ ] **Step 1: Store the target endpoint ID after successful override**

In `audio_commands.rs`, inside the `Ok(Some(original))` match arm (after line 813 where `original_default_device` is stored), add:

```rust
                    // Also store the resolved target endpoint for ensure_ipolicy_override
                    match crate::audio::device_default::find_capture_endpoint_id_by_name(target_device) {
                        Ok(target_ep) => {
                            if let Ok(mut guard) = state.ipolicy_target_endpoint.lock() {
                                *guard = Some(target_ep.clone());
                            }
                            crate::stt::emit_stt_debug(&app, "info", "ipolicy",
                                &format!("IPolicyConfig: stored target endpoint '{}'", target_ep));
                        }
                        Err(e) => {
                            crate::stt::emit_stt_debug(&app, "warn", "ipolicy",
                                &format!("IPolicyConfig: could not resolve target endpoint: {}", e));
                        }
                    }
```

- [ ] **Step 2: Also store target when device is already the default (Ok(None) arm)**

In the `Ok(None)` match arm (line 829-833), the device is already the default so we still need the target endpoint stored. Add after the existing debug log:

```rust
                    // Still store the target endpoint — it IS the current default
                    match crate::audio::device_default::get_default_capture_endpoint_id() {
                        Ok(ep) => {
                            if let Ok(mut guard) = state.ipolicy_target_endpoint.lock() {
                                *guard = Some(ep);
                            }
                        }
                        Err(_) => {}
                    }
```

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check 2>&1 | head -5`
Expected: compiles successfully

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/audio_commands.rs
git commit -m "feat(audio): store IPolicy target endpoint during initial override"
```

---

### Task 3: Clear target endpoint in restore helper

**Files:**
- Modify: `src-tauri/src/commands/audio_commands.rs:1546-1568` (restore_default_device_if_overridden)

- [ ] **Step 1: Clear `ipolicy_target_endpoint` alongside `original_default_device`**

In `restore_default_device_if_overridden()`, after the existing `guard.take()` on line 1549, add a block to also clear the target endpoint. Insert after line 1551 (the `Err(_) => return` line):

```rust
    // Also clear the target endpoint
    if let Ok(mut target_guard) = state.ipolicy_target_endpoint.lock() {
        target_guard.take();
    }
```

- [ ] **Step 2: Verify compilation**

Run: `cd src-tauri && cargo check 2>&1 | head -5`
Expected: compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/audio_commands.rs
git commit -m "fix(audio): clear IPolicy target endpoint on restore"
```

---

### Task 4: Add `ensure_ipolicy_override` Rust command

**Files:**
- Modify: `src-tauri/src/commands/audio_commands.rs` (add new command before `restore_default_device_if_overridden`)

- [ ] **Step 1: Add the command function**

Insert before the `// ── IPolicyConfig restore helper` comment (line 1540):

```rust
// ── IPolicyConfig verification for Web Speech restart ───────────────

/// Verify the OS default capture device still matches the IPolicy target.
/// If Windows has reset the default (drift), re-apply the override.
/// Called by the frontend before each Web Speech restart.
/// Non-destructive: only reads original_default_device and ipolicy_target_endpoint.
#[command]
pub async fn ensure_ipolicy_override(app: AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();

    // 1. Check if an override is active (peek, not take)
    let original = match state.original_default_device.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => return Err("State lock poisoned".to_string()),
    };
    if original.is_none() {
        return serde_json::to_string(&serde_json::json!({
            "active": false,
            "was_drifted": false
        })).map_err(|e| e.to_string());
    }

    // 2. Get the target endpoint (peek, not take)
    let target = match state.ipolicy_target_endpoint.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => return Err("State lock poisoned".to_string()),
    };
    let target = match target {
        Some(t) => t,
        None => {
            log::warn!("IPolicyConfig: override active but no target endpoint stored");
            return serde_json::to_string(&serde_json::json!({
                "active": true,
                "was_drifted": false,
                "current_device": ""
            })).map_err(|e| e.to_string());
        }
    };

    // 3. Read current OS default (handles COM init internally)
    log::info!("IPolicyConfig: verifying default capture device...");

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

        let result = unsafe {
            let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
            let we_initialized = hr.0 == 0;
            if hr.is_err() && hr.0 as u32 != 0x80010106 {
                return Err(format!("CoInitializeEx failed: 0x{:08X}", hr.0));
            }

            let res = (|| -> Result<String, String> {
                let current = crate::audio::device_default::get_default_capture_endpoint_id()?;
                log::debug!("IPolicyConfig verify: current='{}', target='{}'", current, target);

                let was_drifted = current != target;
                if was_drifted {
                    log::warn!(
                        "IPolicyConfig: drift detected! current='{}' != target='{}', re-applying...",
                        current, target
                    );
                    crate::audio::device_default::set_default_capture_endpoint(&target)?;
                    crate::stt::emit_stt_debug(&app, "warn", "ipolicy",
                        &format!("IPolicyConfig drift corrected: '{}' → '{}'", current, target));
                } else {
                    log::info!("IPolicyConfig: no drift — default is still correct");
                }

                serde_json::to_string(&serde_json::json!({
                    "active": true,
                    "was_drifted": was_drifted,
                    "current_device": target
                })).map_err(|e| e.to_string())
            })();

            if we_initialized {
                CoUninitialize();
            }
            res
        };
        result
    }

    #[cfg(not(target_os = "windows"))]
    {
        serde_json::to_string(&serde_json::json!({
            "active": false,
            "was_drifted": false
        })).map_err(|e| e.to_string())
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd src-tauri && cargo check 2>&1 | head -5`
Expected: compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/audio_commands.rs
git commit -m "feat(audio): add ensure_ipolicy_override command for Web Speech restart"
```

---

### Task 5: Register the new command in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs:362-378` (invoke_handler audio commands section)

- [ ] **Step 1: Add the command to the handler list**

In `lib.rs`, add after `audio_commands::get_mute_status,` (line 378):

```rust
            audio_commands::ensure_ipolicy_override,
```

- [ ] **Step 2: Verify compilation**

Run: `cd src-tauri && cargo check 2>&1 | head -5`
Expected: compiles successfully

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(lib): register ensure_ipolicy_override command"
```

---

### Task 6: Add `IpolicyStatus` type and IPC wrapper

**Files:**
- Modify: `src/lib/types.ts:22-26` (after AudioLevel interface, in AUDIO TYPES section)
- Modify: `src/lib/ipc.ts:6-24` (import list) and `src/lib/ipc.ts:63-65` (after stopAudioTest, in Audio IPC section)

- [ ] **Step 1: Add `IpolicyStatus` type to types.ts**

In `src/lib/types.ts`, add after the `AudioLevel` interface (after line 26):

```typescript

export interface IpolicyStatus {
  active: boolean;
  was_drifted: boolean;
  current_device?: string;
}
```

- [ ] **Step 2: Add import in ipc.ts**

In `src/lib/ipc.ts`, add `IpolicyStatus` to the import list from `"./types"` (line 7-24). Add after the existing imports:

```typescript
  IpolicyStatus,
```

- [ ] **Step 3: Add `ensureIpolicyOverride` function in ipc.ts**

In `src/lib/ipc.ts`, add after `stopAudioTest` function (after line 64):

```typescript

export async function ensureIpolicyOverride(): Promise<IpolicyStatus> {
  const result = await invoke<string>("ensure_ipolicy_override");
  return JSON.parse(result);
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/ipc.ts
git commit -m "feat(ipc): add IpolicyStatus type and ensureIpolicyOverride wrapper"
```

---

### Task 7: Update `useSpeechRecognition` with async IPolicy verification + improved logging

**Files:**
- Modify: `src/hooks/useSpeechRecognition.ts:17` (add import)
- Modify: `src/hooks/useSpeechRecognition.ts:193-240` (onend handler)

- [ ] **Step 1: Add import for ensureIpolicyOverride**

In `src/hooks/useSpeechRecognition.ts`, add to imports (after line 17):

```typescript
import { ensureIpolicyOverride } from "../lib/ipc";
```

Note: `pushTranscript` import is already on line 17 from `"../lib/ipc"`, so merge into that existing import:

```typescript
import { pushTranscript, ensureIpolicyOverride } from "../lib/ipc";
```

- [ ] **Step 2: Replace the `onend` handler (lines 193-240)**

Replace the entire `recognition.onend = () => { ... };` block with:

```typescript
    recognition.onend = () => {
      // Only restart if this is still the current instance
      if (instanceIdRef.current !== myInstanceId) return;
      if (!shouldRestartRef.current || !recognitionRef.current) return;

      // Backoff: 300ms, 600ms, 1200ms, capped at 2000ms
      const delay = Math.min(300 * Math.pow(2, restartFailCountRef.current), 2000);
      const restartNum = restartFailCountRef.current + 1;

      console.log(`[STT] Web Speech onend | restart #${restartNum}, delay ${delay}ms`);

      setTimeout(async () => {
        if (instanceIdRef.current !== myInstanceId) return;
        if (!shouldRestartRef.current || !recognitionRef.current) return;

        // Check fresh config
        const freshCfg = useConfigStore.getState().meetingAudioConfig;
        const stillActive =
          (freshCfg?.you.stt_provider === "web_speech" && freshCfg?.you.is_input_device) ||
          (freshCfg?.them.stt_provider === "web_speech" && freshCfg?.them.is_input_device);
        if (!stillActive) return;

        // Verify IPolicy before restarting — never block restart on failure
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

        // Guard again after async — state may have changed during IPolicy check
        if (instanceIdRef.current !== myInstanceId) return;
        if (!shouldRestartRef.current || !recognitionRef.current) return;

        try {
          recognitionRef.current!.start();
          console.log("[STT] Web Speech auto-restarted (delay:", delay, "ms)");
        } catch (err) {
          restartFailCountRef.current += 1;
          console.warn("[STT] Web Speech restart failed, will retry:", err);
          // Force another onend to trigger retry with longer backoff
          // by creating a fresh instance
          if (restartFailCountRef.current <= 5) {
            try {
              // Re-verify IPolicy before fresh instance — device may have drifted
              try {
                await ensureIpolicyOverride();
              } catch {
                // proceed anyway
              }
              const fresh = new SpeechRecognition();
              fresh.continuous = true;
              fresh.interimResults = true;
              fresh.maxAlternatives = 1;
              fresh.lang = "en-US";
              // Copy handlers from old instance
              fresh.onresult = recognitionRef.current!.onresult;
              fresh.onerror = recognitionRef.current!.onerror;
              fresh.onend = recognitionRef.current!.onend;
              recognitionRef.current = fresh;
              fresh.start();
              console.log("[STT] Web Speech creating fresh instance (restart failed)");
            } catch {
              console.error("[STT] Web Speech fresh instance creation also failed");
            }
          }
        }
      }, delay);
    };
```

Key changes from original:
- `setTimeout` callback is now `async`
- Calls `ensureIpolicyOverride()` wrapped in try/catch before `.start()`
- Re-checks instance guards after the async IPolicy call
- Improved log messages with restart number and delay context

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSpeechRecognition.ts
git commit -m "fix(stt): verify IPolicy before Web Speech restart to prevent device drift"
```

---

### Task 8: Add EMA smoothing to `useAudioLevel`

**Files:**
- Modify: `src/hooks/useAudioLevel.ts:29-31` (add smoothing refs)
- Modify: `src/hooks/useAudioLevel.ts:40-66` (event handler)

- [ ] **Step 1: Add smoothing refs after the peak refs (after line 31)**

```typescript
  // EMA smoothing refs — reduces spiky behavior for mixer-type inputs
  const micSmoothedRef = useRef(0);
  const systemSmoothedRef = useRef(0);
```

- [ ] **Step 2: Apply EMA smoothing in the Mic handler (lines 40-53)**

Replace the Mic branch:

```typescript
        if (event.source === "Mic") {
          // EMA smoothing: smooth = prev * 0.7 + current * 0.3
          micSmoothedRef.current = micSmoothedRef.current * 0.7 + event.level * 0.3;

          // Update peak with decay
          if (event.peak > micPeakRef.current) {
            micPeakRef.current = event.peak;
          } else {
            // Decay peak slowly
            micPeakRef.current = micPeakRef.current * 0.95;
          }

          setState((prev) => ({
            ...prev,
            micLevel: micSmoothedRef.current,
            micPeak: micPeakRef.current,
          }));
```

- [ ] **Step 3: Apply EMA smoothing in the System handler (lines 54-66)**

Replace the System branch:

```typescript
        } else if (event.source === "System") {
          // EMA smoothing: smooth = prev * 0.7 + current * 0.3
          systemSmoothedRef.current = systemSmoothedRef.current * 0.7 + event.level * 0.3;

          if (event.peak > systemPeakRef.current) {
            systemPeakRef.current = event.peak;
          } else {
            systemPeakRef.current = systemPeakRef.current * 0.95;
          }

          setState((prev) => ({
            ...prev,
            systemLevel: systemSmoothedRef.current,
            systemPeak: systemPeakRef.current,
          }));
        }
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAudioLevel.ts
git commit -m "fix(audio): add EMA smoothing to audio level monitoring bar"
```

---

### Task 9: Version bump

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Update version and build date**

Replace the full contents of `src/lib/version.ts`:

```typescript
// NexQ version — update on every release / significant fix.
// Displayed in the launcher footer and about page.
export const NEXQ_VERSION = "1.21.0";
export const NEXQ_BUILD_DATE = "2026-03-21"; // v1.21.0: Fix Web Speech IPolicy drift on Chromium timeout restart + EMA audio smoothing
export const NEXQ_DEVELOPER = "Vahid Alizadeh";
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/version.ts
git commit -m "chore: bump version to v1.21.0"
```

---

### Task 10: Full build verification

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Run Rust check**

Run: `cd src-tauri && cargo check`
Expected: compiles successfully

- [ ] **Step 3: Run full build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 4: Run Tauri dev to smoke test**

Run: `npx tauri dev`
Manual verification:
1. Start a meeting with Web Speech + Audience Mix device
2. Check dev console logs for `[STT] IPolicy verified` messages on restart
3. Confirm the monitoring bar is smoother (no abrupt spikes)
4. Let it run past 3:47 to confirm system audio continues transcribing
