import {
  Mic,
  Keyboard,
  Rocket,
  ArrowRight,
  FileText,
  CheckCircle,
  Volume2,
  Globe,
} from "lucide-react";
import { useConfigStore } from "../../stores/configStore";

interface ReadyStepProps {
  onStartMeeting: () => void;
  onGoToLauncher: () => void;
  onOpenContext: () => void;
}

function useShortcuts() {
  const hotkeys = useConfigStore((s) => s.hotkeys);
  return [
    { keys: hotkeys.toggle_assist, action: "Trigger AI Assist", context: "During meeting" },
    { keys: hotkeys.start_end_meeting, action: "Start / End meeting", context: "Global" },
    { keys: hotkeys.show_hide, action: "Show / Hide overlay", context: "Global" },
    { keys: hotkeys.mode_say, action: "What to Say mode", context: "During meeting" },
    { keys: hotkeys.mode_shorten, action: "Shorten mode", context: "During meeting" },
    { keys: hotkeys.mode_followup, action: "Follow-up mode", context: "During meeting" },
    { keys: hotkeys.mode_recap, action: "Recap mode", context: "During meeting" },
    { keys: hotkeys.mode_ask, action: "Ask Question mode", context: "During meeting" },
    { keys: hotkeys.open_settings, action: "Open Settings", context: "Global" },
    { keys: hotkeys.escape, action: "Close overlay / settings", context: "Global" },
  ];
}

export function ReadyStep({
  onStartMeeting,
  onGoToLauncher,
  onOpenContext,
}: ReadyStepProps) {
  const SHORTCUTS = useShortcuts();
  const meetingAudioConfig = useConfigStore((s) => s.meetingAudioConfig);

  return (
    <div className="flex flex-col items-center">
      {/* Success header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-green-500/10 shadow-lg shadow-green-500/10">
          <CheckCircle className="h-10 w-10 text-green-500" />
        </div>
        <h2 className="text-3xl font-bold text-foreground">
          You're All Set!
        </h2>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          NexQ is ready to be your AI meeting assistant.
        </p>
      </div>

      <div className="w-full max-w-lg space-y-6">
        {/* Configured Parties Summary */}
        {meetingAudioConfig && (
          <div className="rounded-xl border border-border/40 bg-secondary/15 p-4 space-y-2.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Audio Configuration
            </p>
            <div className="flex items-center gap-2 text-xs">
              <Mic className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium text-foreground">You:</span>
              <span className="text-muted-foreground">
                {meetingAudioConfig.you.stt_provider === "web_speech"
                  ? "Web Speech API"
                  : meetingAudioConfig.you.stt_provider.replace("_", " ")}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-foreground">Them:</span>
              <span className="text-muted-foreground">
                {meetingAudioConfig.them.stt_provider === "web_speech"
                  ? "Web Speech API"
                  : meetingAudioConfig.them.stt_provider.replace("_", " ")}
              </span>
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts Reference */}
        <div className="rounded-xl border border-border/40 bg-secondary/15 overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-border/25 px-5 py-3">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">
              Keyboard Shortcuts
            </p>
          </div>
          <div className="max-h-52 overflow-y-auto p-1.5">
            <table className="w-full">
              <tbody>
                {SHORTCUTS.map((s) => (
                  <tr
                    key={s.keys}
                    className="group border-b border-border/10 last:border-0"
                  >
                    <td className="px-3 py-1.5">
                      <kbd className="inline-flex items-center rounded border border-border/50 bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                        {s.keys}
                      </kbd>
                    </td>
                    <td className="px-2 py-1.5 text-xs text-foreground">
                      {s.action}
                    </td>
                    <td className="px-3 py-1.5 text-right text-[10px] text-muted-foreground/60">
                      {s.context}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {/* Primary: Start Meeting */}
          <button
            onClick={onStartMeeting}
            className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-primary to-primary/85 px-6 py-4 text-base font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.01] active:scale-[0.99]"
          >
            <Mic className="h-5 w-5" />
            Start Meeting
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* Secondary: Go to Launcher */}
          <button
            onClick={onGoToLauncher}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-border/40 bg-secondary/20 px-6 py-3.5 text-sm font-semibold text-foreground transition-all duration-200 hover:bg-secondary/40"
          >
            <Rocket className="h-4 w-4 text-muted-foreground" />
            Go to Launcher
          </button>
        </div>

        {/* Upload Resume Link */}
        <div className="text-center">
          <button
            onClick={onOpenContext}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            <FileText className="h-3.5 w-3.5" />
            Upload your resume for personalized responses
          </button>
        </div>
      </div>
    </div>
  );
}
