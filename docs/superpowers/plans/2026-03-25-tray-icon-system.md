# Tray Icon System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign NexQ's system tray icon into a full control surface with dynamic icon states, smart interactions, state-aware context menus, live tooltip, and novel features (stealth mode, notifications, auto-start, auto-detect, quick-copy).

**Architecture:** Hybrid — Rust `TrayManager` renders tray icon/menu/tooltip. Frontend Zustand stores drive state via IPC commands. Menu clicks emit Tauri events consumed by frontend.

**Tech Stack:** Tauri 2 tray APIs, Rust (tokio), React 18, Zustand, `tauri-plugin-notification`, `tauri-plugin-autostart`, `tauri-plugin-global-shortcut`

**Spec:** `docs/superpowers/specs/2026-03-25-tray-icon-system-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src-tauri/src/tray/mod.rs` | TrayManager struct, public API, initialization, teardown |
| `src-tauri/src/tray/state.rs` | TrayState enum definition (serde-compatible) |
| `src-tauri/src/tray/icons.rs` | Load base icon, composite badge overlays, store variants |
| `src-tauri/src/tray/menu.rs` | Build idle/meeting menus, menu event handler |
| `src-tauri/src/tray/click.rs` | Double-click + middle-click handling (native Tauri 2.10 events) |
| `src-tauri/src/tray/tooltip.rs` | Tooltip formatting, elapsed-time timer |
| `src-tauri/src/commands/tray_commands.rs` | IPC commands: set_tray_state, set_tray_tooltip, etc. |
| `src/hooks/useTraySync.ts` | Watches Zustand stores, syncs tray state via IPC |

### Modified Files

| File | Changes |
|------|---------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-autostart`, `image` crate |
| `src-tauri/src/lib.rs` | Add `pub mod tray`, replace inline tray setup with TrayManager, register new commands |
| `src-tauri/src/state.rs` | Add `tray: Option<Arc<Mutex<TrayManager>>>` to AppState |
| `src-tauri/src/commands/mod.rs` | Add `pub mod tray_commands` |
| `src/lib/types.ts` | Add `TrayState`, `RecentMeeting` types |
| `src/lib/ipc.ts` | Add typed wrappers for tray IPC commands |
| `src/lib/events.ts` | Add typed listeners for new tray events |
| `src/stores/meetingStore.ts` | Add `overlayHidden: boolean` field + toggle action |
| `src/stores/configStore.ts` | Add tray setting fields (`trayNotifications`, `trayAutoStart`, etc.) |
| `src/App.tsx` | Wire `useTraySync` hook, expand tray event listeners |

---

## Task 1: TrayState Enum + Types (Rust + TypeScript)

**Files:**
- Create: `src-tauri/src/tray/state.rs`
- Create: `src-tauri/src/tray/mod.rs` (initial skeleton)
- Modify: `src-tauri/src/lib.rs` (add `pub mod tray`)
- Modify: `src/lib/types.ts` (add TrayState, RecentMeeting)

- [ ] **Step 1: Create `src-tauri/src/tray/state.rs`**

```rust
use serde::{Deserialize, Serialize};

/// Tray icon visual state. Frontend picks the highest-priority state
/// and sends it via IPC. Rust applies it without duplicate priority logic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrayState {
    Idle,
    Recording,
    Muted,
    Stealth,
    AiProcessing,
    Indexing,
}

impl Default for TrayState {
    fn default() -> Self {
        Self::Idle
    }
}
```

- [ ] **Step 2: Create `src-tauri/src/tray/mod.rs` (skeleton)**

```rust
pub mod state;

pub use state::TrayState;
```

- [ ] **Step 3: Add `pub mod tray` to `src-tauri/src/lib.rs`**

Add after the existing module declarations at the top of `lib.rs`:

```rust
pub mod tray;
```

- [ ] **Step 4: Add TypeScript types to `src/lib/types.ts`**

Add at the end of the file:

```typescript
// == TRAY TYPES ==

export type TrayState = "idle" | "recording" | "muted" | "stealth" | "ai_processing" | "indexing";

export interface RecentMeeting {
  id: string;
  title: string;
  startTime: string;
  duration: number;
}
```

- [ ] **Step 5: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/tray/ src-tauri/src/lib.rs src/lib/types.ts
git commit -m "feat(tray): add TrayState enum and TypeScript types"
```

---

## Task 2: Icon Compositing (Rust)

**Files:**
- Create: `src-tauri/src/tray/icons.rs`
- Modify: `src-tauri/src/tray/mod.rs`
- Modify: `src-tauri/Cargo.toml` (add `image` crate)

- [ ] **Step 1: Add `image` crate to Cargo.toml**

Add to `[dependencies]`:

```toml
image = { version = "0.25", default-features = false, features = ["png"] }
```

- [ ] **Step 2: Create `src-tauri/src/tray/icons.rs`**

This module loads the base icon and composites badge overlays for each TrayState at startup. Variants are stored as raw RGBA buffers for instant swapping.

