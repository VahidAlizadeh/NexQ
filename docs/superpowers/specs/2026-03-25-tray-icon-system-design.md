# Tray Icon System — Design Spec

## Overview

Redesign NexQ's system tray icon from a basic toggle/menu into a full control surface that reflects live app state, provides quick actions, and includes novel features like stealth mode, auto-detection, and quick-copy.

**Approach:** Hybrid (Approach B) — Rust manages tray rendering, frontend Zustand stores drive state via IPC commands.

## Icon States — Hybrid Badge System

The base NexQ icon stays constant for recognizability. Small overlay badges communicate state at a glance.

### States

| State | Badge | Animation | Description |
|-------|-------|-----------|-------------|
| Idle | None | None | Default. Clean base icon. |
| Recording | Red dot, bottom-right | Pulsing opacity (750ms alternating between full and dim icon variants) | Meeting active, capturing audio. Only animated state. |
| Muted | Amber square with slash, bottom-right | None | Meeting active, mic muted. Distinct shape from recording dot. |
| AI Processing | Blue dot with spinner, bottom-right | CSS-style spin (icon swap not needed — alternating frames) | LLM generating response. Secondary importance. |
| Stealth | Dimmed/desaturated base icon + muted red dot | None | Recording with overlay hidden. Visually "quiet." |
| Indexing | Small green progress bar at icon bottom | Progress animation (alternating icon frames) | RAG indexing in background. Non-intrusive. |

### State Priority

When multiple states are active simultaneously, the highest-priority state determines the icon:

```
Stealth > Muted > Recording > AI Processing > Indexing > Idle
```

**Rationale:** Stealth is highest priority because its purpose is to be visually unobtrusive — showing a pulsing red recording dot would defeat stealth's intent. When stealth is active, the dimmed icon takes precedence over all other states. Muted ranks above Recording because it signals "attention needed" (you may not realize your mic is muted).

### Icon Generation Strategy

Pre-composite all 6 icon variants at app startup:

1. Load base `icon.png` (32x32)
2. For each state, draw the badge overlay onto a copy of the base
3. Store as `Vec<u8>` RGBA buffers in `TrayManager`
4. On state change, call `tray.set_icon(preloaded_variant)`
5. For recording pulse: alternate between "recording" and "recording-dim" variants on a 750ms timer
6. For AI processing spinner: alternate between 2-3 spinner frame variants on a timer

No runtime image compositing. No GPU. Simple icon swaps.

## Interaction Model

| Input | Action | Context |
|-------|--------|---------|
| Single click | Toggle launcher window visibility | Always |
| Double-click | Context-aware smart action | Idle → start meeting + show overlay. Meeting active → bring overlay to front |
| Middle-click | Toggle mic mute/unmute | Meeting only. No-op when idle (silent, no error). Still works during stealth. |
| Right-click | Open state-aware context menu | Always. Menu content changes based on meeting state. |

### Platform Notes

**Double-click:** Tauri 2's `TrayIconEvent` does not expose a native `DoubleClick` variant — only `Click`. Double-click must be synthesized in Rust by tracking consecutive `Click` events:
1. On first `Click`, store `last_click_time = Instant::now()` and spawn a 200ms delayed task
2. If a second `Click` arrives within 200ms, cancel the pending single-click task and execute the double-click action
3. If the 200ms timer fires without a second click, execute the single-click action (toggle launcher)
4. **Trade-off:** This adds ~200ms latency to every single-click. Acceptable because the toggle is not latency-critical.

**Middle-click:** Tauri 2's `TrayIconEvent::Click` carries a `button` field (`Left`, `Right`, `Middle`). Middle-click delivery is platform-dependent and may not work on all Windows configurations. **Treat middle-click as a nice-to-have bonus** — the mute toggle is always accessible via the context menu as the primary path. Implementation should check `button == MouseButton::Middle` in the click handler but not rely on it as the only mute path.

### Edge Cases

