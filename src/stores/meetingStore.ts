import { create } from "zustand";
import type { AppView, Meeting, MeetingSummary } from "../lib/types";
import {
  startMeeting as ipcStartMeeting,
  endMeeting as ipcEndMeeting,
  listMeetings as ipcListMeetings,
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

  // Async flows
  startMeetingFlow: (title?: string) => Promise<void>;
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

  startMeetingFlow: async (title?: string) => {
    try {
      // 1. Create meeting record in SQLite
      const meeting = await ipcStartMeeting(title);

      // 2. Start audio capture — use per-party config if available, else legacy
      const config = useConfigStore.getState();
      try {
        if (config.meetingAudioConfig) {
          await startCapturePerParty(
            config.meetingAudioConfig.you,
            config.meetingAudioConfig.them
          );
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

      // 3. Clear previous transcript segments
      useTranscriptStore.getState().clearSegments();

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

    // 4. End meeting record in DB
    if (meeting) {
      try {
        await ipcEndMeeting(meeting.id);
      } catch (err) {
        console.error("[meetingStore] Failed to end meeting:", err);
      }
    }

    // 5. Clear call log and close sidebar
    try {
      const { useCallLogStore } = await import("./callLogStore");
      useCallLogStore.getState().clearAll();
      useCallLogStore.getState().setOpen(false);
    } catch {
      // Non-critical
    }

    // 6. Clear active state
    set({
      activeMeeting: null,
      isRecording: false,
      meetingStartTime: null,
      elapsedMs: 0,
      lastPersistedIndex: 0,
    });

    // 7. Reload recent meetings
    await get().loadRecentMeetings();

    // 8. Switch to launcher
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