```rust
use std::collections::HashMap;
use image::{RgbaImage, Rgba};
use tauri::image::Image as TauriImage;

use super::TrayState;

/// Pre-composited icon RGBA data for each tray state.
pub struct IconSet {
    variants: HashMap<TrayState, Vec<u8>>,
    /// For recording pulse: a dimmer variant of the recording icon
    recording_dim: Vec<u8>,
    width: u32,
    height: u32,
}

impl IconSet {
    /// Load base icon from the app's icon path and composite all variants.
    pub fn new(base_icon_bytes: &[u8]) -> Result<Self, String> {
        let base = image::load_from_memory(base_icon_bytes)
            .map_err(|e| format!("Failed to load base icon: {}", e))?
            .to_rgba8();
        let (w, h) = base.dimensions();

        let mut variants = HashMap::new();

        // Idle: base icon unchanged
        variants.insert(TrayState::Idle, base.as_raw().clone());

        // Recording: red dot badge bottom-right
        let recording = Self::add_circle_badge(&base, Rgba([239, 68, 68, 255]));
        variants.insert(TrayState::Recording, recording.as_raw().clone());

        // Recording dim: red dot badge with lower opacity (for pulse animation)
        let recording_dim = Self::add_circle_badge(&base, Rgba([239, 68, 68, 140]));

        // Muted: amber square badge bottom-right
        let muted = Self::add_square_badge(&base, Rgba([245, 158, 11, 255]));
        variants.insert(TrayState::Muted, muted.as_raw().clone());

        // AI Processing: blue dot badge bottom-right
        let ai = Self::add_circle_badge(&base, Rgba([59, 130, 246, 255]));
        variants.insert(TrayState::AiProcessing, ai.as_raw().clone());

        // Stealth: desaturated base + muted red dot
        let mut stealth_base = Self::desaturate(&base);
        Self::draw_circle_badge(&mut stealth_base, Rgba([239, 68, 68, 140]));
        variants.insert(TrayState::Stealth, stealth_base.as_raw().clone());

        // Indexing: green progress bar at bottom
        let indexing = Self::add_progress_bar(&base, Rgba([34, 197, 94, 255]), 0.6);
        variants.insert(TrayState::Indexing, indexing.as_raw().clone());

        Ok(Self {
            variants,
            recording_dim: recording_dim.as_raw().clone(),
            width: w,
            height: h,
        })
    }

    /// Get the icon bytes for a given state.
    pub fn get(&self, state: TrayState) -> TauriImage<'_> {
        let bytes = self.variants.get(&state).expect("All states pre-composited");
        TauriImage::new_owned(bytes.clone(), self.width, self.height)
    }

    /// Get the dim recording variant (for pulse animation).
    pub fn get_recording_dim(&self) -> TauriImage<'_> {
        TauriImage::new_owned(self.recording_dim.clone(), self.width, self.height)
    }

    // -- Private compositing helpers --

    fn add_circle_badge(base: &RgbaImage, color: Rgba<u8>) -> RgbaImage {
        let mut img = base.clone();
        Self::draw_circle_badge(&mut img, color);
        img
    }

    fn draw_circle_badge(img: &mut RgbaImage, color: Rgba<u8>) {
        let (w, h) = img.dimensions();
        let radius = (w.min(h) / 5) as i32; // ~6px on 32x32
        let cx = (w as i32) - radius - 1;
        let cy = (h as i32) - radius - 1;

        for y in (cy - radius)..=(cy + radius) {
            for x in (cx - radius)..=(cx + radius) {
                if (x - cx).pow(2) + (y - cy).pow(2) <= radius.pow(2) {
                    if x >= 0 && y >= 0 && (x as u32) < w && (y as u32) < h {
                        img.put_pixel(x as u32, y as u32, color);
                    }
                }
            }
        }
    }

    fn add_square_badge(base: &RgbaImage, color: Rgba<u8>) -> RgbaImage {
        let mut img = base.clone();
        let (w, h) = img.dimensions();
        let size = w.min(h) / 4; // ~8px on 32x32
        let x0 = w - size - 1;
        let y0 = h - size - 1;

        for y in y0..(y0 + size) {
            for x in x0..(x0 + size) {
                if x < w && y < h {
                    img.put_pixel(x, y, color);
                }
            }
        }
        // Draw slash (diagonal line)
        for i in 0..size {
            let sx = x0 + i;
            let sy = y0 + size - 1 - i;
            if sx < w && sy < h {
                img.put_pixel(sx, sy, Rgba([26, 26, 46, 255])); // dark slash
            }
        }
        img
    }

    fn desaturate(img: &RgbaImage) -> RgbaImage {
        let mut out = img.clone();
        for pixel in out.pixels_mut() {
            let avg = ((pixel[0] as u16 + pixel[1] as u16 + pixel[2] as u16) / 3) as u8;
            // Blend 70% toward grayscale
            pixel[0] = ((pixel[0] as u16 * 30 + avg as u16 * 70) / 100) as u8;
            pixel[1] = ((pixel[1] as u16 * 30 + avg as u16 * 70) / 100) as u8;
            pixel[2] = ((pixel[2] as u16 * 30 + avg as u16 * 70) / 100) as u8;
        }
        out
    }

    fn add_progress_bar(base: &RgbaImage, color: Rgba<u8>, fill: f32) -> RgbaImage {
        let mut img = base.clone();
        let (w, h) = img.dimensions();
        let bar_h = 3u32;
        let margin = 4u32;
        let bar_w = w - margin * 2;
        let fill_w = (bar_w as f32 * fill) as u32;
        let y0 = h - bar_h - 1;

        for y in y0..(y0 + bar_h) {
            for x in margin..(margin + bar_w) {
                if y < h && x < w {
                    let c = if x < margin + fill_w {
                        color
                    } else {
                        Rgba([60, 60, 60, 200])
                    };
                    img.put_pixel(x, y, c);
                }
            }
        }
        img
    }
}
```

- [ ] **Step 3: Update `src-tauri/src/tray/mod.rs` to include icons**

```rust
pub mod state;
pub mod icons;

pub use state::TrayState;
pub use icons::IconSet;
```

- [ ] **Step 4: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/tray/icons.rs src-tauri/src/tray/mod.rs src-tauri/Cargo.toml
git commit -m "feat(tray): add icon compositing with badge overlays for all states"
```

---

## Task 3: TrayManager Core + Tooltip Timer (Rust)

**Files:**
- Create: `src-tauri/src/tray/tooltip.rs`
- Modify: `src-tauri/src/tray/mod.rs` (add TrayManager struct)
- Modify: `src-tauri/src/state.rs` (add tray manager to AppState)

- [ ] **Step 1: Create `src-tauri/src/tray/tooltip.rs`**

```rust
use std::time::Instant;

/// Format elapsed time as "MM:SS" or "H:MM:SS".
pub fn format_elapsed(start: Instant) -> String {
    let secs = start.elapsed().as_secs();
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    if h > 0 {
        format!("{}:{:02}:{:02}", h, m, s)
    } else {
        format!("{:02}:{:02}", m, s)
    }
}

