# NexQ Demo Mode — Design Spec

**Date:** 2026-03-28
**Scope:** Frontend-only demo mode for capturing pixel-perfect screenshots and screen recordings
**Trigger:** `Ctrl+Shift+D` keyboard shortcut

---

## 1. Overview

A hidden developer/marketing tool that populates Zustand stores with realistic mock data and optionally auto-plays a timed sequence. No Rust backend changes needed — purely frontend store manipulation.

### Purpose

Enable capturing pixel-perfect screenshots and GIF recordings of the real NexQ app UI for the marketing website, README, and documentation. Eliminates the need for HTML mockups that can't match the actual design.

### Trigger

`Ctrl+Shift+D` opens a demo picker overlay listing available scenarios with Play/Screenshot mode toggle.

---

## 2. Scenarios

| # | Scenario | Modes | Window | Duration (Play) |
|---|----------|-------|--------|-----------------|
| 1 | Live Interview | Play + Screenshot | Overlay | ~15s |
| 2 | Live Lecture | Play + Screenshot | Overlay | ~15s |
| 3 | Past Meeting Review | Screenshot | Launcher | Instant |
| 4 | Settings (Configured) | Screenshot | Overlay (settings modal) | Instant |
| 5 | RAG / Context Intelligence | Screenshot | Launcher | Instant |

### 2.1 Live Interview (Play + Screenshot)

**Timeline (Play mode, ~15 seconds):**

| Time | Event |
|------|-------|
| 0s | Meeting starts: "Technical Interview", ONLINE, Interview scenario, REC active |
| 0.5s | Them: "Let's move on to the technical portion. Can you walk me through how you'd design a real-time data pipeline?" |
| 2s | You: "Sure. I'd start with an event-driven architecture using Kafka as the message broker." |
| 3.5s | Them: "Good. How would you handle backpressure if the consumers can't keep up?" |
| 5s | You: "I'd implement consumer group scaling combined with a dead letter queue for failures." |
| 6.5s | Translation activates (Chinese/ZH), translations appear below existing lines |
| 8s | Them: "What about exactly-once delivery guarantees? How would you approach that?" |
| 9.5s | You: "Kafka supports idempotent producers and transactional writes. Combined with consumer offset commits..." |
| 11s | Them: "And how do you monitor the health of such a pipeline in production?" |
| 11.5s | Question detected: "How do you monitor the health of such a pipeline in production?" |
| 13s | AI Assist triggered, response streams: monitoring key points (Prometheus, PagerDuty, Jaeger, health checks) |
| 15s | AI response complete, final state held |

**Screenshot mode:** Jumps directly to the 15s final state — all transcript lines visible, translation active, question answered, AI response complete.

**Stores populated:**
- `meetingStore`: active meeting, title "Technical Interview", scenario "interview", audioMode "online", recording true, elapsed ~180s (03:00)
- `transcriptStore`: 7 transcript segments with timestamps, speaker labels, final confidence
- `translationStore`: enabled, targetLang "zh", translated text for all segments
- `streamStore`: AI response text (complete), not streaming
- `callLogStore`: 1 entry (Assist mode, GPT-4o, with response)
- `speakerStore`: 2 speakers ("You", "Interviewer")
- `audioPlayerStore`: mic level ~40%, system level ~60% (simulated)

### 2.2 Live Lecture (Play + Screenshot)

**Timeline (Play mode, ~15 seconds):**

