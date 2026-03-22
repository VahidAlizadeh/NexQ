# In-Person Meeting Mode — Design Spec

**Date:** 2026-03-22
**Status:** Approved
**Scope:** New in-person meeting mode with speaker diarization, decoupled AI scenarios, and 8 innovative features

## Overview

Add an in-person meeting mode to NexQ alongside the existing online meeting mode. In-person mode uses a single microphone to capture all speakers in a room (classroom, office, conference). Cloud STT providers with diarization support separate speakers automatically; local STT falls back to a single "Room" label.

AI prompt templates are decoupled from audio mode — users independently choose a scenario (Team Meeting, Lecture, Interview, Webinar, Custom) that controls how the AI processes, summarizes, and responds to the transcript.

## Architecture: Layered Extension (Approach 3)

Three independent layers, each with a single responsibility:

```
┌─────────────────────────────────────────────────┐
│  Scenario Layer (ScenarioManager)               │
│  Controls: AI prompts, summarization, Q&A       │
│  Independent of audio mode                      │
├─────────────────────────────────────────────────┤
│  Speaker Layer (SpeakerManager)                 │
│  Controls: Speaker identity, renaming, stats    │
│  Maps raw STT output → display names            │
├─────────────────────────────────────────────────┤
│  Audio Layer (AudioMode)                        │
│  Controls: Capture pipeline, stream setup       │
│  Online=dual-stream, InPerson=single-stream     │
└─────────────────────────────────────────────────┘
```

Existing backend code gets thin adapter wrappers, not a full rewrite. The two-party config (You/Them) still works under the hood; the layers translate it.

---

## 1. Data Model & Types

### New Enums

```typescript
type AudioMode = "online" | "in_person";
type AIScenario = "team_meeting" | "lecture" | "interview" | "webinar" | "custom";
type SpeakerSource = "fixed" | "diarization" | "room";
```

### New Types

```typescript
interface SpeakerIdentity {
  id: string;              // Stable ID: "speaker_1", "you", "them", "room"
  display_name: string;    // Current name: "Speaker 1", "Professor Smith", "You"
  source: SpeakerSource;
  color?: string;          // Per-speaker color for transcript
  stats: SpeakerStats;
}

interface SpeakerStats {
  segment_count: number;
  word_count: number;
  talk_time_ms: number;
  last_spoke_ms: number;   // Relative to meeting start
}

interface MeetingBookmark {
  id: string;
  timestamp_ms: number;    // Relative to meeting start
  note?: string;
  created_at: string;
}

interface TopicSection {
  id: string;
  title: string;           // "Budget Discussion", "Q&A Session"
  start_ms: number;
  end_ms?: number;         // null if still active
}

interface ActionItem {
  id: string;
  text: string;            // "Send the report by Friday"
  assignee_speaker_id?: string;
  timestamp_ms: number;
  completed: boolean;
}

interface ScenarioTemplate {
  id: AIScenario;
  name: string;
  description: string;
  system_prompt: string;
  summary_prompt: string;
  question_detection_prompt: string;
  is_custom: boolean;
}

interface NoisePreset {
  id: string;              // "quiet_office", "classroom", "conference_hall", "cafe"
  name: string;
  vad_sensitivity: number;
  noise_gate_db: number;
  description: string;
}
```

### Extended Existing Types

```typescript
interface Meeting {
  // ... existing fields ...
  audio_mode: AudioMode;
  ai_scenario: AIScenario;
  speakers: SpeakerIdentity[];
  bookmarks: MeetingBookmark[];
  topic_sections: TopicSection[];
  action_items: ActionItem[];
  noise_preset?: string;
}

interface TranscriptSegment {
  // ... existing fields (confidence already exists) ...
  speaker_id: string;      // Links to SpeakerIdentity.id
}

interface MeetingAudioConfig {
  // ... existing you/them party configs ...
  audio_mode: AudioMode;
  noise_preset?: string;
}
```

### DB Schema Changes