/// Build tooltip text based on current state.
pub fn build_tooltip(
    state: super::TrayState,
    meeting_start: Option<Instant>,
    is_muted: bool,
    custom_text: Option<&str>,
) -> String {
    use super::TrayState;

    match state {
        TrayState::Idle => {
            if let Some(text) = custom_text {
                format!("NexQ — Idle · {}", text)
            } else {
                "NexQ — Idle".to_string()
            }
        }
        TrayState::Recording => {
            let elapsed = meeting_start
                .map(|s| format_elapsed(s))
                .unwrap_or_else(|| "00:00".to_string());
            if is_muted {
                format!("NexQ — Recording (Mic Muted) · {} elapsed", elapsed)
            } else {
                format!("NexQ — Recording · {} elapsed", elapsed)
            }
        }
        TrayState::Muted => {
            let elapsed = meeting_start
                .map(|s| format_elapsed(s))
                .unwrap_or_else(|| "00:00".to_string());
            format!("NexQ — Recording (Mic Muted) · {} elapsed", elapsed)
        }
        TrayState::Stealth => {
            let elapsed = meeting_start
                .map(|s| format_elapsed(s))
                .unwrap_or_else(|| "00:00".to_string());
            format!("NexQ — Stealth · {} elapsed", elapsed)
        }
        TrayState::AiProcessing => "NexQ — AI Processing...".to_string(),
        TrayState::Indexing => {
            if let Some(text) = custom_text {
                format!("NexQ — {}", text)
            } else {
                "NexQ — Indexing files...".to_string()
            }
        }
    }
}
```

- [ ] **Step 2: Add TrayManager struct to `src-tauri/src/tray/mod.rs`**

Replace the file contents with:

```rust
pub mod state;
pub mod icons;
pub mod tooltip;

pub use state::TrayState;
pub use icons::IconSet;

use std::time::Instant;
use tokio::task::JoinHandle;

/// Manages tray icon state, icon swaps, tooltip updates, and animation timers.
/// Accessed through AppState via Arc<Mutex<TrayManager>>.
pub struct TrayManager {
    pub current_state: TrayState,
    pub icon_set: IconSet,
    pub meeting_start_time: Option<Instant>,
    pub is_muted: bool,
    pub meeting_active: bool,
    pub custom_tooltip: Option<String>,
    /// Handle for the recording pulse animation timer
    pub pulse_timer: Option<JoinHandle<()>>,
    /// Handle for the tooltip elapsed-time updater
    pub tooltip_timer: Option<JoinHandle<()>>,
}

impl TrayManager {
    pub fn new(icon_set: IconSet) -> Self {
        Self {
            current_state: TrayState::Idle,
            icon_set,
            meeting_start_time: None,
            is_muted: false,
            meeting_active: false,
            custom_tooltip: None,
            pulse_timer: None,
            tooltip_timer: None,
        }
    }

    /// Cancel all active timers. Called on shutdown or state transitions.
    pub fn cancel_timers(&mut self) {
        if let Some(h) = self.pulse_timer.take() { h.abort(); }
        if let Some(h) = self.tooltip_timer.take() { h.abort(); }
    }
}
```

- [ ] **Step 3: Add TrayManager to AppState in `src-tauri/src/state.rs`**

Add the import at the top:

```rust
use crate::tray::TrayManager;
```

Add to the `AppState` struct after `openrouter_cache`:

```rust
    pub tray_manager: Arc<Mutex<Option<TrayManager>>>,
```

Add to `AppState::new()`:

```rust
            tray_manager: Arc::new(Mutex::new(None)),
```

- [ ] **Step 4: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/tray/ src-tauri/src/state.rs
git commit -m "feat(tray): add TrayManager core with tooltip formatting and timer management"
```

---

## Task 4: State-Aware Menu Builder (Rust)

**Files:**
- Create: `src-tauri/src/tray/menu.rs`
- Modify: `src-tauri/src/tray/mod.rs`

- [ ] **Step 1: Create `src-tauri/src/tray/menu.rs`**

```rust
use serde::Deserialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Manager,
};

/// Lightweight meeting info for the recent meetings menu.
#[derive(Debug, Clone, Deserialize)]
pub struct RecentMeetingInfo {
    pub id: String,
    pub title: String,
    pub start_time: String,
    pub duration: u64,
}

/// Build the idle-state tray menu.
pub fn build_idle_menu(
    app: &AppHandle,
    recent_meetings: &[RecentMeetingInfo],
) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let start = MenuItem::with_id(app, "start_meeting", "Start Meeting", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = vec![
        Box::new(start),
        Box::new(sep1),
    ];

    // Recent meetings (up to 3)
    if !recent_meetings.is_empty() {
        for meeting in recent_meetings.iter().take(3) {
            let label = format!("{}  —  {}", meeting.title, meeting.start_time);
            let id = format!("recent_{}", meeting.id);
            let item = MenuItem::with_id(app, &id, &label, true, None::<&str>)?;
            items.push(Box::new(item));
        }
        items.push(Box::new(PredefinedMenuItem::separator(app)?));
    }

    // Copy submenu
    let copy_sub = build_copy_submenu(app, "Copy from Last Meeting")?;
    items.push(Box::new(copy_sub));
    items.push(Box::new(PredefinedMenuItem::separator(app)?));

    // Settings + Quit
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit NexQ", true, None::<&str>)?;
    items.push(Box::new(settings));
    items.push(Box::new(quit));

    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        items.iter().map(|i| i.as_ref()).collect();
    Menu::with_items(app, &refs)
}

/// Build the meeting-active tray menu.
pub fn build_meeting_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let stop = MenuItem::with_id(app, "stop_meeting", "Stop Meeting", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let mute_mic = MenuItem::with_id(app, "toggle_mic", "Mute Microphone", true, None::<&str>)?;
    let mute_sys = MenuItem::with_id(app, "toggle_system", "Mute System Audio", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    let stealth = MenuItem::with_id(app, "toggle_stealth", "Stealth Mode", true, None::<&str>)?;
    let show_overlay = MenuItem::with_id(app, "show_overlay", "Show Overlay", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;

    let copy_sub = build_copy_submenu(app, "Copy")?;
    let sep4 = PredefinedMenuItem::separator(app)?;

    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit NexQ", true, None::<&str>)?;

    Menu::with_items(app, &[
        &stop, &sep1,
        &mute_mic, &mute_sys, &sep2,
        &stealth, &show_overlay, &sep3,
        &copy_sub, &sep4,
        &settings, &quit,
    ])
}

/// Build the copy submenu (shared between idle and meeting menus).
fn build_copy_submenu(app: &AppHandle, label: &str) -> Result<Submenu<tauri::Wry>, tauri::Error> {
    let ai = MenuItem::with_id(app, "copy_ai_answer", "Last AI Answer", true, None::<&str>)?;
    let actions = MenuItem::with_id(app, "copy_action_items", "Action Items", true, None::<&str>)?;
    let summary = MenuItem::with_id(app, "copy_summary", "Meeting Summary", true, None::<&str>)?;
    let transcript = MenuItem::with_id(app, "copy_transcript", "Full Transcript", true, None::<&str>)?;

    Submenu::with_items(app, label, true, &[&ai, &actions, &summary, &transcript])
}
```

