import { create } from "zustand";
import type { AppView, Meeting, MeetingSummary, AudioMode, AIScenario } from "../lib/types";
import {
  startMeeting as ipcStartMeeting,
  endMeeting as ipcEndMeeting,
  listMeetings as ipcListMeetings,
  saveMeetingAiInteractions,
  startCapture,
  startCapturePerParty,
  stopCapture,
} from "../lib/ipc";
import { useConfigStore } from "./configStore";
import { useTranscriptStore } from "./transcriptStore";

interface MeetingState {
  // View state
  currentView: AppView;
  previousView: AppView | null;
  settingsOpen: boolean;

  // Active meeting
  activeMeeting: Meeting | null;
  isRecording: boolean;
  meetingStartTime: number | null;
  elapsedMs: number;

  // Meeting history
  recentMeetings: MeetingSummary[];

  // Persistence tracking
  lastPersistedIndex: number;

  // Timer interval ID
  _timerInterval: ReturnType<typeof setInterval> | null;

  // Crash recovery
  unfinishedMeeting: MeetingSummary | null;

  // Active meeting mode / scenario
  audioMode: AudioMode;
  aiScenario: AIScenario;

  // Actions
  setCurrentView: (view: AppView) => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveMeeting: (meeting: Meeting | null) => void;
  setIsRecording: (recording: boolean) => void;
  setMeetingStartTime: (time: number | null) => void;
  setElapsedMs: (ms: number) => void;
  setRecentMeetings: (meetings: MeetingSummary[]) => void;
  setLastPersistedIndex: (index: number) => void;
  setUnfinishedMeeting: (meeting: MeetingSummary | null) => void;
  setAudioMode: (mode: AudioMode) => void;
  setAiScenario: (scenario: AIScenario) => void;

  // Async flows
  startMeetingFlow: (title?: string, audioMode?: AudioMode, scenario?: AIScenario) => Promise<void>;
  endMeetingFlow: () => Promise<void>;
  loadRecentMeetings: () => Promise<void>;

  // Timer management
  startTimer: () => void;
  stopTimer: () => void;
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
  currentView: "launcher",
  previousView: null,
  settingsOpen: false,
  activeMeeting: null,
  isRecording: false,
  meetingStartTime: null,
  elapsedMs: 0,
  recentMeetings: [],
  lastPersistedIndex: 0,
  unfinishedMeeting: null,
  _timerInterval: null,
  audioMode: "online",
  aiScenario: "team_meeting",

  setCurrentView: (view) => {
    const current = get().currentView;
    // When navigating to settings, remember where we came from
    if (view === "settings") {
      set({ currentView: view, previousView: current });
    } else {
      set({ currentView: view, previousView: null });
    }
  },
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setActiveMeeting: (meeting) => set({ activeMeeting: meeting }),
  setIsRecording: (recording) => set({ isRecording: recording }),
  setMeetingStartTime: (time) => set({ meetingStartTime: time }),
  setElapsedMs: (ms) => set({ elapsedMs: ms }),
  setRecentMeetings: (meetings) => set({ recentMeetings: meetings }),
  setLastPersistedIndex: (index) => set({ lastPersistedIndex: index }),
  setUnfinishedMeeting: (meeting) => set({ unfinishedMeeting: meeting }),
  setAudioMode: (mode) => set({ audioMode: mode }),
  setAiScenario: (scenario) => set({ aiScenario: scenario }),