```sql
ALTER TABLE meetings ADD COLUMN audio_mode TEXT NOT NULL DEFAULT 'online';
ALTER TABLE meetings ADD COLUMN ai_scenario TEXT NOT NULL DEFAULT 'team_meeting';
ALTER TABLE meetings ADD COLUMN noise_preset TEXT;

CREATE TABLE meeting_speakers (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  speaker_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  source TEXT NOT NULL,
  color TEXT,
  segment_count INTEGER DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  talk_time_ms INTEGER DEFAULT 0
);

CREATE TABLE meeting_bookmarks (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  timestamp_ms INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE meeting_topic_sections (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  title TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER
);

CREATE TABLE meeting_action_items (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id),
  text TEXT NOT NULL,
  assignee_speaker_id TEXT,
  timestamp_ms INTEGER NOT NULL,
  completed INTEGER DEFAULT 0
);

-- confidence column already exists on transcript_segments
ALTER TABLE transcript_segments ADD COLUMN speaker_id TEXT;
```

### Migration Notes

- **Existing transcript segments**: Backfill `speaker_id` from existing `speaker` values — map `"User"` → `"you"`, `"Interviewer"`/`"Them"` → `"them"`, `"Unknown"` → `"unknown"`
- **Existing meetings**: Default `audio_mode="online"`, `ai_scenario="team_meeting"` (via DEFAULT clause)
- **Scenario persistence**: Custom scenarios and user overrides to built-in prompts are persisted in the app config store (same mechanism as existing MeetingAudioConfig presets), not in a separate DB table

---

## 2. Audio Layer

### AudioMode Behavior

| | Online | In-Person |
|---|---|---|
| Streams | 2 — Mic (You) + System/Input (Them) | 1 — Mic (Them/Room config) |
| Party configs used | Both `you` + `them` | Only `them` (relabeled "Room") |
| STT routing | Two independent STT providers | One STT provider (from `them` config) |
| Diarization | Off (speakers structurally known) | On if cloud STT supports it, off otherwise |
| Audio levels UI | Two meters (You + Them) | One meter (Room) |
| Mute controls | Independent per party | Single mute toggle |
| Recording | Dual-channel WAV (mic L, system R) | Mono WAV |

### AudioCaptureManager Changes (Rust)

```rust
fn start_capture(config: MeetingAudioConfig) {
    match config.audio_mode {
        AudioMode::Online => {
            // Existing behavior — start both streams
            start_mic_stream(config.you);
            start_system_stream(config.them);
        }
        AudioMode::InPerson => {
            // Single stream from "them" device config
            // Tagged as AudioSource::Room (new variant)
            start_room_stream(config.them);
            // "you" stream not started
        }
    }
}
```

- New `AudioSource::Room` variant alongside existing `Mic` and `System`
- Room stream uses the device from `them` party config (always an input device for in-person)
- VAD applies noise preset parameters if configured
- Audio level events emit `room_level` instead of separate `mic_level` + `system_level`

### STT Routing

```
Online:
  Mic chunks  →  STTRouter(you.stt_provider)  →  speaker="you"
  System chunks → STTRouter(them.stt_provider) → speaker="them"

In-Person:
  Room chunks → STTRouter(them.stt_provider, diarize=true)
             → speaker="speaker_1", "speaker_2", ...  (cloud + diarization)
             → speaker="room"                          (local STT / no diarization)
```

### Diarization Provider Support

| Provider | Diarization | Notes |
|----------|-------------|-------|
| Deepgram | Yes | `diarize=true` param, returns `speaker` field per word |
| Azure Speech | Yes | Conversation Transcription API |
| Groq Whisper | No | No diarization support |
| Web Speech | No | Browser API, no speaker info |
| Whisper.cpp | No | Local model |
| Sherpa ONNX | No | Local model |
| Others | No | Default to "room" label |

When local STT is used for in-person mode, show a one-time info toast: "Local STT doesn't support speaker separation — all speech labeled as Room. Switch to Deepgram or Azure for per-speaker labels."

### New Events

```
"audio_level" → { mic_level?, system_level?, room_level? }  // room_level for in-person
"speaker_detected" → { speaker_id, meeting_id }  // diarization finds new speaker
```

---

## 3. Speaker Layer

### SpeakerManager (New Store: `speakerStore.ts`)

```
State:
  speakers: Map<string, SpeakerIdentity>
  speakerOrder: string[]  // order of first appearance

Actions:
  initForOnline()
    → fixed speakers: {id:"you", display_name:"You", source:"fixed"}
                      {id:"them", display_name:"Them", source:"fixed"}

  initForInPerson(hasDiarization: boolean)
    → no diarization: {id:"room", display_name:"Room", source:"room"}
    → diarization: starts empty, populated as speakers detected

  addSpeaker(speaker_id: string)
    → creates {id, display_name:"Speaker N", source:"diarization"}
    → triggers Live Speaker Naming prompt

  renameSpeaker(speaker_id: string, new_name: string)
    → updates display_name
    → all transcript segments reflect new name immediately
    → persists to meeting_speakers table

  updateStats(speaker_id: string, segment: TranscriptSegment)
    → increments segment_count, word_count, talk_time_ms
    → updates last_spoke_ms

  getSpeakerColor(speaker_id: string) → string
    → auto-assigned from 8-color palette
    → "you" = blue, "them" = orange (existing)
    → diarized speakers get colors in appearance order
```