- [ ] **Step 2: Update `src-tauri/src/tray/mod.rs`**

Add after other `pub mod` declarations:

```rust
pub mod menu;
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/tray/menu.rs src-tauri/src/tray/mod.rs
git commit -m "feat(tray): add state-aware menu builder with idle/meeting/copy variants"
```

---

## Task 5: Click Handler — Native DoubleClick + Middle-Click (Rust)

**Files:**
- Create: `src-tauri/src/tray/click.rs`
- Modify: `src-tauri/src/tray/mod.rs`

**Note:** Tauri 2.10+ exposes native `TrayIconEvent::DoubleClick` (Windows only). No need to synthesize double-click from consecutive Click events. Single-click has zero latency.

- [ ] **Step 1: Create `src-tauri/src/tray/click.rs`**

```rust
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

/// Single click: toggle launcher window visibility.
pub fn handle_single_click(app: &AppHandle) {
    if let Some(launcher) = app.get_webview_window("launcher") {
        if launcher.is_visible().unwrap_or(false) {
            let _ = launcher.hide();
        } else {
            let _ = launcher.show();
            let _ = launcher.set_focus();
        }
    }
}

/// Double-click: context-aware smart action.
/// Idle → emit start meeting + show overlay.
/// Meeting → bring overlay to front.
pub fn handle_double_click(app: &AppHandle) {
    let state = app.state::<AppState>();
    let tray_mgr = state.tray_manager.clone();

    let meeting_active = {
        let mgr = tray_mgr.lock().unwrap();
        mgr.as_ref().map_or(false, |m| m.meeting_active)
    };

    if meeting_active {
        // Bring overlay to front
        if let Some(overlay) = app.get_webview_window("overlay") {
            let _ = overlay.show();
            let _ = overlay.set_focus();
        }
    } else {
        // Start meeting
        let _ = app.emit("tray_start_meeting", ());
        if let Some(overlay) = app.get_webview_window("overlay") {
            let _ = overlay.show();
            let _ = overlay.set_focus();
        }
        if let Some(launcher) = app.get_webview_window("launcher") {
            let _ = launcher.hide();
        }
    }
}

/// Middle-click: toggle mic mute during meeting. No-op when idle.
pub fn handle_middle_click(app: &AppHandle) {
    let state = app.state::<AppState>();
    let tray_mgr = state.tray_manager.clone();

    let mgr = tray_mgr.lock().unwrap();
    if let Some(ref manager) = *mgr {
        if manager.meeting_active {
            let _ = app.emit("tray_toggle_mic", ());
        }
        // Else: no-op silently
    }
}
```

- [ ] **Step 2: Update `src-tauri/src/tray/mod.rs`**

Add after other `pub mod` declarations:

```rust
pub mod click;
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/tray/click.rs src-tauri/src/tray/mod.rs
git commit -m "feat(tray): add click handler with double-click synthesis and middle-click mute"
```

---

## Task 6: IPC Commands (Rust)

**Files:**
- Create: `src-tauri/src/commands/tray_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Create `src-tauri/src/commands/tray_commands.rs`**

```rust
use tauri::{command, AppHandle, Manager};
use crate::state::AppState;
use crate::tray::{TrayState, tooltip};
use crate::tray::menu::RecentMeetingInfo;
use std::time::Instant;

/// Update the tray icon to reflect a new state.
#[command]
pub async fn set_tray_state(
    app: AppHandle,
    state: TrayState,
) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let mut mgr = app_state.tray_manager.lock().map_err(|e| e.to_string())?;
    let manager = mgr.as_mut().ok_or("TrayManager not initialized")?;

    // Cancel pulse timer if leaving recording state
    if manager.current_state == TrayState::Recording && state != TrayState::Recording {
        if let Some(h) = manager.pulse_timer.take() { h.abort(); }
    }

    manager.current_state = state;

    // Update icon
    let icon = manager.icon_set.get(state);
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_icon(Some(icon)).map_err(|e| e.to_string())?;
    }

    // Update tooltip
    let tooltip_text = tooltip::build_tooltip(
        state,
        manager.meeting_start_time,
        manager.is_muted,
        manager.custom_tooltip.as_deref(),
    );
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(Some(&tooltip_text)).map_err(|e| e.to_string())?;
    }

    // Start pulse animation for recording
    if state == TrayState::Recording {
        let tray_mgr_clone = app_state.tray_manager.clone();
        let app_clone = app.clone();
        let handle = tauri::async_runtime::spawn(async move {
            let mut bright = true;
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(750)).await;
                bright = !bright;
                let mgr = tray_mgr_clone.lock().unwrap();
                if let Some(ref m) = *mgr {
                    if m.current_state != TrayState::Recording { break; }
                    let icon = if bright {
                        m.icon_set.get(TrayState::Recording)
                    } else {
                        m.icon_set.get_recording_dim()
                    };
                    if let Some(tray) = app_clone.tray_by_id("main") {
                        let _ = tray.set_icon(Some(icon));
                    }
                } else { break; }
            }
        });
        // Need to re-acquire lock to store handle
        drop(mgr);
        let mut mgr = app_state.tray_manager.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut m) = *mgr {
            m.pulse_timer = Some(handle);
        }
    }

    Ok(())
}

