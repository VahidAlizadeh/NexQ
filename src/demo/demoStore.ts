import { create } from 'zustand';

interface DemoState {
  isDemoActive: boolean;
  activeScenario: string | null;
  mode: 'play' | 'screenshot' | null;
  isPlaying: boolean;
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
  setPlaying: (playing: boolean) => void;
  activate: (scenarioId: string, mode: 'play' | 'screenshot') => void;
  deactivate: () => void;
}

export const useDemoStore = create<DemoState>((set) => ({
  isDemoActive: false,
  activeScenario: null,
  mode: null,
  isPlaying: false,
  pickerOpen: false,
  openPicker: () => set({ pickerOpen: true }),
  closePicker: () => set({ pickerOpen: false }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  activate: (scenarioId, mode) => set({
    isDemoActive: true,
    activeScenario: scenarioId,
    mode,
    pickerOpen: false,
    isPlaying: mode === 'play',
  }),
  deactivate: () => set({
    isDemoActive: false,
    activeScenario: null,
    mode: null,
    isPlaying: false,
    pickerOpen: false,
  }),
}));