- **Double-click when idle but overlay visible:** Starts meeting (overlay showing without active meeting is a valid state).
- **Middle-click during stealth:** Toggles mute normally — stealth hides overlay, doesn't disable controls.
- **Middle-click when idle:** Ignored silently — no toast, no error, no-op.

## Context Menus — State-Aware

### Idle State Menu

```
▶  Start Meeting                    Ctrl+Shift+M
─────────────────────────────────────────────────
RECENT MEETINGS
   Sprint Planning                  Today, 2:30 PM
   Client Sync — Acme Corp         Today, 11:00 AM
   1:1 with Sarah                  Yesterday
─────────────────────────────────────────────────
📋 Copy from Last Meeting                      ▶
─────────────────────────────────────────────────
⚙  Settings                        Ctrl+,
✕  Quit NexQ                       Ctrl+Q
```

### Meeting Active Menu

```
┌ 🔴 Recording — 12:34 ──────────────────────┐
■  Stop Meeting                     Ctrl+Shift+M
─────────────────────────────────────────────────
AUDIO CONTROLS
🎤 Mute Microphone                 Middle-Click
🔊 Mute System Audio
─────────────────────────────────────────────────
👁  Stealth Mode                    Ctrl+Shift+S
📈 Show Overlay
─────────────────────────────────────────────────
📋 Copy                                        ▶
─────────────────────────────────────────────────
⚙  Settings
✕  Quit NexQ
```

### Copy Sub-Menu

```
Last AI Answer
Action Items
Meeting Summary
Full Transcript
```

### Menu Design Decisions

- **Menu mockup emoji are illustrative only.** Tauri 2's native `Menu`/`MenuItem` API on Windows renders through Win32 menus which do not reliably render inline emoji. Implementation should use text-only labels. If icons are desired, use Tauri 2's `IconMenuItem` with custom 16x16 icon assets.
- **Meeting status banner** at top of active menu showing elapsed time with pulsing indicator
- **Primary action highlighted** with left border accent (Start = brand purple, Stop = red)
- **Section headers** (Recent Meetings, Audio Controls) group related items with uppercase labels
- **Shortcut hints** right-aligned in monospace font — teaches users keyboard shortcuts
- **Copy is a sub-menu** to keep the main menu clean
- **Ctrl+Shift+M** serves double duty — Start when idle, Stop when in meeting
- **Recent Meetings** shows last 3, click to open meeting review
- **Audio controls clarification:** "Mute Microphone" mutes the "You" source (mic input), "Mute System Audio" mutes the "Them/Room" source (system loopback). This stops NexQ from capturing/transcribing that stream — it does NOT affect actual system volume or mic hardware. Works for both online meetings (Zoom/Teams) and in-person meetings.

## Live Tooltip

Dynamic tooltip updates based on app state.

| State | Tooltip Text |
|-------|-------------|
| Idle | `NexQ — Idle` |
| Idle + stats | `NexQ — Idle · Today: 3 meetings, 1h 47m` |
| Recording | `NexQ — Recording · 12:34 elapsed` |
| Recording + muted | `NexQ — Recording (Mic Muted) · 12:34 elapsed` |
| Stealth | `NexQ — Stealth · 12:34 elapsed` |
| AI Processing | `NexQ — AI Processing...` |
| Indexing | `NexQ — Indexing files (3/7)` |

### Rules

- **Elapsed time is computed in Rust**, not sent from frontend. The `TrayManager` stores `meeting_start_time: Option<Instant>` (set via a single IPC call at meeting start/stop). A Rust-side tokio interval timer updates the tooltip every ~5 seconds during a meeting. This avoids periodic IPC round-trips for tooltip updates.
- "Today's stats" shown in idle only when at least 1 meeting recorded today
- Time format: `MM:SS` under 1 hour, `H:MM:SS` at 1 hour+
- Multiple states combine: Recording takes priority text, muted noted in parentheses
- Max length under Windows' ~128 character tooltip limit

## Novel Features

### Tray Notification Toasts