/// Set custom tooltip text (used for idle stats).
#[command]
pub async fn set_tray_tooltip(
    app: AppHandle,
    text: String,
) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let mut mgr = app_state.tray_manager.lock().map_err(|e| e.to_string())?;
    let manager = mgr.as_mut().ok_or("TrayManager not initialized")?;

    manager.custom_tooltip = if text.is_empty() { None } else { Some(text) };

    let tooltip_text = tooltip::build_tooltip(
        manager.current_state,
        manager.meeting_start_time,
        manager.is_muted,
        manager.custom_tooltip.as_deref(),
    );
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(Some(&tooltip_text)).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Set or clear the meeting start time (for Rust-side elapsed time tooltip).
#[command]
pub async fn set_meeting_start_time(
    app: AppHandle,
    started: bool,
) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let tray_mgr = app_state.tray_manager.clone();

    {
        let mut mgr = tray_mgr.lock().map_err(|e| e.to_string())?;
        let manager = mgr.as_mut().ok_or("TrayManager not initialized")?;

        if started {
            manager.meeting_start_time = Some(Instant::now());
            manager.meeting_active = true;

            // Cancel any existing tooltip timer
            if let Some(h) = manager.tooltip_timer.take() { h.abort(); }
        } else {
            manager.meeting_start_time = None;
            manager.meeting_active = false;

            // Cancel tooltip timer
            if let Some(h) = manager.tooltip_timer.take() { h.abort(); }
            return Ok(());
        }
    }

    // Start tooltip update timer (every 5 seconds)
    let app_clone = app.clone();
    let timer_tray = tray_mgr.clone();
    let handle = tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            let mgr = timer_tray.lock().unwrap();
            if let Some(ref m) = *mgr {
                if m.meeting_start_time.is_none() { break; }
                let text = tooltip::build_tooltip(
                    m.current_state,
                    m.meeting_start_time,
                    m.is_muted,
                    m.custom_tooltip.as_deref(),
                );
                if let Some(tray) = app_clone.tray_by_id("main") {
                    let _ = tray.set_tooltip(Some(&text));
                }
            } else { break; }
        }
    });

    let mut mgr = tray_mgr.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut m) = *mgr {
        m.tooltip_timer = Some(handle);
    }

    Ok(())
}

/// Rebuild the tray menu for the current state (idle vs meeting).
#[command]
pub async fn rebuild_tray_menu(
    app: AppHandle,
    meeting_active: bool,
    recent_meetings: Vec<RecentMeetingInfo>,
) -> Result<(), String> {
    let menu = if meeting_active {
        crate::tray::menu::build_meeting_menu(&app).map_err(|e| e.to_string())?
    } else {
        crate::tray::menu::build_idle_menu(&app, &recent_meetings).map_err(|e| e.to_string())?
    };

    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Enable or disable a specific menu item by ID.
#[command]
pub async fn set_tray_menu_item_enabled(
    app: AppHandle,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    // Tauri 2 doesn't expose menu item lookup by ID on tray directly.
    // Menu items are rebuilt via rebuild_tray_menu instead.
    // This command is a no-op placeholder for future use.
    log::debug!("set_tray_menu_item_enabled: {} = {}", id, enabled);
    Ok(())
}
```

- [ ] **Step 2: Add to `src-tauri/src/commands/mod.rs`**

Add line:

```rust
pub mod tray_commands;
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/tray_commands.rs src-tauri/src/commands/mod.rs
git commit -m "feat(tray): add IPC commands for tray state, tooltip, menu, and meeting time"
```

---

## Task 7: Wire TrayManager into lib.rs (Replace Inline Tray Setup)

**Files:**
- Modify: `src-tauri/src/lib.rs`

This is the integration task — replace the existing inline tray menu/click handling in `lib.rs` with the new TrayManager system.

- [ ] **Step 1: Add tray command imports to `lib.rs`**

Add after existing command imports (around line 46):

```rust
// == MODULE COMMANDS: tray ==
use commands::tray_commands;
```

- [ ] **Step 2: Update use statement at top of `lib.rs`**

Replace the existing import block:

```rust
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconEvent,
    Emitter, Manager,
};
```

With:

```rust
use tauri::{
    tray::{TrayIconEvent, MouseButton},
    Emitter, Manager,
};
// Note: Tauri 2.10+ exposes DoubleClick as a native TrayIconEvent variant (Windows only).
```

(Remove menu imports — menus are now built in `tray/menu.rs`)

- [ ] **Step 3: Replace tray setup block (lines ~314-373)**

Replace the entire block from `// -- Build tray menu --` through the `on_tray_icon_event` closure with:

```rust
            // -- Initialize TrayManager --
            {
                let base_icon = include_bytes!("../icons/icon.png");
                let icon_set = tray::IconSet::new(base_icon)
                    .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e)))?;
                let manager = tray::TrayManager::new(icon_set);

                let state = app.state::<AppState>();
                *state.tray_manager.lock().unwrap() = Some(manager);

                // Build initial idle menu
                let menu = tray::menu::build_idle_menu(app.handle(), &[])
                    .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
                if let Some(tray_icon) = app.tray_by_id("main") {
                    tray_icon.set_menu(Some(menu))
                        .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
                }
            }

            // -- Handle tray menu item clicks --
            let app_handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                let id = event.id().as_ref();
                match id {
                    "start_meeting" => {
                        let _ = _app.emit("tray_start_meeting", ());
                        show_overlay(&app_handle);
                    }
                    "stop_meeting" => {
                        let _ = _app.emit("tray_stop_meeting", ());
                    }
                    "toggle_mic" => {
                        let _ = _app.emit("tray_toggle_mic", ());
                    }
                    "toggle_system" => {
                        let _ = _app.emit("tray_toggle_system", ());
                    }
                    "toggle_stealth" => {
                        let _ = _app.emit("tray_toggle_stealth", ());
                    }
                    "show_overlay" => {
                        let _ = _app.emit("tray_show_overlay", ());
                        show_overlay(&app_handle);
                    }
                    "copy_ai_answer" => {
                        let _ = _app.emit("tray_copy", "ai_answer");
                    }
                    "copy_action_items" => {
                        let _ = _app.emit("tray_copy", "action_items");
                    }
                    "copy_summary" => {
                        let _ = _app.emit("tray_copy", "summary");
                    }
                    "copy_transcript" => {
                        let _ = _app.emit("tray_copy", "transcript");
                    }
                    "settings" => {
                        let _ = _app.emit("tray_open_settings", ());
                        show_launcher(&app_handle);
                    }
                    "quit" => {
                        _app.exit(0);
                    }
                    _ => {
                        // Check for recent meeting clicks (id format: "recent_{id}")
                        if let Some(meeting_id) = id.strip_prefix("recent_") {
                            let _ = _app.emit("tray_open_meeting", meeting_id.to_string());
                            show_launcher(&app_handle);
                        }
                    }
                }
            });

            // -- Handle tray icon click events (single/double/middle) --
            // Tauri 2.10+ provides native DoubleClick event on Windows.
            let tray_app = app.handle().clone();
            if let Some(tray_icon) = app.tray_by_id("main") {
                tray_icon.on_tray_icon_event(move |_tray, event| {
                    match event {
                        TrayIconEvent::Click { button, .. } => match button {
                            MouseButton::Left => {
                                tray::click::handle_single_click(&tray_app);
                            }
                            MouseButton::Middle => {
                                tray::click::handle_middle_click(&tray_app);
                            }
                            _ => {}
                        },
                        TrayIconEvent::DoubleClick { button, .. }
                            if button == MouseButton::Left =>
                        {
                            tray::click::handle_double_click(&tray_app);
                        }
                        _ => {}
                    }
                });
            }
```

