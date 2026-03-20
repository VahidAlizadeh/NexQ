import { create } from "zustand";
import { load, Store } from "@tauri-apps/plugin-store";
import type {
  ThemeMode,
  LLMProviderType,
  STTProviderType,
  HotkeyConfig,
  MeetingAudioConfig,
  ContextStrategy,
  WhisperDualPassConfig,
  DeepgramConfig,
  GroqConfig,
} from "../lib/types";

const DEFAULT_DEEPGRAM_CONFIG: DeepgramConfig = {
  model: "nova-3",
  smart_format: false,
  interim_results: true,
  endpointing: 300,
  punctuate: true,
  diarize: false,
  profanity_filter: false,
  numerals: false,
  dictation: false,
  vad_events: true,
  keyterms: [],
};

const DEFAULT_GROQ_CONFIG: GroqConfig = {
  model: "whisper-large-v3-turbo",
  language: "en",
  temperature: 0,
  response_format: "json",
  timestamp_granularities: [],
  prompt: "",
  segment_duration_secs: 5.0,
};

const STORE_FILE = "config.json";

const DEFAULT_HOTKEYS: HotkeyConfig = {
  toggle_assist: "Space",
  start_end_meeting: "Ctrl+M",
  show_hide: "Ctrl+B",
  open_settings: "Ctrl+,",
  escape: "Escape",
  mode_assist: "Space",
  mode_say: "1",
  mode_shorten: "2",
  mode_followup: "3",
  mode_recap: "4",
  mode_ask: "5",
};

// Singleton store instance, lazily initialized
let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await load(STORE_FILE, { autoSave: true, defaults: {} });
  }
  return storeInstance;
}

/**
 * Persist a key-value pair to the Tauri plugin-store.
 * Fire-and-forget: errors are logged but do not block the UI.
 */
async function persistValue(key: string, value: unknown): Promise<void> {
  try {
    const store = await getStore();
    await store.set(key, value);
  } catch (err) {
    console.error(`[configStore] Failed to persist "${key}":`, err);
  }
}

interface ConfigState {
  // Appearance
  theme: ThemeMode;

  // Providers
  sttProvider: STTProviderType;
  llmProvider: LLMProviderType;
  llmModel: string;

  // Audio (legacy — kept for backward compat, new code uses meetingAudioConfig)
  micDeviceId: string | null;
  systemDeviceId: string | null;
  recordingEnabled: boolean;

  // Two-Party Audio Config (new)
  meetingAudioConfig: MeetingAudioConfig | null;

  // User-saved custom presets (persisted)
  customPresets: MeetingAudioConfig[];

  // Local STT — globally active whisper model (e.g., "base", "small")
  activeWhisperModel: string | null;

  // Cloud providers that have been tested and verified (persisted)
  verifiedCloudProviders: string[];

  // Whisper dual-pass config
  whisperDualPass: WhisperDualPassConfig;

  // Deepgram model/feature config
  deepgramConfig: DeepgramConfig;

  // Groq Whisper config
  groqConfig: GroqConfig;

  // Universal pause threshold for transcript line-breaking (ms)
  pauseThresholdMs: number;

  // Intelligence
  autoTrigger: boolean;
  autoSummary: boolean;
  contextWindowSeconds: number;

  // System
  startOnLogin: boolean;
  dataDirectory: string;
  firstRunCompleted: boolean;

  // Hotkeys
  hotkeys: HotkeyConfig;

  // Context Strategy
  contextStrategy: ContextStrategy;

  // Loading state
  _loaded: boolean;

  // Mute state (non-persisted, session-only — resets on app restart)
  mutedYou: boolean;
  mutedThem: boolean;
  toggleMuteYou: () => void;
  toggleMuteThem: () => void;