Uses Windows native toast notifications via Tauri's notification API.

**Triggers:**
- "Meeting started" — when recording begins
- "Meeting ended — 5 action items captured" — on meeting stop, with count
- "AI detected a question for you" — during meeting, when question detection fires
- "RAG indexing complete" — when background indexing finishes

**Constraints:**
- No toasts during stealth mode
- Max 1 toast per 30 seconds (spam prevention)
- Toasts are non-blocking — click to open relevant view, auto-dismiss after 5s
- Toast failures (e.g., user disabled notifications in Windows Settings) are logged but not surfaced to the user. No fallback UI — toasts are a bonus, not critical.

**Dependencies:** `tauri-plugin-notification` (already in `Cargo.toml`)

**Setting:** `tray.notifications` — toggle, default: `true`

### Quick-Copy from Tray

Available as a sub-menu in the context menu (see Copy Sub-Menu above). Copies to system clipboard silently. No toast confirmation needed — clipboard is instant feedback.

Items: Last AI Answer, Action Items, Meeting Summary, Full Transcript.

Always available in menu when data exists. Menu items grayed out when no data available (e.g., no meeting recorded yet).

### Auto-Start Minimized to Tray

- App registers in Windows startup via `tauri-plugin-autostart` (add as new dependency)
- Uses `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` registry key (no elevation required)
- Starts minimized — no window shown, tray icon appears in system tray
- First click/double-click on tray icon opens launcher

**Dependencies:** `tauri-plugin-autostart` (new dependency, must be added to `Cargo.toml` and initialized in `lib.rs`)

**Settings:**
- `tray.autoStart` — toggle, default: `false`
- `tray.startMinimized` — toggle, default: `true` (only visible when autoStart is enabled)

### Meeting Auto-Detection (Audio Activity)

Passively monitors audio input levels when idle. When both mic AND system audio show sustained activity (>3 seconds above a configurable threshold), fires a toast: "Meeting detected — Start recording?"

**Behavior:**
- Toast has two actions: "Start" and "Dismiss"
- "Start" begins the meeting flow automatically
- "Dismiss" suppresses detection for 5 minutes (avoids nagging)
- Does NOT auto-record without user confirmation — privacy first
- Only monitors when idle (not during an active meeting)

**Setting:** `tray.autoDetectMeeting` — toggle, default: `false` (opt-in for privacy)

**Architecture:** A background tokio task in the audio module polls `IAudioMeterInformation` levels (same approach used by the existing `start_device_monitor` command). Uses the audio activity threshold from settings. Auto-stops monitoring when a meeting begins. Resumes monitoring when meeting ends and setting is enabled.

### Stealth Mode (Overlay Hide)

Hides the overlay window while continuing all recording, transcription, and AI processing in the background. Designed for interviews or situations where a visible copilot is undesirable.

**Relationship to existing Capture Stealth:** NexQ already has `set_stealth_mode` in `stealth_commands.rs` which uses `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` to make the overlay invisible to screen capture software while keeping it visible to the user. This new "Overlay Hide" stealth is a different feature — it hides the overlay window entirely. When Overlay Hide is activated, it also enables Capture Stealth automatically (both layers active). When Overlay Hide is deactivated, Capture Stealth returns to its previous user-configured state.

**Behavior:**
- Toggle shortcut: `Ctrl+Shift+S` (configurable)
- Hides overlay window instantly (calls `overlay.hide()`)
- Enables Capture Stealth (`WDA_EXCLUDEFROMCAPTURE`) as a safety net
- Tray icon switches to stealth state (dimmed base + muted red dot)
- Tooltip changes to "NexQ — Stealth · MM:SS elapsed"
- All recording, transcription, AI processing continue unchanged
- No toasts fire during stealth
- Toggle again (shortcut or tray menu) restores overlay and reverts Capture Stealth to prior state
- Silent activation — no toast, no sound, just tray icon change

**Settings:**
- `tray.stealthEnabled` — toggle, default: `true`
- `shortcuts.stealthToggle` — keybind, default: `"Ctrl+Shift+S"`