- [ ] **Step 4: Register tray commands in invoke_handler**

Add after the stealth commands block (around line 477):

```rust
            // == COMMANDS: tray ==
            tray_commands::set_tray_state,
            tray_commands::set_tray_tooltip,
            tray_commands::set_meeting_start_time,
            tray_commands::rebuild_tray_menu,
            tray_commands::set_tray_menu_item_enabled,
```

- [ ] **Step 5: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tray): wire TrayManager into app setup, replace inline tray code"
```

---

## Task 8: Frontend IPC Wrappers + Event Listeners

**Files:**
- Modify: `src/lib/ipc.ts`
- Modify: `src/lib/events.ts`

- [ ] **Step 1: Add IPC wrappers to `src/lib/ipc.ts`**

Add at the end of the file:

```typescript
// == IPC: Tray ==

export async function setTrayState(state: TrayState): Promise<void> {
  return invoke("set_tray_state", { state });
}

export async function setTrayTooltip(text: string): Promise<void> {
  return invoke("set_tray_tooltip", { text });
}

export async function setMeetingStartTime(started: boolean): Promise<void> {
  return invoke("set_meeting_start_time", { started });
}

export async function rebuildTrayMenu(
  meetingActive: boolean,
  recentMeetings: RecentMeeting[]
): Promise<void> {
  return invoke("rebuild_tray_menu", {
    meetingActive,
    recentMeetings: recentMeetings.map((m) => ({
      id: m.id,
      title: m.title,
      start_time: m.startTime,
      duration: m.duration,
    })),
  });
}
```

Also add the missing `setStealthMode` wrapper (Rust command exists but had no TS wrapper):

```typescript
export async function setStealthMode(enabled: boolean): Promise<void> {
  return invoke("set_stealth_mode", { enabled });
}
```

And add `TrayState` and `RecentMeeting` to the import block at top of `ipc.ts`.

- [ ] **Step 2: Add event listeners to `src/lib/events.ts`**

Add at the end:

```typescript
// == TRAY EVENTS ==

export function onTrayStartMeeting(handler: () => void): Promise<UnlistenFn> {
  return listen("tray_start_meeting", () => handler());
}

export function onTrayOpenSettings(handler: () => void): Promise<UnlistenFn> {
  return listen("tray_open_settings", () => handler());
}

export function onTrayStopMeeting(handler: () => void): Promise<UnlistenFn> {
  return listen("tray_stop_meeting", () => handler());
}

export function onTrayToggleMic(handler: () => void): Promise<UnlistenFn> {
  return listen("tray_toggle_mic", () => handler());
}

export function onTrayToggleSystem(handler: () => void): Promise<UnlistenFn> {
  return listen("tray_toggle_system", () => handler());
}

export function onTrayToggleStealth(handler: () => void): Promise<UnlistenFn> {
  return listen("tray_toggle_stealth", () => handler());
}

export function onTrayShowOverlay(handler: () => void): Promise<UnlistenFn> {
  return listen("tray_show_overlay", () => handler());
}

export function onTrayCopy(handler: (kind: string) => void): Promise<UnlistenFn> {
  return listen<string>("tray_copy", (e) => handler(e.payload));
}