### Segment Processing Flow

```
STT emits: { text, speaker: "speaker_0", confidence: 0.87 }
  ↓
SpeakerManager.processSegment():
  1. speaker_0 known? No → addSpeaker("speaker_0") → "Speaker 1"
  2. Map speaker_0 → SpeakerIdentity
  3. Update stats
  4. Emit enriched segment: { text, speaker_id, display_name, confidence, color }
```

### Live Speaker Naming

When `addSpeaker()` fires for a new diarized speaker:
1. Subtle inline banner at bottom of transcript panel:
   `🎙 New speaker detected: Speaker 3 — [Name this speaker: ___] [Skip]`
2. User types name + Enter → `renameSpeaker()` → all past+future segments update
3. Skip → keeps "Speaker N", renameable later
4. Banner auto-dismisses after 10 seconds if ignored

### Post-Meeting Speaker Renaming

In meeting detail Speakers tab:
- Click any speaker name → inline edit field → Save
- Change propagates to all transcript segments in that meeting
- Shows rename history ("Originally Speaker 2")

### Speaker Stats Panel (Overlay)

Collapsible panel toggled via toolbar button:
- Per-speaker: color bar, talk-time %, word count, time since last spoke
- Updates in real-time as segments arrive
- Available in both online and in-person modes

### Confidence Indicator

- Words with `confidence < 0.7` get dotted underline + lower opacity
- Hover tooltip: "Low confidence (67%)"
- Threshold configurable in settings (default 0.70)
- Only shown when STT provider returns confidence data

---

## 4. Scenario Layer

### ScenarioManager (New Store: `scenarioStore.ts`)

```
State:
  builtInScenarios: ScenarioTemplate[]       // shipped defaults, read-only
  customScenarios: ScenarioTemplate[]        // user-created
  activeScenarioId: AIScenario               // current selection
  scenarioOverrides: Map<AIScenario, Partial<ScenarioTemplate>>  // user edits

Actions:
  getActiveTemplate() → ScenarioTemplate
    → built-in merged with user overrides, or custom template

  setActiveScenario(id: AIScenario)
    → persisted to config as default
    → overridable per-meeting in start modal

  updatePrompt(scenarioId, field, value: string)
    → saves to scenarioOverrides
    → "Reset to default" clears override

  createCustomScenario(template: ScenarioTemplate)
  deleteCustomScenario(id: string)
```

### Built-In Scenarios

| Scenario | System Prompt Focus | Summary Style | Question Detection |
|----------|-------------------|---------------|-------------------|
| Team Meeting | Track decisions, assignments, disagreements. Attribute to speakers. | Attendees, Decisions, Action Items, Open Questions | Questions from any speaker; surface unanswered |
| Lecture | Identify primary speaker. Extract concepts, definitions, examples. Note audience questions. | Key Topics, Definitions, Examples, Q&A pairs | Audience questions to lecturer |
| Interview | Two primary speakers. Track questions asked, responses, follow-ups. | Q&A format: Questions → Answers → Assessment | Interviewer questions; flag unanswered |
| Webinar | Presenters + audience. Extract presentation points, Q&A. | Presentation outline + Q&A log | Audience questions |
| Custom | User-defined | User-defined | User-defined |

### Intelligence Pipeline Integration

```
Transcript segments
  ↓
ScenarioManager.getActiveTemplate()
  ↓
Intelligence module assembles prompt:
  1. scenario.system_prompt           ← AI role and focus
  2. Speaker context from SpeakerManager  ← "Speakers: Prof. Smith (62%), ..."
  3. Recent transcript window         ← last N segments with speaker names
  4. scenario.question_detection_prompt
  5. Context documents (RAG)          ← unchanged
  ↓
LLM provider → AI response
```

### Online Prompt Fix

Current interview-biased prompts replaced with Team Meeting as default:
- "Interviewer" → speaker name / "Speaker"
- "Candidate" → "You" / user name
- Acknowledge "Them" can be multiple people: "The remote party may include multiple speakers on a shared audio source"
- Remove interview-structure assumptions

