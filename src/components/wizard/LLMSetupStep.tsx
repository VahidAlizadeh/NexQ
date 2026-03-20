import { useState, useEffect, useCallback } from "react";
import { useConfigStore } from "../../stores/configStore";
import {
  listModels,
  setLLMProvider,
  setActiveModel,
  storeApiKey,
  testLLMConnection,
} from "../../lib/ipc";
import type { LLMProviderType, ModelInfo } from "../../lib/types";
import {
  Server,
  Cloud,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
  Zap,
  Brain,
  RefreshCw,
} from "lucide-react";

interface LLMSetupStepProps {
  ollamaRunning: boolean;
  ollamaModels: string[];
  lmStudioRunning: boolean;
  lmStudioModels: string[];
}

type ConnectionStatus = "idle" | "testing" | "success" | "error";

interface ProviderCard {
  type: LLMProviderType;
  label: string;
  description: string;
  icon: React.ReactNode;
  recommended?: boolean;
  requiresKey: boolean;
}

const CLOUD_PROVIDERS: ProviderCard[] = [
  {
    type: "anthropic",
    label: "Anthropic",
    description: "Claude Sonnet, Opus, Haiku",
    icon: <Brain className="h-5 w-5" />,
    recommended: true,
    requiresKey: true,
  },
  {
    type: "openai",
    label: "OpenAI",
    description: "GPT-4o, GPT-4, etc.",
    icon: <Sparkles className="h-5 w-5" />,
    requiresKey: true,
  },
  {
    type: "groq",
    label: "Groq",
    description: "Ultra-fast inference",
    icon: <Zap className="h-5 w-5" />,
    requiresKey: true,
  },
];