## Architecture

### Rust Side — New `tray/` Module

```
src-tauri/src/tray/
  mod.rs          — TrayManager struct + public API
  icons.rs        — Icon asset loading + badge compositing at startup
  menu.rs         — Menu building (idle vs meeting menu variants)
  state.rs        — TrayState enum + priority logic
```

**TrayManager struct:**
- `current_state: TrayState` — current icon state
- `tray_handle: TrayIcon` — reference to Tauri tray icon
- `icon_variants: HashMap<TrayState, Icon>` — pre-composited icon buffers
- `tooltip_text: String` — current tooltip
- `meeting_active: bool` — controls which menu variant is shown
- `meeting_start_time: Option<Instant>` — set on meeting start, used for elapsed time in tooltip
- `pulse_timer: Option<JoinHandle<()>>` — recording pulse animation timer (cancel on state change)
- `tooltip_timer: Option<JoinHandle<()>>` — tooltip elapsed-time updater (cancel on meeting stop)

**IPC Commands (new, in `src-tauri/src/commands/tray.rs`):**

| Command | Args | Effect |
|---------|------|--------|
| `set_tray_state` | `state: TrayState` | Updates icon variant + base tooltip |
| `set_tray_tooltip` | `text: String` | Sets tooltip text (for elapsed time updates) |
| `set_meeting_start_time` | `started: bool` | Sets/clears `meeting_start_time` for tooltip elapsed time |
| `rebuild_tray_menu` | `meeting_active: bool, recent_meetings: Vec<RecentMeeting>` | Rebuilds menu for current state |
| `set_tray_menu_item_enabled` | `id: String, enabled: bool` | Enable/disable specific menu items |

### Frontend Side — `useTraySync` Hook

New hook in `src/hooks/useTraySync.ts`. Watches relevant Zustand stores and syncs state to Rust via IPC:

```
Store watches:                            IPC calls:
──────────────────────────────────        ──────────────────────────
meetingStore.isRecording              →   set_tray_state("recording")
configStore.mutedYou                  →   set_tray_state("muted")
meetingStore.overlayHidden (NEW)      →   set_tray_state("stealth")
streamStore.isStreaming               →   set_tray_state("ai_processing")
ragStore.isIndexing                   →   set_tray_state("indexing")
none of the above                     →   set_tray_state("idle")
meetingStore.isRecording (on start)   →   set_meeting_start_time(true)
meetingStore.isRecording (on stop)    →   set_meeting_start_time(false)
meetingStore.isRecording (change)     →   rebuild_tray_menu(true/false)
```

**Note on store fields:** `meetingStore.overlayHidden` is a new boolean field that must be added to `meetingStore` for stealth/overlay-hide state. All other fields already exist in the codebase. The tooltip elapsed time is now computed in Rust (see Live Tooltip section), so no periodic tooltip IPC calls are needed — only `set_meeting_start_time` at meeting start/stop.

Priority logic lives in the hook — it evaluates all store values and picks the highest-priority state before calling `set_tray_state`.

### Event Flow (Tray → Frontend)

Menu clicks in Rust emit Tauri events. Frontend listens and dispatches to existing store actions:

| Tray Menu Click | Rust Event | Frontend Handler |
|----------------|------------|-----------------|
| Start Meeting | `tray_start_meeting` | `startMeetingFlow()` |
| Stop Meeting | `tray_stop_meeting` | `stopMeeting()` |
| Mute Mic | `tray_toggle_mic` | `toggleMicMute()` |
| Mute System | `tray_toggle_system` | `toggleSystemMute()` |
| Stealth Mode | `tray_toggle_stealth` | `toggleStealth()` |
| Show Overlay | `tray_show_overlay` | `showOverlay()` |
| Copy (variant) | `tray_copy { kind }` | `copyToClipboard(kind)` |
| Recent Meeting | `tray_open_meeting { id }` | `openMeetingReview(id)` |
| Settings | `tray_open_settings` | `setCurrentView("settings")` |
| Quit | `app.exit(0)` | — |

