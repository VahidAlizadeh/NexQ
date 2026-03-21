import { useEffect, useState } from "react";
import { listAudioDevices } from "../../lib/ipc";
import type { AudioDeviceList } from "../../lib/types";
import {
  Mic,
  Server,
  CheckCircle,
  XCircle,
  Loader2,
  Sparkles,
} from "lucide-react";

interface DetectionResult {
  audioDevices: AudioDeviceList | null;
  ollamaRunning: boolean;
  ollamaModels: string[];
  lmStudioRunning: boolean;
  lmStudioModels: string[];
}

interface WelcomeStepProps {
  onDetectionComplete: (result: DetectionResult) => void;
}

type DetectionPhase =
  | "starting"
  | "audio"
  | "ollama"
  | "lmstudio"
  | "complete";

export function WelcomeStep({ onDetectionComplete }: WelcomeStepProps) {
  const [phase, setPhase] = useState<DetectionPhase>("starting");
  const [result, setResult] = useState<DetectionResult>({
    audioDevices: null,
    ollamaRunning: false,
    ollamaModels: [],
    lmStudioRunning: false,
    lmStudioModels: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function runDetection() {
      const detection: DetectionResult = {
        audioDevices: null,
        ollamaRunning: false,
        ollamaModels: [],
        lmStudioRunning: false,
        lmStudioModels: [],
      };

      // Brief pause for the animation
      await sleep(400);
      if (cancelled) return;

      // Phase 1: Audio devices
      setPhase("audio");
      try {
        const devices = await listAudioDevices();
        detection.audioDevices = devices;
      } catch (err) {
        console.warn("[WelcomeStep] Failed to detect audio devices:", err);
      }
      if (cancelled) return;
      setResult({ ...detection });

      await sleep(300);
      if (cancelled) return;

      // Phase 2: Check Ollama
      setPhase("ollama");
      try {
        const resp = await fetch("http://localhost:11434/api/tags", {
          signal: AbortSignal.timeout(3000),
        });
        if (resp.ok) {
          const data = await resp.json();
          detection.ollamaRunning = true;
          if (data.models && Array.isArray(data.models)) {
            detection.ollamaModels = data.models.map(
              (m: { name: string }) => m.name
            );
          }
        }
      } catch {
        // Ollama not running — that's fine
      }
      if (cancelled) return;
      setResult({ ...detection });

      await sleep(300);
      if (cancelled) return;

      // Phase 3: Check LM Studio
      setPhase("lmstudio");
      try {
        const resp = await fetch("http://localhost:1234/v1/models", {
          signal: AbortSignal.timeout(3000),
        });
        if (resp.ok) {
          const data = await resp.json();
          detection.lmStudioRunning = true;
          if (data.data && Array.isArray(data.data)) {
            detection.lmStudioModels = data.data.map(
              (m: { id: string }) => m.id
            );
          }
        }
      } catch {
        // LM Studio not running — that's fine
      }
      if (cancelled) return;
      setResult({ ...detection });

      await sleep(400);
      if (cancelled) return;

      // Done
      setPhase("complete");
      onDetectionComplete(detection);
    }

    runDetection();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const inputCount = result.audioDevices?.inputs.length ?? 0;
  const outputCount = result.audioDevices?.outputs.length ?? 0;

  const phaseIndex = (
    { starting: 0, audio: 1, ollama: 2, lmstudio: 3, complete: 4 } as Record<
      DetectionPhase,
      number
    >
  )[phase];

  return (
    <div className="flex flex-col items-center text-center">
      {/* Welcome header */}
      <div className="mb-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground">
          Welcome to NexQ
        </h2>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Let's get your AI meeting assistant set up. This will only take a
          minute.
        </p>
      </div>

      {/* Detection progress */}
      <div className="w-full max-w-md space-y-3">
        {/* Audio detection */}
        <DetectionRow
          icon={<Mic className="h-4 w-4" />}
          label="Audio Devices"
          status={
            phaseIndex < 1
              ? "pending"
              : phaseIndex === 1
                ? "detecting"
                : "done"
          }
          detail={
            phaseIndex > 1
              ? `${inputCount} microphone${inputCount !== 1 ? "s" : ""}, ${outputCount} speaker${outputCount !== 1 ? "s" : ""}`
              : undefined
          }
          found={phaseIndex > 1 && (inputCount > 0 || outputCount > 0)}
        />

        {/* Ollama detection */}
        <DetectionRow
          icon={<Server className="h-4 w-4" />}
          label="Ollama (Local LLM)"
          status={
            phaseIndex < 2
              ? "pending"
              : phaseIndex === 2
                ? "detecting"
                : "done"
          }
          detail={
            phaseIndex > 2
              ? result.ollamaRunning
                ? `Running with ${result.ollamaModels.length} model${result.ollamaModels.length !== 1 ? "s" : ""}`
                : "Not detected"
              : undefined
          }
          found={phaseIndex > 2 && result.ollamaRunning}
        />

        {/* LM Studio detection */}
        <DetectionRow
          icon={<Server className="h-4 w-4" />}
          label="LM Studio (Local LLM)"
          status={
            phaseIndex < 3
              ? "pending"
              : phaseIndex === 3
                ? "detecting"
                : "done"
          }
          detail={
            phaseIndex > 3
              ? result.lmStudioRunning
                ? `Running with ${result.lmStudioModels.length} model${result.lmStudioModels.length !== 1 ? "s" : ""}`
                : "Not detected"
              : undefined
          }
          found={phaseIndex > 3 && result.lmStudioRunning}
        />
      </div>

      {/* Summary */}
      {phase === "complete" && (
        <div className="mt-8 w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="rounded-xl border border-border/40 bg-secondary/20 px-5 py-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {result.ollamaRunning || result.lmStudioRunning ? (
                <span className="text-success">
                  Local LLM detected! You can use AI features without an
                  internet connection.
                </span>
              ) : (
                <span>
                  No local LLM found. You can configure a cloud provider in the
                  next steps, or install Ollama later.
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DetectionRow({
  icon,
  label,
  status,
  detail,
  found,
}: {
  icon: React.ReactNode;
  label: string;
  status: "pending" | "detecting" | "done";
  detail?: string;
  found?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-xl border px-5 py-4 transition-all duration-300 ${
        status === "detecting"
          ? "border-primary/40 bg-primary/5 shadow-sm shadow-primary/5"
          : status === "done"
            ? "border-border/40 bg-secondary/20"
            : "border-border/20 bg-secondary/5 opacity-50"
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/50 text-muted-foreground">
        {icon}
      </div>
      <div className="flex-1 text-left">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {detail && (
          <p className="text-xs text-muted-foreground">{detail}</p>
        )}
      </div>
      <div className="shrink-0">
        {status === "pending" && (
          <div className="h-4 w-4 rounded-full border-2 border-border/30" />
        )}
        {status === "detecting" && (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
        {status === "done" &&
          (found ? (
            <CheckCircle className="h-4 w-4 text-success" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground/50" />
          ))}
      </div>
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
