import { useCallback, useEffect, useState } from "react";
import { useMeetingStore } from "../stores/meetingStore";
import { useCallLogStore } from "../stores/callLogStore";
import { useAIActionsStore } from "../stores/aiActionsStore";
import { showToast } from "../stores/toastStore";
import { TranscriptPanel } from "./TranscriptPanel";
import { QuestionDetector } from "./QuestionDetector";
import { AIResponsePanel } from "./AIResponsePanel";
import { ModeButtons } from "./ModeButtons";
import { AskInput } from "./AskInput";
import { ServiceStatusBar } from "../components/ServiceStatusBar";
import { DevLogPanel } from "../components/DevLogPanel";
import {
  GripHorizontal,
  Minus,
  Settings,
  Square,
  Activity,
  Terminal,
} from "lucide-react";
import { formatDuration } from "../lib/utils";

// ════════════════════════════════════════════════════════════════
export function OverlayView() {
  const activeMeeting = useMeetingStore((s) => s.activeMeeting);
  const isRecording = useMeetingStore((s) => s.isRecording);
  const elapsedMs = useMeetingStore((s) => s.elapsedMs);
  const endMeetingFlow = useMeetingStore((s) => s.endMeetingFlow);
  const setCurrentView = useMeetingStore((s) => s.setCurrentView);
  const [askInputVisible, setAskInputVisible] = useState(false);
  const [devLogOpen, setDevLogOpen] = useState(false);
  const toggleLog = useCallLogStore((s) => s.toggleOpen);
  const logOpen = useCallLogStore((s) => s.isOpen);
  const autoTrigger = useAIActionsStore((s) => s.configs.globalDefaults.autoTrigger);

  const handleEndMeeting = useCallback(async () => {
    try { await endMeetingFlow(); showToast("Meeting ended", "info"); }
    catch (err) { showToast(err instanceof Error ? err.message : "Couldn't end meeting", "error"); }
  }, [endMeetingFlow]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        e.preventDefault();
        setDevLogOpen((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const meetingTitle = activeMeeting?.title || "NexQ";

  return (
    <div className="overlay-bg flex h-full flex-col rounded-xl border border-border/20 shadow-xl">

      {/* ═══ HEADER ═══ */}
      <div
        className="no-select flex items-center justify-between gap-3 px-4 py-2 cursor-move"
        data-tauri-drag-region
        style={{ borderBottom: "1px solid hsl(var(--border) / 0.12)" }}
      >
        <div className="flex items-center gap-2.5" data-tauri-drag-region>
          <GripHorizontal className="h-3 w-3 text-muted-foreground/40" />
          <span className="text-xs font-semibold text-foreground/90 truncate max-w-[160px]" title={meetingTitle}>
            {meetingTitle}
          </span>
          {isRecording && (
            <div className="flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-0.5 ring-1 ring-destructive/10" role="status" aria-label="Recording in progress">
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-destructive opacity-50" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" /></span>
              <span className="text-meta font-semibold text-destructive tracking-wide">REC</span>
            </div>
          )}
          <span className="text-xs text-muted-foreground/60 tabular-nums font-medium">
            {elapsedMs > 0 ? formatDuration(elapsedMs) : "00:00"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <HeaderBtn icon={<Activity className="h-3.5 w-3.5" />} active={logOpen} onClick={toggleLog} tooltip="AI Call Log" />
          <HeaderBtn icon={<Terminal className="h-3.5 w-3.5" />} active={devLogOpen} onClick={() => setDevLogOpen(p => !p)} tooltip="Dev Log (Ctrl+Shift+L)" />
          <HeaderBtn icon={<Settings className="h-3.5 w-3.5" />} onClick={() => setCurrentView("settings")} tooltip="Settings" />
          <HeaderBtn icon={<Minus className="h-3.5 w-3.5" />} onClick={() => setCurrentView("launcher")} tooltip="Minimize to Dashboard" />
          <button
            onClick={handleEndMeeting}
            className="ml-1.5 flex items-center gap-1.5 rounded-lg bg-destructive/12 border border-destructive/20 px-3 py-1.5 text-xs font-semibold text-destructive transition-all duration-150 hover:bg-destructive/25 hover:border-destructive/35 hover:shadow-sm hover:shadow-destructive/10 cursor-pointer"
            aria-label="End meeting"
          >
            <Square className="h-3 w-3 fill-current" aria-hidden="true" />
            End
          </button>
        </div>
      </div>

      {/* ═══ MAIN ═══ */}
      <div className="flex flex-1 flex-wrap gap-2.5 overflow-hidden px-3 py-2.5">

        {/* ── LEFT: TRANSCRIPT ── */}
        <div className="flex min-w-[180px] flex-1 basis-[220px] flex-col overflow-hidden rounded-xl border border-border/10 bg-card/25">
          <div className="flex items-center border-b border-border/8 px-3 py-1.5">
            <span className="text-meta font-semibold uppercase tracking-wider text-muted-foreground/60">Transcript</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2.5">
            <TranscriptPanel />
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className="flex min-w-[180px] flex-1 basis-[220px] flex-col gap-2.5">
          {/* Question detector — only shown when auto-trigger is on */}
          {autoTrigger && (
            <div className="shrink-0 rounded-xl border border-info/12 bg-info/[0.04] px-4 py-3">
              <QuestionDetector />
            </div>
          )}

          {/* AI Response */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/10 bg-card/25">
            <div className="flex items-center gap-1 border-b border-border/8 px-2.5 py-1.5">
              <ModeButtons />
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <AIResponsePanel />
            </div>
          </div>
        </div>
      </div>

      {/* Ask input */}
      {askInputVisible && (
        <div className="border-t border-border/12 px-3 py-1.5 slide-down-enter">
          <AskInput visible={askInputVisible} onClose={() => setAskInputVisible(false)} />
        </div>
      )}

      {/* DevLog panel */}
      <DevLogPanel open={devLogOpen} onClose={() => setDevLogOpen(false)} />

      {/* ═══ FOOTER: Service Status ═══ */}
      <div className="border-t border-border/15">
        <ServiceStatusBar compact />
      </div>
    </div>
  );
}

// ── Header Button ──
function HeaderBtn({ icon, active, onClick, tooltip }: { icon: React.ReactNode; active?: boolean; onClick: () => void; tooltip: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg p-2 transition-all duration-150 cursor-pointer ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground/60 hover:bg-accent/60 hover:text-foreground"
      }`}
      aria-label={tooltip}
      aria-pressed={active}
    >
      {icon}
    </button>
  );
}


