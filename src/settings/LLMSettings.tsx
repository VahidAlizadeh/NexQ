import { useState, useEffect, useCallback } from "react";
import { useConfigStore } from "../stores/configStore";
import {
  getLLMProviders,
  setLLMProvider,
  listModels,
  setActiveModel,
  testLLMConnection,
  storeApiKey,
  getApiKey,
} from "../lib/ipc";
import type { LLMProviderType, ModelInfo } from "../lib/types";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
  Wifi,
  Server,
  Cloud,
  Settings2,
  Zap,
} from "lucide-react";
import { hasApiKey } from "../lib/ipc";

interface ProviderInfo {
  type: LLMProviderType;
  name: string;
  base_url: string;
  requires_api_key: boolean;
  is_local: boolean;
}

type ConnectionStatus = "idle" | "testing" | "success" | "error";

const PROVIDER_DISPLAY: Record<
  LLMProviderType,
  { label: string; description: string }
> = {
  ollama: { label: "Ollama", description: "Local models via Ollama" },
  lm_studio: { label: "LM Studio", description: "Local models via LM Studio" },
  openai: { label: "OpenAI", description: "GPT-4o, GPT-4, etc." },
  anthropic: { label: "Anthropic", description: "Claude Sonnet, Opus, Haiku" },
  groq: { label: "Groq", description: "Ultra-fast inference" },
  gemini: { label: "Google Gemini", description: "Gemini Pro, Flash" },
  openrouter: { label: "OpenRouter", description: "Multi-provider gateway" },
  custom: { label: "Custom", description: "Your own endpoint" },
};

// Filter out known embedding-only models from model lists (e.g., all-minilm, nomic-embed)
const EMBEDDING_ONLY_PATTERNS = [
  "all-minilm", "mxbai-embed", "nomic-embed", "bge-",
  "text-embedding", "snowflake-arctic-embed", "jina-embeddings",
];

function filterChatModels(models: ModelInfo[]): ModelInfo[] {
  return models.filter(
    (m) => !EMBEDDING_ONLY_PATTERNS.some((p) => m.id.toLowerCase().includes(p))
  );
}

