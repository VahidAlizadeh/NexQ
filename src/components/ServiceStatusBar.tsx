// Shared service status bar used in both Dashboard and Meeting Overlay footers.
// Shows LLM, You STT, and Them STT with provider + model, lighting up when active.
// During recording: STT chips are interactive (click to swap provider), with mute toggles.

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Brain, Mic, MicOff, Volume2, VolumeX, Zap,
  ChevronUp, CheckCircle, Globe, Monitor, HardDrive, Cloud,
} from "lucide-react";
import { useConfigStore } from "../stores/configStore";
import { useStreamStore } from "../stores/streamStore";
import { useMeetingStore } from "../stores/meetingStore";
import { useAudioLevel } from "../hooks/useAudioLevel";
import { hasApiKey, listLocalSTTEngines, setLLMProvider, setActiveModel, getApiKey } from "../lib/ipc";
import type { STTProviderType, LLMProviderType, LocalSTTEngineInfo } from "../lib/types";

// ── Human-friendly provider labels ──
const LLM_LABELS: Record<string, string> = {
  ollama: "Ollama",
  lm_studio: "LM Studio",
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
  gemini: "Gemini",
  openrouter: "OpenRouter",
  custom: "Custom",
};

const STT_LABELS: Record<string, string> = {
  web_speech: "Web Speech",
  whisper_cpp: "Whisper.cpp",
  deepgram: "Deepgram",
  whisper_api: "Whisper API",
  azure_speech: "Azure",
  groq_whisper: "Groq STT",
  sherpa_onnx: "Sherpa-ONNX",
  ort_streaming: "ORT Streaming",
  windows_native: "Windows Speech",
};

// ── STT provider options for the quick-swap picker ──
// Mirrors MeetingAudioSettings.tsx STT_OPTIONS — same availability rules apply.
const STT_PROVIDER_OPTIONS: {
  value: STTProviderType;
  label: string;
  IconComponent: React.ComponentType<{ className?: string }>;
  requiresKey: boolean;
  isCloud: boolean;
  inputOnly?: boolean;
  requiresDownload?: string;
}[] = [
  { value: "web_speech", label: "Web Speech", IconComponent: Globe, requiresKey: false, isCloud: false, inputOnly: true },
  { value: "windows_native", label: "Windows Speech", IconComponent: Monitor, requiresKey: false, isCloud: false, inputOnly: true },
  { value: "sherpa_onnx", label: "Sherpa-ONNX", IconComponent: HardDrive, requiresKey: false, isCloud: false, requiresDownload: "sherpa_onnx" },
  { value: "ort_streaming", label: "ORT Streaming", IconComponent: Zap, requiresKey: false, isCloud: false, requiresDownload: "ort_streaming" },
  { value: "deepgram", label: "Deepgram", IconComponent: Cloud, requiresKey: true, isCloud: true },
  { value: "whisper_api", label: "Whisper API", IconComponent: Cloud, requiresKey: true, isCloud: true },
  { value: "azure_speech", label: "Azure Speech", IconComponent: Cloud, requiresKey: true, isCloud: true },
  { value: "groq_whisper", label: "Groq Whisper", IconComponent: Zap, requiresKey: true, isCloud: true },
];

// ── LLM provider options for quick-swap ──
const LLM_PROVIDER_OPTIONS: {
  value: LLMProviderType;
  label: string;
  IconComponent: React.ComponentType<{ className?: string }>;
  requiresKey: boolean;
  isLocal: boolean;
}[] = [
  { value: "ollama", label: "Ollama", IconComponent: Monitor, requiresKey: false, isLocal: true },
  { value: "lm_studio", label: "LM Studio", IconComponent: Monitor, requiresKey: false, isLocal: true },
  { value: "openai", label: "OpenAI", IconComponent: Cloud, requiresKey: true, isLocal: false },
  { value: "anthropic", label: "Anthropic", IconComponent: Cloud, requiresKey: true, isLocal: false },
  { value: "groq", label: "Groq", IconComponent: Zap, requiresKey: true, isLocal: false },
  { value: "gemini", label: "Gemini", IconComponent: Cloud, requiresKey: true, isLocal: false },
  { value: "openrouter", label: "OpenRouter", IconComponent: Globe, requiresKey: true, isLocal: false },
  { value: "custom", label: "Custom", IconComponent: HardDrive, requiresKey: false, isLocal: false },
];