| Time | Event |
|------|-------|
| 0s | Meeting starts: "CS 301 — Distributed Systems", ONLINE, Lecture scenario, REC |
| 0.5s | Them (Prof. Chen): "Today we'll cover consensus algorithms, specifically Raft and Paxos." |
| 2s | Them: "The key insight is that in a distributed system, we need a way to agree on a single value..." |
| 3.5s | Topic section detected: "Consensus Algorithms" |
| 4.5s | Them: "Raft simplifies this by electing a leader. The leader handles all client requests..." |
| 6s | User bookmarks this moment (bookmark appears) |
| 7s | Them: "The election timeout is randomized to avoid split votes. This is homework item one — implement leader election." |
| 8.5s | Action item extracted: "Implement leader election (homework)" |
| 9.5s | Them: "Now let's look at how Paxos differs. Paxos uses a proposer-acceptor model..." |
| 10.5s | Topic section detected: "Paxos vs Raft" |
| 11.5s | Them: "The key difference is that Paxos doesn't require a stable leader..." |
| 13s | User triggers AI Recap: "Summarize key points from this lecture so far" |
| 13.5s | AI response streams: summary of consensus algorithms, Raft leader election, Paxos differences |
| 15s | Complete |

**Screenshot mode:** Final state with transcript, 2 topic sections, 1 bookmark, 1 action item, AI recap visible.

**Stores populated:**
- `meetingStore`: "CS 301 — Distributed Systems", scenario "lecture", audioMode "online"
- `transcriptStore`: 7 segments from "Prof. Chen" (single speaker)
- `bookmarkStore`: 1 bookmark at ~6s mark with note "Leader election explanation"
- `actionItemStore`: 1 item "Implement leader election (homework)"
- `topicSectionStore`: 2 sections ("Consensus Algorithms", "Paxos vs Raft")
- `callLogStore`: 1 entry (Recap mode)
- `speakerStore`: 1 speaker ("Prof. Chen")

### 2.3 Past Meeting Review (Screenshot only)

**Populates the launcher view with a realistic meeting history.**

**Meeting list (5 meetings):**

| # | Title | Date | Duration | Scenario | Segments | Has Summary |
|---|-------|------|----------|----------|----------|-------------|
| 1 | Technical Interview — Google | Today, 10:30 AM | 45m | Interview | 127 | Yes |
| 2 | CS 301 — Distributed Systems | Yesterday, 2:00 PM | 1h 15m | Lecture | 89 | Yes |
| 3 | Sprint Planning — Q2 Roadmap | 2 days ago | 30m | Team Meeting | 64 | Yes |
| 4 | Mock Interview Practice | 3 days ago | 25m | Interview | 52 | No |
| 5 | Office Hours — Prof. Chen | 4 days ago | 20m | Lecture | 31 | No |

