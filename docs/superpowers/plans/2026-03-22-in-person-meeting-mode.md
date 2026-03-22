# In-Person Meeting Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-person meeting mode with speaker diarization, decoupled AI scenario templates, and 8 innovative features (speaker stats, bookmarks, topic sections, action items, confidence indicators, live speaker naming, export, noise presets).

**Architecture:** Layered Extension — three independent layers (Audio, Speaker, Scenario) wrap the existing two-party model. Audio Layer controls capture pipeline (online=dual-stream, in-person=single-stream). Speaker Layer maps raw STT output to named speakers with diarization. Scenario Layer manages AI prompt templates independent of audio mode.

**Tech Stack:** React 18, TypeScript 5.5, Zustand 4.5, Tauri 2 (Rust), shadcn/ui, Tailwind CSS, rusqlite

**Spec:** `docs/superpowers/specs/2026-03-22-in-person-meeting-mode-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/stores/speakerStore.ts` | Speaker identity, renaming, stats, color assignment |
| `src/stores/scenarioStore.ts` | AI scenario templates, overrides, persistence |
| `src/stores/bookmarkStore.ts` | Meeting bookmarks (hotkey + UI) |
| `src/stores/actionItemStore.ts` | AI-detected action items |
| `src/stores/topicSectionStore.ts` | AI-detected topic sections |
| `src/hooks/useSpeakerDetection.ts` | Listens to `speaker_detected` events, feeds speakerStore |
| `src/hooks/useBookmarkHotkey.ts` | Ctrl+B hotkey for bookmarks |
| `src/overlay/SpeakerNamingBanner.tsx` | Inline prompt for naming new speakers |
| `src/overlay/SpeakerStatsPanel.tsx` | Collapsible speaker stats overlay panel |
| `src/overlay/BookmarkMarker.tsx` | Inline bookmark marker in transcript |
| `src/overlay/TopicSectionDivider.tsx` | Topic section divider in transcript |
| `src/overlay/ActionItemsPanel.tsx` | Collapsible action items overlay panel |
| `src/launcher/MeetingSetupModal.tsx` | Audio mode + scenario selection modal |
| `src/launcher/MeetingDetailTabs.tsx` | Enhanced meeting detail with Speakers/Actions/Bookmarks tabs |
| `src/launcher/SpeakersTab.tsx` | Post-meeting speaker renaming |
| `src/launcher/ActionItemsTab.tsx` | Post-meeting action items |
| `src/launcher/BookmarksTab.tsx` | Post-meeting bookmarks |
| `src/launcher/ExportDropdown.tsx` | Multi-format export menu |
| `src/settings/ScenarioSettings.tsx` | AI scenario management UI |
| `src/settings/NoisePresetSettings.tsx` | Noise environment presets UI |
| `src/settings/ConfidenceSettings.tsx` | Confidence threshold toggle + slider |
| `src/lib/scenarios.ts` | Built-in scenario template definitions |
| `src/lib/export.ts` | Export logic (Markdown, SRT, JSON) |
| `src/lib/speakerColors.ts` | Speaker color palette constants |

### Modified Files

| File | Changes |
|------|---------|
| `src/lib/types.ts` | Add AudioMode, AIScenario, SpeakerSource, SpeakerIdentity, SpeakerStats, MeetingBookmark, TopicSection, ActionItem, ScenarioTemplate, NoisePreset enums/interfaces. Extend Meeting, MeetingAudioConfig, MeetingSummary. |
| `src/lib/ipc.ts` | Add IPC wrappers for new meeting commands (speakers, bookmarks, action items, topic sections, export). |
| `src/lib/events.ts` | Add `onSpeakerDetected`, `onTopicDetected`, `onActionItemDetected` event listeners. |
| `src/lib/version.ts` | Bump NEXQ_VERSION to 1.23.0. |
| `src/stores/meetingStore.ts` | Update `startMeetingFlow` / `endMeetingFlow` for audio mode + scenario. Add `audioMode` and `aiScenario` to state. |
| `src/stores/configStore.ts` | Add `rememberedMeetingSetup`, `activeScenarioId`, `noisePreset`, `confidenceThreshold`, `diarizationEnabled` to persisted config. Extend `MeetingAudioConfig` with `audio_mode`. |
| `src/stores/transcriptStore.ts` | Add `speaker_id` field processing. |
| `src/overlay/OverlayView.tsx` | Add mode badge, scenario chip, new toolbar buttons (Stats, Bookmark, Action Items). Conditional layout for in-person. |
| `src/overlay/TranscriptPanel.tsx` | Render topic section dividers, bookmark markers, speaker naming banner. Speaker colors from speakerStore. |
| `src/overlay/TranscriptLine.tsx` | Speaker color from speakerStore. Confidence underline styling. |
| `src/overlay/StatusBar.tsx` | Conditional layout: 2 STT indicators (online) vs 1 + speaker count (in-person). |
| `src/launcher/LauncherView.tsx` | Wire up MeetingSetupModal. Update Start Meeting button to show remembered preference. |
| `src/launcher/RecentMeetings.tsx` | Add type badges (ONLINE/IN-PERSON), scenario name, speaker count, filter tabs. |
| `src/settings/MeetingAudioSettings.tsx` | Relabel "Them" → "Them / Room", add diarization toggle, info callout. |
| `src-tauri/src/db/meetings.rs` | DB migration: new tables + columns. New CRUD functions for speakers, bookmarks, action items, topic sections. |
| `src-tauri/src/commands/meeting_commands.rs` | New commands: save/get speakers, bookmarks, action items, topic sections. Export command. |
| `src-tauri/src/audio/mod.rs` | Add `AudioSource::Room`. Mode-aware capture (single-stream for in-person). |
| `src-tauri/src/stt/mod.rs` | Pass diarization flag to providers. Map diarized speaker IDs. |
| `src-tauri/src/intelligence/mod.rs` | Scenario-aware prompt assembly. Speaker context injection. |
| `src-tauri/src/lib.rs` | Register new commands. |

---

## Phase 1: Foundation

### Task 1: Types & Enums

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Add new enums and types to types.ts**

After the existing `AudioSource` type (line 8), add:

```typescript
// == MEETING MODE TYPES ==

export type AudioMode = "online" | "in_person";
export type AIScenario = "team_meeting" | "lecture" | "interview" | "webinar" | "custom";
export type SpeakerSource = "fixed" | "diarization" | "room";
```

After the existing `TranscriptSegment` interface (line 43), add `speaker_id`:

```typescript
export interface TranscriptSegment {
  id: string;
  text: string;
  speaker: Speaker;
  speaker_id?: string;        // NEW: links to SpeakerIdentity.id
  timestamp_ms: number;
  is_final: boolean;
  confidence: number;
}
```

After the existing `MeetingSummary` interface (line 76), add new types:

```typescript
// == SPEAKER TYPES ==

export interface SpeakerIdentity {
  id: string;
  display_name: string;
  source: SpeakerSource;
  color?: string;
  stats: SpeakerStats;
}

export interface SpeakerStats {
  segment_count: number;
  word_count: number;
  talk_time_ms: number;
  last_spoke_ms: number;
}

// == MEETING FEATURE TYPES ==

export interface MeetingBookmark {
  id: string;
  timestamp_ms: number;
  note?: string;
  created_at: string;
}

export interface TopicSection {
  id: string;
  title: string;
  start_ms: number;
  end_ms?: number;
}

export interface ActionItem {
  id: string;
  text: string;
  assignee_speaker_id?: string;
  timestamp_ms: number;
  completed: boolean;
}

// == SCENARIO TYPES ==

export interface ScenarioTemplate {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  summary_prompt: string;
  question_detection_prompt: string;
  is_custom: boolean;
}

export interface NoisePreset {
  id: string;
  name: string;
  vad_sensitivity: number;
  noise_gate_db: number;
  description: string;
}
```

- [ ] **Step 2: Extend existing Meeting interface**

Update the `Meeting` interface to add new fields (after `config_snapshot`):

```typescript
export interface Meeting {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  transcript: TranscriptSegment[];
  ai_interactions: AIInteraction[];
  summary: string | null;
  config_snapshot: MeetingConfig | null;
  // NEW fields
  audio_mode?: AudioMode;
  ai_scenario?: AIScenario;
  speakers?: SpeakerIdentity[];
  bookmarks?: MeetingBookmark[];
  topic_sections?: TopicSection[];
  action_items?: ActionItem[];
  noise_preset?: string;
}
```

- [ ] **Step 3: Extend MeetingAudioConfig**

Update the existing `MeetingAudioConfig` interface (line 253):

```typescript
export interface MeetingAudioConfig {
  you: PartyAudioConfig;
  them: PartyAudioConfig;
  recording_enabled: boolean;
  preset_name: string | null;
  // NEW fields
  audio_mode?: AudioMode;
  noise_preset?: string;
}
```

- [ ] **Step 4: Extend MeetingSummary**

Add new fields to `MeetingSummary` (line 68):

```typescript
export interface MeetingSummary {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  segment_count: number;
  has_summary: boolean;
  // NEW fields
  audio_mode?: AudioMode;
  ai_scenario?: AIScenario;
  speaker_count?: number;
}
```

- [ ] **Step 5: Bump version**

In `src/lib/version.ts`:

```typescript
export const NEXQ_VERSION = "1.23.0";
export const NEXQ_BUILD_DATE = "2026-03-22";
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors (new types are additive, all optional fields)

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/version.ts
git commit -m "feat: add types for in-person meeting mode, speakers, scenarios, bookmarks, actions"
```

---

### Task 2: Speaker Color Palette

**Files:**
- Create: `src/lib/speakerColors.ts`

- [ ] **Step 1: Create speaker color palette**

```typescript
// Speaker color palette — 8 distinct colors for diarized speakers
// "you" and "them" use existing colors; diarized speakers assigned in order

export const SPEAKER_COLORS = [
  "#f97316", // orange (also used for "them" in online)
  "#22c55e", // green (also used for "you" in online)
  "#3b82f6", // blue
  "#eab308", // yellow
  "#ec4899", // pink
  "#14b8a6", // teal
  "#ef4444", // red
  "#6366f1", // indigo
] as const;

export const FIXED_SPEAKER_COLORS: Record<string, string> = {
  you: "#22c55e",
  them: "#f97316",
  room: "#a855f7",
};

export function getSpeakerColor(speakerId: string, orderIndex: number): string {
  if (speakerId in FIXED_SPEAKER_COLORS) {
    return FIXED_SPEAKER_COLORS[speakerId];
  }
  return SPEAKER_COLORS[orderIndex % SPEAKER_COLORS.length];
}

// Badge colors for audio mode
export const MODE_COLORS = {
  online: { text: "#4a6cf7", bg: "rgba(74,108,247,0.15)" },
  in_person: { text: "#a855f7", bg: "rgba(168,85,247,0.15)" },
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/speakerColors.ts
git commit -m "feat: add speaker color palette and mode badge colors"
```

---

### Task 3: Built-In Scenario Templates

**Files:**
- Create: `src/lib/scenarios.ts`

- [ ] **Step 1: Create scenario template definitions**

