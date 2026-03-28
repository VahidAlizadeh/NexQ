# NexQ Demo Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hidden demo mode triggered by `Ctrl+Shift+D` that populates Zustand stores with mock data for capturing pixel-perfect screenshots and recordings.

**Architecture:** Frontend-only. A `demoEngine` orchestrates populating 10+ Zustand stores via their existing actions (no IPC calls). Scenarios provide mock data + optional play timelines. A `DemoPicker` modal lets the user choose scenario and mode.

**Tech Stack:** React 18, Zustand, TypeScript. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-03-28-demo-mode-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/demo/demoStore.ts` | Zustand store: isDemoActive, activeScenario, mode, pickerOpen |
| `src/demo/demoEngine.ts` | Orchestrator: snapshot stores, populate, run timeline, cleanup |
| `src/demo/DemoPicker.tsx` | Modal UI for selecting scenario + mode |
| `src/demo/DemoBadge.tsx` | Floating "EXIT DEMO" badge |
| `src/demo/useDemoShortcut.ts` | Hook: registers Ctrl+Shift+D keydown handler |
| `src/demo/scenarios/types.ts` | DemoScenario interface |
| `src/demo/scenarios/liveInterview.ts` | Interview scenario data + timeline |
| `src/demo/scenarios/liveLecture.ts` | Lecture scenario data + timeline |
| `src/demo/scenarios/pastMeeting.ts` | Past meeting list + detail data |
| `src/demo/scenarios/settings.ts` | Provider config mock data |
| `src/demo/scenarios/ragContext.ts` | Document + RAG index mock data |
| `src/demo/scenarios/index.ts` | Re-exports all scenarios as array |

### Modified Files

| File | Changes |
|------|---------|
| `src/App.tsx` (or root component) | Add `useDemoShortcut()` hook, render `<DemoPicker />` and `<DemoBadge />` |

---

## Important: Store Manipulation Without IPC

The meeting lifecycle methods (`startMeetingFlow`, `endMeetingFlow`, `loadResources`, etc.) make Tauri IPC calls. **Demo mode must NOT call these.** Instead, populate stores using their individual setter/add actions:

- `useMeetingStore.getState().setActiveMeeting(meeting)` — NOT `startMeetingFlow()`
- `useMeetingStore.getState().setCurrentView("overlay")` — direct view switch
- `useMeetingStore.getState().setIsRecording(true)` — direct flag
- `useTranscriptStore.getState().appendSegment(segment)` — direct add
- `useContextStore.getState().setResources(resources)` — direct set, NOT `loadResources()`
- etc.

All store access from demo code uses `useXxxStore.getState()` (outside React) for imperative calls.

---

## Task 1: Demo Store + Scenario Types

**Files:**
- Create: `src/demo/demoStore.ts`
- Create: `src/demo/scenarios/types.ts`

- [ ] **Step 1: Create scenarios/types.ts**

```typescript
export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  supportsPlay: boolean;
  window: 'overlay' | 'launcher';
  populate: () => void;
  play?: () => () => void; // Returns cleanup fn to cancel timers
}
```

- [ ] **Step 2: Create demoStore.ts**

Zustand store with:
```typescript
interface DemoState {
  isDemoActive: boolean;
  activeScenario: string | null;
  mode: 'play' | 'screenshot' | null;
  isPlaying: boolean;
  pickerOpen: boolean;
  // Actions
  openPicker: () => void;
  closePicker: () => void;
  startDemo: (scenarioId: string, mode: 'play' | 'screenshot') => void;
  stopDemo: () => void;
  setPlaying: (playing: boolean) => void;
}
```

`startDemo` sets isDemoActive=true, activeScenario, mode. `stopDemo` resets all to defaults.

- [ ] **Step 3: Verify build**

```bash
cd C:/Users/vahid/Desktop/VahidVibeProject/NexQ && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/demo/
git commit -m "feat(demo): add demoStore and DemoScenario type interface"
```

---

## Task 2: Demo Engine

**Files:**
- Create: `src/demo/demoEngine.ts`

- [ ] **Step 1: Create demoEngine.ts**

The engine provides two functions: `launchDemo(scenario, mode)` and `exitDemo()`.

`launchDemo`:
1. Snapshot current state of all stores that will be modified (meetingStore, transcriptStore, streamStore, callLogStore, translationStore, bookmarkStore, actionItemStore, topicSectionStore, speakerStore, contextStore, ragStore, configStore)
2. Store snapshots in a module-level variable. **Note:** For translationStore, deep-clone `translations` (Map) and `translating` (Set) since they're reference types.
3. If mode === 'screenshot': call `scenario.populate()` to fill stores with final state
4. If mode === 'play' and scenario.supportsPlay: call `scenario.play()` (builds up from empty), store the returned cleanup fn
5. Set demoStore: isDemoActive=true, activeScenario=scenario.id, mode
6. Switch view: if scenario.window === 'overlay', set meetingStore currentView to 'overlay'. If 'launcher', set to 'launcher'.

**Important:** Use `useXxxStore.setState({...})` for direct state mutation instead of setter actions like `setProvider()` or `setLlmProvider()` — those setters persist to Tauri plugin-store on disk, which we must avoid in demo mode. The settings overlay is opened via `useMeetingStore.getState().setSettingsOpen(true)` (safe, no persistence).

`exitDemo`:
1. Call play cleanup function if running (cancels timers)
2. Restore all stores from snapshots
3. Reset demoStore

**Snapshot/restore approach:** For each store, capture a shallow copy of its state via `useXxxStore.getState()`, then restore via `useXxxStore.setState(snapshot)`.

Important: The engine uses `useXxxStore.getState()` for reads and `useXxxStore.setState()` for writes — this works outside React components.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/demo/demoEngine.ts
git commit -m "feat(demo): add demo engine with snapshot/restore and scenario orchestration"
```

