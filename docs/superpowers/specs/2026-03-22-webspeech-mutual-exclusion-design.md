# Web Speech / Windows Speech Mutual Exclusion

**Date:** 2026-03-22
**Status:** Approved
**Scope:** UI constraint enforcement + click-to-steal + auto-fallback

## Problem

Web Speech API and Windows Speech both capture from the OS default recording device. Only one SpeechRecognition instance can run per WebView, and IPolicy can only redirect to one device at a time. When both parties select Web Speech (or Windows Speech) with input devices, the system silently breaks — both see the same audio, IPolicy conflicts arise, and transcription attribution is wrong.

Currently, both `ProviderSelect` (settings) and `STTPickerDropdown` (meeting footer) allow selecting Web Speech / Windows Speech on both parties simultaneously with no warning or constraint.

## Solution: Mutual Exclusion with Click-to-Steal

### Constraint rules (layered)

1. **Non-input device → hide**: If a party's source is not an input device (output/loopback), Web Speech and Windows Speech are not shown at all. (Existing `inputOnly` behavior — no changes.)

2. **Exclusive provider in use by other party → greyed/locked**: If the other party already uses `web_speech` or `windows_native`, those options appear greyed with "(in use by [other party])" sublabel. Still clickable — triggers the steal flow.

### Exclusive provider detection

```typescript
const EXCLUSIVE_PROVIDERS = ["web_speech", "windows_native"];

function isExclusiveProvider(provider: string): boolean {
  return EXCLUSIVE_PROVIDERS.includes(provider);
}
```

**Keep `isAvailable()` as boolean.** Do not change its return type. Instead, add a separate function:

```typescript
function isExclusiveLocked(opt: typeof STT_OPTIONS[0], otherPartyProvider: string | null): boolean {
  if (!isExclusiveProvider(opt.value)) return false;
  if (!otherPartyProvider) return false;
  return isExclusiveProvider(otherPartyProvider);
}
```

The rendering pipeline becomes:
- `isAvailable(opt)` returns `false` → option is hidden (existing behavior unchanged)
- `isAvailable(opt)` returns `true` AND `isExclusiveLocked(opt)` returns `true` → option is shown greyed/locked
- `isAvailable(opt)` returns `true` AND `isExclusiveLocked(opt)` returns `false` → option is shown normally

This preserves all existing `.filter()` call sites — locked providers pass `isAvailable()` (they ARE technically available) and appear in the list. The locked visual treatment is applied separately in the render path.

The existing auto-fallback `useEffect` in `ProviderSelect` (which watches `[localEngines, apiKeyStatus]`) is unaffected because locked providers return `true` from `isAvailable()` — so they won't trigger unwanted auto-fallback.

### New prop: `otherPartyProvider`

Both `ProviderSelect` and `STTPickerDropdown` need to know the other party's provider. Add a new prop:

```typescript
otherPartyProvider: STTProviderType | null
```

Passed down from the parent component:
- In `MeetingAudioSettings.tsx`: `PartyPanel` reads the other party from `meetingAudioConfig`
- In `ServiceStatusBar.tsx`: the STT chip's picker reads the other party from `meetingAudioConfig`

No direct `useConfigStore` calls inside the dropdown components — props keep them pure and testable.

### Fallback chain

```typescript
const EXCLUSIVE_FALLBACK_ORDER: STTProviderType[] = [
  "deepgram",
  "groq_whisper",
  "whisper_api",
  "azure_speech",
  "sherpa_onnx",
  "ort_streaming",
  "parakeet_tdt",
];
```

All non-exclusive providers, ordered by quality/reliability preference. Each is checked for availability: `hasApiKey()` for cloud providers (`requiresKey`), `isLocalEngineReady()` for local (`requiresDownload`). First available wins. If none available, fallback is `null` (no engine).

### Click-to-steal flow

When a user clicks a locked provider option:

1. **Show confirmation prompt** — a small inline card below the dropdown options (not a browser dialog):
   - With fallback: *"Web Speech can only run on one source at a time. Switch to [this party]? [Other party] will fall back to [fallback name]."*
   - Without fallback: *"...The other party will have no STT engine."*
   - Two buttons: "Switch" and "Cancel"

2. **On confirm**: re-derive the fallback at confirm time (not from the prompt's closure — read `useConfigStore.getState()` fresh to handle cases where config changed while the prompt was open). If the exclusive conflict has resolved (other party no longer on an exclusive provider), simply apply the selection without the steal. Otherwise, update both parties in `meetingAudioConfig` atomically via a single `setMeetingAudioConfig` call:
   - New party → exclusive provider
   - Old party → fallback provider (or `"none"`)
   - IPolicy switches to the new party's device via the existing hot-swap path
   - Show toast: *"Web Speech moved to [party]. [Other party] fell back to [fallback]."*

3. **On cancel**: nothing changes, dropdown stays open.

### Visual treatment

**Settings (`ProviderSelect` dropdown):**
- Locked options: `opacity-50`, provider name visible, "(in use by You/Them)" sublabel in muted text
- Same position in list (Local & Built-in group) — not moved to bottom
- Cursor remains pointer (clickable → triggers steal flow)

**Meeting footer (`STTPickerDropdown`):**
- Same greyed treatment with sublabel
- Confirmation prompt renders as inline card below dropdown options
- Toast notification on successful steal

**IPolicy warning box** (existing amber warning in settings):
- Only shown on the party that currently holds the exclusive provider
- When provider is stolen, warning moves to the new party

### Config store changes

**No new state fields.** The mutual exclusion is derived at render time by comparing both party configs.

**Atomic update:** The steal action calls a single config update that modifies both parties simultaneously, preventing intermediate states where both parties have exclusive providers.

**Migration on config load** (`configStore.ts`): If both parties have exclusive providers (from old config), keep "You" on its provider and fall back "Them" to best available using `EXCLUSIVE_FALLBACK_ORDER`. This migration runs AFTER the existing `windows_native` non-input migration (after line 503) to avoid double-fallback.

### Edge cases

- **Device switches from input to output**: If that party had Web Speech, the existing `inputOnly` + auto-fallback logic handles it — falls back to best available. No new code needed. The exclusive lock on the other party resolves automatically on re-render.
- **Hot-swap during meeting**: Same steal flow applies in the footer STTPickerDropdown. IPolicy target switches via `start_capture_per_party` hot-swap path.
- **Both parties start with Web Speech from old config**: Migration on config load — keep "You", fall back "Them".
- **No fallback available**: Confirmation prompt warns user. On confirm, other party gets `"none"` (no STT). Settings shows "No STT engine" state.
- **Config changes while confirmation prompt is open**: The confirm handler re-derives fallback from fresh config state. If the conflict resolved (other party changed provider while prompt was open), the selection applies normally without a steal.

### Version bump

`src/lib/version.ts`: `1.21.0` → `1.22.0` (verify actual version at implementation time)

## Files changed

| File | Change |
|------|--------|
| `src/settings/MeetingAudioSettings.tsx` | `ProviderSelect`: add `otherPartyProvider` prop, `isExclusiveLocked()`, locked option rendering, steal confirmation card, fallback logic. `PartyPanel`: pass `otherPartyProvider` prop. |
| `src/components/ServiceStatusBar.tsx` | `STTPickerDropdown`: add `otherPartyProvider` prop, same exclusive lock + steal confirmation + toast |
| `src/stores/configStore.ts` | Migration for dual-exclusive configs on load (after existing migrations) |
| `src/lib/version.ts` | Bump to 1.22.0 |

## What this does NOT change

- No backend/Rust changes — this is purely frontend constraint enforcement
- No changes to IPolicy logic — it already handles the singleton correctly
- No changes to `useSpeechRecognition` hook — it already reads the active config
- No changes to audio capture or cpal device handling
- The `inputOnly` rule stays unchanged — this adds a second layer on top
- `isAvailable()` return type stays boolean — locked state is a separate check