```typescript
import type { ScenarioTemplate, AIScenario } from "./types";

export const BUILT_IN_SCENARIOS: ScenarioTemplate[] = [
  {
    id: "team_meeting",
    name: "Team Meeting",
    description: "Tracks decisions, action items, speaker attribution",
    system_prompt: `You are an AI assistant in a team meeting. Your role:
- Track decisions made and who made them
- Identify action items and who they are assigned to
- Note disagreements or unresolved questions
- Attribute statements to speakers by name when available
- The remote party may include multiple speakers on a shared audio source
- Be concise and focus on what matters for follow-up`,
    summary_prompt: `Summarize this meeting with the following structure:
## Attendees
List all speakers who participated.

## Key Decisions
Bullet points of decisions made, attributed to speakers.

## Action Items
- [ ] Action item (Owner) — due date if mentioned

## Open Questions
Items that were discussed but not resolved.`,
    question_detection_prompt: `Detect questions from any speaker in the conversation. Surface unanswered questions — those asked but not addressed by another speaker. Prioritize questions that seem to require follow-up or action.`,
    is_custom: false,
  },
  {
    id: "lecture",
    name: "Lecture",
    description: "Key concepts, definitions, Q&A extraction",
    system_prompt: `You are an AI assistant in a lecture or class session. Your role:
- Identify the primary speaker (highest talk time) as the lecturer/presenter
- Extract key concepts, definitions, and examples
- Note audience questions and the lecturer's responses
- Track when new topics are introduced
- Focus on educational content that would be useful for study notes`,
    summary_prompt: `Summarize this lecture as study notes:
## Key Topics
List major topics covered with timestamps.

## Definitions
Important terms and their definitions as explained by the lecturer.

## Examples
Key examples used to illustrate concepts.

## Q&A
Questions asked by audience members and the lecturer's responses.`,
    question_detection_prompt: `Focus on detecting questions from audience members (non-primary speakers) directed at the lecturer. Also detect rhetorical questions from the lecturer that introduce new concepts.`,
    is_custom: false,
  },
  {
    id: "interview",
    name: "Interview",
    description: "Questions, responses, follow-ups",
    system_prompt: `You are an AI assistant in an interview. Your role:
- Track questions asked by the interviewer
- Summarize candidate responses
- Note follow-up questions and areas of deeper exploration
- Identify key qualifications or concerns raised
- Maintain a neutral, objective tone`,
    summary_prompt: `Summarize this interview:
## Questions & Answers
For each question, provide:
- **Q:** The question asked
- **A:** Summary of the response
- **Notes:** Any follow-up or notable observations

## Key Themes
Major topics or skills discussed.

## Assessment Notes
Objective observations about the conversation flow.`,
    question_detection_prompt: `Detect interview questions — focus on questions from the interviewer to the candidate. Flag questions that were asked but not fully answered, or that warrant follow-up.`,
    is_custom: false,
  },
  {
    id: "webinar",
    name: "Webinar",
    description: "Presentation points, audience Q&A",
    system_prompt: `You are an AI assistant in a webinar or presentation. Your role:
- Track the presentation structure and key points
- Separate presenter content from audience Q&A
- Note any polls, demonstrations, or interactive elements mentioned
- Extract actionable takeaways for attendees`,
    summary_prompt: `Summarize this webinar:
## Presentation Outline
Key points in presentation order with timestamps.

## Key Takeaways
Actionable insights for attendees.

## Q&A Session
Audience questions and presenter responses.`,
    question_detection_prompt: `Detect audience questions during Q&A segments. Also detect presenter questions that are rhetorical or meant to engage the audience.`,
    is_custom: false,
  },
];

export function getScenarioById(id: string): ScenarioTemplate | undefined {
  return BUILT_IN_SCENARIOS.find((s) => s.id === id);
}

export function getDefaultScenario(): ScenarioTemplate {
  return BUILT_IN_SCENARIOS[0]; // team_meeting
}

export const NOISE_PRESETS = [
  { id: "quiet_office", name: "Quiet Office", vad_sensitivity: 0.8, noise_gate_db: -40, description: "Low noise, high sensitivity — catches soft speech" },
  { id: "classroom", name: "Classroom", vad_sensitivity: 0.5, noise_gate_db: -30, description: "Moderate noise, echo tolerant — handles shuffling, chatter" },
  { id: "conference_hall", name: "Conference Hall", vad_sensitivity: 0.3, noise_gate_db: -25, description: "High noise, aggressive filtering — large rooms, reverb" },
  { id: "cafe", name: "Café / Open Space", vad_sensitivity: 0.4, noise_gate_db: -28, description: "Variable noise, balanced sensitivity — music, conversations nearby" },
] as const;
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/scenarios.ts
git commit -m "feat: add built-in AI scenario templates and noise presets"
```

---

### Task 4: Speaker Store

**Files:**
- Create: `src/stores/speakerStore.ts`

- [ ] **Step 1: Create speakerStore**

```typescript
import { create } from "zustand";
import type { SpeakerIdentity, SpeakerStats, AudioMode } from "../lib/types";
import { getSpeakerColor, FIXED_SPEAKER_COLORS } from "../lib/speakerColors";

interface SpeakerState {
  speakers: Record<string, SpeakerIdentity>;
  speakerOrder: string[];
  pendingNaming: string | null; // speaker_id awaiting user input

  // Init
  initForOnline: () => void;
  initForInPerson: (hasDiarization: boolean) => void;
  reset: () => void;

  // Speaker management
  addSpeaker: (speakerId: string) => void;
  renameSpeaker: (speakerId: string, newName: string) => void;
  dismissNaming: () => void;

  // Stats
  updateStats: (speakerId: string, wordCount: number, durationMs: number) => void;

  // Getters
  getSpeaker: (speakerId: string) => SpeakerIdentity | undefined;
  getSpeakerColor: (speakerId: string) => string;
  getSpeakerDisplayName: (speakerId: string) => string;
  getAllSpeakers: () => SpeakerIdentity[];
}

const emptyStats = (): SpeakerStats => ({
  segment_count: 0,
  word_count: 0,
  talk_time_ms: 0,
  last_spoke_ms: 0,
});

export const useSpeakerStore = create<SpeakerState>((set, get) => ({
  speakers: {},
  speakerOrder: [],
  pendingNaming: null,

  initForOnline: () => {
    const speakers: Record<string, SpeakerIdentity> = {
      you: { id: "you", display_name: "You", source: "fixed", color: FIXED_SPEAKER_COLORS.you, stats: emptyStats() },
      them: { id: "them", display_name: "Them", source: "fixed", color: FIXED_SPEAKER_COLORS.them, stats: emptyStats() },
    };
    set({ speakers, speakerOrder: ["you", "them"], pendingNaming: null });
  },

  initForInPerson: (hasDiarization: boolean) => {
    if (!hasDiarization) {
      const speakers: Record<string, SpeakerIdentity> = {
        room: { id: "room", display_name: "Room", source: "room", color: FIXED_SPEAKER_COLORS.room, stats: emptyStats() },
      };
      set({ speakers, speakerOrder: ["room"], pendingNaming: null });
    } else {
      set({ speakers: {}, speakerOrder: [], pendingNaming: null });
    }
  },

  reset: () => set({ speakers: {}, speakerOrder: [], pendingNaming: null }),

  addSpeaker: (speakerId: string) => {
    const state = get();
    if (state.speakers[speakerId]) return;

    const orderIndex = state.speakerOrder.length;
    const displayName = `Speaker ${orderIndex + 1}`;
    const color = getSpeakerColor(speakerId, orderIndex);

    const newSpeaker: SpeakerIdentity = {
      id: speakerId,
      display_name: displayName,
      source: "diarization",
      color,
      stats: emptyStats(),
    };

    set({
      speakers: { ...state.speakers, [speakerId]: newSpeaker },
      speakerOrder: [...state.speakerOrder, speakerId],
      pendingNaming: speakerId,
    });
  },

  renameSpeaker: (speakerId: string, newName: string) => {
    const state = get();
    const speaker = state.speakers[speakerId];
    if (!speaker) return;

    set({
      speakers: {
        ...state.speakers,
        [speakerId]: { ...speaker, display_name: newName },
      },
      pendingNaming: state.pendingNaming === speakerId ? null : state.pendingNaming,
    });
  },

  dismissNaming: () => set({ pendingNaming: null }),

  updateStats: (speakerId: string, wordCount: number, durationMs: number) => {
    const state = get();
    const speaker = state.speakers[speakerId];
    if (!speaker) return;

    const updatedStats: SpeakerStats = {
      segment_count: speaker.stats.segment_count + 1,
      word_count: speaker.stats.word_count + wordCount,
      talk_time_ms: speaker.stats.talk_time_ms + durationMs,
      last_spoke_ms: Date.now(), // Absolute timestamp — SpeakerStatsPanel computes "spoke N seconds ago" from this
    };

    set({
      speakers: {
        ...state.speakers,
        [speakerId]: { ...speaker, stats: updatedStats },
      },
    });
  },

  getSpeaker: (speakerId: string) => get().speakers[speakerId],
  getSpeakerColor: (speakerId: string) => get().speakers[speakerId]?.color ?? "#888",
  getSpeakerDisplayName: (speakerId: string) => get().speakers[speakerId]?.display_name ?? speakerId,
  getAllSpeakers: () => get().speakerOrder.map((id) => get().speakers[id]).filter(Boolean),
}));
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/stores/speakerStore.ts
git commit -m "feat: add speakerStore for identity, renaming, stats, and color management"
```

---

### Task 5: Scenario Store

**Files:**
- Create: `src/stores/scenarioStore.ts`

- [ ] **Step 1: Create scenarioStore**

```typescript
import { create } from "zustand";
import { load, Store } from "@tauri-apps/plugin-store";
import type { ScenarioTemplate, AIScenario } from "../lib/types";
import { BUILT_IN_SCENARIOS, getDefaultScenario } from "../lib/scenarios";

const STORE_FILE = "config.json";
let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await load(STORE_FILE, { autoSave: true, defaults: {} });
  }
  return storeInstance;
}

interface ScenarioState {
  activeScenarioId: AIScenario;
  customScenarios: ScenarioTemplate[];
  scenarioOverrides: Record<string, Partial<ScenarioTemplate>>;

  // Actions
  setActiveScenario: (id: AIScenario) => Promise<void>;
  getActiveTemplate: () => ScenarioTemplate;
  updatePrompt: (scenarioId: string, field: "system_prompt" | "summary_prompt" | "question_detection_prompt", value: string) => Promise<void>;
  resetScenarioOverrides: (scenarioId: string) => Promise<void>;
  createCustomScenario: (template: ScenarioTemplate) => Promise<void>;
  deleteCustomScenario: (id: string) => Promise<void>;
  cloneScenario: (sourceId: string, newName: string) => Promise<void>;
  loadScenarioConfig: () => Promise<void>;
}