### Settings UI

New "AI Scenarios" section:
- Dropdown to switch active scenario
- Collapsible prompt cards: System Prompt, Summary Prompt, Question Detection
- Each: preview text, Edit button, Reset to Default, "Modified" indicator
- Create Custom + Clone actions at bottom

---

## 5. Meeting Flow

### Updated Lifecycle

```
Launcher → "Start Meeting" click
  ↓
Meeting Setup Modal:
  1. Pick Audio Mode (Online / In-Person)
  2. See active scenario + quick-switch
  3. [Remember my choice] checkbox
  4. Click "Start"
  ↓
startMeetingFlow(audioMode, scenario):
  1. Create meeting record (DB) with audio_mode + ai_scenario
  2. SpeakerManager.init(audioMode, hasDiarization)
  3. ScenarioManager.setActiveScenario(scenario)
  4. AudioCaptureManager.start(config, audioMode)
  5. Clear previous transcript + AI state
  6. isRecording=true, meetingStartTime=now()
  7. Start timer
  8. Switch to Overlay (adapts to audioMode)
  ↓
Meeting In Progress:
  - Transcript flowing (speaker-aware)
  - AI responding (scenario-aware)
  - Live features active (bookmarks, topic sections, action items, stats)
  ↓
endMeetingFlow():
  1. Stop timer + audio capture
  2. Flush transcript segments to DB (with speaker_id + confidence)
  3. Persist speakers to meeting_speakers table
  4. Persist bookmarks, topic sections, action items
  5. Run final AI summary using scenario.summary_prompt
  6. End meeting record
  7. Clear transient state
  8. Return to Launcher
```

### Meeting Setup Modal

**First-time user / no remembered choice:**
- Audio Mode: two cards — "Online" (mic + system audio) and "In-Person" (single mic, room capture)
- AI Scenario: compact row showing active scenario + "Change ▾" to open picker dropdown
- "Remember my choice" checkbox
- Start Meeting button

**Returning user (remembered choice):**
- Compact view: two summary chips (Audio mode + Scenario)
- "Change settings ▾" link to expand full selection
- Prominent Start Meeting button
- "Forget" link to clear preference

**Scenario picker dropdown** (when "Change" clicked):
- Team Meeting, Lecture, Interview, Webinar as cards with description
- "+ Custom scenarios in Settings" link at bottom

**Dashboard Start button indicator** (when preference remembered):
`[ ▶ Start Meeting · Online · Team Meeting ]`

### Remember My Choice

- Saves `{audioMode, scenario}` to configStore
- Next start → compact modal with one-click start
- "Forget" clears saved preference
- "Change settings" expands to full selection within same modal

---

## 6. Overlay UI

### Header Changes

Both modes:
- Meeting type badge: blue `ONLINE` or purple `IN-PERSON`
- Scenario name chip (e.g., "Team Meeting", "Lecture")
- New toolbar buttons: Speaker Stats, Bookmark (Ctrl+B), Action Items

### Status Bar

Online (updated):
- LLM status: provider/model + streaming indicator
- You STT: provider + audio level meter
- Them STT: provider + audio level meter

In-Person (new):
- LLM status: provider/model + streaming indicator
- Room STT: provider + single audio level meter
- Speaker count: "3 speakers detected" (live-updated)

### Transcript Panel

Online:
- Fixed green (You) + orange (Them) speaker colors
- Existing layout preserved

In-Person:
- Auto-assigned color palette per speaker (up to 8 distinct colors)
- Speaker names shown (renamed or "Speaker N")
- Low-confidence words: dotted underline + lower opacity
- Topic section dividers: horizontal rule with purple label + timestamp
- Bookmark markers: inline yellow accent with note text
- Live Speaker Naming banner at bottom when new speaker detected

### Color Scheme

- Online badge: blue (`#4a6cf7`) with `rgba(74,108,247,0.15)` background
- In-Person badge: purple (`#a855f7`) with `rgba(168,85,247,0.15)` background
- Speaker colors (in-person): orange, green, blue, yellow, pink, teal, red, indigo (palette of 8)
- Bookmarks: yellow (`#eab308`)
- Topic sections: purple (`#a855f7`)

---

## 7. Settings UI

### Audio Configuration — "Them / Room" Relabel