---

## Task 3: Live Interview Scenario

**Files:**
- Create: `src/demo/scenarios/liveInterview.ts`

- [ ] **Step 1: Create liveInterview.ts**

Exports a `DemoScenario` object.

**`populate()` function** — populates stores with the final state (all 7 transcript lines, translation active, question answered, AI response complete):

Mock meeting: `{ id: "demo-interview-001", title: "Technical Interview", created_at: ISO string, ... }`

7 transcript segments (use `appendSegment` on transcriptStore):
- Each with unique id (e.g., `demo-seg-001`), text from spec, speaker "you"/"them", timestamp_ms, is_final: true, confidence: 0.95

Translation: Set translationStore autoTranslateActive=true, targetLang="zh", displayMode="inline", add translations for all 7 segments via `addTranslation()`.

AI response: Set streamStore with completed Assist response. Add a LogEntry to callLogStore with status "complete", mode "Assist", provider "openai", model "gpt-4o".

Speakers: Use speakerStore to set up "you" and "them" speakers with stats.

Meeting state: Set meetingStore activeMeeting, currentView "overlay", isRecording true, audioMode "online", aiScenario "interview", elapsedMs 180000 (3 min).

**`play()` function** — returns a cleanup function. Uses `setTimeout` chain following the timeline from the spec (0s→15s). Each step calls the appropriate store action. The populate function is NOT called first in play mode — the play function builds up from empty.

Play flow:
1. Set meeting active (empty transcript)
2. Add segments one by one on the timeline
3. At 6.5s: enable translation, add translations for existing segments
4. Continue adding segments (with translations)
5. At 11.5s: (question detection is visual — set streamStore to show the question)
6. At 13s: start AI response streaming (use appendToken in a loop with small delays)
7. At 15s: complete