export const useScenarioStore = create<ScenarioState>((set, get) => ({
  activeScenarioId: "team_meeting",
  customScenarios: [],
  scenarioOverrides: {},

  setActiveScenario: async (id: AIScenario) => {
    set({ activeScenarioId: id });
    const store = await getStore();
    await store.set("activeScenarioId", id);
  },

  getActiveTemplate: () => {
    const { activeScenarioId, customScenarios, scenarioOverrides } = get();

    // Check custom scenarios first
    const custom = customScenarios.find((s) => s.id === activeScenarioId);
    if (custom) return custom;

    // Get built-in and merge overrides
    const builtIn = BUILT_IN_SCENARIOS.find((s) => s.id === activeScenarioId) ?? getDefaultScenario();
    const overrides = scenarioOverrides[activeScenarioId];
    if (overrides) {
      return { ...builtIn, ...overrides };
    }
    return builtIn;
  },

  updatePrompt: async (scenarioId, field, value) => {
    const state = get();
    const existing = state.scenarioOverrides[scenarioId] ?? {};
    const updated = { ...state.scenarioOverrides, [scenarioId]: { ...existing, [field]: value } };
    set({ scenarioOverrides: updated });
    const store = await getStore();
    await store.set("scenarioOverrides", updated);
  },

  resetScenarioOverrides: async (scenarioId) => {
    const state = get();
    const updated = { ...state.scenarioOverrides };
    delete updated[scenarioId];
    set({ scenarioOverrides: updated });
    const store = await getStore();
    await store.set("scenarioOverrides", updated);
  },

  createCustomScenario: async (template) => {
    const state = get();
    const updated = [...state.customScenarios, { ...template, is_custom: true }];
    set({ customScenarios: updated });
    const store = await getStore();
    await store.set("customScenarios", updated);
  },

  deleteCustomScenario: async (id) => {
    const state = get();
    const updated = state.customScenarios.filter((s) => s.id !== id);
    set({ customScenarios: updated });
    const store = await getStore();
    await store.set("customScenarios", updated);
    // If deleted scenario was active, reset to default
    if (state.activeScenarioId === id) {
      get().setActiveScenario("team_meeting");
    }
  },

  cloneScenario: async (sourceId, newName) => {
    const state = get();
    const source = BUILT_IN_SCENARIOS.find((s) => s.id === sourceId)
      ?? state.customScenarios.find((s) => s.id === sourceId);
    if (!source) return;

    const newId = `custom_${Date.now()}`;
    const clone: ScenarioTemplate = {
      ...source,
      id: newId,
      name: newName,
      is_custom: true,
    };
    await get().createCustomScenario(clone);
  },

  loadScenarioConfig: async () => {
    try {
      const store = await getStore();
      const activeId = await store.get<AIScenario>("activeScenarioId");
      const customs = await store.get<ScenarioTemplate[]>("customScenarios");
      const overrides = await store.get<Record<string, Partial<ScenarioTemplate>>>("scenarioOverrides");

      set({
        activeScenarioId: activeId ?? "team_meeting",
        customScenarios: customs ?? [],
        scenarioOverrides: overrides ?? {},
      });
    } catch (err) {
      console.error("[scenarioStore] Failed to load config:", err);
    }
  },
}));
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/stores/scenarioStore.ts
git commit -m "feat: add scenarioStore for AI scenario templates and prompt management"
```

---

### Task 6: Bookmark, Action Item, and Topic Section Stores

**Files:**
- Create: `src/stores/bookmarkStore.ts`
- Create: `src/stores/actionItemStore.ts`
- Create: `src/stores/topicSectionStore.ts`

- [ ] **Step 1: Create bookmarkStore**

```typescript
import { create } from "zustand";
import type { MeetingBookmark } from "../lib/types";

interface BookmarkState {
  bookmarks: MeetingBookmark[];
  addBookmark: (timestampMs: number, note?: string) => void;
  removeBookmark: (id: string) => void;
  updateBookmarkNote: (id: string, note: string) => void;
  clearBookmarks: () => void;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarks: [],

  addBookmark: (timestampMs, note) => {
    const bookmark: MeetingBookmark = {
      id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp_ms: timestampMs,
      note,
      created_at: new Date().toISOString(),
    };
    set((state) => ({ bookmarks: [...state.bookmarks, bookmark] }));
  },

  removeBookmark: (id) =>
    set((state) => ({ bookmarks: state.bookmarks.filter((b) => b.id !== id) })),

  updateBookmarkNote: (id, note) =>
    set((state) => ({
      bookmarks: state.bookmarks.map((b) => (b.id === id ? { ...b, note } : b)),
    })),

  clearBookmarks: () => set({ bookmarks: [] }),
}));
```

- [ ] **Step 2: Create actionItemStore**

```typescript
import { create } from "zustand";
import type { ActionItem } from "../lib/types";

interface ActionItemState {
  items: ActionItem[];
  addItem: (item: ActionItem) => void;
  toggleCompleted: (id: string) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
}

export const useActionItemStore = create<ActionItemState>((set) => ({
  items: [],

  addItem: (item) =>
    set((state) => ({ items: [...state.items, item] })),

  toggleCompleted: (id) =>
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i)),
    })),

  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

  clearItems: () => set({ items: [] }),
}));
```

- [ ] **Step 3: Create topicSectionStore**

```typescript
import { create } from "zustand";
import type { TopicSection } from "../lib/types";

interface TopicSectionState {
  sections: TopicSection[];
  addSection: (section: TopicSection) => void;
  endCurrentSection: (endMs: number) => void;
  clearSections: () => void;
}

export const useTopicSectionStore = create<TopicSectionState>((set, get) => ({
  sections: [],

  addSection: (section) => {
    // End the previous section if it's still open
    const state = get();
    const updated = state.sections.map((s, i) =>
      i === state.sections.length - 1 && !s.end_ms
        ? { ...s, end_ms: section.start_ms }
        : s
    );
    set({ sections: [...updated, section] });
  },

  endCurrentSection: (endMs) =>
    set((state) => ({
      sections: state.sections.map((s, i) =>
        i === state.sections.length - 1 && !s.end_ms ? { ...s, end_ms: endMs } : s
      ),
    })),

  clearSections: () => set({ sections: [] }),
}));
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/stores/bookmarkStore.ts src/stores/actionItemStore.ts src/stores/topicSectionStore.ts
git commit -m "feat: add stores for bookmarks, action items, and topic sections"
```

---

### Task 7: Config Store Extensions

**Files:**
- Modify: `src/stores/configStore.ts`

- [ ] **Step 1: Add new config fields to the state interface and defaults**

Add to the state interface (after existing fields like `pauseThresholdMs`):

```typescript
// In-person meeting config
rememberedMeetingSetup: { audioMode: AudioMode; scenario: AIScenario } | null;
diarizationEnabled: boolean;
noisePreset: string | null;
confidenceThreshold: number;
confidenceHighlightEnabled: boolean;
```

Add defaults in the store creation (after existing defaults):

```typescript
rememberedMeetingSetup: null,
diarizationEnabled: true,
noisePreset: null,
confidenceThreshold: 0.7,
confidenceHighlightEnabled: true,
```

- [ ] **Step 2: Add setter actions**

```typescript
setRememberedMeetingSetup: async (setup: { audioMode: AudioMode; scenario: AIScenario } | null) => {
  set({ rememberedMeetingSetup: setup });
  const store = await getStore();
  await store.set("rememberedMeetingSetup", setup);
},

setDiarizationEnabled: async (enabled: boolean) => {
  set({ diarizationEnabled: enabled });
  const store = await getStore();
  await store.set("diarizationEnabled", enabled);
},

setNoisePreset: async (preset: string | null) => {
  set({ noisePreset: preset });
  const store = await getStore();
  await store.set("noisePreset", preset);
},

setConfidenceThreshold: async (threshold: number) => {
  set({ confidenceThreshold: threshold });
  const store = await getStore();
  await store.set("confidenceThreshold", threshold);
},

setConfidenceHighlightEnabled: async (enabled: boolean) => {
  set({ confidenceHighlightEnabled: enabled });
  const store = await getStore();
  await store.set("confidenceHighlightEnabled", enabled);
},
```

- [ ] **Step 3: Add to loadConfig**

In the existing `loadConfig` function, after loading other fields, add:

```typescript
const rememberedSetup = await store.get<any>("rememberedMeetingSetup");
const diarizationEnabled = await store.get<boolean>("diarizationEnabled");
const noisePreset = await store.get<string>("noisePreset");
const confidenceThreshold = await store.get<number>("confidenceThreshold");
const confidenceHighlightEnabled = await store.get<boolean>("confidenceHighlightEnabled");

set({
  rememberedMeetingSetup: rememberedSetup ?? null,
  diarizationEnabled: diarizationEnabled ?? true,
  noisePreset: noisePreset ?? null,
  confidenceThreshold: confidenceThreshold ?? 0.7,
  confidenceHighlightEnabled: confidenceHighlightEnabled ?? true,
});
```

- [ ] **Step 4: Import AudioMode type**

Add `AudioMode, AIScenario` to the import from `"../lib/types"`.

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/stores/configStore.ts
git commit -m "feat: extend configStore with meeting setup, diarization, noise, confidence settings"
```

---

## Phase 2: Meeting Flow

### Task 8: Meeting Setup Modal

**Files:**
- Create: `src/launcher/MeetingSetupModal.tsx`

- [ ] **Step 1: Create the MeetingSetupModal component**

This modal is shown when user clicks "Start Meeting". It has two states:
1. **Full selection** — first time or "Change settings" clicked
2. **Compact remembered** — returning user with saved preference

The component should:
- Accept `onStart(audioMode, scenario)` and `onCancel` props
- Read `rememberedMeetingSetup` from configStore
- Show audio mode selection (Online / In-Person cards)
- Show scenario quick-switch with dropdown
- Remember checkbox that persists to configStore
- Use shadcn/ui Dialog, Button, Checkbox components
- Follow existing component patterns (Tailwind classes, shadcn imports)

Reference the mockup in the spec (Section 5) for layout. Use `MODE_COLORS` from `speakerColors.ts` for badge styling.