export function onTrayOpenMeeting(handler: (id: string) => void): Promise<UnlistenFn> {
  return listen<string>("tray_open_meeting", (e) => handler(e.payload));
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ipc.ts src/lib/events.ts
git commit -m "feat(tray): add frontend IPC wrappers and event listeners for tray system"
```

---

## Task 9: useTraySync Hook + Store Updates

**Files:**
- Create: `src/hooks/useTraySync.ts`
- Modify: `src/stores/meetingStore.ts` (add `overlayHidden`)
- Modify: `src/App.tsx` (wire hook + event handlers)

- [ ] **Step 1: Add `overlayHidden` to meetingStore**

In `src/stores/meetingStore.ts`, add to the `MeetingState` interface:

```typescript
  overlayHidden: boolean;
  setOverlayHidden: (hidden: boolean) => void;
  toggleOverlayHidden: () => void;
```

Add to the store initial state:

```typescript
  overlayHidden: false,
  setOverlayHidden: (hidden) => set({ overlayHidden: hidden }),
  toggleOverlayHidden: () => {
    const next = !useMeetingStore.getState().overlayHidden;
    set({ overlayHidden: next });
  },
```

- [ ] **Step 2: Create `src/hooks/useTraySync.ts`**

```typescript
import { useEffect, useRef } from "react";
import { useMeetingStore } from "../stores/meetingStore";
import { useConfigStore } from "../stores/configStore";
import { useStreamStore } from "../stores/streamStore";
import { useRagStore } from "../stores/ragStore";
import {
  setTrayState,
  setMeetingStartTime,
  rebuildTrayMenu,
} from "../lib/ipc";
import type { TrayState, RecentMeeting, MeetingSummary } from "../lib/types";

/**
 * Priority order: Stealth > Muted > Recording > AiProcessing > Indexing > Idle
 */
function computeTrayState(
  isRecording: boolean,
  mutedYou: boolean,
  overlayHidden: boolean,
  isStreaming: boolean,
  isIndexing: boolean
): TrayState {
  if (isRecording && overlayHidden) return "stealth";
  if (isRecording && mutedYou) return "muted";
  if (isRecording) return "recording";
  if (isStreaming) return "ai_processing";
  if (isIndexing) return "indexing";
  return "idle";
}

function toRecentMeeting(m: MeetingSummary): RecentMeeting {
  return {
    id: m.id,
    title: m.title || "Untitled Meeting",
    startTime: m.start_time || "",
    duration: m.duration_seconds ?? 0,
  };
}

export function useTraySync() {
  const prevState = useRef<TrayState>("idle");
  const prevRecording = useRef(false);

  const isRecording = useMeetingStore((s) => s.isRecording);
  const overlayHidden = useMeetingStore((s) => s.overlayHidden);
  const recentMeetings = useMeetingStore((s) => s.recentMeetings);
  const mutedYou = useConfigStore((s) => s.mutedYou);
  const isStreaming = useStreamStore((s) => s.isStreaming);
  const isIndexing = useRagStore((s) => s.isIndexing);

  // Sync tray state on store changes
  useEffect(() => {
    const newState = computeTrayState(
      isRecording, mutedYou, overlayHidden, isStreaming, isIndexing
    );

    if (newState !== prevState.current) {
      prevState.current = newState;
      setTrayState(newState).catch((e) =>
        console.warn("[useTraySync] Failed to set tray state:", e)
      );
    }
  }, [isRecording, mutedYou, overlayHidden, isStreaming, isIndexing]);

  // Sync meeting start/stop time
  useEffect(() => {
    if (isRecording && !prevRecording.current) {
      setMeetingStartTime(true).catch((e) =>
        console.warn("[useTraySync] Failed to set meeting start:", e)
      );
    } else if (!isRecording && prevRecording.current) {
      setMeetingStartTime(false).catch((e) =>
        console.warn("[useTraySync] Failed to clear meeting start:", e)
      );
    }
    prevRecording.current = isRecording;
  }, [isRecording]);

  // Rebuild tray menu when meeting state or recent meetings change
  useEffect(() => {
    const recent = recentMeetings.slice(0, 3).map(toRecentMeeting);
    rebuildTrayMenu(isRecording, recent).catch((e) =>
      console.warn("[useTraySync] Failed to rebuild tray menu:", e)
    );
  }, [isRecording, recentMeetings]);
}
```

- [ ] **Step 3: Wire `useTraySync` and new event handlers in `src/App.tsx`**

Add import:

```typescript
import { useTraySync } from "./hooks/useTraySync";
```

Add inside the `App` component (after existing hooks):

```typescript
  useTraySync();
```

Expand the existing tray event `useEffect` to include new events. Add handlers for:
- `tray_stop_meeting` → call `endMeetingFlow()` or equivalent stop function
- `tray_toggle_mic` → call `useConfigStore.getState().toggleMuteYou()`
- `tray_toggle_system` → call `useConfigStore.getState().toggleMuteThem()`
- `tray_toggle_stealth` → call `useMeetingStore.getState().toggleOverlayHidden()`
- `tray_show_overlay` → show overlay window
- `tray_copy` → read payload kind and copy to clipboard
- `tray_open_meeting` → navigate to meeting review

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTraySync.ts src/stores/meetingStore.ts src/App.tsx
git commit -m "feat(tray): add useTraySync hook, overlayHidden state, wire tray events in App"
```

---

## Task 10: Tray Settings (Config Store + Settings UI)

**Files:**
- Modify: `src/stores/configStore.ts`
- Modify: Settings UI component (add tray settings section)

- [ ] **Step 1: Add tray settings to configStore**

Add to the `ConfigState` interface:

```typescript
  trayNotifications: boolean;
  trayAutoStart: boolean;
  trayStartMinimized: boolean;
  trayAutoDetectMeeting: boolean;
  trayStealthEnabled: boolean;
  stealthShortcut: string;
  setTrayNotifications: (enabled: boolean) => void;
  setTrayAutoStart: (enabled: boolean) => void;
  setTrayStartMinimized: (enabled: boolean) => void;
  setTrayAutoDetectMeeting: (enabled: boolean) => void;
  setTrayStealthEnabled: (enabled: boolean) => void;
  setStealthShortcut: (shortcut: string) => void;
```

Add default values:

```typescript
  trayNotifications: true,
  trayAutoStart: false,
  trayStartMinimized: true,
  trayAutoDetectMeeting: false,
  trayStealthEnabled: true,
  stealthShortcut: "Ctrl+Shift+H",
```

Add setter actions (following existing pattern with `set()` + persist via plugin-store):

```typescript
  setTrayNotifications: (enabled) => {
    set({ trayNotifications: enabled });
    // Persist: follow the existing loadConfig/saveConfig pattern in configStore
  },
  setTrayAutoStart: (enabled) => {
    set({ trayAutoStart: enabled });
  },
  setTrayStartMinimized: (enabled) => {
    set({ trayStartMinimized: enabled });
  },
  setTrayAutoDetectMeeting: (enabled) => {
    set({ trayAutoDetectMeeting: enabled });
  },
  setTrayStealthEnabled: (enabled) => {
    set({ trayStealthEnabled: enabled });
  },
  setStealthShortcut: (shortcut) => {
    set({ stealthShortcut: shortcut });
  },
```

**Important:** Each setter must persist to the Tauri plugin-store following the same pattern as other settings in `loadConfig()`. Add the new keys to both the save and load paths in the existing config persistence logic.

- [ ] **Step 2: Add tray settings section to settings UI**

Add a new "Tray & System" section in the settings panel with toggles for:
- Tray Notifications (toggle)
- Start with Windows (toggle)
- Start Minimized (toggle, only visible when Start with Windows is on)
- Auto-Detect Meetings (toggle)
- Stealth Mode Enabled (toggle)
- Stealth Shortcut (keybind input)

Follow the existing settings UI pattern (shadcn/ui Switch components, grouped sections).

- [ ] **Step 3: Persist tray settings**

Follow the existing `loadConfig` pattern — tray settings should be saved to and loaded from the Tauri plugin-store alongside other config values.

- [ ] **Step 4: Verify TypeScript compiles and settings render**

Run: `npx tsc --noEmit`
Run: `npm run dev` and verify settings page shows new section.

- [ ] **Step 5: Commit**

```bash
git add src/stores/configStore.ts src/settings/
git commit -m "feat(tray): add tray settings to config store and settings UI"
```

---

## Task 11: Auto-Start with Windows

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json` (add plugin)

- [ ] **Step 1: Add `tauri-plugin-autostart` to Cargo.toml**

```toml
tauri-plugin-autostart = "2"
```

- [ ] **Step 2: Initialize plugin in `lib.rs`**

In the plugin chain (look for `.plugin(tauri_plugin_*::init())` calls), add:

```rust
.plugin(tauri_plugin_autostart::init(
    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
    None,
))
```

- [ ] **Step 3: Add autostart toggle logic**

When `trayAutoStart` setting changes, call the autostart plugin's enable/disable. This can be done via a Rust command or directly from the frontend using `@tauri-apps/plugin-autostart`.

Add to `package.json` dependencies:

```
"@tauri-apps/plugin-autostart": "^2"
```

In the settings UI toggle handler:

```typescript
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";

// When toggle changes:
if (enabled) {
  await enable();
} else {
  await disable();
}
```

- [ ] **Step 4: Add autostart permission to capabilities**

Check `src-tauri/capabilities/default.json` (or equivalent). Add the `autostart:allow-enable`, `autostart:allow-disable`, `autostart:allow-is-enabled` permissions if required by the plugin.

- [ ] **Step 5: Handle start-minimized**

In `lib.rs` setup, after window creation, check if the app was auto-started and should start minimized. If so, hide the launcher window:

```rust
// After window setup, check if we should start minimized
// This reads from the persisted settings store
```

- [ ] **Step 6: Verify compile**

Run: `cd src-tauri && cargo check && cd .. && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/tauri.conf.json src-tauri/capabilities/ package.json
git commit -m "feat(tray): add auto-start with Windows via tauri-plugin-autostart"
```

---

## Note: Meeting Auto-Detection (Deferred)

The spec defines meeting auto-detection via audio activity monitoring (IAudioMeterInformation polling). This is **deferred to a follow-up plan** because:
1. It requires background audio monitoring infrastructure that is independent of the tray system
2. The setting toggle (`trayAutoDetectMeeting`) is wired in Task 10 and defaults to `false`
3. The feature can be implemented later without changing any tray system code — it just needs to fire a toast notification when activity is detected

---

## Task 12: Stealth Mode (Overlay Hide)

**Files:**
- Modify: `src/App.tsx` or new `src/hooks/useStealthMode.ts`
- Modify: `src-tauri/src/commands/stealth_commands.rs` (extend existing)

- [ ] **Step 1: Implement stealth toggle in frontend**

When `tray_toggle_stealth` event fires (or stealth shortcut pressed):

```typescript
function toggleStealth() {
  const { overlayHidden, setOverlayHidden } = useMeetingStore.getState();
  const next = !overlayHidden;
  setOverlayHidden(next);

  if (next) {
    // Hide overlay window
    import("@tauri-apps/api/webviewWindow").then(({ WebviewWindow }) => {
      const overlay = WebviewWindow.getByLabel("overlay");
      overlay?.hide();
    });
    // Enable capture stealth as safety net
    import("../lib/ipc").then(({ setStealthMode }) => {
      setStealthMode(true);
    });
  } else {
    // Show overlay window
    import("@tauri-apps/api/webviewWindow").then(({ WebviewWindow }) => {
      const overlay = WebviewWindow.getByLabel("overlay");
      overlay?.show();
    });
    // Revert capture stealth
    import("../lib/ipc").then(({ setStealthMode }) => {
      setStealthMode(false);
    });
  }
}
```

- [ ] **Step 2: Register stealth shortcut**

Use the existing `useGlobalShortcut` hook pattern to register `Ctrl+Shift+H` (or user's configured shortcut) that calls `toggleStealth()`.

- [ ] **Step 3: Verify stealth toggle works**

Run: `npx tauri dev`
Test: Start meeting → press Ctrl+Shift+H → overlay hides, tray icon changes to stealth state. Press again → overlay returns.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/ src/App.tsx
git commit -m "feat(tray): implement stealth mode (overlay hide) with keyboard shortcut"
```

---

## Task 13: Notification Toasts

**Files:**
- Create: `src/hooks/useTrayNotifications.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create notification hook**

```typescript
import { useEffect, useRef } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useMeetingStore } from "../stores/meetingStore";
import { useConfigStore } from "../stores/configStore";