### Click Handling (Double-Click Synthesis + Middle-Click)

Implemented in Rust's `on_tray_icon_event` handler. Tauri 2 only fires `TrayIconEvent::Click` — double-click is synthesized from consecutive clicks:

```rust
// Pseudocode for click handler
on_tray_icon_event(event) {
    if let TrayIconEvent::Click { button, .. } = event {
        match button {
            MouseButton::Left => {
                if last_click.elapsed() < 200ms {
                    cancel_pending_single_click();
                    execute_double_click_action(); // context-aware smart action
                } else {
                    last_click = Instant::now();
                    spawn_delayed(200ms, || execute_single_click_action()); // toggle launcher
                }
            }
            MouseButton::Middle => {
                if meeting_active { toggle_mic_mute(); }
                // else: no-op silently
            }
            _ => {} // Right-click handled by menu system
        }
    }
}
```

**State for click tracking:** `last_click_time: Option<Instant>` and `pending_click_task: Option<JoinHandle<()>>` stored in `TrayManager`.

### Teardown

On app exit or `TrayManager::cleanup()`:
- Cancel active `pulse_timer` (recording animation)
- Cancel active `tooltip_timer` (elapsed time updates)
- Cancel any `pending_click_task` (double-click debounce)
- Tray icon cleanup is handled automatically by Tauri's drop lifecycle

### Settings Integration

New keys in the existing settings system:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `tray.notifications` | bool | `true` | Enable tray notification toasts |
| `tray.autoStart` | bool | `false` | Launch with Windows |
| `tray.startMinimized` | bool | `true` | Start minimized to tray (when autoStart on) |
| `tray.autoDetectMeeting` | bool | `false` | Audio-based meeting auto-detection |
| `tray.stealthEnabled` | bool | `true` | Enable stealth mode feature |
| `shortcuts.stealthToggle` | string | `"Ctrl+Shift+S"` | Stealth mode keyboard shortcut |

## Type Definitions

### TrayState (Rust enum + TypeScript union)

```
Idle | Recording | Muted | Stealth | AiProcessing | Indexing
```

### RecentMeeting

```typescript
interface RecentMeeting {
  id: string;          // meeting ID from DB
  title: string;       // meeting title or "Untitled Meeting"
  startTime: string;   // ISO timestamp
  duration: number;    // seconds
}
```

Reuses data from the existing `MeetingSummary` type in `types.ts` — `RecentMeeting` is a lightweight subset for the tray menu (no transcript, no action items).

## Files Changed

### New Files
- `src-tauri/src/tray/mod.rs` — TrayManager struct + public API
- `src-tauri/src/tray/icons.rs` — Icon loading + badge compositing
- `src-tauri/src/tray/menu.rs` — State-aware menu construction
- `src-tauri/src/tray/state.rs` — TrayState enum + priority
- `src-tauri/src/commands/tray.rs` — IPC commands for tray control
- `src/hooks/useTraySync.ts` — Frontend→backend tray state sync hook
- `src-tauri/icons/` — 6+ icon variant PNGs (or generated at build time)

### Modified Files
- `src-tauri/src/lib.rs` — Replace inline tray setup with TrayManager initialization, register new commands
- `src-tauri/src/state.rs` — Add TrayManager to AppState
- `src/lib/ipc.ts` — Add typed wrappers for new tray IPC commands
- `src/lib/events.ts` — Add typed listeners for new tray events
- `src/lib/types.ts` — Add TrayState enum, RecentMeeting type
- `src/App.tsx` — Add `useTraySync` hook, expand tray event listeners
- `src/stores/meetingStore.ts` — Add `overlayHidden: boolean` field for stealth/overlay-hide state
- `src-tauri/Cargo.toml` — Add `tauri-plugin-autostart` dependency
- Settings store + settings UI — Add new tray/shortcut settings