**Selected meeting detail (Meeting #1 — Google Interview):**
- Full transcript (sample of ~10 segments visible)
- AI Call Log sidebar with 3 entries (Assist, WhatToSay, Recap)
- Meeting summary generated
- 2 action items extracted
- 3 bookmarked moments
- Speaker stats: You (42%), Interviewer (58%)

**Stores populated:**
- `meetingStore`: list of 5 meetings with metadata, meeting #1 selected
- `transcriptStore`: 10 sample segments for meeting #1
- `callLogStore`: 3 AI interaction entries
- `bookmarkStore`: 3 bookmarks
- `actionItemStore`: 2 items
- `speakerStore`: 2 speakers with talk-time stats

### 2.4 Settings (Screenshot only)

**Shows a fully configured NexQ with all providers set up.**

**Stores populated via `configStore`:**
- STT "You": Deepgram (connected, API key set)
- STT "Them": Web Speech API (no key needed)
- LLM: OpenAI GPT-4o (connected, API key set)
- Alternative LLM: Ollama llama3.2 (local, connected)
- Recording: enabled
- Overlay: always-on-top, 500x700
- Keyboard shortcuts: defaults

The settings modal/overlay opens automatically showing the provider configuration tab.

### 2.5 RAG / Context Intelligence (Screenshot only)

**Shows the context panel with documents loaded and indexed.**

**Stores populated:**
- `contextStore`: 4 loaded resources:
  1. `resume-2026.pdf` (PDF, 2 pages, 1,847 tokens, indexed, 12 chunks)
  2. `google-job-description.docx` (DOCX, 3 pages, 2,103 tokens, indexed, 15 chunks)
  3. `system-design-notes.md` (MD, 890 tokens, indexed, 6 chunks)
  4. `distributed-systems-cheatsheet.txt` (TXT, 456 tokens, indexed, 3 chunks)
- `ragStore`: indexing complete, 36 total chunks, hybrid search ready
- Token budget: 5,296 / 8,000 tokens used (66%)

---

## 3. Architecture

### File Structure

```
src/demo/
  demoStore.ts          — Zustand store: isDemoActive, activeScenario, mode
  DemoPicker.tsx        — Modal triggered by Ctrl+Shift+D
  demoEngine.ts         — Orchestrator: populate stores, run timeline, cleanup
  scenarios/
    liveInterview.ts    — Mock data + play timeline
    liveLecture.ts      — Mock data + play timeline
    pastMeeting.ts      — Mock meetings + detail data
    settings.ts         — Mock provider configs
    ragContext.ts        — Mock documents + index state
```

### demoStore.ts

```typescript
interface DemoState {
  isDemoActive: boolean;
  activeScenario: string | null;
  mode: 'play' | 'screenshot' | null;
  isPlaying: boolean;
  // Actions
  startDemo: (scenario: string, mode: 'play' | 'screenshot') => void;
  stopDemo: () => void;
}
```

### DemoPicker.tsx

A modal overlay that appears on `Ctrl+Shift+D`:
- List of 5 scenarios with icons and descriptions
- Play/Screenshot toggle for scenarios that support Play mode
- "Start" button to launch selected scenario
- "Close" button / Escape to dismiss
- Styled to match existing NexQ modal design (settings overlay pattern)

### demoEngine.ts

The orchestrator that:
1. Receives a scenario name and mode
2. Snapshots current store state (for cleanup)
3. Calls the scenario's `populate()` function to fill stores with mock data
4. If mode is "play": calls the scenario's `play()` function which returns a cleanup function (for cancelling timeouts)
5. Shows the "EXIT DEMO" badge
6. On exit: clears all mock data, restores previous state

### Scenario Interface

Each scenario file exports:

```typescript
interface DemoScenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  supportsPlay: boolean;
  window: 'overlay' | 'launcher';
  populate: () => void;           // Instantly populate stores with final state
  play?: () => () => void;        // Returns cleanup function to cancel timers
}
```

### Exit Demo Badge

A small floating badge in the bottom-right corner:
- Text: "EXIT DEMO" or "Demo Mode"
- Click to exit and restore normal state
- `Ctrl+Shift+D` also exits if demo is active
- Styled subtly: small, semi-transparent, doesn't interfere with screenshots (can be cropped)

---

## 4. Integration Points

### Keyboard Shortcut

Register `Ctrl+Shift+D` in the existing keyboard shortcut system. When pressed:
- If no demo active → open DemoPicker
- If demo active → exit demo and restore state

### Window Routing

- Overlay scenarios (Live Interview, Live Lecture, Settings): need the overlay window visible. If not in a meeting, the demo engine should set `meetingStore` to simulate an active meeting so the overlay renders.
- Launcher scenarios (Past Meeting, RAG): populate the launcher view. If overlay is open, minimize it.

### Store Cleanup

On demo exit, each store that was modified needs to be reset. The engine should:
1. Before populating, save a snapshot of each store's state
2. On exit, restore each store from the snapshot
3. Clear any running timers from play mode

---

## 5. Constraints

- **No Rust changes** — All mock data pushed directly into Zustand stores from the frontend
- **No side effects** — Demo mode must not trigger any Tauri IPC commands (no audio capture, no STT, no LLM calls, no DB writes)
- **Clean exit** — Exiting demo mode must restore the app to its pre-demo state completely
- **Production safe** — The demo code should be tree-shakeable or behind a dev flag so it doesn't bloat the production bundle (optional optimization, not blocking)
