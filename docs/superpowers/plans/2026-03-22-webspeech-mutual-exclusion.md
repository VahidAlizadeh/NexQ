# Web Speech Mutual Exclusion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent both parties from selecting Web Speech / Windows Speech simultaneously, with click-to-steal confirmation and automatic fallback.

**Architecture:** Add `isExclusiveLocked()` check alongside existing `isAvailable()` in both ProviderSelect (settings) and STTPickerDropdown (footer). Locked options render greyed with "(in use by [party])" sublabel. Clicking triggers inline confirmation → atomic config update → toast. Config migration handles old dual-exclusive configs.

**Tech Stack:** React 18, TypeScript, Zustand (configStore), Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-22-webspeech-mutual-exclusion-design.md`

---

### Task 1: Add shared constants and helpers

**Files:**
- Modify: `src/settings/MeetingAudioSettings.tsx:43-131` (after STT_OPTIONS)

- [ ] **Step 1: Add exclusive provider constants and helper functions**

After the `STT_OPTIONS` array (after line 131), add:

```typescript
// ── Web Speech / Windows Speech mutual exclusion ──
// These providers capture from the OS default mic via a single SpeechRecognition instance.
// Only one can be active across both parties at any time.
const EXCLUSIVE_PROVIDERS: STTProviderType[] = ["web_speech", "windows_native"];

const EXCLUSIVE_FALLBACK_ORDER: STTProviderType[] = [
  "deepgram", "groq_whisper", "whisper_api", "azure_speech",
  "sherpa_onnx", "ort_streaming", "parakeet_tdt",
];

function isExclusiveProvider(provider: string): boolean {
  return EXCLUSIVE_PROVIDERS.includes(provider as STTProviderType);
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/settings/MeetingAudioSettings.tsx
git commit -m "feat(audio): add exclusive provider constants for Web Speech mutual exclusion"
```

---

### Task 2: Add `otherPartyProvider` prop to ProviderSelect and render locked options

**Files:**
- Modify: `src/settings/MeetingAudioSettings.tsx:516-541` (PartyPanel props + call site)
- Modify: `src/settings/MeetingAudioSettings.tsx:670-676` (ProviderSelect usage in PartyPanel)
- Modify: `src/settings/MeetingAudioSettings.tsx:700-854` (ProviderSelect component)

- [ ] **Step 1: Add `otherPartyProvider` prop to PartyPanel**

In `PartyPanel` props interface (lines 529-541), add after `localEngines`:

```typescript
  otherPartyProvider: STTProviderType | null;
  otherPartyLabel: string;
```

- [ ] **Step 2: Pass `otherPartyProvider` and `otherPartyLabel` to ProviderSelect inside PartyPanel**

In PartyPanel's JSX (line 670-676), update the `<ProviderSelect>` call to include:

```typescript
          <ProviderSelect
            value={party.stt_provider}
            isInput={party.is_input_device}
            apiKeyStatus={apiKeyStatus}
            localEngines={localEngines}
            otherPartyProvider={otherPartyProvider}
            onChange={handleProviderChange}
          />
```

- [ ] **Step 3: Pass `otherPartyProvider` from the parent to each PartyPanel**

At the call sites (lines 346-359 and 360-372), add the prop. For "You" panel:

```typescript
          otherPartyProvider={config.them.stt_provider}
```

For "Them" panel:

```typescript
          otherPartyProvider={config.you.stt_provider}
```

- [ ] **Step 4: Add `otherPartyProvider` prop and `isExclusiveLocked` to ProviderSelect**

In `ProviderSelect` props (lines 700-712), add:

```typescript
  otherPartyProvider: STTProviderType | null;
```

Inside the component (after `isAvailable`, around line 739), add:

```typescript
  function isExclusiveLocked(opt: typeof STT_OPTIONS[0]): boolean {
    if (!isExclusiveProvider(opt.value)) return false;
    if (!otherPartyProvider) return false;
    return isExclusiveProvider(otherPartyProvider);
  }
```

- [ ] **Step 5: Update the rendering to show locked options**

The existing filter at lines 761-762 already passes locked options through `isAvailable()` (they return `true` — they're available, just locked). The rendering in the option buttons (lines 795-812 for local, 824-841 for cloud) needs to check `isExclusiveLocked` and apply locked styling.

Replace the local options rendering (lines 795-812) with:

```typescript
              {localOptions.map((opt) => {
                const locked = isExclusiveLocked(opt);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      if (locked) {
                        setStealTarget(opt.value);
                      } else {
                        onChange(opt.value);
                        setOpen(false);
                      }
                    }}
                    className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-xs transition-colors ${
                      locked
                        ? "opacity-50 hover:opacity-70"
                        : value === opt.value
                          ? "bg-primary/5 text-primary"
                          : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <span className={`shrink-0 ${value === opt.value ? "text-primary" : "text-emerald-500"}`}>
                      {opt.icon}
                    </span>
                    <span className="flex-1 text-left">
                      {opt.label}
                      {locked && (
                        <span className="block text-meta text-muted-foreground/50">
                          In use by {otherPartyLabel}
                        </span>
                      )}
                    </span>
                    {value === opt.value && !locked && (
                      <CheckCircle className="h-3 w-3 shrink-0 text-primary" />
                    )}
                  </button>
                );
              })}