- "You" section: add subtle badge "Online meetings only"
- "You" description: "Your microphone — used in online meetings to capture your voice"
- "Them" section header: **Them** (orange) / **Room** (purple)
- "Them" description: "Online: System audio or input device for remote party" / "In-Person: Room microphone capturing all speakers"
- New toggle under Them/Room: **Speaker Diarization** — "Separate speakers in in-person mode (cloud STT only)"
- Info callout: explains the dual-purpose nature of this config

### AI Scenarios Section (new)

- Active scenario dropdown
- Collapsible prompt cards: System Prompt, Summary Prompt, Question Detection
- Edit/Reset to Default per prompt
- "Modified" indicator when user has edited a built-in
- Create Custom + Clone Scenario actions

### Noise Environment Section (new)

- Radio selection: Quiet Office, Classroom, Conference Hall, Café / Open Space
- Each preset: icon, name, description of what it optimizes
- Advanced expandable: custom VAD sensitivity + noise gate sliders
- Description: "Primarily affects in-person meetings"

### Confidence Threshold (addition to existing)

- Toggle: Low Confidence Highlighting on/off
- Slider: threshold 0.0–1.0, default 0.70

---

## 8. Meeting History & Post-Meeting

### Recent Meetings List (Dashboard)

- Each meeting shows type badge: blue `ONLINE` or purple `IN-PERSON`
- Subtitle: date, duration, scenario name, speaker count
- Non-diarized in-person: shows "Room (no diarization)" instead of count
- Filter tabs: All / Online / In-Person

### Meeting Detail View

Header:
- Title + type badge + scenario badge + metadata (date, time, duration, speakers, word count)

Tabs:
- **Transcript** — existing, enhanced with topic section dividers + bookmark markers + confidence underlines
- **Summary** — scenario-aware: Key Topics with timestamps, Speaker Breakdown with stats, scenario-specific sections (e.g., Key Definitions for Lecture)
- **Speakers** (new) — all speakers with color, name (click-to-rename), stats bar, rename history
- **Action Items** (new) — AI-detected items with assignee, timestamp, completion toggle, count badge on tab
- **Bookmarks** (new) — user-created markers with timestamps + notes, click to jump to transcript position
- **AI Log** — existing, unchanged
- **Export** dropdown in tab bar

### Post-Meeting Speaker Renaming

- Speakers tab: click name → inline edit → Save
- Updates all transcript segments for that speaker
- Shows: "Named during meeting" or "Click to rename"
- Shows original name if renamed: "Originally Speaker 2"

### Export Formats

Base formats (all scenarios):
- **Markdown** — full transcript + summary
- **PDF** — formatted meeting minutes
- **SRT** — timed subtitles for audio/video pairing
- **JSON** — structured data for integrations

Scenario-specific formats:
- Lecture → **Study Notes** (key concepts, definitions, Q&A pairs)
- Team Meeting → **Meeting Minutes** (decisions, action items, owners)
- Interview → **Interview Summary** (Q&A pairs, assessment)
- Webinar → **Presentation Notes** (outline, Q&A log)

---

## 9. Innovative Features Summary

All 8 features included in v1:

| Feature | Layer | Effort | Description |
|---------|-------|--------|-------------|
| Live Speaker Naming | Speaker | Low-Medium | Inline prompt when new speaker detected, immediate rename |
| Real-Time Speaker Stats | Speaker | Low | Collapsible panel with talk %, word count, last spoke |
| Auto Topic Sections | Scenario | Medium | AI inserts topic dividers, post-meeting table of contents |
| Live Action Item Detection | Scenario | Medium | AI extracts commitments, pinned sidebar list |
| Bookmark Moments | UI | Low | Ctrl+B hotkey, inline markers with optional notes |
| Confidence Indicator | Speaker | Low | Dotted underline on low-confidence words, configurable threshold |
| Multi-Format Export | Post-Meeting | Medium | Markdown, PDF, SRT, JSON + scenario-specific formats |
| Noise Environment Presets | Audio | Medium | VAD/noise tuning per environment (Quiet, Classroom, Conference, Café) |

---

## 10. Future Enhancements (Not in v1)

- Voice enrollment: pre-meeting speaker registration for better diarization
- Hybrid meeting mode: some participants in-person, some remote
- Multi-mic in-person: multiple input devices for different room zones
- Speaker merge: manually merge diarization IDs that represent the same person
- Real-time translation: per-speaker language detection + translation
- Meeting templates: pre-configured title + scenario + noise preset combos