export function LLMSetupStep({
  ollamaRunning,
  ollamaModels,
  lmStudioRunning,
  lmStudioModels,
}: LLMSetupStepProps) {
  const llmProvider = useConfigStore((s) => s.llmProvider);
  const llmModel = useConfigStore((s) => s.llmModel);
  const setConfigProvider = useConfigStore((s) => s.setLLMProvider);
  const setConfigModel = useConfigStore((s) => s.setLLMModel);

  const hasLocalLLM = ollamaRunning || lmStudioRunning;

  const [selectedProvider, setSelectedProvider] = useState<LLMProviderType>(
    hasLocalLLM
      ? ollamaRunning
        ? "ollama"
        : "lm_studio"
      : "anthropic"
  );
  const [selectedModel, setSelectedModel] = useState(llmModel || "");
  const [apiKey, setApiKeyValue] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Auto-load models for local providers
  useEffect(() => {
    if (selectedProvider === "ollama" && ollamaRunning) {
      handleLoadModels();
    } else if (selectedProvider === "lm_studio" && lmStudioRunning) {
      handleLoadModels();
    }
  }, [selectedProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  const requiresApiKey = ["openai", "anthropic", "groq", "gemini", "openrouter"].includes(
    selectedProvider
  );

  const buildProviderConfig = useCallback(() => {
    const config: Record<string, unknown> = {
      provider_type: selectedProvider,
    };
    if (apiKey) config.api_key = apiKey;
    return JSON.stringify(config);
  }, [selectedProvider, apiKey]);

  async function handleProviderSelect(provider: LLMProviderType) {
    setSelectedProvider(provider);
    setSelectedModel("");
    setModels([]);
    setConnectionStatus("idle");
    setConnectionMessage("");
  }

  async function handleLoadModels() {
    setModelsLoading(true);
    setModels([]);
    try {
      if (apiKey) {
        await storeApiKey(selectedProvider, apiKey).catch(() => {});
      }
      const configJson = buildProviderConfig();
      await setLLMProvider(configJson).catch(() => {});
      const modelList = await listModels(configJson);
      setModels(modelList);
    } catch (err) {
      console.warn("[LLMSetupStep] Failed to load models:", err);
    } finally {
      setModelsLoading(false);
    }
  }

  async function handleTestConnection() {
    setConnectionStatus("testing");
    setConnectionMessage("");
    try {
      if (apiKey) {
        await storeApiKey(selectedProvider, apiKey).catch(() => {});
      }
      const configJson = buildProviderConfig();
      const success = await testLLMConnection(configJson);
      if (success) {
        setConnectionStatus("success");
        setConnectionMessage("Connected successfully");
        await setLLMProvider(configJson).catch(() => {});
        setConfigProvider(selectedProvider);
      } else {
        setConnectionStatus("error");
        setConnectionMessage("Connection failed");
      }
    } catch (err) {
      setConnectionStatus("error");
      setConnectionMessage(
        err instanceof Error ? err.message : "Connection failed"
      );
    }
  }

  async function handleModelSelect(modelId: string) {
    setSelectedModel(modelId);
    setConfigModel(modelId);
    setConfigProvider(selectedProvider);
    try {
      await setActiveModel(selectedProvider, modelId);
    } catch {
      // Non-critical
    }
  }

  async function handleSaveApiKey() {
    if (!apiKey) return;
    try {
      await storeApiKey(selectedProvider, apiKey);
    } catch {
      // Silently handle
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 shadow-md shadow-primary/10">
          <Brain className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">LLM Configuration</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Choose an AI model to power your meeting assistant.
        </p>
      </div>

      <div className="w-full max-w-lg space-y-6">
        {/* Local LLM Detection Banner */}
        {hasLocalLLM && (
          <div className="rounded-xl border border-green-500/25 bg-green-500/5 px-5 py-4">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-green-500" />
              <p className="text-sm font-medium text-green-400">
                Local LLM Detected
              </p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {ollamaRunning &&
                `Ollama is running with ${ollamaModels.length} model${ollamaModels.length !== 1 ? "s" : ""}. `}
              {lmStudioRunning &&
                `LM Studio is running with ${lmStudioModels.length} model${lmStudioModels.length !== 1 ? "s" : ""}. `}
              Your data stays on your machine.
            </p>
          </div>
        )}

        {/* Local Provider Cards */}
        {hasLocalLLM && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Local Providers
            </p>
            <div className="grid gap-2">
              {ollamaRunning && (
                <ProviderButton
                  label="Ollama"
                  description={`${ollamaModels.length} model${ollamaModels.length !== 1 ? "s" : ""} available`}
                  icon={<Server className="h-5 w-5" />}
                  selected={selectedProvider === "ollama"}
                  recommended
                  onClick={() => handleProviderSelect("ollama")}
                />
              )}
              {lmStudioRunning && (
                <ProviderButton
                  label="LM Studio"
                  description={`${lmStudioModels.length} model${lmStudioModels.length !== 1 ? "s" : ""} available`}
                  icon={<Server className="h-5 w-5" />}
                  selected={selectedProvider === "lm_studio"}
                  onClick={() => handleProviderSelect("lm_studio")}
                />
              )}
            </div>
          </div>
        )}

        {/* Cloud Provider Cards */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cloud Providers
          </p>
          <div className="grid gap-2">
            {CLOUD_PROVIDERS.map((p) => (
              <ProviderButton
                key={p.type}
                label={p.label}
                description={p.description}
                icon={p.icon}
                selected={selectedProvider === p.type}
                recommended={!hasLocalLLM && p.recommended}
                onClick={() => handleProviderSelect(p.type)}
              />
            ))}
          </div>
        </div>

        {/* API Key Input */}
        {requiresApiKey && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKeyValue(e.target.value)}
                onBlur={handleSaveApiKey}
                placeholder={`Enter your ${selectedProvider === "anthropic" ? "Anthropic" : selectedProvider === "openai" ? "OpenAI" : "Groq"} API key`}
                className="w-full rounded-xl border border-border/40 bg-background px-4 py-3 pr-11 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Stored securely in your system keychain
            </p>
          </div>
        )}

        {/* Test Connection & Load Models */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleTestConnection}
            disabled={
              connectionStatus === "testing" ||
              (requiresApiKey && !apiKey)
            }
            className="inline-flex items-center gap-2 rounded-xl border border-border/40 bg-background px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connectionStatus === "testing" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5" />
            )}
            Test Connection
          </button>
          <button
            onClick={handleLoadModels}
            disabled={modelsLoading || (requiresApiKey && !apiKey)}
            className="inline-flex items-center gap-2 rounded-xl border border-border/40 bg-background px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {modelsLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Load Models
          </button>
          {connectionStatus === "success" && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <CheckCircle className="h-3 w-3" />
              {connectionMessage}
            </span>
          )}
          {connectionStatus === "error" && (
            <span className="flex items-center gap-1 text-xs text-red-500">
              <XCircle className="h-3 w-3" />
              {connectionMessage}
            </span>
          )}
        </div>

        {/* Model Selection */}
        {models.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Select Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => handleModelSelect(e.target.value)}
              className="w-full rounded-xl border border-border/40 bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
            >
              <option value="">Choose a model...</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.context_window
                    ? ` (${Math.round(m.context_window / 1000)}K ctx)`
                    : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Recommendation */}
        <div className="rounded-xl border border-border/25 bg-secondary/15 px-5 py-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Tip: </span>
            {hasLocalLLM
              ? "For privacy and speed, we recommend using Ollama with llama3.2. Your conversations never leave your machine."
              : "For the best experience, we recommend Anthropic Claude. For local privacy, install Ollama and run it before starting NexQ."}
          </p>
        </div>
      </div>
    </div>
  );
}

function ProviderButton({
  label,
  description,
  icon,
  selected,
  recommended,
  onClick,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  recommended?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-4 rounded-xl border px-5 py-4 text-left transition-all duration-150 ${
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm"
          : "border-border/40 hover:border-border/60 hover:bg-accent/20"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          selected
            ? "bg-primary/10 text-primary"
            : "bg-secondary/40 text-muted-foreground"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {recommended && (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          Recommended
        </span>
      )}
      {selected && (
        <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
      )}
    </button>
  );
}