```

Apply the same pattern to the cloud options rendering (lines 824-841) — same locked check, same styling, same `setStealTarget` on click.

- [ ] **Step 6: Add `stealTarget` state and steal confirmation card**

At the top of `ProviderSelect` component (after line 713), add:

```typescript
  const [stealTarget, setStealTarget] = useState<STTProviderType | null>(null);
```

Reset `stealTarget` when dropdown closes — in the existing `setOpen(false)` calls and the click-outside handler, also call `setStealTarget(null)`.

After the dropdown options (before the closing `</div>` of the popover, around line 850), add the inline confirmation card:

```typescript
          {stealTarget && (
            <div className="border-t border-border/20 bg-amber-500/5 px-3 py-2.5">
              <p className="text-meta leading-relaxed text-amber-200/80 mb-2">
                <span className="font-semibold text-amber-400">
                  {STT_OPTIONS.find(o => o.value === stealTarget)?.label}
                </span>{" "}
                can only run on one source at a time. Switch to this party?
                The other party will fall back to{" "}
                <span className="font-medium">
                  {(() => {
                    const fb = findExclusiveFallback();
                    return fb ? (STT_OPTIONS.find(o => o.value === fb)?.label ?? fb) : "no available engine";
                  })()}
                </span>.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleStealConfirm}
                  className="rounded-lg bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-meta font-semibold text-amber-400 hover:bg-amber-500/30 cursor-pointer"
                >
                  Switch
                </button>
                <button
                  type="button"
                  onClick={() => setStealTarget(null)}
                  className="rounded-lg bg-muted/30 px-3 py-1 text-meta font-medium text-muted-foreground hover:bg-muted/50 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
```

- [ ] **Step 7: Add `findExclusiveFallback` and `handleStealConfirm` functions**

Inside `ProviderSelect` (after `isExclusiveLocked`), add:

```typescript
  function findExclusiveFallback(): STTProviderType | null {
    for (const provider of EXCLUSIVE_FALLBACK_ORDER) {
      const opt = STT_OPTIONS.find(o => o.value === provider);
      if (opt && isAvailable(opt)) return provider;
    }
    return null;
  }

  function handleStealConfirm() {
    if (!stealTarget) return;
    // Re-derive fallback at confirm time (config may have changed while prompt was open)
    const freshConfig = useConfigStore.getState().meetingAudioConfig;
    if (!freshConfig) return;

    // Determine which role is "this" party and which is "other"
    const thisRole = freshConfig.you.stt_provider === otherPartyProvider ? "them" : "you";
    const otherRole = thisRole === "you" ? "them" : "you";
    const otherStillExclusive = isExclusiveProvider(freshConfig[otherRole].stt_provider);

    if (!otherStillExclusive) {
      // Conflict resolved while prompt was open — just apply normally
      onChange(stealTarget);
      setStealTarget(null);
      setOpen(false);
      return;
    }

    const fallback = findExclusiveFallback();
    if (!fallback) {
      // No fallback available — warn and don't steal
      showToast("No fallback STT engine available. Configure an API key or download a local model first.", "error");
      setStealTarget(null);
      return;
    }

    // Single atomic update: steal for this party + fallback for other party
    const updatedConfig = { ...freshConfig };
    updatedConfig[thisRole] = {
      ...updatedConfig[thisRole],
      stt_provider: stealTarget,
      local_model_id: undefined,
    };
    updatedConfig[otherRole] = {
      ...updatedConfig[otherRole],
      stt_provider: fallback,
      local_model_id: undefined,
    };
    useConfigStore.getState().setMeetingAudioConfig(updatedConfig);

    const stealLabel = STT_OPTIONS.find(o => o.value === stealTarget)?.label ?? stealTarget;
    const fallbackLabel = STT_OPTIONS.find(o => o.value === fallback)?.label ?? fallback;
    showToast(
      `${stealLabel} moved to ${thisRole === "you" ? "You" : "Them"}. ${otherRole === "you" ? "You" : "Them"} fell back to ${fallbackLabel}.`,
      "info"
    );

    setStealTarget(null);
    setOpen(false);
  }
```

- [ ] **Step 8: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/settings/MeetingAudioSettings.tsx
git commit -m "feat(audio): add Web Speech mutual exclusion to ProviderSelect with click-to-steal"
```

---

### Task 3: Add mutual exclusion to STTPickerDropdown in ServiceStatusBar

**Files:**
- Modify: `src/components/ServiceStatusBar.tsx:240-296` (STTPickerDropdown call sites)
- Modify: `src/components/ServiceStatusBar.tsx:530-679` (STTPickerDropdown component)

- [ ] **Step 1: Add exclusive provider constants**

At the top of `ServiceStatusBar.tsx`, after the `STT_PROVIDER_OPTIONS` array (around line 62), add the same constants:

```typescript
const EXCLUSIVE_PROVIDERS: STTProviderType[] = ["web_speech", "windows_native"];

const EXCLUSIVE_FALLBACK_ORDER: STTProviderType[] = [
  "deepgram", "groq_whisper", "whisper_api", "azure_speech",
  "sherpa_onnx", "ort_streaming", "parakeet_tdt",
];

function isExclusiveProvider(provider: string): boolean {
  return EXCLUSIVE_PROVIDERS.includes(provider as STTProviderType);
}
```

- [ ] **Step 2: Add `otherPartyProvider` prop to STTPickerDropdown**

In the component props (lines 530-539), add:

```typescript
  otherPartyProvider: STTProviderType | null;
```

- [ ] **Step 3: Pass `otherPartyProvider` at the call sites**

At line 253 (You picker), add:

```typescript
              otherPartyProvider={(meetingAudioConfig?.them.stt_provider ?? null) as STTProviderType | null}
```

At line 285 (Them picker), add:

```typescript
              otherPartyProvider={(meetingAudioConfig?.you.stt_provider ?? null) as STTProviderType | null}
```

- [ ] **Step 4: Add `isExclusiveLocked`, `stealTarget` state, fallback logic, and locked rendering**

Apply the same pattern as Task 2 inside `STTPickerDropdown`:
1. Add `isExclusiveLocked()` function using the `otherPartyProvider` prop
2. Add `const [stealTarget, setStealTarget] = useState<STTProviderType | null>(null);`
3. Add `findExclusiveFallback()` and `handleStealConfirm()` — same logic as Task 2 but calling `onSelect` instead of `onChange`, and reading fresh config at confirm time
4. Update option rendering (lines 622-638 for local, 650-666 for cloud) to check `isExclusiveLocked` and show locked styling + sublabel
5. Add the inline confirmation card before the closing `</div>` of the dropdown
6. Reset `stealTarget` when dropdown closes (on Escape and click-outside handlers)

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/ServiceStatusBar.tsx
git commit -m "feat(audio): add Web Speech mutual exclusion to STTPickerDropdown with click-to-steal"
```

---

### Task 4: Config migration for dual-exclusive configs

**Files:**
- Modify: `src/stores/configStore.ts:498-503` (after existing windows_native migration)

- [ ] **Step 1: Add exclusive-conflict migration**

After the existing `windows_native` non-input migration block (after line 498, before the `if (migrated)` check at line 499), add:

```typescript
        // Mutual exclusion: Web Speech / Windows Speech can only be used by one party.
        // If both parties have exclusive providers (from old config), keep "You" and fallback "Them".
        const exclusiveProviders = ["web_speech", "windows_native"];
        if (
          exclusiveProviders.includes(resolvedMeetingConfig.you.stt_provider) &&
          exclusiveProviders.includes(resolvedMeetingConfig.them.stt_provider)
        ) {
          // Fall back Them to best available: deepgram → groq → whisper_api → azure → sherpa → ort → parakeet
          resolvedMeetingConfig.them = {
            ...resolvedMeetingConfig.them,
            stt_provider: "deepgram",
            local_model_id: undefined,
          };
          migrated = true;
          console.log("[configStore] Migrated dual-exclusive STT: kept You, fell back Them to deepgram");
        }
```

Note: This uses "deepgram" as the static fallback (no runtime availability check during config load — API key status isn't loaded yet). The ProviderSelect auto-fallback will fix it at runtime if deepgram is unavailable.

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/stores/configStore.ts
git commit -m "fix(config): migrate dual-exclusive STT configs on load"
```

---

### Task 5: Version bump

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Update version**

```typescript
export const NEXQ_VERSION = "1.22.0";
export const NEXQ_BUILD_DATE = "2026-03-22"; // v1.22.0: Web Speech mutual exclusion — click-to-steal + auto-fallback
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/version.ts
git commit -m "chore: bump version to v1.22.0"
```

---

### Task 6: Full build verification

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Full Vite build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 3: Manual smoke test**

Run: `npx tauri dev`

Test scenarios:
1. Set You=Web Speech, Them source=input device → verify Web Speech appears greyed in Them's dropdown with "(in use by other party)"
2. Click the greyed Web Speech in Them's dropdown → verify confirmation card appears with fallback name
3. Click "Switch" → verify You falls back and toast shows
4. Click "Cancel" → verify nothing changes
5. Test in the meeting footer STTPickerDropdown — same behavior
6. Test with Them on output device → verify Web Speech doesn't appear at all (existing inputOnly rule)