  startMeetingFlow: async (title?: string, audioMode?: AudioMode, scenario?: AIScenario) => {
    try {
      // Resolve mode and scenario (fall back to current state if not provided)
      const resolvedMode: AudioMode = audioMode ?? get().audioMode;
      const resolvedScenario: AIScenario = scenario ?? get().aiScenario;

      // 1. Create meeting record in SQLite
      const meeting = await ipcStartMeeting(title);

      // 1b. Store mode/scenario in state and persist to DB
      set({ audioMode: resolvedMode, aiScenario: resolvedScenario });
      try {
        const { updateMeetingMode } = await import("../lib/ipc");
        await updateMeetingMode(meeting.id, resolvedMode, resolvedScenario);
      } catch { /* non-critical */ }

      // 1c. Initialize speaker store for the resolved mode
      try {
        const { useSpeakerStore } = await import("./speakerStore");
        const config = useConfigStore.getState();
        if (resolvedMode === "online") {
          useSpeakerStore.getState().initForOnline();
        } else {
          const hasDiarization =
            config.diarizationEnabled &&
            ["deepgram", "azure_speech"].includes(
              config.meetingAudioConfig?.you?.stt_provider ?? config.sttProvider
            );
          useSpeakerStore.getState().initForInPerson(hasDiarization);

          // Inform user if local STT won't support speaker separation
          if (!hasDiarization) {
            const { showToast } = await import("../stores/toastStore");
            showToast(
              "Local STT doesn't support speaker separation — all speech labeled as Room.",
              "info"
            );
          }
        }
      } catch { /* non-critical */ }

      // 1d. Set active scenario in scenarioStore + push prompts to Rust backend
      try {
        const { useScenarioStore } = await import("./scenarioStore");
        useScenarioStore.getState().setActiveScenario(resolvedScenario);

        // Push scenario prompts to Rust backend for scenario-aware intelligence
        const template = useScenarioStore.getState().getActiveTemplate();
        const { setActiveScenario } = await import("../lib/ipc");
        await setActiveScenario(
          template.system_prompt,
          template.summary_prompt,
          template.question_detection_prompt
        );
      } catch { /* non-critical */ }

      // 2. Start audio capture — use per-party config if available, else legacy
      const config = useConfigStore.getState();
      try {
        if (config.meetingAudioConfig) {
          await startCapturePerParty(
            config.meetingAudioConfig.you,
            config.meetingAudioConfig.them
          );
          // In-person mode: mute "you" source — room mic captures everyone,
          // separate mic capture is redundant and creates duplicate "You" transcripts.
          if (resolvedMode === "in_person") {
            try {
              const { setSourceMuted } = await import("../lib/ipc");
              await setSourceMuted("you", true);
              // Also set the UI mute state
              (await import("./configStore")).useConfigStore.setState({ mutedYou: true });
            } catch { /* non-critical */ }
          }
        } else {
          // Legacy fallback: use old mic + system device IDs
          const micId = config.micDeviceId || "default";
          const sysId = config.systemDeviceId || "default";
          await startCapture(micId, sysId);
        }
      } catch (err) {
        console.warn("[meetingStore] Audio capture failed to start:", err);
        // Continue anyway — meeting is created, user can still use AI features
      }

      // 3. Clear previous transcript segments and leftover AI state
      useTranscriptStore.getState().clearSegments();

      // Clear AI response history, dev log, and call log from any prior meeting
      try {
        const { useStreamStore } = await import("./streamStore");
        useStreamStore.getState().clearCurrent();
        useStreamStore.setState({ responseHistory: [], pinnedResponses: [] });
      } catch { /* non-critical */ }
      try {
        const { useDevLogStore } = await import("./devLogStore");
        useDevLogStore.getState().clear();
      } catch { /* non-critical */ }
      try {
        const { useCallLogStore } = await import("./callLogStore");
        useCallLogStore.getState().clearAll();
      } catch { /* non-critical */ }

      // 3b. Clear new feature stores
      try {
        const { useBookmarkStore } = await import("./bookmarkStore");
        useBookmarkStore.getState().clearBookmarks();
      } catch { /* non-critical */ }
      try {
        const { useActionItemStore } = await import("./actionItemStore");
        useActionItemStore.getState().clearItems();
      } catch { /* non-critical */ }
      try {
        const { useTopicSectionStore } = await import("./topicSectionStore");
        useTopicSectionStore.getState().clearSections();
      } catch { /* non-critical */ }

      // 4. Set meeting state
      const now = Date.now();
      set({
        activeMeeting: meeting,
        isRecording: true,
        meetingStartTime: now,
        elapsedMs: 0,
        lastPersistedIndex: 0,
      });

      // 5. Start timer
      get().startTimer();

      // 6. Switch to overlay view
      set({ currentView: "overlay" });
    } catch (err) {
      console.error("[meetingStore] Failed to start meeting:", err);
      throw err;
    }
  },