export function useTrayNotifications() {
  const isRecording = useMeetingStore((s) => s.isRecording);
  const overlayHidden = useMeetingStore((s) => s.overlayHidden);
  const trayNotifications = useConfigStore((s) => s.trayNotifications);
  const prevRecording = useRef(false);
  const lastToastTime = useRef(0);

  useEffect(() => {
    if (!trayNotifications || overlayHidden) return; // No toasts in stealth

    const now = Date.now();
    if (now - lastToastTime.current < 30_000) return; // Rate limit

    if (isRecording && !prevRecording.current) {
      sendToast("Meeting started", "NexQ is recording.");
      lastToastTime.current = now;
    } else if (!isRecording && prevRecording.current) {
      sendToast("Meeting ended", "Check your transcript and action items.");
      lastToastTime.current = now;
    }

    prevRecording.current = isRecording;
  }, [isRecording, trayNotifications, overlayHidden]);
}

async function sendToast(title: string, body: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch (e) {
    console.warn("[trayNotifications] Toast failed:", e);
  }
}
```

- [ ] **Step 2: Wire hook in App.tsx**

```typescript
import { useTrayNotifications } from "./hooks/useTrayNotifications";
// Inside App():
useTrayNotifications();
```

- [ ] **Step 3: Verify notifications**

Run: `npx tauri dev`
Test: Start meeting → Windows toast appears. Stop meeting → toast appears.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTrayNotifications.ts src/App.tsx
git commit -m "feat(tray): add notification toasts for meeting start/stop with rate limiting"
```

---

## Task 14: Version Bump + Final Integration Test

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Bump version**

Update `NEXQ_VERSION` and `NEXQ_BUILD_DATE` in `src/lib/version.ts`.

- [ ] **Step 2: Full build test**

Run: `npx tauri build`
Expected: Builds successfully with no errors.

- [ ] **Step 3: Manual smoke test**

Run the app and verify:
1. Tray icon shows with "NexQ — Idle" tooltip
2. Right-click shows idle menu with Start Meeting, recent meetings, Copy, Settings, Quit
3. Single click toggles launcher
4. Double-click starts meeting (check 200ms delay on single click)
5. During meeting: tray icon shows recording badge (pulsing), menu switches to meeting variant
6. Middle-click toggles mic mute (if supported)
7. Stealth shortcut (Ctrl+Shift+H) hides overlay, icon dims
8. Stop meeting → icon returns to idle, toast fires
9. Settings → tray section shows all toggles

- [ ] **Step 4: Commit**

```bash
git add src/lib/version.ts
git commit -m "chore: bump version for tray icon system release"
```