function formatModel(model: string): string {
  if (!model) return "—";
  const afterSlash = model.split("/").pop() || model;
  return afterSlash.split(":")[0] || afterSlash;
}

function formatSttLabel(provider: string, localModelId?: string): { provider: string; model: string } {
  const providerLabel = STT_LABELS[provider] || provider;
  const localProviders = ["whisper_cpp", "sherpa_onnx", "ort_streaming"];
  if (localProviders.includes(provider) && localModelId) {
    return { provider: providerLabel, model: localModelId };
  }
  return { provider: providerLabel, model: "" };
}

/**
 * Unified service status bar for both Dashboard footer and Meeting overlay footer.
 * Reads directly from Zustand stores so it reacts to settings changes immediately.
 *
 * `compact` — used in the meeting overlay (less padding, tighter spacing)
 *
 * During an active recording, STT chips become interactive:
 * - Click to open an upward dropdown to switch STT provider
 * - Mute toggle button to silence each audio source
 */
export function ServiceStatusBar({ compact = false }: { compact?: boolean }) {
  // Config (reactive)
  const llmProvider = useConfigStore((s) => s.llmProvider);
  const llmModel = useConfigStore((s) => s.llmModel);
  const meetingAudioConfig = useConfigStore((s) => s.meetingAudioConfig);
  const activeWhisperModel = useConfigStore((s) => s.activeWhisperModel);
  const setMeetingAudioConfig = useConfigStore((s) => s.setMeetingAudioConfig);

  // Active state
  const isRecording = useMeetingStore((s) => s.isRecording);
  const isStreaming = useStreamStore((s) => s.isStreaming);
  const latencyMs = useStreamStore((s) => s.latencyMs);
  const streamProvider = useStreamStore((s) => s.currentProvider);
  const streamModel = useStreamStore((s) => s.currentModel);
  const { micLevel, systemLevel } = useAudioLevel();

  // Mute state (session-only, not persisted)
  const mutedYou = useConfigStore((s) => s.mutedYou);
  const mutedThem = useConfigStore((s) => s.mutedThem);
  const toggleMuteYou = useConfigStore((s) => s.toggleMuteYou);
  const toggleMuteThem = useConfigStore((s) => s.toggleMuteThem);

  // Picker state (LLM or STT)
  const [pickerOpen, setPickerOpen] = useState<"llm" | "you" | "them" | null>(null);
  const setConfigProvider = useConfigStore((s) => s.setLLMProvider);
  const setConfigModel = useConfigStore((s) => s.setLLMModel);

  // ── Derive display values ──
  const llmProviderLabel = LLM_LABELS[streamProvider || llmProvider] || (streamProvider || llmProvider);
  const llmModelLabel = formatModel(streamModel || llmModel);

  const youSttProvider = meetingAudioConfig?.you.stt_provider ?? "web_speech";
  const youLocalModel = meetingAudioConfig?.you.local_model_id
    || (youSttProvider === "whisper_cpp" ? activeWhisperModel : undefined);
  const youStt = formatSttLabel(youSttProvider, youLocalModel || undefined);
  const youActive = isRecording && !mutedYou && micLevel > 0.02;

  const themSttProvider = meetingAudioConfig?.them.stt_provider ?? "—";
  const themLocalModel = meetingAudioConfig?.them.local_model_id
    || (themSttProvider === "whisper_cpp" ? activeWhisperModel : undefined);
  const themStt = formatSttLabel(themSttProvider, themLocalModel || undefined);
  const themActive = isRecording && !mutedThem && systemLevel > 0.02;

  // ── Provider change handler ──
  // Updates meetingAudioConfig; useAudioConfigSync automatically restarts capture.
  const handleProviderChange = useCallback((party: "you" | "them", provider: STTProviderType) => {
    if (!meetingAudioConfig) return;
    const updates: Partial<typeof meetingAudioConfig.you> = { stt_provider: provider };
    if (provider === "sherpa_onnx" || provider === "ort_streaming") {
      // Use per-engine active model — not the legacy global activeWhisperModel
      const activeModelPerEngine = useConfigStore.getState().activeModelPerEngine;
      const engineModel = activeModelPerEngine[provider]
        ?? useConfigStore.getState().activeWhisperModel;
      if (engineModel) updates.local_model_id = engineModel;
    }
    setMeetingAudioConfig({
      ...meetingAudioConfig,
      [party]: { ...meetingAudioConfig[party], ...updates },
      preset_name: null,
    });
    setPickerOpen(null);
  }, [meetingAudioConfig, setMeetingAudioConfig]);

  return (
    <div className={`flex items-center gap-2.5 ${compact ? "px-3 py-2" : "px-5 py-2.5"}`}>
      {/* LLM — always interactive */}
      <div className="relative">
        <STTChip
          icon={<Brain className="h-3.5 w-3.5" />}
          provider={llmProviderLabel}
          model={llmModelLabel}
          active={isStreaming}
          color="blue"
          label=""
          muted={false}
          interactive={true}
          pickerOpen={pickerOpen === "llm"}
          onClick={() => setPickerOpen(pickerOpen === "llm" ? null : "llm")}
          tooltip={`LLM: ${llmProviderLabel} / ${llmModelLabel}`}
        />
        {pickerOpen === "llm" && (
          <LLMPickerDropdown
            currentProvider={llmProvider}
            currentModel={llmModel}
            onApply={async (provider, model) => {
              try {
                const key = await getApiKey(provider).catch(() => null);
                const config = JSON.stringify({
                  provider_type: provider,
                  ...(key && { api_key: key }),
                });
                await setLLMProvider(config);
                setConfigProvider(provider as LLMProviderType);
                await setActiveModel(provider, model);
                setConfigModel(model);
              } catch (e) {
                console.warn("[ServiceStatusBar] Failed to switch LLM:", e);
              }
              setPickerOpen(null);
            }}
            onClose={() => setPickerOpen(null)}
          />
        )}
      </div>

      <Divider />

      {/* You STT — interactive during recording */}
      <div className="flex items-center gap-1">
        <div className="relative">
          <STTChip
            icon={<Mic className="h-3.5 w-3.5" />}
            provider={youStt.provider}
            model={youStt.model}
            active={youActive}
            color="sky"
            label="You"
            muted={mutedYou}
            interactive={isRecording}
            pickerOpen={pickerOpen === "you"}
            onClick={() => setPickerOpen(pickerOpen === "you" ? null : "you")}
            tooltip={`Your STT: ${youStt.provider}${youStt.model ? ` / ${youStt.model}` : ""}`}
          />
          {pickerOpen === "you" && (
            <STTPickerDropdown
              currentProvider={youSttProvider as STTProviderType}
              isInput={meetingAudioConfig?.you.is_input_device ?? true}
              onSelect={(p) => handleProviderChange("you", p)}
              onClose={() => setPickerOpen(null)}
            />
          )}
        </div>
        {isRecording && (
          <MuteButton type="mic" muted={mutedYou} onToggle={toggleMuteYou} label="You" />
        )}
      </div>

      <Divider />

      {/* Them STT — interactive during recording */}
      <div className="flex items-center gap-1">
        <div className="relative">
          <STTChip
            icon={<Volume2 className="h-3.5 w-3.5" />}
            provider={themStt.provider}
            model={themStt.model}
            active={themActive}
            color="amber"
            label="Them"
            muted={mutedThem}
            interactive={isRecording}
            pickerOpen={pickerOpen === "them"}
            onClick={() => setPickerOpen(pickerOpen === "them" ? null : "them")}
            tooltip={`Their STT: ${themStt.provider}${themStt.model ? ` / ${themStt.model}` : ""}`}
          />
          {pickerOpen === "them" && (
            <STTPickerDropdown
              currentProvider={themSttProvider as STTProviderType}
              isInput={meetingAudioConfig?.them.is_input_device ?? false}
              onSelect={(p) => handleProviderChange("them", p)}
              onClose={() => setPickerOpen(null)}
            />
          )}
        </div>
        {isRecording && (
          <MuteButton type="speaker" muted={mutedThem} onToggle={toggleMuteThem} label="Them" />
        )}
      </div>

      {/* Latency / streaming indicator */}
      {(isStreaming || latencyMs != null) && (
        <>
          <Divider />
          <div className="flex items-center gap-1">
            <Zap className={`h-3 w-3 ${isStreaming ? "text-primary animate-pulse" : "text-muted-foreground/60"}`} />
            <span className="text-[11px] tabular-nums font-medium text-muted-foreground">
              {isStreaming ? (
                <span className="text-primary animate-pulse">streaming</span>
              ) : (
                `${latencyMs}ms`
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Color Map ──────────────────────────────────────────────────────

const COLOR_MAP = {
  blue: {
    active: "text-blue-400",
    dot: "bg-blue-400",
    bg: "bg-blue-500/8",
    border: "border-blue-500/15",
    glow: "shadow-blue-500/20",
  },
  sky: {
    active: "text-sky-400",
    dot: "bg-sky-400",
    bg: "bg-sky-500/8",
    border: "border-sky-500/15",
    glow: "shadow-sky-500/20",
  },
  amber: {
    active: "text-amber-400",
    dot: "bg-amber-400",
    bg: "bg-amber-500/8",
    border: "border-amber-500/15",
    glow: "shadow-amber-500/20",
  },
} as const;

// ── Service Chip (display-only, used for LLM) ──────────────────────

function ServiceChip({
  icon,
  provider,
  model,
  active,
  color,
  tooltip,
}: {
  icon: React.ReactNode;
  provider: string;
  model: string;
  active: boolean;
  color: keyof typeof COLOR_MAP;
  tooltip: string;
}) {
  const c = COLOR_MAP[color];

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all duration-200 ${
        active
          ? `${c.bg} border ${c.border} shadow-sm ${c.glow}`
          : "bg-secondary/30 border border-transparent"
      }`}
      title={tooltip}
    >
      {/* Status dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        {active && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${c.dot} opacity-50`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full transition-colors duration-200 ${
          active ? c.dot : "bg-muted-foreground/30"
        }`} />
      </span>

      {/* Icon */}
      <span className={`shrink-0 transition-colors duration-200 ${active ? c.active : "text-muted-foreground/60"}`}>
        {icon}
      </span>

      {/* Text */}
      <div className="flex items-center gap-1 min-w-0">
        <span className={`text-[11px] font-medium truncate max-w-[100px] transition-colors duration-200 ${
          active ? "text-foreground/90" : "text-muted-foreground/70"
        }`}>
          {provider}
        </span>
        {model && (
          <span className={`text-[10px] truncate max-w-[70px] transition-colors duration-200 ${
            active ? "text-foreground/60" : "text-muted-foreground/60"
          }`}>
            {model}
          </span>
        )}
      </div>
    </div>
  );
}

// ── STT Chip (interactive during recording) ─────────────────────────

function STTChip({
  icon,
  provider,
  model,
  active,
  color,
  label,
  muted,
  interactive,
  pickerOpen,
  onClick,
  tooltip,
}: {
  icon: React.ReactNode;
  provider: string;
  model: string;
  active: boolean;
  color: keyof typeof COLOR_MAP;
  label: string;
  muted: boolean;
  interactive: boolean;
  pickerOpen: boolean;
  onClick: () => void;
  tooltip: string;
}) {
  const c = COLOR_MAP[color];

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all duration-200 ${
        muted
          ? "bg-red-500/[0.04] border border-red-500/12"
          : active
            ? `${c.bg} border ${c.border} shadow-sm ${c.glow}`
            : "bg-secondary/30 border border-transparent"
      } ${interactive ? "cursor-pointer hover:brightness-110" : ""}`}
      title={tooltip}
      onClick={interactive ? onClick : undefined}
    >
      {/* Status dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        {active && !muted && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${c.dot} opacity-50`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full transition-colors duration-200 ${
          muted ? "bg-red-400/50" : active ? c.dot : "bg-muted-foreground/30"
        }`} />
      </span>

      {/* Icon */}
      <span className={`shrink-0 transition-colors duration-200 ${
        muted ? "text-red-400/60" : active ? c.active : "text-muted-foreground/60"
      }`}>
        {icon}
      </span>

      {/* Text */}
      <div className="flex items-center gap-1 min-w-0">
        {label && (
          <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide transition-colors duration-200 ${
            muted ? "text-red-400/50" : active ? c.active : "text-muted-foreground/60"
          }`}>
            {label}
          </span>
        )}
        <span className={`text-[11px] font-medium truncate max-w-[100px] transition-colors duration-200 ${
          muted ? "text-red-400/50 line-through" : active ? "text-foreground/90" : "text-muted-foreground/70"
        }`}>
          {provider}
        </span>
        {model && !muted && (
          <span className={`text-[10px] truncate max-w-[70px] transition-colors duration-200 ${
            active ? "text-foreground/60" : "text-muted-foreground/60"
          }`}>
            {model}
          </span>
        )}
      </div>

      {/* Chevron — visible only when interactive */}
      {interactive && (
        <ChevronUp className={`h-2.5 w-2.5 shrink-0 transition-all duration-200 ${
          pickerOpen ? "text-foreground/60 rotate-0" : "text-muted-foreground/50 rotate-180"
        }`} />
      )}
    </div>
  );
}

// ── Mute Button ─────────────────────────────────────────────────────

function MuteButton({
  type,
  muted,
  onToggle,
  label,
}: {
  type: "mic" | "speaker";
  muted: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onToggle}
      className={`shrink-0 rounded-full p-1 transition-all duration-150 cursor-pointer ${
        muted
          ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
          : "text-muted-foreground/60 hover:text-foreground/70 hover:bg-accent/40"
      }`}
      title={muted ? `Unmute ${label}` : `Mute ${label}`}
    >
      {type === "mic"
        ? (muted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />)
        : (muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />)
      }
    </button>
  );
}

// ── STT Provider Picker Dropdown (opens upward from footer) ─────────

function STTPickerDropdown({
  currentProvider,
  isInput,
  onSelect,
  onClose,
}: {
  currentProvider: STTProviderType;
  isInput: boolean;
  onSelect: (provider: STTProviderType) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, boolean>>({});
  const [localEngines, setLocalEngines] = useState<LocalSTTEngineInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Load availability data on mount (lazy — only when dropdown opens)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cloudProviders = ["deepgram", "whisper_api", "azure_speech", "groq_whisper"];
        const [engines, ...keyResults] = await Promise.all([
          listLocalSTTEngines(),
          ...cloudProviders.map(async (p) => {
            try { return { p, ok: await hasApiKey(p) }; }
            catch { return { p, ok: false }; }
          }),
        ]);
        if (cancelled) return;
        setLocalEngines(engines);
        const status: Record<string, boolean> = {};
        for (const k of keyResults) status[k.p] = k.ok;
        setApiKeyStatus(status);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Click outside to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Escape to close
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  function isLocalEngineReady(engineId: string): boolean {
    const eng = localEngines.find((e) => e.engine === engineId);
    if (!eng) return false;
    return eng.models.some((m) => !m.id.startsWith("binary-") && m.is_downloaded);
  }

  function isAvailable(opt: (typeof STT_PROVIDER_OPTIONS)[0]): boolean {
    if (opt.inputOnly && !isInput) return false;
    if (opt.requiresDownload) return isLocalEngineReady(opt.requiresDownload);
    if (opt.requiresKey) return apiKeyStatus[opt.value] ?? false;
    return true;
  }

  const localOpts = STT_PROVIDER_OPTIONS.filter((o) => !o.isCloud && isAvailable(o));
  const cloudOpts = STT_PROVIDER_OPTIONS.filter((o) => o.isCloud && isAvailable(o));

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 min-w-[200px] rounded-xl border border-border/30 bg-popover/95 backdrop-blur-md shadow-2xl z-50 overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-150"
    >
      {loading ? (
        <div className="px-4 py-3 text-[11px] text-muted-foreground">Loading providers...</div>
      ) : (
        <>
          {localOpts.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 bg-muted/15 px-3 py-1.5 border-b border-border/10">
                <HardDrive className="h-2.5 w-2.5 text-emerald-400" />
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Local & Built-in
                </span>
              </div>
              {localOpts.map((opt) => {
                const Icon = opt.IconComponent;
                const selected = currentProvider === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => onSelect(opt.value)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-[11px] transition-colors cursor-pointer ${
                      selected ? "bg-primary/8 text-primary" : "text-foreground/80 hover:bg-accent/40"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-primary" : "text-emerald-400"}`} />
                    <span className="flex-1 text-left font-medium">{opt.label}</span>
                    {selected && <CheckCircle className="h-3 w-3 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}

          {cloudOpts.length > 0 && (
            <div className={localOpts.length > 0 ? "border-t border-border/10" : ""}>
              <div className="flex items-center gap-1.5 bg-muted/15 px-3 py-1.5 border-b border-border/10">
                <Cloud className="h-2.5 w-2.5 text-blue-400" />
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Cloud
                </span>
              </div>
              {cloudOpts.map((opt) => {
                const Icon = opt.IconComponent;
                const selected = currentProvider === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => onSelect(opt.value)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-[11px] transition-colors cursor-pointer ${
                      selected ? "bg-primary/8 text-primary" : "text-foreground/80 hover:bg-accent/40"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-primary" : "text-blue-400"}`} />
                    <span className="flex-1 text-left font-medium">{opt.label}</span>
                    {selected && <CheckCircle className="h-3 w-3 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}

          {localOpts.length === 0 && cloudOpts.length === 0 && (
            <p className="px-4 py-3 text-[10px] text-muted-foreground/60">
              No providers available — configure in Settings
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── LLM Provider + Model Picker (single interaction, opens upward) ───
// Shows verified providers, loads models inline when provider is picked.
// User selects provider → models load → user picks model → dropdown closes.

const EMBEDDING_PATTERNS = [
  "embed", "all-minilm", "nomic-embed", "bge-",
  "text-embedding", "snowflake-arctic", "jina-embedding",
];

function LLMPickerDropdown({
  currentProvider,
  currentModel,
  onApply,
  onClose,
}: {
  currentProvider: string;
  currentModel: string;
  onApply: (provider: string, model: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const verifiedProviders = useConfigStore((s) => s.verifiedCloudProviders);

  // Internal state: pending provider (may differ from active while browsing)
  const [pendingProvider, setPendingProvider] = useState(currentProvider);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Load models when pending provider changes
  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    setModels([]);
    (async () => {
      try {
        const { listModels } = await import("../lib/ipc");
        const key = await getApiKey(pendingProvider).catch(() => null);
        const config = JSON.stringify({
          provider_type: pendingProvider,
          ...(key && { api_key: key }),
        });
        const modelList = await listModels(config);
        if (cancelled) return;
        const chatModels = modelList.filter(
          (m: { id: string }) => !EMBEDDING_PATTERNS.some((p) => m.id.toLowerCase().includes(p))
        );
        setModels(chatModels.map((m: { id: string; name?: string }) => ({ id: m.id, name: m.name || m.id })));
      } catch {
        if (!cancelled) setModels([]);
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pendingProvider]);

  // Click outside / Escape to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Only show verified/ready providers
  const available = LLM_PROVIDER_OPTIONS.filter((o) => {
    if (o.value === "custom") return false;
    if (o.requiresKey) return verifiedProviders.includes(o.value);
    return verifiedProviders.includes(o.value); // Local also needs verification
  });
  // Fallback: always include the current active provider
  if (!available.some((o) => o.value === currentProvider)) {
    const opt = LLM_PROVIDER_OPTIONS.find((o) => o.value === currentProvider);
    if (opt) available.unshift(opt);
  }

  const localOpts = available.filter((o) => o.isLocal);
  const cloudOpts = available.filter((o) => !o.isLocal);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 min-w-[240px] rounded-xl border border-border/30 bg-popover/95 backdrop-blur-md shadow-2xl z-50 overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-150"
    >
      {/* ── Provider section ── */}
      {localOpts.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 bg-muted/15 px-3 py-1.5 border-b border-border/10">
            <HardDrive className="h-2.5 w-2.5 text-emerald-400" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Local</span>
          </div>
          {localOpts.map((opt) => {
            const Icon = opt.IconComponent;
            const isPending = pendingProvider === opt.value;
            const isActive = currentProvider === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setPendingProvider(opt.value)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-[11px] transition-colors cursor-pointer ${
                  isPending ? "bg-primary/8 text-primary" : "text-foreground/80 hover:bg-accent/40"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${isPending ? "text-primary" : "text-emerald-400"}`} />
                <span className="flex-1 text-left font-medium">{opt.label}</span>
                {isActive && <span className="text-[9px] text-primary/80">active</span>}
              </button>
            );
          })}
        </div>
      )}

      {cloudOpts.length > 0 && (
        <div className={localOpts.length > 0 ? "border-t border-border/10" : ""}>
          <div className="flex items-center gap-1.5 bg-muted/15 px-3 py-1.5 border-b border-border/10">
            <Cloud className="h-2.5 w-2.5 text-blue-400" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Cloud</span>
          </div>
          {cloudOpts.map((opt) => {
            const Icon = opt.IconComponent;
            const isPending = pendingProvider === opt.value;
            const isActive = currentProvider === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setPendingProvider(opt.value)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-[11px] transition-colors cursor-pointer ${
                  isPending ? "bg-primary/8 text-primary" : "text-foreground/80 hover:bg-accent/40"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${isPending ? "text-primary" : "text-blue-400"}`} />
                <span className="flex-1 text-left font-medium">{opt.label}</span>
                {isActive && <span className="text-[9px] text-primary/80">active</span>}
              </button>
            );
          })}
        </div>
      )}

      {available.length === 0 && (
        <div className="px-4 py-3 text-[10px] text-muted-foreground/60">
          No verified providers — test connection in Settings first
        </div>
      )}

      {/* ── Model section (for pending provider) ── */}
      <div className="border-t border-border/10">
        <div className="flex items-center gap-1.5 bg-muted/15 px-3 py-1.5 border-b border-border/10">
          <Brain className="h-2.5 w-2.5 text-violet-400" />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Model — {LLM_LABELS[pendingProvider] || pendingProvider}
          </span>
          {modelsLoading && (
            <span className="text-[9px] text-muted-foreground/60 animate-pulse ml-auto">loading...</span>
          )}
        </div>
        {models.length > 0 ? (
          <div className="max-h-[160px] overflow-y-auto">
            {models.map((m) => {
              const isCurrentModel = currentProvider === pendingProvider && currentModel === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onApply(pendingProvider, m.id)}
                  className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-[11px] transition-colors cursor-pointer ${
                    isCurrentModel ? "bg-primary/8 text-primary" : "text-foreground/80 hover:bg-accent/40"
                  }`}
                >
                  <span className="flex-1 text-left font-medium truncate">{formatModel(m.id)}</span>
                  {isCurrentModel && <CheckCircle className="h-3 w-3 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        ) : !modelsLoading ? (
          <div className="px-3 py-2 text-[10px] text-muted-foreground/60">
            No models available
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Divider ─────────────────────────────────────────────────────────

function Divider() {
  return <div className="h-4 w-px shrink-0 bg-border/15" />;
}