  endMeetingFlow: async () => {
    const state = get();
    const meeting = state.activeMeeting;

    // 1. Stop timer
    state.stopTimer();

    // 2. Stop audio capture
    try {
      await stopCapture();
    } catch (err) {
      console.warn("[meetingStore] Audio capture failed to stop:", err);
    }

    // 2b. Reset mute state — unmute both sources for next meeting
    const configStore = (await import("./configStore")).useConfigStore;
    const { mutedYou, mutedThem } = configStore.getState();
    if (mutedYou) configStore.getState().toggleMuteYou();
    if (mutedThem) configStore.getState().toggleMuteThem();

    // 3. Flush all remaining transcript segments to DB before ending
    if (meeting) {
      const segments = useTranscriptStore.getState().segments;
      const lastIdx = get().lastPersistedIndex;
      const unpersisted = segments.slice(lastIdx).filter((s) => s.is_final);

      for (const seg of unpersisted) {
        try {
          const { appendTranscriptSegment } = await import("../lib/ipc");
          await appendTranscriptSegment(meeting.id, JSON.stringify(seg));
        } catch (err) {
          console.error("[meetingStore] Failed to persist segment:", err);
          break;
        }
      }
    }

    // 4. Persist AI call log entries as AI interactions before ending
    if (meeting) {
      try {
        const { useCallLogStore } = await import("./callLogStore");
        const entries = useCallLogStore.getState().entries;
        if (entries.length > 0) {
          const interactions = entries
            .filter((e) => e.status === "complete")
            .map((e) => ({
              id: e.id,
              meeting_id: meeting.id,
              mode: e.mode,
              question_context: e.actualUserPrompt || "",
              response: e.responseContentClean || e.responseContent,
              model: e.model,
              provider: e.provider,
              latency_ms: e.latencyMs ?? 0,
              timestamp: new Date(e.timestamp).toISOString(),
            }));
          if (interactions.length > 0) {
            await saveMeetingAiInteractions(
              meeting.id,
              JSON.stringify(interactions)
            );
          }
        }
      } catch (err) {
        console.error("[meetingStore] Failed to persist AI interactions:", err);
      }
    }

    // 5. End meeting record in DB
    if (meeting) {
      try {
        await ipcEndMeeting(meeting.id);
      } catch (err) {
        console.error("[meetingStore] Failed to end meeting:", err);
      }
    }

    // 6. Clear call log and close sidebar
    try {
      const { useCallLogStore } = await import("./callLogStore");
      useCallLogStore.getState().clearAll();
      useCallLogStore.getState().setOpen(false);
    } catch {
      // Non-critical
    }

    // 7. Clear AI response history and dev log for fresh next meeting
    try {
      const { useStreamStore } = await import("./streamStore");
      useStreamStore.getState().clearCurrent();
      useStreamStore.setState({ responseHistory: [], pinnedResponses: [] });
    } catch {
      // Non-critical
    }
    try {
      const { useDevLogStore } = await import("./devLogStore");
      useDevLogStore.getState().clear();
    } catch {
      // Non-critical
    }

    // 7b. Persist new feature stores via actual IPC calls
    if (meeting) {
      try {
        const { useSpeakerStore } = await import("./speakerStore");
        const speakers = useSpeakerStore.getState().getAllSpeakers();
        if (speakers.length > 0) {
          const { saveMeetingSpeakers } = await import("../lib/ipc");
          const transformed = speakers.map((s) => ({
            id: crypto.randomUUID(),
            meeting_id: meeting.id,
            speaker_id: s.id,
            display_name: s.display_name,
            source: s.source,
            color: s.color ?? null,
            segment_count: s.stats.segment_count,
            word_count: s.stats.word_count,
            talk_time_ms: s.stats.talk_time_ms,
          }));
          await saveMeetingSpeakers(meeting.id, JSON.stringify(transformed));
          console.log(`[meetingStore] Persisted ${speakers.length} speaker(s) for ${meeting.id}`);
        }
      } catch (err) {
        console.error("[meetingStore] Failed to persist speakers:", err);
      }

      try {
        const { useBookmarkStore } = await import("./bookmarkStore");
        const bookmarks = useBookmarkStore.getState().bookmarks;
        if (bookmarks.length > 0) {
          const { saveMeetingBookmarks } = await import("../lib/ipc");
          const transformed = bookmarks.map((b) => ({ ...b, meeting_id: meeting.id }));
          await saveMeetingBookmarks(meeting.id, JSON.stringify(transformed));
          console.log(`[meetingStore] Persisted ${bookmarks.length} bookmark(s) for ${meeting.id}`);
        }
      } catch (err) {
        console.error("[meetingStore] Failed to persist bookmarks:", err);
      }

      try {
        const { useActionItemStore } = await import("./actionItemStore");
        const items = useActionItemStore.getState().items;
        if (items.length > 0) {
          const { saveMeetingActionItems } = await import("../lib/ipc");
          const transformed = items.map((item) => ({ ...item, meeting_id: meeting.id }));
          await saveMeetingActionItems(meeting.id, JSON.stringify(transformed));
          console.log(`[meetingStore] Persisted ${items.length} action item(s) for ${meeting.id}`);
        }
      } catch (err) {
        console.error("[meetingStore] Failed to persist action items:", err);
      }

      try {
        const { useTopicSectionStore } = await import("./topicSectionStore");
        const sections = useTopicSectionStore.getState().sections;
        if (sections.length > 0) {
          const { saveMeetingTopicSections } = await import("../lib/ipc");
          const transformed = sections.map((s) => ({ ...s, meeting_id: meeting.id }));
          await saveMeetingTopicSections(meeting.id, JSON.stringify(transformed));
          console.log(`[meetingStore] Persisted ${sections.length} topic section(s) for ${meeting.id}`);
        }
      } catch (err) {
        console.error("[meetingStore] Failed to persist topic sections:", err);
      }
    }

    // 7c. Reset new feature stores
    try {
      const { useSpeakerStore } = await import("./speakerStore");
      useSpeakerStore.getState().reset();
    } catch { /* non-critical */ }
    try {
      const { useBookmarkStore } = await import("./bookmarkStore");
      useBookmarkStore.getState().clearBookmarks();
    } catch { /* non-critical */ }
    try {
      const { useActionItemStore } = await import("./actionItemStore");
      useActionItemStore.getState().clearItems();
    } catch { /* non-critical */ }
    try {
      const { useTopicSectionStore } = await import("./topicSectionStore");
      useTopicSectionStore.getState().clearSections();
    } catch { /* non-critical */ }

    // 8. Clear active state
    set({
      activeMeeting: null,
      isRecording: false,
      meetingStartTime: null,
      elapsedMs: 0,
      lastPersistedIndex: 0,
      audioMode: "online",
      aiScenario: "team_meeting",
    });

    // 9. Reload recent meetings
    await get().loadRecentMeetings();

    // 10. Switch to launcher
    set({ currentView: "launcher", previousView: null });
  },

  loadRecentMeetings: async () => {
    try {
      const meetings = await ipcListMeetings(50, 0);
      set({ recentMeetings: meetings });
    } catch (err) {
      console.error("[meetingStore] Failed to load meetings:", err);
    }
  },

  startTimer: () => {
    const state = get();
    // Clear existing interval if any
    if (state._timerInterval) {
      clearInterval(state._timerInterval);
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      set({ elapsedMs: Date.now() - startTime });
    }, 1000);

    set({ _timerInterval: interval });
  },

  stopTimer: () => {
    const state = get();
    if (state._timerInterval) {
      clearInterval(state._timerInterval);
      set({ _timerInterval: null });
    }
  },
}));