Return a cleanup function that calls `clearTimeout` on all pending timeouts.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/demo/scenarios/liveInterview.ts
git commit -m "feat(demo): add live interview scenario with play timeline"
```

---

## Task 4: Live Lecture Scenario

**Files:**
- Create: `src/demo/scenarios/liveLecture.ts`

- [ ] **Step 1: Create liveLecture.ts**

Same pattern as liveInterview but with lecture-specific data:

Meeting: "CS 301 — Distributed Systems", scenario "lecture", single speaker "Prof. Chen".

7 transcript segments about consensus algorithms (Raft, Paxos).

Features exercised:
- 2 topic sections: "Consensus Algorithms" (start_ms: 0), "Paxos vs Raft" (start_ms: ~90000)
- 1 bookmark at ~60000ms with note "Leader election explanation"
- 1 action item: "Implement leader election (homework)"
- 1 callLog entry: Recap mode with lecture summary

Play timeline follows spec: segments appear → topic detected → bookmark → action item → AI recap streams.

- [ ] **Step 2: Verify build and commit**

```bash
npm run build
git add src/demo/scenarios/liveLecture.ts
git commit -m "feat(demo): add live lecture scenario with bookmarks, topics, action items"
```

---

## Task 5: Past Meeting Scenario

**Files:**
- Create: `src/demo/scenarios/pastMeeting.ts`

- [ ] **Step 1: Create pastMeeting.ts**

Screenshot-only scenario (no play function).

`populate()`:
1. Set meetingStore.currentView to "launcher"
2. Set meetingStore.recentMeetings with 5 MeetingSummary objects (from spec table: Google Interview, CS 301, Sprint Planning, Mock Interview, Office Hours)
3. Each MeetingSummary needs: id, title, created_at (relative dates computed from now), duration_seconds, segment_count, audio_mode, ai_scenario, has_summary, speaker_count
4. Set meetingStore.activeMeeting to null (launcher view, no active meeting)
5. Populate transcriptStore with 10 sample segments for the first meeting (Technical Interview — Google)
6. Populate callLogStore with 3 entries (Assist, WhatToSay, Recap)
7. Populate bookmarkStore with 3 bookmarks
8. Populate actionItemStore with 2 items
9. Populate speakerStore with 2 speakers ("You" at 42%, "Interviewer" at 58%)

Note: The launcher view reads `recentMeetings` from meetingStore. The user clicks a meeting card to view its details. The demo should pre-populate the detail data so it's visible when a meeting is selected.

- [ ] **Step 2: Verify build and commit**

```bash
npm run build
git add src/demo/scenarios/pastMeeting.ts
git commit -m "feat(demo): add past meeting scenario with 5 meetings and detail data"
```

---

## Task 6: Settings Scenario

**Files:**
- Create: `src/demo/scenarios/settings.ts`

- [ ] **Step 1: Create settings.ts**

Screenshot-only. Populates configStore with realistic provider configuration.

`populate()`:
1. Set an active meeting (so overlay renders) with meetingStore
2. Open settings: set meetingStore.settingsOpen = true (or use setCurrentView("settings") — check which triggers the settings modal)
3. Set configStore:
   - sttProvider: "deepgram"
   - llmProvider: "openai"
   - llmModel: "gpt-4o"
   - Meeting audio config: You → Deepgram, Them → Web Speech
   - Recording enabled

The implementer should check how the settings overlay is opened (it may be `meetingStore.settingsOpen` or a separate mechanism) and use that.

- [ ] **Step 2: Verify build and commit**

```bash
npm run build
git add src/demo/scenarios/settings.ts
git commit -m "feat(demo): add settings scenario with configured providers"
```

---

## Task 7: RAG/Context Scenario

**Files:**
- Create: `src/demo/scenarios/ragContext.ts`

- [ ] **Step 1: Create ragContext.ts**

Screenshot-only. Populates contextStore and ragStore for the launcher's context panel.

`populate()`:
1. Set meetingStore.currentView to "launcher"
2. Set contextStore.resources with 4 ContextResource objects:
   - resume-2026.pdf: file_type "pdf", size_bytes 245760, token_count 1847, chunk_count 12, index_status "indexed"
   - google-job-description.docx: file_type "docx", size_bytes 189440, token_count 2103, chunk_count 15, index_status "indexed"
   - system-design-notes.md: file_type "md", size_bytes 12800, token_count 890, chunk_count 6, index_status "indexed"
   - distributed-systems-cheatsheet.txt: file_type "txt", size_bytes 5120, token_count 456, chunk_count 3, index_status "indexed"
3. Set contextStore.tokenBudget: { used: 5296, total: 8000, segments: [...] }
4. Set ragStore.indexStatus: { total_files: 4, indexed_files: 4, total_chunks: 36, total_tokens: 5296, last_indexed_at: recent ISO date }
5. Set ragStore.isIndexing to false
6. Set ragStore.ragConfig.enabled to true

- [ ] **Step 2: Verify build and commit**

```bash
npm run build
git add src/demo/scenarios/ragContext.ts
git commit -m "feat(demo): add RAG/context scenario with 4 indexed documents"
```

---

## Task 8: Scenario Index

**Files:**
- Create: `src/demo/scenarios/index.ts`

- [ ] **Step 1: Create index.ts**

Re-export all scenarios as an array:

```typescript
import { liveInterviewScenario } from './liveInterview';
import { liveLectureScenario } from './liveLecture';
import { pastMeetingScenario } from './pastMeeting';
import { settingsScenario } from './settings';
import { ragContextScenario } from './ragContext';
import type { DemoScenario } from './types';

export const demoScenarios: DemoScenario[] = [
  liveInterviewScenario,
  liveLectureScenario,
  pastMeetingScenario,
  settingsScenario,
  ragContextScenario,
];