  // Actions
  setTheme: (theme: ThemeMode) => void;
  setContextStrategy: (strategy: ContextStrategy) => void;
  setSTTProvider: (provider: STTProviderType) => void;
  setLLMProvider: (provider: LLMProviderType) => void;
  setLLMModel: (model: string) => void;
  setMicDeviceId: (id: string | null) => void;
  setSystemDeviceId: (id: string | null) => void;
  setRecordingEnabled: (enabled: boolean) => void;
  setMeetingAudioConfig: (config: MeetingAudioConfig) => void;
  saveCustomPreset: (name: string) => void;
  deleteCustomPreset: (name: string) => void;
  setActiveWhisperModel: (modelId: string | null) => void;
  setWhisperDualPass: (config: WhisperDualPassConfig) => void;
  setDeepgramConfig: (config: DeepgramConfig) => void;
  setGroqConfig: (config: GroqConfig) => void;
  setPauseThresholdMs: (ms: number) => void;
  setAutoTrigger: (enabled: boolean) => void;
  setAutoSummary: (enabled: boolean) => void;
  setContextWindowSeconds: (seconds: number) => void;
  setStartOnLogin: (enabled: boolean) => void;
  setDataDirectory: (dir: string) => void;
  setFirstRunCompleted: (completed: boolean) => void;
  setHotkeys: (hotkeys: HotkeyConfig) => void;
  setVerifiedCloudProviders: (providers: string[]) => void;
  loadConfig: () => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set) => ({
  theme: "dark",
  sttProvider: "windows_native",
  llmProvider: "ollama",
  llmModel: "",
  micDeviceId: null,
  systemDeviceId: null,
  recordingEnabled: false,
  meetingAudioConfig: null,
  customPresets: [],
  activeWhisperModel: null,
  verifiedCloudProviders: [],
  whisperDualPass: { shortChunkSecs: 1.0, longChunkSecs: 3.0, pauseSecs: 1.5 },
  deepgramConfig: DEFAULT_DEEPGRAM_CONFIG,
  groqConfig: DEFAULT_GROQ_CONFIG,
  pauseThresholdMs: 3000,
  autoTrigger: true,
  autoSummary: true,
  contextWindowSeconds: 120,
  startOnLogin: false,
  dataDirectory: "",
  firstRunCompleted: false,
  contextStrategy: "stuffing",
  hotkeys: DEFAULT_HOTKEYS,
  _loaded: false,
  mutedYou: false,
  mutedThem: false,
  toggleMuteYou: () => {
    const next = !useConfigStore.getState().mutedYou;
    set({ mutedYou: next });
    import("../lib/ipc").then(({ setSourceMuted }) =>
      setSourceMuted("you", next)
        .catch((e) => console.warn("[configStore] Failed to set You muted:", e))
    );
  },
  toggleMuteThem: () => {
    const next = !useConfigStore.getState().mutedThem;
    set({ mutedThem: next });
    import("../lib/ipc").then(({ setSourceMuted }) =>
      setSourceMuted("them", next)
        .catch((e) => console.warn("[configStore] Failed to set Them muted:", e))
    );
  },

  setContextStrategy: (strategy) => {
    set({ contextStrategy: strategy });
    persistValue("contextStrategy", strategy);
  },
  setTheme: (theme) => {
    set({ theme });
    persistValue("theme", theme);
  },
  setSTTProvider: (provider) => {
    set({ sttProvider: provider });
    persistValue("sttProvider", provider);
  },
  setLLMProvider: (provider) => {
    set({ llmProvider: provider });
    persistValue("llmProvider", provider);
  },
  setLLMModel: (model) => {
    set({ llmModel: model });
    persistValue("llmModel", model);
  },
  setMicDeviceId: (id) => {
    set({ micDeviceId: id });
    persistValue("micDeviceId", id);
  },
  setSystemDeviceId: (id) => {
    set({ systemDeviceId: id });
    persistValue("systemDeviceId", id);
  },
  setRecordingEnabled: (enabled) => {
    set({ recordingEnabled: enabled });
    persistValue("recordingEnabled", enabled);
  },
  setMeetingAudioConfig: (config) => {
    set({ meetingAudioConfig: config });
    persistValue("meetingAudioConfig", config);
    // Keep legacy fields in sync for backward compatibility
    set({
      micDeviceId: config.you.device_id || null,
      systemDeviceId: config.them.device_id || null,
      recordingEnabled: config.recording_enabled,
    });
    persistValue("micDeviceId", config.you.device_id || null);
    persistValue("systemDeviceId", config.them.device_id || null);
    persistValue("recordingEnabled", config.recording_enabled);
  },
  saveCustomPreset: (name) => {
    const state = useConfigStore.getState();
    if (!state.meetingAudioConfig) return;
    const preset: MeetingAudioConfig = {
      ...state.meetingAudioConfig,
      preset_name: name,
    };
    // Replace if exists, else append
    const existing = state.customPresets.filter((p) => p.preset_name !== name);
    const updated = [...existing, preset];
    set({ customPresets: updated });
    persistValue("customPresets", updated);
  },
  deleteCustomPreset: (name) => {
    const state = useConfigStore.getState();
    const updated = state.customPresets.filter((p) => p.preset_name !== name);
    set({ customPresets: updated });
    persistValue("customPresets", updated);
  },
  setActiveWhisperModel: (modelId) => {
    set({ activeWhisperModel: modelId });
    persistValue("activeWhisperModel", modelId);
    // Also update local_model_id on any party using whisper_cpp
    const state = useConfigStore.getState();
    if (state.meetingAudioConfig && modelId) {
      const cfg = { ...state.meetingAudioConfig };
      let changed = false;
      if (cfg.you.stt_provider === "whisper_cpp") {
        cfg.you = { ...cfg.you, local_model_id: modelId };
        changed = true;
      }
      if (cfg.them.stt_provider === "whisper_cpp") {
        cfg.them = { ...cfg.them, local_model_id: modelId };
        changed = true;
      }
      if (changed) {
        set({ meetingAudioConfig: cfg });
        persistValue("meetingAudioConfig", cfg);
      }
    }
  },
  setWhisperDualPass: (config) => {
    set({ whisperDualPass: config });
    persistValue("whisperDualPass", config);
    // Apply immediately to Rust backend
    import("../lib/ipc").then(({ updateWhisperDualPassConfig }) =>
      updateWhisperDualPassConfig(config.shortChunkSecs, config.longChunkSecs, config.pauseSecs)
        .catch((e) => console.warn("[configStore] Failed to update whisper dual-pass config:", e))
    );
  },
  setDeepgramConfig: (config) => {
    set({ deepgramConfig: config });
    persistValue("deepgramConfig", config);
    // Apply immediately to Rust backend
    import("../lib/ipc").then(({ updateDeepgramConfig }) =>
      updateDeepgramConfig(config)
        .catch((e) => console.warn("[configStore] Failed to update Deepgram config:", e))
    );
  },
  setGroqConfig: (config) => {
    set({ groqConfig: config });
    persistValue("groqConfig", config);
    // Apply immediately to Rust backend
    import("../lib/ipc").then(({ updateGroqConfig }) =>
      updateGroqConfig(config)
        .catch((e) => console.warn("[configStore] Failed to update Groq config:", e))
    );
  },
  setPauseThresholdMs: (ms) => {
    set({ pauseThresholdMs: ms });
    persistValue("pauseThresholdMs", ms);
    // Apply immediately to Rust backend
    import("../lib/ipc").then(({ setPauseThreshold }) =>
      setPauseThreshold(ms)
        .catch((e) => console.warn("[configStore] Failed to update pause threshold:", e))
    );
  },
  setAutoTrigger: (enabled) => {
    set({ autoTrigger: enabled });
    persistValue("autoTrigger", enabled);
  },
  setAutoSummary: (enabled) => {
    set({ autoSummary: enabled });
    persistValue("autoSummary", enabled);
  },
  setContextWindowSeconds: (seconds) => {
    set({ contextWindowSeconds: seconds });
    persistValue("contextWindowSeconds", seconds);
  },
  setStartOnLogin: (enabled) => {
    set({ startOnLogin: enabled });
    persistValue("startOnLogin", enabled);
  },
  setDataDirectory: (dir) => {
    set({ dataDirectory: dir });
    persistValue("dataDirectory", dir);
  },
  setFirstRunCompleted: (completed) => {
    set({ firstRunCompleted: completed });
    persistValue("firstRunCompleted", completed);
  },
  setHotkeys: (hotkeys) => {
    set({ hotkeys });
    persistValue("hotkeys", hotkeys);
  },
  setVerifiedCloudProviders: (providers) => {
    set({ verifiedCloudProviders: providers });
    persistValue("verifiedCloudProviders", providers);
  },

  /**
   * Load all persisted config values from the Tauri plugin-store on app start.
   * Any key not found in the store will keep its default value.
   * Auto-migrates old single-provider fields to the new per-party MeetingAudioConfig.
   */
  loadConfig: async () => {
    try {
      const store = await getStore();

      const theme = await store.get<ThemeMode>("theme");
      const sttProvider = await store.get<STTProviderType>("sttProvider");
      const llmProvider = await store.get<LLMProviderType>("llmProvider");
      const llmModel = await store.get<string>("llmModel");
      const micDeviceId = await store.get<string | null>("micDeviceId");
      const systemDeviceId = await store.get<string | null>("systemDeviceId");
      const recordingEnabled = await store.get<boolean>("recordingEnabled");
      const meetingAudioConfig = await store.get<MeetingAudioConfig>("meetingAudioConfig");
      const customPresets = await store.get<MeetingAudioConfig[]>("customPresets");
      const autoTrigger = await store.get<boolean>("autoTrigger");
      const autoSummary = await store.get<boolean>("autoSummary");
      const contextWindowSeconds = await store.get<number>("contextWindowSeconds");
      const startOnLogin = await store.get<boolean>("startOnLogin");
      const dataDirectory = await store.get<string>("dataDirectory");
      const firstRunCompleted = await store.get<boolean>("firstRunCompleted");
      const hotkeys = await store.get<HotkeyConfig>("hotkeys");
      const activeWhisperModel = await store.get<string | null>("activeWhisperModel");
      const whisperDualPass = await store.get<WhisperDualPassConfig>("whisperDualPass");
      const contextStrategy = await store.get<ContextStrategy>("contextStrategy");
      const verifiedCloudProviders = await store.get<string[]>("verifiedCloudProviders");
      const deepgramConfig = await store.get<DeepgramConfig>("deepgramConfig");
      const groqConfig = await store.get<GroqConfig>("groqConfig");
      const pauseThresholdMs = await store.get<number>("pauseThresholdMs");

      // Auto-migrate: if no meetingAudioConfig exists but old fields do,
      // build a MeetingAudioConfig from legacy fields.
      let resolvedMeetingConfig = meetingAudioConfig ?? null;
      if (!resolvedMeetingConfig && (micDeviceId || systemDeviceId)) {
        resolvedMeetingConfig = {
          you: {
            role: "You",
            device_id: micDeviceId ?? "default",
            is_input_device: true,
            stt_provider: "web_speech",
          },
          them: {
            role: "Them",
            device_id: systemDeviceId ?? "default",
            is_input_device: false,
            stt_provider: "deepgram",
          },
          recording_enabled: recordingEnabled ?? false,
          preset_name: null,
        };
        await store.set("meetingAudioConfig", resolvedMeetingConfig);
        console.log("[configStore] Migrated legacy audio config to meetingAudioConfig");
      }

      // Migrate whisper_cpp → correct defaults (whisper_cpp is batch-only, not for live STT)
      if (resolvedMeetingConfig) {
        let migrated = false;
        if ((resolvedMeetingConfig.you.stt_provider as string) === "whisper_cpp") {
          resolvedMeetingConfig.you = { ...resolvedMeetingConfig.you, stt_provider: "web_speech", local_model_id: undefined };
          migrated = true;
        }
        if ((resolvedMeetingConfig.them.stt_provider as string) === "whisper_cpp") {
          resolvedMeetingConfig.them = { ...resolvedMeetingConfig.them, stt_provider: "deepgram", local_model_id: undefined };
          migrated = true;
        }
        // windows_native only works with mic input; migrate Them (non-input) away from it
        if (
          (resolvedMeetingConfig.them.stt_provider as string) === "windows_native" &&
          !resolvedMeetingConfig.them.is_input_device
        ) {
          resolvedMeetingConfig.them = { ...resolvedMeetingConfig.them, stt_provider: "deepgram" };
          migrated = true;
        }
        if (migrated) {
          await store.set("meetingAudioConfig", resolvedMeetingConfig);
          console.log("[configStore] Migrated meetingAudioConfig providers");
        }
      }

      // Migrate top-level sttProvider away from whisper_cpp
      let resolvedSttProvider = sttProvider;
      if (!resolvedSttProvider || (resolvedSttProvider as string) === "whisper_cpp") {
        resolvedSttProvider = "windows_native" as STTProviderType;
        await store.set("sttProvider", resolvedSttProvider);
        console.log("[configStore] Migrated top-level sttProvider to windows_native");
      }

      // If no meetingAudioConfig was found after all migrations, create a default
      if (!resolvedMeetingConfig) {
        resolvedMeetingConfig = {
          you: {
            role: "You",
            device_id: "default",
            is_input_device: true,
            stt_provider: "web_speech",
          },
          them: {
            role: "Them",
            device_id: "default",
            is_input_device: false,
            stt_provider: "deepgram",
          },
          recording_enabled: false,
          preset_name: null,
        };
        await store.set("meetingAudioConfig", resolvedMeetingConfig);
        console.log("[configStore] Created default meetingAudioConfig (Web Speech + Deepgram)");
      }

      set((state) => ({
        ...state,
        _loaded: true,
        ...(theme != null && { theme }),
        ...(sttProvider != null && { sttProvider }),
        ...(llmProvider != null && { llmProvider }),
        ...(llmModel != null && { llmModel }),
        ...(micDeviceId !== undefined && { micDeviceId }),
        ...(systemDeviceId !== undefined && { systemDeviceId }),
        ...(recordingEnabled != null && { recordingEnabled }),
        ...(resolvedMeetingConfig != null && { meetingAudioConfig: resolvedMeetingConfig }),
        ...(customPresets != null && { customPresets }),
        ...(autoTrigger != null && { autoTrigger }),
        ...(autoSummary != null && { autoSummary }),
        ...(contextWindowSeconds != null && { contextWindowSeconds }),
        ...(startOnLogin != null && { startOnLogin }),
        ...(dataDirectory != null && { dataDirectory }),
        ...(firstRunCompleted != null && { firstRunCompleted }),
        ...(hotkeys != null && { hotkeys }),
        ...(activeWhisperModel !== undefined && { activeWhisperModel }),
        ...(whisperDualPass != null && { whisperDualPass }),
        ...(contextStrategy != null && { contextStrategy }),
        ...(verifiedCloudProviders != null && { verifiedCloudProviders }),
        ...(deepgramConfig != null && { deepgramConfig }),
        ...(groqConfig != null && { groqConfig }),
        ...(pauseThresholdMs != null && { pauseThresholdMs }),
      }));

      // Set up cross-window sync: when another window changes the store,
      // update this window's Zustand state automatically.
      store.onKeyChange<MeetingAudioConfig>("meetingAudioConfig", (val) => {
        if (val != null) set({ meetingAudioConfig: val });
      });
      store.onKeyChange<string>("activeWhisperModel", (val) => {
        if (val !== undefined) set({ activeWhisperModel: val ?? null });
      });
      store.onKeyChange<STTProviderType>("sttProvider", (val) => {
        if (val != null) set({ sttProvider: val });
      });
      store.onKeyChange<LLMProviderType>("llmProvider", (val) => {
        if (val != null) set({ llmProvider: val });
      });
      store.onKeyChange<string>("llmModel", (val) => {
        if (val != null) set({ llmModel: val });
      });
      store.onKeyChange<ContextStrategy>("contextStrategy", (val) => {
        if (val != null) set({ contextStrategy: val });
      });
      store.onKeyChange<WhisperDualPassConfig>("whisperDualPass", (val) => {
        if (val != null) set({ whisperDualPass: val });
      });

      // Sync persisted dual-pass config to Rust backend on startup.
      // The Rust side starts with DualPassConfig::default(); this pushes saved values.
      const loadedDualPass = whisperDualPass ?? { shortChunkSecs: 1.0, longChunkSecs: 3.0, pauseSecs: 1.5 };
      import("../lib/ipc").then(({ updateWhisperDualPassConfig }) =>
        updateWhisperDualPassConfig(
          loadedDualPass.shortChunkSecs,
          loadedDualPass.longChunkSecs,
          loadedDualPass.pauseSecs,
        ).catch((e) => console.warn("[configStore] Failed to sync dual-pass config on load:", e))
      );

      // Sync persisted Deepgram config to Rust backend on startup.
      const loadedDgConfig = deepgramConfig ?? DEFAULT_DEEPGRAM_CONFIG;
      import("../lib/ipc").then(({ updateDeepgramConfig }) =>
        updateDeepgramConfig(loadedDgConfig)
          .catch((e) => console.warn("[configStore] Failed to sync Deepgram config on load:", e))
      );

      // Sync persisted Groq config to Rust backend on startup.
      const loadedGroqConfig = groqConfig ?? DEFAULT_GROQ_CONFIG;
      import("../lib/ipc").then(({ updateGroqConfig }) =>
        updateGroqConfig(loadedGroqConfig)
          .catch((e) => console.warn("[configStore] Failed to sync Groq config on load:", e))
      );

      // Sync persisted pause threshold to Rust backend on startup.
      const loadedPauseThreshold = pauseThresholdMs ?? 3000;
      import("../lib/ipc").then(({ setPauseThreshold }) =>
        setPauseThreshold(loadedPauseThreshold)
          .catch((e) => console.warn("[configStore] Failed to sync pause threshold on load:", e))
      );

      console.log("[configStore] Config loaded from store (with cross-window sync)");
    } catch (err) {
      console.error("[configStore] Failed to load config:", err);
      set({ _loaded: true });
    }
  },
}));