export function LLMSettings() {
  const llmProvider = useConfigStore((s) => s.llmProvider);
  const llmModel = useConfigStore((s) => s.llmModel);
  const setConfigProvider = useConfigStore((s) => s.setLLMProvider);
  const setConfigModel = useConfigStore((s) => s.setLLMModel);

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] =
    useState<LLMProviderType>(llmProvider);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState(llmModel);
  const [apiKey, setApiKeyValue] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");

  // Custom provider fields
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [customAuthType, setCustomAuthType] = useState<
    "none" | "bearer" | "api_key"
  >("none");
  const [customAuthValue, setCustomAuthValue] = useState("");

  // Key status for badges
  const [keyStatusMap, setKeyStatusMap] = useState<Record<string, boolean>>({});

  // Check which providers have stored API keys
  useEffect(() => {
    async function checkAllKeys() {
      const cloudProviders = ["openai", "anthropic", "groq", "gemini", "openrouter"];
      const status: Record<string, boolean> = {};
      // Local providers always ready
      status["ollama"] = true;
      status["lm_studio"] = true;
      for (const p of cloudProviders) {
        try {
          status[p] = await hasApiKey(p);
        } catch {
          status[p] = false;
        }
      }
      setKeyStatusMap(status);
    }
    checkAllKeys();
  }, []);

  // Load available providers
  useEffect(() => {
    let mounted = true;
    getLLMProviders()
      .then((providerList) => {
        if (!mounted) return;
        // providerList can be either string[] or ProviderInfo[]
        if (
          providerList.length > 0 &&
          typeof providerList[0] === "object"
        ) {
          setProviders(providerList as unknown as ProviderInfo[]);
        } else {
          // Old format: array of type strings
          const infos: ProviderInfo[] = (providerList as string[]).map(
            (p) => ({
              type: p as LLMProviderType,
              name: PROVIDER_DISPLAY[p as LLMProviderType]?.label || p,
              base_url: "",
              requires_api_key: [
                "openai",
                "anthropic",
                "groq",
                "gemini",
                "openrouter",
              ].includes(p),
              is_local: ["ollama", "lm_studio"].includes(p),
            })
          );
          setProviders(infos);
        }
      })
      .catch(() => {
        // Fall back to default list
        if (!mounted) return;
        const defaults: LLMProviderType[] = [
          "ollama",
          "lm_studio",
          "openai",
          "anthropic",
          "groq",
          "gemini",
          "openrouter",
          "custom",
        ];
        setProviders(
          defaults.map((p) => ({
            type: p,
            name: PROVIDER_DISPLAY[p]?.label || p,
            base_url: "",
            requires_api_key: [
              "openai",
              "anthropic",
              "groq",
              "gemini",
              "openrouter",
            ].includes(p),
            is_local: ["ollama", "lm_studio"].includes(p),
          }))
        );
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Load API key when provider changes
  useEffect(() => {
    if (
      ["openai", "anthropic", "groq", "gemini", "openrouter"].includes(
        selectedProvider
      )
    ) {
      getApiKey(selectedProvider)
        .then((key) => {
          setApiKeyValue(key || "");
        })
        .catch(() => setApiKeyValue(""));
    } else {
      setApiKeyValue("");
    }
    setConnectionStatus("idle");
    setConnectionMessage("");
    setModels([]);
    setModelsError("");
  }, [selectedProvider]);

  // Build the provider config JSON for backend calls
  const buildProviderConfig = useCallback(() => {
    const config: Record<string, unknown> = {
      provider_type: selectedProvider,
    };

    if (apiKey) {
      config.api_key = apiKey;
    }

    if (selectedProvider === "custom") {
      if (customBaseUrl) config.base_url = customBaseUrl;
      if (customAuthType !== "none") {
        config.auth_type = customAuthType;
        config.auth_value = customAuthValue;
      }
    }

    return JSON.stringify(config);
  }, [selectedProvider, apiKey, customBaseUrl, customAuthType, customAuthValue]);

  // Handle provider change
  const handleProviderChange = async (provider: LLMProviderType) => {
    setSelectedProvider(provider);
    setSelectedModel("");
    setModels([]);
    setConnectionStatus("idle");
    setConnectionMessage("");
    setModelsError("");
  };

  // Save API key
  const handleSaveApiKey = async () => {
    if (!apiKey) return;
    try {
      await storeApiKey(selectedProvider, apiKey);
      setKeyStatusMap((prev) => ({ ...prev, [selectedProvider]: true }));
    } catch {
      // Silently handle - key will still be used for this session
    }
  };

  // Test connection
  const handleTestConnection = async () => {
    setConnectionStatus("testing");
    setConnectionMessage("");

    try {
      // Save API key first if present
      if (apiKey) {
        await storeApiKey(selectedProvider, apiKey).catch(() => {});
      }

      const configJson = buildProviderConfig();
      const success = await testLLMConnection(configJson);

      if (success) {
        setConnectionStatus("success");
        setConnectionMessage("Connected successfully");
        // Also set the provider in the backend
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
  };

  // Load models
  const handleLoadModels = async () => {
    setModelsLoading(true);
    setModelsError("");
    setModels([]);

    try {
      // Save API key first if present
      if (apiKey) {
        await storeApiKey(selectedProvider, apiKey).catch(() => {});
      }

      const configJson = buildProviderConfig();
      // Set provider first to ensure it's configured
      await setLLMProvider(configJson).catch(() => {});
      setConfigProvider(selectedProvider);

      const modelList = await listModels(configJson);
      const chatModels = filterChatModels(modelList);
      setModels(chatModels);

      if (chatModels.length === 0) {
        setModelsError(
          modelList.length > 0
            ? "No chat models found (embedding-only models filtered)"
            : "No models found"
        );
      }
    } catch (err) {
      setModelsError(
        err instanceof Error ? err.message : "Failed to load models"
      );
    } finally {
      setModelsLoading(false);
    }
  };

  // Handle model selection
  const handleModelSelect = async (modelId: string) => {
    setSelectedModel(modelId);
    setConfigModel(modelId);
    try {
      await setActiveModel(selectedProvider, modelId);
    } catch {
      // Non-critical
    }
  };

  const currentProviderInfo = providers.find(
    (p) => p.type === selectedProvider
  );
  const requiresApiKey =
    currentProviderInfo?.requires_api_key ??
    ["openai", "anthropic", "groq", "gemini", "openrouter"].includes(
      selectedProvider
    );
  const isLocal =
    currentProviderInfo?.is_local ??
    ["ollama", "lm_studio"].includes(selectedProvider);
  const isCustom = selectedProvider === "custom";

  return (
    <div className="space-y-6">
      {/* Active Provider + Model Banner */}
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-5 py-3.5">
        <Zap className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            Active: {PROVIDER_DISPLAY[llmProvider]?.label || llmProvider}
            {llmModel ? ` / ${llmModel}` : " — no model selected"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {llmModel
              ? "This provider and model will be used for AI responses"
              : "Select a provider, test connection, and load models below"}
          </p>
        </div>
      </div>

      {/* Provider Selection */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Provider
        </h3>
        <div className="grid grid-cols-4 gap-2.5">
          {providers.map((p) => {
            const display = PROVIDER_DISPLAY[p.type];
            const isSelected = selectedProvider === p.type;
            const isActive = llmProvider === p.type;
            const hasKey = keyStatusMap[p.type] ?? false;
            const isReady = p.is_local || hasKey || p.type === "custom";
            return (
              <button
                key={p.type}
                onClick={() => handleProviderChange(p.type)}
                className={`relative flex flex-col items-start rounded-xl border p-3 text-left transition-all duration-150 ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/50 hover:border-border hover:bg-accent/50"
                }`}
              >
                {/* Ready / Active badge */}
                <div className="absolute -top-1 -right-1">
                  {isReady && (
                    <div
                      className={`h-2.5 w-2.5 rounded-full ring-2 ring-card ${isActive ? "bg-green-500" : "bg-green-500/40"}`}
                      title={isActive ? "Active" : "Ready"}
                    />
                  )}
                  {!isReady && p.requires_api_key && (
                    <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60 ring-2 ring-card" title="No API key" />
                  )}
                </div>
                <div className="flex w-full items-center gap-1.5">
                  {p.is_local ? (
                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : p.type === "custom" ? (
                    <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium truncate">
                    {display?.label || p.name}
                  </span>
                </div>
                <span className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">
                  {display?.description || ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* API Key Input (for cloud providers) */}
      {requiresApiKey && (
        <div className="rounded-xl border border-border/30 bg-card/50 p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            API Key
          </h3>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKeyValue(e.target.value)}
                onBlur={handleSaveApiKey}
                placeholder={`Enter ${PROVIDER_DISPLAY[selectedProvider]?.label || selectedProvider} API key`}
                className="w-full rounded-lg border border-border/50 bg-background px-3.5 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                title={showApiKey ? "Hide" : "Show"}
              >
                {showApiKey ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Stored securely in your system keychain
          </p>
        </div>
      )}

      {/* Custom Provider Config */}
      {isCustom && (
        <div className="space-y-4 rounded-xl border border-border/30 bg-card/50 p-5">
          <h3 className="text-sm font-semibold text-foreground">Custom Provider</h3>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Base URL
            </label>
            <input
              type="text"
              value={customBaseUrl}
              onChange={(e) => setCustomBaseUrl(e.target.value)}
              placeholder="http://localhost:8080/v1"
              className="w-full rounded-lg border border-border/50 bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Auth Type
              </label>
              <select
                value={customAuthType}
                onChange={(e) =>
                  setCustomAuthType(
                    e.target.value as "none" | "bearer" | "api_key"
                  )
                }
                className="w-full rounded-lg border border-border/50 bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
              >
                <option value="none">None</option>
                <option value="bearer">Bearer Token</option>
                <option value="api_key">API Key Header</option>
              </select>
            </div>
            {customAuthType !== "none" && (
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium text-foreground">
                  {customAuthType === "bearer" ? "Token" : "API Key"}
                </label>
                <input
                  type="password"
                  value={customAuthValue}
                  onChange={(e) => setCustomAuthValue(e.target.value)}
                  placeholder={
                    customAuthType === "bearer"
                      ? "Bearer token..."
                      : "API key..."
                  }
                  className="w-full rounded-lg border border-border/50 bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Local Provider Status */}
      {isLocal && (
        <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-accent/20 px-4 py-3">
          <Server className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">
            {selectedProvider === "ollama"
              ? "Requires Ollama running on localhost:11434"
              : "Requires LM Studio running on localhost:1234"}
          </span>
        </div>
      )}

      {/* Connection Test & Model Loading */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Connection</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTestConnection}
            disabled={
              connectionStatus === "testing" ||
              (requiresApiKey && !apiKey) ||
              (isCustom && !customBaseUrl)
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connectionStatus === "testing" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wifi className="h-3.5 w-3.5" />
            )}
            Test Connection
          </button>

          <button
            onClick={handleLoadModels}
            disabled={
              modelsLoading ||
              (requiresApiKey && !apiKey) ||
              (isCustom && !customBaseUrl)
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {modelsLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Load Models
          </button>

          {/* Connection status indicator */}
          {connectionStatus === "success" && (
            <div className="flex items-center gap-1 text-green-500">
              <CheckCircle className="h-3.5 w-3.5" />
              <span className="text-xs">{connectionMessage}</span>
            </div>
          )}
          {connectionStatus === "error" && (
            <div className="flex items-center gap-1 text-red-500">
              <XCircle className="h-3.5 w-3.5" />
              <span className="text-xs truncate max-w-[200px]">
                {connectionMessage}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Model Selection */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Model
        </h3>
        {models.length > 0 ? (
          <select
            value={selectedModel}
            onChange={(e) => handleModelSelect(e.target.value)}
            className="w-full rounded-lg border border-border/50 bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
          >
            <option value="">Select a model...</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.context_window
                  ? ` (${Math.round(m.context_window / 1000)}K ctx)`
                  : ""}
              </option>
            ))}
          </select>
        ) : (
          <div className="rounded-lg border border-border/30 bg-accent/20 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {modelsError
                ? modelsError
                : modelsLoading
                  ? "Loading models..."
                  : 'Click "Load Models" to fetch available models'}
            </p>
          </div>
        )}
      </div>

      {/* Make Active button */}
      {selectedProvider !== llmProvider && (
        <button
          onClick={async () => {
            try {
              if (apiKey) await storeApiKey(selectedProvider, apiKey).catch(() => {});
              const configJson = buildProviderConfig();
              await setLLMProvider(configJson);
              setConfigProvider(selectedProvider);
              if (selectedModel) {
                await setActiveModel(selectedProvider, selectedModel).catch(() => {});
                setConfigModel(selectedModel);
              }
            } catch {}
          }}
          className="w-full rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          Set {PROVIDER_DISPLAY[selectedProvider]?.label || selectedProvider} as Active Provider
        </button>
      )}
    </div>
  );
}
