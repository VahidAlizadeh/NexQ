import { create } from "zustand";
import { load, Store } from "@tauri-apps/plugin-store";
import type {
  TranslationProviderType,
  TranslationDisplayMode,
  TranslationResult,
} from "../lib/types";

const STORE_FILE = "translation-config.json";

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
    console.error(`[translationStore] Failed to persist "${key}":`, err);
  }
}

interface TranslationState {
  // Persisted preferences
  provider: TranslationProviderType;
  targetLang: string;
  sourceLang: string; // "auto" or ISO code
  displayMode: TranslationDisplayMode;
  autoTranslateEnabled: boolean;
  selectionToolbarEnabled: boolean;
  cacheEnabled: boolean;

  // Session state (not persisted)
  autoTranslateActive: boolean; // current session toggle
  translations: Map<string, TranslationResult>; // segmentId → result
  translating: Set<string>; // segmentIds currently being translated
  batchProgress: { completed: number; total: number } | null;

  // Actions
  setProvider: (provider: TranslationProviderType) => void;
  setTargetLang: (lang: string) => void;
  setSourceLang: (lang: string) => void;
  setDisplayMode: (mode: TranslationDisplayMode) => void;
  setAutoTranslateEnabled: (enabled: boolean) => void;
  setSelectionToolbarEnabled: (enabled: boolean) => void;
  setCacheEnabled: (enabled: boolean) => void;
  setAutoTranslateActive: (active: boolean) => void;
  addTranslation: (result: TranslationResult) => void;
  addTranslations: (results: TranslationResult[]) => void;
  setTranslating: (segmentId: string, isTranslating: boolean) => void;
  setBatchProgress: (progress: { completed: number; total: number } | null) => void;
  clearTranslations: () => void;
  loadConfig: () => Promise<void>;
}

export const useTranslationStore = create<TranslationState>((set) => ({
  // Persisted defaults
  provider: "microsoft",
  targetLang: "es",
  sourceLang: "auto",
  displayMode: "inline",
  autoTranslateEnabled: true,
  selectionToolbarEnabled: true,
  cacheEnabled: true,

  // Session defaults
  autoTranslateActive: false,
  translations: new Map(),
  translating: new Set(),
  batchProgress: null,

  setProvider: (provider) => {
    set({ provider });
    persistValue("provider", provider);
  },
  setTargetLang: (lang) => {
    set({ targetLang: lang });
    persistValue("targetLang", lang);
  },
  setSourceLang: (lang) => {
    set({ sourceLang: lang });
    persistValue("sourceLang", lang);
  },
  setDisplayMode: (mode) => {
    set({ displayMode: mode });
    persistValue("displayMode", mode);
  },
  setAutoTranslateEnabled: (enabled) => {
    set({ autoTranslateEnabled: enabled });
    persistValue("autoTranslateEnabled", enabled);
  },
  setSelectionToolbarEnabled: (enabled) => {
    set({ selectionToolbarEnabled: enabled });
    persistValue("selectionToolbarEnabled", enabled);
  },
  setCacheEnabled: (enabled) => {
    set({ cacheEnabled: enabled });
    persistValue("cacheEnabled", enabled);
  },
  setAutoTranslateActive: (active) => set({ autoTranslateActive: active }),

  addTranslation: (result) => {
    if (!result.segment_id) return;
    set((state) => {
      const updated = new Map(state.translations);
      updated.set(result.segment_id!, result);
      const translating = new Set(state.translating);
      translating.delete(result.segment_id!);
      return { translations: updated, translating };
    });
  },
  addTranslations: (results) => {
    set((state) => {
      const updated = new Map(state.translations);
      const translating = new Set(state.translating);
      for (const r of results) {
        if (r.segment_id) {
          updated.set(r.segment_id, r);
          translating.delete(r.segment_id);
        }
      }
      return { translations: updated, translating };
    });
  },
  setTranslating: (segmentId, isTranslating) => {
    set((state) => {
      const updated = new Set(state.translating);
      if (isTranslating) updated.add(segmentId);
      else updated.delete(segmentId);
      return { translating: updated };
    });
  },
  setBatchProgress: (progress) => set({ batchProgress: progress }),
  clearTranslations: () => set({ translations: new Map(), translating: new Set() }),

  loadConfig: async () => {
    try {
      const store = await getStore();
      const provider = await store.get<TranslationProviderType>("provider");
      const targetLang = await store.get<string>("targetLang");
      const sourceLang = await store.get<string>("sourceLang");
      const displayMode = await store.get<TranslationDisplayMode>("displayMode");
      const autoTranslateEnabled = await store.get<boolean>("autoTranslateEnabled");
      const selectionToolbarEnabled = await store.get<boolean>("selectionToolbarEnabled");
      const cacheEnabled = await store.get<boolean>("cacheEnabled");

      set({
        ...(provider != null && { provider }),
        ...(targetLang != null && { targetLang }),
        ...(sourceLang != null && { sourceLang }),
        ...(displayMode != null && { displayMode }),
        ...(autoTranslateEnabled != null && { autoTranslateEnabled }),
        ...(selectionToolbarEnabled != null && { selectionToolbarEnabled }),
        ...(cacheEnabled != null && { cacheEnabled }),
      });

      // Cross-window sync: when another window changes the store,
      // update this window's Zustand state automatically.
      store.onKeyChange<TranslationProviderType>("provider", (val) => {
        if (val != null) set({ provider: val });
      });
      store.onKeyChange<string>("targetLang", (val) => {
        if (val != null) set({ targetLang: val });
      });
      store.onKeyChange<string>("sourceLang", (val) => {
        if (val != null) set({ sourceLang: val });
      });
      store.onKeyChange<TranslationDisplayMode>("displayMode", (val) => {
        if (val != null) set({ displayMode: val });
      });
      store.onKeyChange<boolean>("autoTranslateEnabled", (val) => {
        if (val != null) set({ autoTranslateEnabled: val });
      });
      store.onKeyChange<boolean>("selectionToolbarEnabled", (val) => {
        if (val != null) set({ selectionToolbarEnabled: val });
      });
      store.onKeyChange<boolean>("cacheEnabled", (val) => {
        if (val != null) set({ cacheEnabled: val });
      });

      console.log("[translationStore] Config loaded from store (with cross-window sync)");
    } catch (err) {
      console.error("[translationStore] Failed to load config:", err);
    }
  },
}));