The component should be approximately 200-250 lines. Import `BUILT_IN_SCENARIOS` from `scenarios.ts` for the scenario picker.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/launcher/MeetingSetupModal.tsx
git commit -m "feat: add MeetingSetupModal for audio mode and scenario selection"
```

---

### Task 9: Meeting Store Flow Updates

**Files:**
- Modify: `src/stores/meetingStore.ts`

- [ ] **Step 1: Add audioMode and aiScenario to state**

Add to the `MeetingState` interface:

```typescript
audioMode: AudioMode;
aiScenario: AIScenario;
```

Add defaults:

```typescript
audioMode: "online",
aiScenario: "team_meeting",
```

Add setters:

```typescript
setAudioMode: (mode: AudioMode) => set({ audioMode: mode }),
setAiScenario: (scenario: AIScenario) => set({ aiScenario: scenario }),
```

- [ ] **Step 2: Update startMeetingFlow signature and body**

Change signature to accept audioMode and scenario:

```typescript
startMeetingFlow: async (title?: string, audioMode?: AudioMode, scenario?: AIScenario) => {
```

After creating the meeting record (step 1), add speaker initialization:

```typescript
// 1b. Set audio mode and scenario
const mode = audioMode ?? "online";
const scn = scenario ?? "team_meeting";
set({ audioMode: mode, aiScenario: scn });

// 1c. Initialize speaker store
const { useSpeakerStore } = await import("./speakerStore");
if (mode === "online") {
  useSpeakerStore.getState().initForOnline();
} else {
  const config = useConfigStore.getState();
  const hasDiarization = config.diarizationEnabled &&
    ["deepgram", "azure_speech"].includes(config.meetingAudioConfig?.them?.stt_provider ?? "");
  useSpeakerStore.getState().initForInPerson(hasDiarization);
}

// 1d. Initialize scenario store
const { useScenarioStore } = await import("./scenarioStore");
useScenarioStore.getState().setActiveScenario(scn);
```

Update the audio capture section (step 2) to be mode-aware:

```typescript
// 2. Start audio capture — mode-aware
const config = useConfigStore.getState();
try {
  if (mode === "in_person") {
    // In-person: only start "them" party as room mic
    if (config.meetingAudioConfig) {
      await startCapturePerParty(
        // Pass them config as both — backend will only use one stream
        // The actual single-stream logic is handled by the Rust audio layer
        config.meetingAudioConfig.you, // not used in in-person, but API requires it
        config.meetingAudioConfig.them
      );
    }
  } else {
    // Online: existing dual-stream behavior
    if (config.meetingAudioConfig) {
      await startCapturePerParty(
        config.meetingAudioConfig.you,
        config.meetingAudioConfig.them
      );
    } else {
      const micId = config.micDeviceId || "default";
      const sysId = config.systemDeviceId || "default";
      await startCapture(micId, sysId);
    }
  }
} catch (err) {
  console.warn("[meetingStore] Audio capture failed to start:", err);
}
```

Also clear new stores in step 3:

```typescript
// 3. Clear new feature stores
try {
  const { useBookmarkStore } = await import("./bookmarkStore");
  useBookmarkStore.getState().clearBookmarks();
  const { useActionItemStore } = await import("./actionItemStore");
  useActionItemStore.getState().clearItems();
  const { useTopicSectionStore } = await import("./topicSectionStore");
  useTopicSectionStore.getState().clearSections();
} catch { /* non-critical */ }
```

- [ ] **Step 3: Update endMeetingFlow**

Before step 5 (end meeting record), persist new feature data:

```typescript
// 4b. Persist speakers
if (meeting) {
  try {
    const { useSpeakerStore } = await import("./speakerStore");
    const speakers = useSpeakerStore.getState().getAllSpeakers();
    // TODO: IPC call to persist speakers — will be added in Rust backend task
    console.log("[meetingStore] Speakers to persist:", speakers.length);
  } catch { /* non-critical */ }
}

// 4c. Persist bookmarks
if (meeting) {
  try {
    const { useBookmarkStore } = await import("./bookmarkStore");
    const bookmarks = useBookmarkStore.getState().bookmarks;
    console.log("[meetingStore] Bookmarks to persist:", bookmarks.length);
  } catch { /* non-critical */ }
}

// 4d. Persist action items
if (meeting) {
  try {
    const { useActionItemStore } = await import("./actionItemStore");
    const items = useActionItemStore.getState().items;
    console.log("[meetingStore] Action items to persist:", items.length);
  } catch { /* non-critical */ }
}
```

After clearing state (step 8), also reset new stores:

```typescript
// 8b. Reset new feature stores
try {
  const { useSpeakerStore } = await import("./speakerStore");
  useSpeakerStore.getState().reset();
  const { useBookmarkStore } = await import("./bookmarkStore");
  useBookmarkStore.getState().clearBookmarks();
  const { useActionItemStore } = await import("./actionItemStore");
  useActionItemStore.getState().clearItems();
  const { useTopicSectionStore } = await import("./topicSectionStore");
  useTopicSectionStore.getState().clearSections();
} catch { /* non-critical */ }
```

- [ ] **Step 4: Import new types**

Add `AudioMode, AIScenario` to the import from `"../lib/types"`.

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/stores/meetingStore.ts
git commit -m "feat: update meeting flow for audio mode, scenario, and new feature stores"
```

---

### Task 10: Wire Modal into Launcher

**Files:**
- Modify: `src/launcher/LauncherView.tsx`

- [ ] **Step 1: Add modal state and import**

Add state for showing the modal:

```typescript
const [showMeetingSetup, setShowMeetingSetup] = useState(false);
```

Import the modal:

```typescript
import { MeetingSetupModal } from "./MeetingSetupModal";
```

- [ ] **Step 2: Update Start Meeting button**

Replace the existing Start Meeting button click handler to open the modal instead of directly calling `startMeetingFlow`:

```typescript
onClick={() => setShowMeetingSetup(true)}
```

If `rememberedMeetingSetup` exists in configStore, show the remembered preference on the button text:

```typescript
const { rememberedMeetingSetup } = useConfigStore();
// Button label:
rememberedMeetingSetup
  ? `Start Meeting · ${rememberedMeetingSetup.audioMode === "online" ? "Online" : "In-Person"}`
  : "Start Meeting"
```

- [ ] **Step 3: Add modal to JSX**

At the bottom of the component, before closing tags:

```tsx
<MeetingSetupModal
  open={showMeetingSetup}
  onStart={async (audioMode, scenario) => {
    setShowMeetingSetup(false);
    await startMeetingFlow(undefined, audioMode, scenario);
  }}
  onCancel={() => setShowMeetingSetup(false)}
/>
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/launcher/LauncherView.tsx
git commit -m "feat: wire MeetingSetupModal into launcher dashboard"
```

---

## Phase 3: Overlay UI

### Task 11: Overlay Header Updates

**Files:**
- Modify: `src/overlay/OverlayView.tsx`

- [ ] **Step 1: Add mode badge and scenario chip to header**

Import stores and colors:

```typescript
import { useMeetingStore } from "../stores/meetingStore";
import { useSpeakerStore } from "../stores/speakerStore";
import { useScenarioStore } from "../stores/scenarioStore";
import { MODE_COLORS } from "../lib/speakerColors";
```

In the header section, after the existing REC indicator and timer, add:

```tsx
{/* Audio mode badge */}
<span
  className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded"
  style={{
    color: MODE_COLORS[audioMode].text,
    backgroundColor: MODE_COLORS[audioMode].bg,
  }}
>
  {audioMode === "online" ? "ONLINE" : "IN-PERSON"}
</span>

{/* Scenario chip */}
<span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-white/5">
  {scenarioStore.getActiveTemplate().name}
</span>
```

- [ ] **Step 2: Add new toolbar buttons**

In the header right-side buttons, add Speaker Stats, Bookmark, and Action Items toggles:

```tsx
{/* Speaker Stats toggle */}
<Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setStatsOpen(!statsOpen)}>
  <BarChart3 className="h-3.5 w-3.5" />
</Button>

{/* Bookmark */}
<Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleBookmark}>
  <Bookmark className="h-3.5 w-3.5" />
</Button>

{/* Action Items toggle */}
<Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setActionsOpen(!actionsOpen)}>
  <ClipboardList className="h-3.5 w-3.5" />
</Button>
```

- [ ] **Step 3: Add state for new panels**

```typescript
const [statsOpen, setStatsOpen] = useState(false);
const [actionsOpen, setActionsOpen] = useState(false);
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/overlay/OverlayView.tsx
git commit -m "feat: add mode badge, scenario chip, and new toolbar buttons to overlay header"
```

---

### Task 12: Status Bar Updates

**Files:**
- Modify: `src/overlay/StatusBar.tsx`

- [ ] **Step 1: Make status bar mode-aware**

Import meeting store to read audioMode:

```typescript
import { useMeetingStore } from "../stores/meetingStore";
import { useSpeakerStore } from "../stores/speakerStore";
```

Read the mode:

```typescript
const { audioMode } = useMeetingStore();
const { speakerOrder } = useSpeakerStore();
```

- [ ] **Step 2: Conditional rendering**

In the STT indicators section, conditionally render based on mode:

```tsx
{audioMode === "online" ? (
  <>
    {/* Existing: You STT indicator */}
    <div className="flex items-center gap-1">
      <div className={`w-1.5 h-1.5 rounded-full ${youActive ? "bg-green-500" : "bg-muted"}`} />
      <span className="text-muted-foreground">You:</span>
      <span>{youProvider}</span>
      {/* audio level bar */}
    </div>
    {/* Existing: Them STT indicator */}
    <div className="flex items-center gap-1">
      <div className={`w-1.5 h-1.5 rounded-full ${themActive ? "bg-orange-500" : "bg-muted"}`} />
      <span className="text-muted-foreground">Them:</span>
      <span>{themProvider}</span>
      {/* audio level bar */}
    </div>
  </>
) : (
  <>
    {/* In-Person: Room STT indicator */}
    <div className="flex items-center gap-1">
      <div className={`w-1.5 h-1.5 rounded-full ${roomActive ? "bg-purple-500" : "bg-muted"}`} />
      <span className="text-muted-foreground">Room:</span>
      <span>{roomProvider}</span>
      {/* audio level bar */}
    </div>
    {/* Speaker count */}
    <div className="flex items-center gap-1">
      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
      <span className="text-muted-foreground">{speakerOrder.length} speakers detected</span>
    </div>
  </>
)}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/overlay/StatusBar.tsx
git commit -m "feat: make status bar mode-aware with room STT and speaker count for in-person"
```

---

### Task 13: Transcript Line Speaker Colors & Confidence

**Files:**
- Modify: `src/overlay/TranscriptLine.tsx`

- [ ] **Step 1: Use speakerStore for colors**

Replace fixed speaker color logic with dynamic lookup:

```typescript
import { useSpeakerStore } from "../stores/speakerStore";
import { useConfigStore } from "../stores/configStore";

// Inside component:
const getSpeakerColor = useSpeakerStore((s) => s.getSpeakerColor);
const getSpeakerDisplayName = useSpeakerStore((s) => s.getSpeakerDisplayName);
const { confidenceThreshold, confidenceHighlightEnabled } = useConfigStore();

const speakerId = segment.speaker_id ?? (segment.speaker === "User" ? "you" : "them");
const speakerColor = getSpeakerColor(speakerId);
const speakerName = getSpeakerDisplayName(speakerId);
```

- [ ] **Step 2: Update speaker label rendering**

Replace the existing speaker label with dynamic name and color:

```tsx
<span className="text-[10px] font-semibold" style={{ color: speakerColor }}>
  {speakerName}
</span>
```

- [ ] **Step 3: Add confidence underline styling**

Wrap transcript text in a span that conditionally applies confidence styling:

```tsx
<span
  className={
    confidenceHighlightEnabled && segment.confidence < confidenceThreshold
      ? "border-b border-dotted border-white/30 opacity-70"
      : ""
  }
  title={
    confidenceHighlightEnabled && segment.confidence < confidenceThreshold
      ? `Low confidence (${Math.round(segment.confidence * 100)}%)`
      : undefined
  }
>
  {segment.text}
</span>
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/overlay/TranscriptLine.tsx
git commit -m "feat: dynamic speaker colors and confidence underline in transcript lines"
```

---

### Task 14: Transcript Panel Enhancements

**Files:**
- Create: `src/overlay/SpeakerNamingBanner.tsx`
- Create: `src/overlay/BookmarkMarker.tsx`
- Create: `src/overlay/TopicSectionDivider.tsx`
- Modify: `src/overlay/TranscriptPanel.tsx`

- [ ] **Step 1: Create SpeakerNamingBanner**

Small component shown at bottom of transcript when a new speaker is detected:

```tsx
import { useState, useEffect } from "react";
import { useSpeakerStore } from "../stores/speakerStore";

export function SpeakerNamingBanner() {
  const { pendingNaming, getSpeakerDisplayName, renameSpeaker, dismissNaming } = useSpeakerStore();
  const [name, setName] = useState("");

  useEffect(() => {
    if (!pendingNaming) return;
    // Auto-dismiss after 10 seconds
    const timer = setTimeout(() => dismissNaming(), 10000);
    return () => clearTimeout(timer);
  }, [pendingNaming, dismissNaming]);

  if (!pendingNaming) return null;

  const currentName = getSpeakerDisplayName(pendingNaming);

  return (
    <div className="mx-3 mb-2 px-3 py-2 rounded-md bg-purple-500/8 border border-purple-500/20 flex items-center gap-2 text-xs">
      <span>🎙</span>
      <span className="text-purple-400">New speaker detected:</span>
      <span className="text-foreground/80">{currentName}</span>
      <input
        className="flex-1 h-6 px-2 rounded bg-white/5 border border-white/10 text-xs text-foreground outline-none focus:border-purple-500/30"
        placeholder="Name this speaker..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) {
            renameSpeaker(pendingNaming, name.trim());
            setName("");
          }
        }}
        autoFocus
      />
      <button className="text-muted-foreground hover:text-foreground" onClick={dismissNaming}>
        Skip
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create BookmarkMarker**

```tsx
import type { MeetingBookmark } from "../lib/types";

interface Props {
  bookmark: MeetingBookmark;
  meetingStartTime: number;
}

export function BookmarkMarker({ bookmark, meetingStartTime }: Props) {
  const relativeMs = bookmark.timestamp_ms;
  const mins = Math.floor(relativeMs / 60000);
  const secs = Math.floor((relativeMs % 60000) / 1000);
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-yellow-500/8 border-l-2 border-yellow-500 mx-3 my-1">
      <span className="text-[10px]">🔖</span>
      <span className="text-[10px] text-yellow-500">{timeStr}</span>
      {bookmark.note && (
        <span className="text-[10px] text-muted-foreground">{bookmark.note}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create TopicSectionDivider**

```tsx
import type { TopicSection } from "../lib/types";

interface Props {
  section: TopicSection;
}

export function TopicSectionDivider({ section }: Props) {
  const mins = Math.floor(section.start_ms / 60000);
  const secs = Math.floor((section.start_ms % 60000) / 1000);
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <div className="flex-1 h-px bg-purple-500/20" />
      <span className="text-[10px] text-purple-500 whitespace-nowrap">{section.title}</span>
      <span className="text-[9px] text-muted-foreground/50">{timeStr}</span>
      <div className="flex-1 h-px bg-purple-500/20" />
    </div>
  );
}
```

- [ ] **Step 4: Integrate into TranscriptPanel**

In `TranscriptPanel.tsx`, import the new components and stores:

```typescript
import { SpeakerNamingBanner } from "./SpeakerNamingBanner";
import { BookmarkMarker } from "./BookmarkMarker";
import { TopicSectionDivider } from "./TopicSectionDivider";
import { useBookmarkStore } from "../stores/bookmarkStore";
import { useTopicSectionStore } from "../stores/topicSectionStore";
```

In the transcript rendering loop, interleave topic section dividers and bookmarks based on timestamp_ms comparison with segments. Add the `SpeakerNamingBanner` at the bottom of the transcript area, before the audio activity bars.

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/overlay/SpeakerNamingBanner.tsx src/overlay/BookmarkMarker.tsx src/overlay/TopicSectionDivider.tsx src/overlay/TranscriptPanel.tsx
git commit -m "feat: add speaker naming banner, bookmark markers, topic dividers to transcript panel"
```

---

### Task 15: Speaker Stats Panel

**Files:**
- Create: `src/overlay/SpeakerStatsPanel.tsx`
- Modify: `src/overlay/OverlayView.tsx`

- [ ] **Step 1: Create SpeakerStatsPanel**

Collapsible panel showing per-speaker stats:

```tsx
import { useSpeakerStore } from "../stores/speakerStore";

interface Props {
  isOpen: boolean;
}

export function SpeakerStatsPanel({ isOpen }: Props) {
  const speakers = useSpeakerStore((s) => s.getAllSpeakers());

  if (!isOpen || speakers.length === 0) return null;

  const totalTalkTime = speakers.reduce((sum, s) => sum + s.stats.talk_time_ms, 0) || 1;

  return (
    <div className="border-t border-border/40 px-3 py-2 space-y-2 bg-background/50">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Speaker Stats
      </div>
      {speakers.map((speaker) => {
        const pct = Math.round((speaker.stats.talk_time_ms / totalTalkTime) * 100);
        const mins = Math.floor(speaker.stats.talk_time_ms / 60000);
        const secs = Math.floor((speaker.stats.talk_time_ms % 60000) / 1000);
        const timeSinceSpoke = speaker.stats.last_spoke_ms
          ? Math.floor((Date.now() - speaker.stats.last_spoke_ms) / 1000)
          : null;

        return (
          <div key={speaker.id} className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: speaker.color }}>
                {speaker.display_name}
              </span>
              <span className="text-[10px] text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: speaker.color }}
              />
            </div>
            <div className="text-[9px] text-muted-foreground/70">
              {speaker.stats.word_count} words · {mins}m {secs}s
              {timeSinceSpoke !== null && ` · spoke ${timeSinceSpoke}s ago`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Wire into OverlayView**

Add `<SpeakerStatsPanel isOpen={statsOpen} />` in the overlay layout, below the transcript panel.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/overlay/SpeakerStatsPanel.tsx src/overlay/OverlayView.tsx
git commit -m "feat: add collapsible speaker stats panel to overlay"
```

---

### Task 16: Bookmark Hotkey

**Files:**
- Create: `src/hooks/useBookmarkHotkey.ts`
- Modify: `src/overlay/OverlayView.tsx`

- [ ] **Step 1: Create useBookmarkHotkey hook**

```typescript
import { useEffect } from "react";
import { useBookmarkStore } from "../stores/bookmarkStore";
import { useMeetingStore } from "../stores/meetingStore";

export function useBookmarkHotkey() {
  const addBookmark = useBookmarkStore((s) => s.addBookmark);
  const meetingStartTime = useMeetingStore((s) => s.meetingStartTime);
  const isRecording = useMeetingStore((s) => s.isRecording);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "b" && isRecording && meetingStartTime) {
        e.preventDefault();
        const timestampMs = Date.now() - meetingStartTime;
        addBookmark(timestampMs);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addBookmark, meetingStartTime, isRecording]);
}
```

- [ ] **Step 2: Wire into OverlayView**

```typescript
import { useBookmarkHotkey } from "../hooks/useBookmarkHotkey";

// Inside OverlayView component:
useBookmarkHotkey();
```

Also update the Bookmark toolbar button to use the same logic:

```typescript
const handleBookmark = () => {
  const { meetingStartTime } = useMeetingStore.getState();
  if (meetingStartTime) {
    useBookmarkStore.getState().addBookmark(Date.now() - meetingStartTime);
  }
};
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useBookmarkHotkey.ts src/overlay/OverlayView.tsx
git commit -m "feat: add Ctrl+B bookmark hotkey and toolbar button"
```

---

### Task 16b: Action Items Panel

**Files:**
- Create: `src/overlay/ActionItemsPanel.tsx`
- Modify: `src/overlay/OverlayView.tsx`

- [ ] **Step 1: Create ActionItemsPanel**

Collapsible panel showing AI-detected action items:

```tsx
import { useActionItemStore } from "../stores/actionItemStore";
import { useSpeakerStore } from "../stores/speakerStore";

interface Props {
  isOpen: boolean;
}

export function ActionItemsPanel({ isOpen }: Props) {
  const { items, toggleCompleted } = useActionItemStore();
  const getSpeakerDisplayName = useSpeakerStore((s) => s.getSpeakerDisplayName);

  if (!isOpen) return null;

  return (
    <div className="border-t border-border/40 px-3 py-2 space-y-1.5 bg-background/50 max-h-40 overflow-y-auto">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Action Items ({items.length})
      </div>
      {items.length === 0 ? (
        <div className="text-[10px] text-muted-foreground/50 py-2">No action items detected yet</div>
      ) : (
        items.map((item) => (
          <div key={item.id} className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={item.completed}
              onChange={() => toggleCompleted(item.id)}
              className="mt-0.5 h-3 w-3 rounded border-white/20"
            />
            <div className="flex-1">
              <span className={item.completed ? "line-through text-muted-foreground/50" : "text-foreground/90"}>
                {item.text}
              </span>
              {item.assignee_speaker_id && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  — {getSpeakerDisplayName(item.assignee_speaker_id)}
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into OverlayView**

Import and render below the SpeakerStatsPanel:

```tsx
import { ActionItemsPanel } from "./ActionItemsPanel";
// In JSX:
<ActionItemsPanel isOpen={actionsOpen} />
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/overlay/ActionItemsPanel.tsx src/overlay/OverlayView.tsx
git commit -m "feat: add collapsible action items panel to overlay"
```

---

## Phase 4: Settings

### Task 17: Audio Settings Relabeling

**Files:**
- Modify: `src/settings/MeetingAudioSettings.tsx`

- [ ] **Step 1: Update "Them" section header**

Replace the "Them" label with dual-purpose label:

```tsx
<div className="flex items-center gap-1.5">
  <span className="font-semibold text-orange-500">Them</span>
  <span className="text-muted-foreground">/</span>
  <span className="font-semibold text-purple-500">Room</span>
</div>
```

- [ ] **Step 2: Add contextual descriptions**

Under "You" section:
```tsx
<p className="text-[11px] text-muted-foreground">
  Your microphone — used in online meetings to capture your voice
</p>
<span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
  Online meetings only
</span>
```

Under "Them / Room" section:
```tsx
<p className="text-[11px] text-muted-foreground leading-relaxed">
  <span className="text-orange-500 font-medium">Online:</span> System audio or input device for the remote party<br/>
  <span className="text-purple-500 font-medium">In-Person:</span> Room microphone capturing all speakers
</p>
```

- [ ] **Step 3: Add diarization toggle**

After the Them/Room STT provider selector:

```tsx
<div className="flex items-center justify-between px-3 py-2 rounded-md bg-purple-500/5 border border-purple-500/15">
  <div>
    <div className="text-xs text-foreground">Speaker Diarization</div>
    <div className="text-[10px] text-muted-foreground">Separate speakers in in-person mode (cloud STT only)</div>
  </div>
  <Switch
    checked={diarizationEnabled}
    onCheckedChange={setDiarizationEnabled}
  />
</div>
```

- [ ] **Step 4: Add info callout**

```tsx
<div className="px-3 py-2.5 rounded-md bg-blue-500/5 border-l-2 border-blue-500/40">
  <p className="text-[11px] text-muted-foreground leading-relaxed">
    <span className="text-foreground/70 font-medium">💡 How this works:</span> The device and STT provider configured here are used as{" "}
    <span className="text-orange-500 font-medium">Them</span> in online meetings (remote party audio) or as{" "}
    <span className="text-purple-500 font-medium">Room</span> in in-person meetings (everyone's audio via one mic).
  </p>
</div>
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/settings/MeetingAudioSettings.tsx
git commit -m "feat: relabel Them/Room audio settings with diarization toggle and info callout"
```

---

### Task 18: Scenario Settings

**Files:**
- Create: `src/settings/ScenarioSettings.tsx`
- Modify: settings panel parent (wire in new section)

- [ ] **Step 1: Create ScenarioSettings component**

Approximately 200 lines. Key features:
- Dropdown to select active scenario from built-in + custom list
- Collapsible cards for System Prompt, Summary Prompt, Question Detection
- Each card: preview text (truncated), Edit button (opens textarea), Reset to Default
- "Modified" badge when user has overrides
- "+ Create Custom Scenario" and "Clone This Scenario" buttons at bottom
- Use `useScenarioStore` for all state
- Use shadcn/ui Select, Button, Collapsible, Textarea components
- Follow existing settings panel patterns

Reference the spec Section 4 "Settings UI" for layout.

- [ ] **Step 2: Wire into settings panel**

Add the ScenarioSettings component to the main settings layout, as a new section labeled "AI Scenarios".

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/settings/ScenarioSettings.tsx
git commit -m "feat: add AI scenario settings with prompt editing and custom scenarios"
```

---

### Task 19: Noise Preset and Confidence Settings

**Files:**
- Create: `src/settings/NoisePresetSettings.tsx`
- Create: `src/settings/ConfidenceSettings.tsx`
- Modify: settings panel parent

- [ ] **Step 1: Create NoisePresetSettings**

Radio-style selection of noise presets:
- Import `NOISE_PRESETS` from `scenarios.ts`
- Each preset: icon, name, description
- Selected state from `useConfigStore().noisePreset`
- Advanced expandable section (placeholder for custom VAD/noise gate — values from preset for now)

- [ ] **Step 2: Create ConfidenceSettings**

Toggle + slider:
- Toggle: `confidenceHighlightEnabled`
- Slider: `confidenceThreshold` (0.0–1.0, step 0.05, default 0.70)
- Show current value label

- [ ] **Step 3: Wire both into settings panel**

Add after the existing audio settings section.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/settings/NoisePresetSettings.tsx src/settings/ConfidenceSettings.tsx
git commit -m "feat: add noise environment presets and confidence threshold settings"
```

---

## Phase 5: Meeting History

### Task 20: Recent Meetings Updates

**Files:**
- Modify: `src/launcher/RecentMeetings.tsx`
- Modify: `src/launcher/LauncherView.tsx`

- [ ] **Step 1: Add type badges to meeting cards**

In the meeting card rendering, add mode badge:

```tsx
{meeting.audio_mode && (
  <span
    className="text-[9px] font-bold tracking-wider px-1 py-0.5 rounded"
    style={{
      color: meeting.audio_mode === "online" ? "#4a6cf7" : "#a855f7",
      backgroundColor: meeting.audio_mode === "online" ? "rgba(74,108,247,0.12)" : "rgba(168,85,247,0.12)",
    }}
  >
    {meeting.audio_mode === "online" ? "ONLINE" : "IN-PERSON"}
  </span>
)}
```

- [ ] **Step 2: Add filter tabs**

Above the meeting list, add filter tabs: All | Online | In-Person

```tsx
const [modeFilter, setModeFilter] = useState<"all" | "online" | "in_person">("all");

const filteredMeetings = modeFilter === "all"
  ? meetings
  : meetings.filter((m) => m.audio_mode === modeFilter);
```

- [ ] **Step 3: Update meeting subtitle**

Show scenario name and speaker count:

```tsx
<span className="text-[10px] text-muted-foreground">
  {formatDate(meeting.start_time)} · {formatDuration(meeting.duration_seconds)}
  {meeting.ai_scenario && ` · ${scenarioName}`}
  {meeting.speaker_count && ` · ${meeting.speaker_count} speakers`}
</span>
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/launcher/RecentMeetings.tsx src/launcher/LauncherView.tsx
git commit -m "feat: add mode badges, filter tabs, and speaker count to meeting history"
```

---

### Task 21: Meeting Detail Tabs

**Files:**
- Create: `src/launcher/MeetingDetailTabs.tsx`
- Create: `src/launcher/SpeakersTab.tsx`
- Create: `src/launcher/ActionItemsTab.tsx`
- Create: `src/launcher/BookmarksTab.tsx`
- Modify: `src/launcher/LauncherView.tsx` (or `MeetingDetails.tsx` — wherever meeting detail view is rendered)

- [ ] **Step 1: Create SpeakersTab**

Shows all speakers for a meeting with inline rename:
- Speaker color dot, name (click-to-rename), stats bar
- Rename updates display and persists
- Shows source info ("Named during meeting" / "Click to rename")

- [ ] **Step 2: Create ActionItemsTab**

Shows action items with completion toggles:
- Checkbox, text, assignee, timestamp
- Count badge for tab header

- [ ] **Step 3: Create BookmarksTab**

Shows bookmarks with timestamps and notes:
- Timestamp, note text
- Click to highlight/scroll to transcript position

- [ ] **Step 4: Create MeetingDetailTabs container**

Tabbed container with: Transcript | Summary | Speakers | Action Items | Bookmarks | AI Log | Export
- Uses shadcn/ui Tabs component
- Export button in tab bar (dropdown placeholder for now)
- Badges on tabs with counts (action items count, bookmarks count)

- [ ] **Step 5: Wire into meeting detail view**

Replace or enhance the existing meeting detail rendering to use the new tabbed layout.

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/launcher/MeetingDetailTabs.tsx src/launcher/SpeakersTab.tsx src/launcher/ActionItemsTab.tsx src/launcher/BookmarksTab.tsx
git commit -m "feat: add Speakers, Action Items, Bookmarks tabs to meeting detail view"
```

---

## Phase 6: Export

### Task 22: Export Logic & Dropdown

**Files:**
- Create: `src/lib/export.ts`
- Create: `src/launcher/ExportDropdown.tsx`

- [ ] **Step 1: Create export utility functions**

```typescript
import type { Meeting, TranscriptSegment, SpeakerIdentity, MeetingBookmark, TopicSection, ActionItem } from "./types";

export function exportToMarkdown(meeting: Meeting): string {
  let md = `# ${meeting.title}\n\n`;
  md += `**Date:** ${meeting.start_time}\n`;
  md += `**Duration:** ${meeting.duration_seconds ? Math.round(meeting.duration_seconds / 60) + " minutes" : "N/A"}\n\n`;

  if (meeting.summary) {
    md += `## Summary\n\n${meeting.summary}\n\n`;
  }

  md += `## Transcript\n\n`;
  for (const seg of meeting.transcript) {
    const mins = Math.floor(seg.timestamp_ms / 60000);
    const secs = Math.floor((seg.timestamp_ms % 60000) / 1000);
    md += `**[${mins}:${secs.toString().padStart(2, "0")}] ${seg.speaker}:** ${seg.text}\n\n`;
  }

  return md;
}

export function exportToSRT(segments: TranscriptSegment[]): string {
  return segments
    .filter((s) => s.is_final)
    .map((seg, i) => {
      const startMs = seg.timestamp_ms;
      const endMs = startMs + 3000; // approximate 3s per segment
      return `${i + 1}\n${formatSRTTime(startMs)} --> ${formatSRTTime(endMs)}\n${seg.text}\n`;
    })
    .join("\n");
}

function formatSRTTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ms2 = ms % 1000;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms2.toString().padStart(3, "0")}`;
}

export function exportToJSON(meeting: Meeting): string {
  return JSON.stringify(meeting, null, 2);
}

// Scenario-specific export formats
export function exportStudyNotes(meeting: Meeting): string {
  // For Lecture scenario — key topics, definitions, Q&A pairs
  let md = `# Study Notes: ${meeting.title}\n\n`;
  if (meeting.topic_sections?.length) {
    md += `## Topics Covered\n`;
    for (const section of meeting.topic_sections) {
      const mins = Math.floor(section.start_ms / 60000);
      const secs = Math.floor((section.start_ms % 60000) / 1000);
      md += `- **${section.title}** (${mins}:${secs.toString().padStart(2, "0")})\n`;
    }
    md += "\n";
  }
  if (meeting.summary) md += `## Key Concepts\n\n${meeting.summary}\n\n`;
  return md;
}

export function exportMeetingMinutes(meeting: Meeting): string {
  // For Team Meeting scenario — decisions, action items, owners
  let md = `# Meeting Minutes: ${meeting.title}\n\n`;
  if (meeting.speakers?.length) {
    md += `## Attendees\n`;
    for (const s of meeting.speakers) md += `- ${s.display_name}\n`;
    md += "\n";
  }
  if (meeting.summary) md += `## Summary\n\n${meeting.summary}\n\n`;
  if (meeting.action_items?.length) {
    md += `## Action Items\n`;
    for (const item of meeting.action_items) {
      md += `- [${item.completed ? "x" : " "}] ${item.text}\n`;
    }
  }
  return md;
}

export function getScenarioExportFormat(scenario: string): { label: string; fn: (m: Meeting) => string } | null {
  switch (scenario) {
    case "lecture": return { label: "Study Notes", fn: exportStudyNotes };
    case "team_meeting": return { label: "Meeting Minutes", fn: exportMeetingMinutes };
    case "interview": return { label: "Interview Summary", fn: exportToMarkdown }; // uses markdown with interview structure
    case "webinar": return { label: "Presentation Notes", fn: exportToMarkdown }; // uses markdown with presentation structure
    default: return null;
  }
}
```

- [ ] **Step 2: Create ExportDropdown component**

Dropdown menu with base formats (Markdown, PDF placeholder, SRT, JSON) plus a scenario-specific format at the bottom using `getScenarioExportFormat()`. Each triggers file save dialog via Tauri `dialog.save()`.

- [ ] **Step 3: Wire into MeetingDetailTabs**

Add the Export button to the tab bar.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/lib/export.ts src/launcher/ExportDropdown.tsx
git commit -m "feat: add multi-format export (Markdown, SRT, JSON) with export dropdown"
```

---

## Phase 7: Rust Backend

### Task 23: Database Migration

**Files:**
- Modify: `src-tauri/src/db/meetings.rs`

- [ ] **Step 1: Add migration function**

Add a migration that runs on app startup (alongside existing migrations):

```rust
pub fn migrate_v2(conn: &Connection) -> Result<(), rusqlite::Error> {
    // New columns on meetings
    conn.execute_batch("
        ALTER TABLE meetings ADD COLUMN audio_mode TEXT NOT NULL DEFAULT 'online';
        ALTER TABLE meetings ADD COLUMN ai_scenario TEXT NOT NULL DEFAULT 'team_meeting';
        ALTER TABLE meetings ADD COLUMN noise_preset TEXT;
    ")?;

    // New column on transcript_segments
    conn.execute_batch("
        ALTER TABLE transcript_segments ADD COLUMN speaker_id TEXT;
    ")?;

    // Backfill speaker_id from existing speaker values
    conn.execute_batch("
        UPDATE transcript_segments SET speaker_id = 'you' WHERE speaker = 'User';
        UPDATE transcript_segments SET speaker_id = 'them' WHERE speaker IN ('Interviewer', 'Them');
        UPDATE transcript_segments SET speaker_id = 'unknown' WHERE speaker = 'Unknown';
    ")?;

    // New tables
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS meeting_speakers (
            id TEXT PRIMARY KEY,
            meeting_id TEXT NOT NULL,
            speaker_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            source TEXT NOT NULL,
            color TEXT,
            segment_count INTEGER DEFAULT 0,
            word_count INTEGER DEFAULT 0,
            talk_time_ms INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS meeting_bookmarks (
            id TEXT PRIMARY KEY,
            meeting_id TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            note TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS meeting_topic_sections (
            id TEXT PRIMARY KEY,
            meeting_id TEXT NOT NULL,
            title TEXT NOT NULL,
            start_ms INTEGER NOT NULL,
            end_ms INTEGER
        );

        CREATE TABLE IF NOT EXISTS meeting_action_items (
            id TEXT PRIMARY KEY,
            meeting_id TEXT NOT NULL,
            text TEXT NOT NULL,
            assignee_speaker_id TEXT,
            timestamp_ms INTEGER NOT NULL,
            completed INTEGER DEFAULT 0
        );
    ")?;

    Ok(())
}
```

- [ ] **Step 2: Call migration on startup**

In the database initialization (wherever `ensure_schema` or similar is called), add a call to `migrate_v2`. Wrap in a version check — if column already exists, skip.

- [ ] **Step 3: Add CRUD functions**

Add functions for the new tables:
- `save_meeting_speakers(conn, meeting_id, speakers_json) -> Result`
- `get_meeting_speakers(conn, meeting_id) -> Result<Vec<Speaker>>`
- `save_meeting_bookmarks(conn, meeting_id, bookmarks_json) -> Result`
- `save_meeting_action_items(conn, meeting_id, items_json) -> Result`
- `save_meeting_topic_sections(conn, meeting_id, sections_json) -> Result`
- `update_speaker_name(conn, meeting_id, speaker_id, new_name) -> Result`

- [ ] **Step 4: Update list_meetings to include new fields**

Add `audio_mode`, `ai_scenario`, `speaker_count` to the `MeetingSummary` query.

- [ ] **Step 5: Verify Rust compiles**

Run: `cargo check` from `src-tauri/`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/db/meetings.rs
git commit -m "feat: add DB migration for meeting mode, speakers, bookmarks, actions, topic sections"
```

---

### Task 24: New IPC Commands

**Files:**
- Modify: `src-tauri/src/commands/meeting_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/ipc.ts`

- [ ] **Step 1: Add Rust commands**

```rust
#[command]
pub async fn save_meeting_speakers(
    meeting_id: String,
    speakers_json: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Parse JSON and save to meeting_speakers table
}

#[command]
pub async fn save_meeting_bookmarks(
    meeting_id: String,
    bookmarks_json: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Parse JSON and save to meeting_bookmarks table
}

#[command]
pub async fn save_meeting_action_items(
    meeting_id: String,
    items_json: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Parse JSON and save to meeting_action_items table
}

#[command]
pub async fn save_meeting_topic_sections(
    meeting_id: String,
    sections_json: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Parse JSON and save to meeting_topic_sections table
}

#[command]
pub async fn rename_speaker(
    meeting_id: String,
    speaker_id: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Update display_name in meeting_speakers table
}
```

- [ ] **Step 2: Register commands in lib.rs**

Add the new commands to the `.invoke_handler(tauri::generate_handler![...])` macro.

- [ ] **Step 3: Add TypeScript IPC wrappers**

In `src/lib/ipc.ts`:

```typescript
export async function saveMeetingSpeakers(meetingId: string, speakersJson: string): Promise<void> {
  await invoke("save_meeting_speakers", { meetingId, speakersJson });
}

export async function saveMeetingBookmarks(meetingId: string, bookmarksJson: string): Promise<void> {
  await invoke("save_meeting_bookmarks", { meetingId, bookmarksJson });
}

export async function saveMeetingActionItems(meetingId: string, itemsJson: string): Promise<void> {
  await invoke("save_meeting_action_items", { meetingId, itemsJson });
}

export async function saveMeetingTopicSections(meetingId: string, sectionsJson: string): Promise<void> {
  await invoke("save_meeting_topic_sections", { meetingId, sectionsJson });
}

export async function renameSpeaker(meetingId: string, speakerId: string, newName: string): Promise<void> {
  await invoke("rename_speaker", { meetingId, speakerId, newName });
}
```

- [ ] **Step 4: Verify Rust compiles and TypeScript compiles**

Run: `cargo check` from `src-tauri/`
Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/meeting_commands.rs src-tauri/src/lib.rs src/lib/ipc.ts
git commit -m "feat: add IPC commands for speakers, bookmarks, action items, topic sections"
```

---

### Task 25: Audio Layer — Mode-Aware Capture

**Files:**
- Modify: `src-tauri/src/audio/mod.rs`
- Modify: `src-tauri/src/commands/audio_commands.rs`

- [ ] **Step 1: Add AudioSource::Room variant**

In the `AudioSource` enum:

```rust
pub enum AudioSource {
    Mic,
    System,
    Room,  // NEW: single-mic in-person capture
}
```

- [ ] **Step 2: Update start_capture_per_party for in-person mode**

In `audio_commands.rs`, the `start_capture_per_party` command currently starts both mic and system streams. Add logic to check audio mode:

When the frontend passes an `audio_mode` parameter (add it to the command), if `in_person`:
- Only start the "them" party stream as a Room source
- Skip the "you" party stream
- Tag audio chunks with `AudioSource::Room` instead of `AudioSource::System`

- [ ] **Step 3: Update audio level events**

When in in-person mode, emit `room_level` in the audio level event payload instead of separate `mic_level` and `system_level`.

- [ ] **Step 4: Verify Rust compiles**

Run: `cargo check`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/audio/mod.rs src-tauri/src/commands/audio_commands.rs
git commit -m "feat: add AudioSource::Room and mode-aware capture for in-person meetings"
```

---

### Task 26: STT Diarization Flag

**Files:**
- Modify: `src-tauri/src/stt/mod.rs`
- Modify: Deepgram STT provider file (e.g., `src-tauri/src/stt/deepgram.rs`)

- [ ] **Step 1: Add diarization flag to STT routing**

When routing audio to STT in in-person mode, pass `diarize=true` to providers that support it.

- [ ] **Step 2: Update Deepgram provider**

In the Deepgram WebSocket connection parameters, add `diarize=true` when the flag is set. Deepgram returns a `speaker` field in its response — map this to `speaker_id` in the transcript segment.

- [ ] **Step 3: Add speaker_detected event**

When a new speaker ID is seen in diarized output, emit a `speaker_detected` event:

```rust
app_handle.emit("speaker_detected", json!({
    "speaker_id": format!("speaker_{}", speaker_index),
    "meeting_id": meeting_id,
}));
```

- [ ] **Step 4: Add frontend event listener**

In `src/lib/events.ts`:

```typescript
export function onSpeakerDetected(handler: (payload: { speaker_id: string; meeting_id: string }) => void): Promise<UnlistenFn> {
  return listen<{ speaker_id: string; meeting_id: string }>("speaker_detected", (event) => handler(event.payload));
}
```

- [ ] **Step 5: Create useSpeakerDetection hook**

In `src/hooks/useSpeakerDetection.ts`:

```typescript
import { useEffect } from "react";
import { onSpeakerDetected } from "../lib/events";
import { useSpeakerStore } from "../stores/speakerStore";

export function useSpeakerDetection() {
  const addSpeaker = useSpeakerStore((s) => s.addSpeaker);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    onSpeakerDetected(({ speaker_id }) => {
      addSpeaker(speaker_id);
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, [addSpeaker]);
}
```

Wire into `OverlayView.tsx`:

```typescript
import { useSpeakerDetection } from "../hooks/useSpeakerDetection";
// Inside component:
useSpeakerDetection();
```

- [ ] **Step 6: Verify both compile**

Run: `cargo check` from `src-tauri/`
Run: `npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/stt/ src/lib/events.ts src/hooks/useSpeakerDetection.ts src/overlay/OverlayView.tsx
git commit -m "feat: add STT diarization flag, speaker_detected events, and detection hook"
```

---

## Phase 8: Intelligence Pipeline

### Task 27: Scenario-Aware Prompts

**Files:**
- Modify: `src-tauri/src/intelligence/mod.rs` (or relevant prompt assembly file)
- Modify: `src-tauri/src/commands/intelligence_commands.rs`
- Modify: `src-tauri/src/state.rs`
- Modify: `src/lib/ipc.ts`

**Bridging mechanism:** Scenario templates are defined in TypeScript but prompts are assembled in Rust. The bridge works as follows:
1. Frontend calls a new IPC command `set_active_scenario` at meeting start, passing the scenario's prompts as JSON
2. Rust stores the active scenario prompts in `AppState` (new field: `active_scenario: Arc<RwLock<ActiveScenario>>`)
3. Intelligence module reads from `AppState.active_scenario` when assembling prompts

- [ ] **Step 1: Add ActiveScenario struct to state.rs**

```rust
pub struct ActiveScenario {
    pub system_prompt: String,
    pub summary_prompt: String,
    pub question_detection_prompt: String,
    pub speaker_context: String,  // Updated by frontend as speakers change
}
```

Add to `AppState`:
```rust
pub active_scenario: Arc<RwLock<ActiveScenario>>,
```

- [ ] **Step 2: Add IPC commands**

In `intelligence_commands.rs`:

```rust
#[command]
pub async fn set_active_scenario(
    system_prompt: String,
    summary_prompt: String,
    question_detection_prompt: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut scenario = state.active_scenario.write().map_err(|e| e.to_string())?;
    scenario.system_prompt = system_prompt;
    scenario.summary_prompt = summary_prompt;
    scenario.question_detection_prompt = question_detection_prompt;
    Ok(())
}

#[command]
pub async fn update_speaker_context(
    speaker_context: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut scenario = state.active_scenario.write().map_err(|e| e.to_string())?;
    scenario.speaker_context = speaker_context;
    Ok(())
}
```

In `src/lib/ipc.ts`:

```typescript
export async function setActiveScenario(systemPrompt: string, summaryPrompt: string, questionDetectionPrompt: string): Promise<void> {
  await invoke("set_active_scenario", { systemPrompt, summaryPrompt, questionDetectionPrompt });
}

export async function updateSpeakerContext(speakerContext: string): Promise<void> {
  await invoke("update_speaker_context", { speakerContext });
}
```

Register both in `lib.rs`.

- [ ] **Step 3: Update intelligence module to use active scenario**

Update the prompt assembly to read from `AppState.active_scenario` instead of hardcoded prompts. Use `scenario.system_prompt` as the system message, inject `scenario.speaker_context` before the transcript window.

- [ ] **Step 2: Add speaker context to prompts**

When assembling the prompt, include speaker context:

```
Current speakers in this meeting:
- Professor Smith (62% talk time, 1826 words)
- Speaker 2 (23% talk time, 514 words)
- Speaker 3 (15% talk time, 340 words)
```

- [ ] **Step 3: Fix interview bias in online prompts**

Replace all instances of "Interviewer" with dynamic speaker names. Replace "Candidate" with "You". Remove assumptions about interview structure.

- [ ] **Step 4: Verify Rust compiles**

Run: `cargo check`

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/intelligence/
git commit -m "feat: scenario-aware prompt assembly with speaker context and de-biased online prompts"
```

---

### Task 27b: Live Topic & Action Item Detection

**Files:**
- Modify: `src-tauri/src/intelligence/mod.rs`
- Modify: `src/lib/events.ts`
- Create: `src/hooks/useTopicDetection.ts`
- Create: `src/hooks/useActionItemDetection.ts`
- Modify: `src/overlay/OverlayView.tsx`

The intelligence pipeline periodically analyzes the rolling transcript (on each AI response cycle). When it detects topic shifts or action items, it emits events that the frontend stores consume.

- [ ] **Step 1: Add Rust event emission for topics and action items**

In the intelligence module, after generating an AI response, parse the response for topic shifts and action items. Emit events:

```rust
// When AI detects a topic shift
app_handle.emit("topic_detected", json!({
    "id": uuid::Uuid::new_v4().to_string(),
    "title": "Budget Discussion",
    "start_ms": timestamp_ms,
}));

// When AI detects an action item
app_handle.emit("action_item_detected", json!({
    "id": uuid::Uuid::new_v4().to_string(),
    "text": "Send the report by Friday",
    "assignee_speaker_id": "speaker_1",
    "timestamp_ms": timestamp_ms,
}));
```

Add detection prompts to the AI call: instruct the LLM to output structured markers like `[TOPIC: Budget Discussion]` and `[ACTION: John will send the report by Friday]` in a parseable format, then extract these from the response before cleaning it for display.

- [ ] **Step 2: Add frontend event listeners**

In `src/lib/events.ts`:

```typescript
export function onTopicDetected(handler: (payload: TopicSection) => void): Promise<UnlistenFn> {
  return listen<TopicSection>("topic_detected", (event) => handler(event.payload));
}

export function onActionItemDetected(handler: (payload: ActionItem) => void): Promise<UnlistenFn> {
  return listen<ActionItem>("action_item_detected", (event) => handler(event.payload));
}
```

- [ ] **Step 3: Create useTopicDetection hook**

```typescript
import { useEffect } from "react";
import { onTopicDetected } from "../lib/events";
import { useTopicSectionStore } from "../stores/topicSectionStore";

export function useTopicDetection() {
  const addSection = useTopicSectionStore((s) => s.addSection);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onTopicDetected((section) => {
      addSection(section);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [addSection]);
}
```

- [ ] **Step 4: Create useActionItemDetection hook**

```typescript
import { useEffect } from "react";
import { onActionItemDetected } from "../lib/events";
import { useActionItemStore } from "../stores/actionItemStore";

export function useActionItemDetection() {
  const addItem = useActionItemStore((s) => s.addItem);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onActionItemDetected((item) => {
      addItem({ ...item, completed: false });
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [addItem]);
}
```

- [ ] **Step 5: Wire hooks into OverlayView**

```typescript
import { useTopicDetection } from "../hooks/useTopicDetection";
import { useActionItemDetection } from "../hooks/useActionItemDetection";

// Inside component:
useTopicDetection();
useActionItemDetection();
```

- [ ] **Step 6: Verify both compile**

Run: `cargo check` from `src-tauri/`
Run: `npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/intelligence/ src/lib/events.ts src/hooks/useTopicDetection.ts src/hooks/useActionItemDetection.ts src/overlay/OverlayView.tsx
git commit -m "feat: add live topic section and action item detection via AI events"
```

---

### Task 28: Wire Meeting Store Persistence

**Files:**
- Modify: `src/stores/meetingStore.ts`

- [ ] **Step 1: Replace console.log placeholders with actual IPC calls**

In `endMeetingFlow`, replace the placeholder persist calls (from Task 9) with actual IPC:

```typescript
// 4b. Persist speakers
if (meeting) {
  try {
    const { useSpeakerStore } = await import("./speakerStore");
    const { saveMeetingSpeakers } = await import("../lib/ipc");
    const speakers = useSpeakerStore.getState().getAllSpeakers();
    if (speakers.length > 0) {
      await saveMeetingSpeakers(meeting.id, JSON.stringify(speakers));
    }
  } catch (err) {
    console.error("[meetingStore] Failed to persist speakers:", err);
  }
}

// 4c. Persist bookmarks
if (meeting) {
  try {
    const { useBookmarkStore } = await import("./bookmarkStore");
    const { saveMeetingBookmarks } = await import("../lib/ipc");
    const bookmarks = useBookmarkStore.getState().bookmarks;
    if (bookmarks.length > 0) {
      await saveMeetingBookmarks(meeting.id, JSON.stringify(bookmarks));
    }
  } catch (err) {
    console.error("[meetingStore] Failed to persist bookmarks:", err);
  }
}

// 4d. Persist action items
if (meeting) {
  try {
    const { useActionItemStore } = await import("./actionItemStore");
    const { saveMeetingActionItems } = await import("../lib/ipc");
    const items = useActionItemStore.getState().items;
    if (items.length > 0) {
      await saveMeetingActionItems(meeting.id, JSON.stringify(items));
    }
  } catch (err) {
    console.error("[meetingStore] Failed to persist action items:", err);
  }
}

// 4e. Persist topic sections
if (meeting) {
  try {
    const { useTopicSectionStore } = await import("./topicSectionStore");
    const { saveMeetingTopicSections } = await import("../lib/ipc");
    const sections = useTopicSectionStore.getState().sections;
    if (sections.length > 0) {
      await saveMeetingTopicSections(meeting.id, JSON.stringify(sections));
    }
  } catch (err) {
    console.error("[meetingStore] Failed to persist topic sections:", err);
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/stores/meetingStore.ts
git commit -m "feat: wire actual IPC persistence for speakers, bookmarks, action items, topic sections"
```

---

## Phase 9: Integration & Polish

### Task 29: Scenario Store Initialization

**Files:**
- Modify: App entry point (wherever stores are initialized on app startup)

- [ ] **Step 1: Load scenario config on app startup**

In the app initialization (likely `App.tsx` or a top-level `useEffect`), add:

```typescript
import { useScenarioStore } from "./stores/scenarioStore";

// On mount:
useScenarioStore.getState().loadScenarioConfig();
```

- [ ] **Step 2: Verify the app starts without errors**

Run: `npm run dev`

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: initialize scenario store on app startup"
```

---

### Task 30: Transcript Hook — Speaker Processing

**Files:**
- Modify: `src/hooks/useTranscript.ts`

- [ ] **Step 1: Process speaker_id through speakerStore**

In the transcript event handler, after receiving a segment from the backend, process it through the speaker store:

```typescript
import { useSpeakerStore } from "../stores/speakerStore";

// In the transcript_final handler:
const speakerStore = useSpeakerStore.getState();
const speakerId = segment.speaker_id ?? (segment.speaker === "User" ? "you" : "them");

// Ensure speaker exists
if (!speakerStore.getSpeaker(speakerId)) {
  speakerStore.addSpeaker(speakerId);
}

// Update stats
const wordCount = segment.text.split(/\s+/).filter(Boolean).length;
speakerStore.updateStats(speakerId, wordCount, 0);

// Enrich segment with speaker_id
const enrichedSegment = { ...segment, speaker_id: speakerId };
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTranscript.ts
git commit -m "feat: process transcript segments through speaker store for identity and stats"
```

---

### Task 31: Local STT Info Toast

**Files:**
- Modify: `src/stores/meetingStore.ts`

- [ ] **Step 1: Show toast when in-person mode uses local STT without diarization**

In `startMeetingFlow`, after initializing the speaker store, add:

```typescript
// Show info toast if local STT without diarization
if (mode === "in_person") {
  const sttProvider = config.meetingAudioConfig?.them?.stt_provider ?? "";
  const hasDiarization = config.diarizationEnabled &&
    ["deepgram", "azure_speech"].includes(sttProvider);

  if (!hasDiarization) {
    try {
      const { useToastStore } = await import("./toastStore");
      useToastStore.getState().showToast(
        "Local STT doesn't support speaker separation — all speech labeled as Room. Switch to Deepgram or Azure for per-speaker labels.",
        "info"
      );
    } catch { /* non-critical */ }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/meetingStore.ts
git commit -m "feat: show info toast when in-person mode uses local STT without diarization"
```

---

### Task 32: Audio Level Hook Update

**Files:**
- Modify: `src/hooks/useAudioLevel.ts`

- [ ] **Step 1: Add room level support**

Update the hook to also return `roomLevel` from audio level events:

```typescript
const [roomLevel, setRoomLevel] = useState(0);

// In event handler:
if (payload.source === "Room") {
  setRoomLevel(payload.level);
}

return { micLevel, systemLevel, roomLevel };
```

- [ ] **Step 2: Update TranscriptPanel audio bars**

In `TranscriptPanel.tsx`, conditionally show one room bar or two party bars based on `audioMode`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAudioLevel.ts src/overlay/TranscriptPanel.tsx
git commit -m "feat: add room audio level support for in-person mode"
```

---

### Task 33: Final Version Bump & Cleanup

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Ensure version is bumped**

Verify `src/lib/version.ts` has:

```typescript
export const NEXQ_VERSION = "1.23.0";
export const NEXQ_BUILD_DATE = "2026-03-22";
```

- [ ] **Step 2: Full build verification**

Run: `npm run build`
Expected: TypeScript check passes, Vite builds successfully

Run: `cargo check` from `src-tauri/`
Expected: Rust compiles without errors

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: bump version to v1.23.0 for in-person meeting mode release"
```

---

## Task Dependency Summary

```
Phase 1: Foundation (Tasks 1-7) — no dependencies, can be done in parallel
  ↓
Phase 2: Meeting Flow (Tasks 8-10) — depends on Phase 1
  ↓
Phase 3: Overlay UI (Tasks 11-16) — depends on Phase 2
  ↓
Phase 4: Settings (Tasks 17-19) — depends on Phase 1, can parallel with Phase 3
  ↓
Phase 5: Meeting History (Tasks 20-21) — depends on Phase 1
  ↓
Phase 6: Export (Task 22) — depends on Phase 1
  ↓
Phase 7: Rust Backend (Tasks 23-26) — depends on Phase 1 types
  ↓
Phase 8: Intelligence Pipeline (Tasks 27-28) — depends on Phase 7
  ↓
Phase 9: Integration & Polish (Tasks 29-33) — depends on all prior phases
```

**Parallelizable groups:**
- Tasks 1-7 (Phase 1) can run sequentially but are independent of each other
- Phase 3 (Overlay) and Phase 4 (Settings) can run in parallel
- Phase 5 (History) and Phase 6 (Export) can run in parallel
- Phase 7 (Rust) can start as soon as Phase 1 types are done
