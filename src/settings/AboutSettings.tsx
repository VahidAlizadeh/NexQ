import { Mic, ExternalLink } from "lucide-react";

const shortcuts = [
  { keys: "Space", action: "Generate AI Assist", context: "During meeting" },
  { keys: "Ctrl+M", action: "Start / End meeting", context: "Global" },
  { keys: "Ctrl+B", action: "Show / Hide overlay", context: "Global" },
  { keys: "Ctrl+,", action: "Open Settings", context: "Global" },
  { keys: "Escape", action: "Close settings / Cancel", context: "Global" },
  { keys: "Ctrl+1", action: "What to Say mode", context: "During meeting" },
  { keys: "Ctrl+2", action: "Shorten mode", context: "During meeting" },
  { keys: "Ctrl+3", action: "Follow-Up mode", context: "During meeting" },
  { keys: "Ctrl+4", action: "Recap mode", context: "During meeting" },
  { keys: "Ctrl+5", action: "Ask Question mode", context: "During meeting" },
];

export function AboutSettings() {
  return (
    <div className="space-y-6">
      {/* App Info */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-6">
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <Mic className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">NexQ</h3>
            <p className="text-xs text-muted-foreground">Version 1.0.0</p>
            <p className="mt-2 text-sm text-muted-foreground">
              AI Meeting Assistant &amp; Real-Time Interview Copilot
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/50 px-3 py-1 text-[10px] font-medium text-muted-foreground">
                Built with Tauri v2
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/50 px-3 py-1 text-[10px] font-medium text-muted-foreground">
                React + Rust
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-5">
        <h4 className="mb-4 text-sm font-semibold text-primary/80">
          Keyboard Shortcuts
        </h4>
        <div className="overflow-hidden rounded-xl border border-border/30">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/20 bg-secondary/20">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Shortcut
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Action
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Context
                </th>
              </tr>
            </thead>
            <tbody>
              {shortcuts.map((shortcut, idx) => (
                <tr
                  key={shortcut.keys}
                  className={
                    idx < shortcuts.length - 1
                      ? "border-b border-border/10"
                      : ""
                  }
                >
                  <td className="px-4 py-2.5">
                    <kbd className="rounded-lg bg-secondary/60 px-2 py-1 font-mono text-[11px] text-foreground">
                      {shortcut.keys}
                    </kbd>
                  </td>
                  <td className="px-4 py-2.5 text-foreground/80">
                    {shortcut.action}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground/60">
                    {shortcut.context}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-5">
        <p className="text-xs text-muted-foreground/60 leading-relaxed">
          NexQ is an open desktop application. All processing can run locally
          with Ollama or LM Studio, or optionally connect to cloud AI providers.
        </p>
      </div>
    </div>
  );
}