export type { DemoScenario } from './types';
```

- [ ] **Step 2: Verify build and commit**

```bash
npm run build
git add src/demo/scenarios/index.ts
git commit -m "feat(demo): add scenario index re-exporting all 5 scenarios"
```

---

## Task 9: Demo Picker UI

**Files:**
- Create: `src/demo/DemoPicker.tsx`

- [ ] **Step 1: Create DemoPicker.tsx**

A modal overlay matching the app's existing modal pattern (reference `src/settings/SettingsOverlay.tsx` for styling).

Structure:
- Backdrop: fixed inset-0, bg-black/50, z-50, flex center
- Dialog: rounded-2xl, bg-card, border border-border/20, max-w-md, p-6
- Title: "Demo Mode" (text-lg font-bold)
- Subtitle: "Select a scenario for screenshots or recordings" (text-sm text-muted-foreground)
- Scenario list: 5 items, each showing icon + name + description
- Selected state: ring-2 ring-primary bg-primary/5
- Mode toggle: "Play" / "Screenshot" buttons (only shown if selected scenario supports play)
- Start button: btn-primary style
- Close: X button top-right + Escape key

Import `demoScenarios` from scenarios/index and `useDemoStore` for pickerOpen state.

On start: call `demoEngine.launchDemo(selectedScenario, mode)` and close picker.

- [ ] **Step 2: Verify build and commit**

```bash
npm run build
git add src/demo/DemoPicker.tsx
git commit -m "feat(demo): add DemoPicker modal UI"
```

---

## Task 10: Demo Badge + Keyboard Shortcut

**Files:**
- Create: `src/demo/DemoBadge.tsx`
- Create: `src/demo/useDemoShortcut.ts`

- [ ] **Step 1: Create DemoBadge.tsx**

A small floating badge visible when demo is active:
- Position: fixed bottom-4 right-4 z-[100]
- Styling: bg-destructive/20 border border-destructive/30 rounded-full px-3 py-1.5
- Text: "EXIT DEMO" (text-xs font-bold text-destructive)
- Click handler: calls `demoEngine.exitDemo()`
- Only renders when `useDemoStore.isDemoActive` is true

- [ ] **Step 2: Create useDemoShortcut.ts**

A hook that registers `window.addEventListener("keydown")` for Ctrl+Shift+D:
- If demo not active AND picker not open → open picker
- If demo active → exit demo
- If picker open → close picker
- Cleanup: remove listener on unmount

```typescript
export function useDemoShortcut() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        const { isDemoActive, pickerOpen, openPicker, closePicker } = useDemoStore.getState();
        if (isDemoActive) {
          exitDemo();
        } else if (pickerOpen) {
          closePicker();
        } else {
          openPicker();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
```

- [ ] **Step 3: Verify build and commit**

```bash
npm run build
git add src/demo/DemoBadge.tsx src/demo/useDemoShortcut.ts
git commit -m "feat(demo): add EXIT DEMO badge and Ctrl+Shift+D shortcut hook"
```

---

## Task 11: Integration into App

**Files:**
- Modify: `src/App.tsx` (or the root component that renders both launcher and overlay views)

- [ ] **Step 1: Read App.tsx to understand the root component structure**

Find where to add:
1. The `useDemoShortcut()` hook call
2. The `<DemoPicker />` component
3. The `<DemoBadge />` component

These should be rendered at the root level so they're always available regardless of current view.

- [ ] **Step 2: Add imports and components**

Add to the root component:
```typescript
import { useDemoShortcut } from './demo/useDemoShortcut';
import { DemoPicker } from './demo/DemoPicker';
import { DemoBadge } from './demo/DemoBadge';
```

Inside the root component:
```typescript
useDemoShortcut();
// In JSX:
<>
  {/* ... existing content ... */}
  <DemoPicker />
  <DemoBadge />
</>
```

- [ ] **Step 3: Full build verification**

```bash
npm run build
```

- [ ] **Step 4: Test manually**

```bash
npx tauri dev
```

1. Press `Ctrl+Shift+D` → Demo Picker should appear
2. Select "Live Interview" + "Screenshot" → overlay should show with mock data
3. Click "EXIT DEMO" → should restore to normal state
4. Press `Ctrl+Shift+D` again → picker appears
5. Select "Live Interview" + "Play" → transcript should animate over 15 seconds
6. Test all 5 scenarios

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(demo): integrate demo mode into app root (picker, badge, shortcut)"
```

---

## Summary

| Task | Component | Files |
|------|-----------|-------|
| 1 | Store + Types | demoStore.ts, scenarios/types.ts |
| 2 | Engine | demoEngine.ts |
| 3 | Live Interview | scenarios/liveInterview.ts |
| 4 | Live Lecture | scenarios/liveLecture.ts |
| 5 | Past Meeting | scenarios/pastMeeting.ts |
| 6 | Settings | scenarios/settings.ts |
| 7 | RAG/Context | scenarios/ragContext.ts |
| 8 | Scenario Index | scenarios/index.ts |
| 9 | Picker UI | DemoPicker.tsx |
| 10 | Badge + Shortcut | DemoBadge.tsx, useDemoShortcut.ts |
| 11 | Integration | App.tsx modification |

**Total: 11 tasks, 12 new files, 1 modified file**

### Dependency Order

Tasks 1-2 must be done first (foundation). Tasks 3-8 (scenarios) can be done in any order after 1-2. Task 9-10 can be done after 1-2. Task 11 depends on all previous tasks.

### Parallelization

After Tasks 1-2, tasks 3-10 are all independent and can run in parallel.
