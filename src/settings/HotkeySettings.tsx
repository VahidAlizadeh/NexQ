import { useState, useCallback, useEffect, useRef } from "react";
import { useConfigStore } from "../stores/configStore";
import { showToast } from "../stores/toastStore";
import type { HotkeyConfig } from "../lib/types";
import { RotateCcw, Keyboard } from "lucide-react";

/** Display-friendly labels for each hotkey action */
const HOTKEY_LABELS: Record<keyof HotkeyConfig, string> = {
  toggle_assist: "Toggle AI Assist",
  start_end_meeting: "Start / End Meeting",
  show_hide: "Show / Hide Overlay",
  open_settings: "Open Settings",
  escape: "Escape / Cancel",
  mode_assist: "Mode: Assist",
  mode_say: "Mode: What to Say",
  mode_shorten: "Mode: Shorten",
  mode_followup: "Mode: Follow-Up",
  mode_recap: "Mode: Recap",
  mode_ask: "Mode: Ask Question",
};

const DEFAULT_HOTKEYS: HotkeyConfig = {
  toggle_assist: "Space",
  start_end_meeting: "Ctrl+M",
  show_hide: "Ctrl+B",
  open_settings: "Ctrl+,",
  escape: "Escape",
  mode_assist: "Space",
  mode_say: "Ctrl+1",
  mode_shorten: "Ctrl+2",
  mode_followup: "Ctrl+3",
  mode_recap: "Ctrl+4",
  mode_ask: "Ctrl+5",
};

/**
 * Convert a keyboard event to a human-readable shortcut string like "Ctrl+Shift+K".
 */
function keyEventToString(e: KeyboardEvent): string | null {
  // Ignore standalone modifier keys
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
    return null;
  }

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  // Normalize the key name
  let key = e.key;
  if (key === " ") key = "Space";
  else if (key === ",") key = ",";
  else if (key === "Escape") key = "Escape";
  else if (key.length === 1) key = key.toUpperCase();

  parts.push(key);
  return parts.join("+");
}

export function HotkeySettings() {
  const hotkeys = useConfigStore((s) => s.hotkeys);
  const setHotkeys = useConfigStore((s) => s.setHotkeys);

  const [editingKey, setEditingKey] = useState<keyof HotkeyConfig | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const listenerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // When a row is clicked for rebinding, listen for the next key combo
  useEffect(() => {
    if (!editingKey) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const combo = keyEventToString(e);
      if (!combo) return; // pure modifier press, keep waiting

      // Check for conflicts with other bindings
      const conflictingAction = (
        Object.entries(hotkeys) as [keyof HotkeyConfig, string][]
      ).find(
        ([action, binding]) => binding === combo && action !== editingKey
      );

      if (conflictingAction) {
        setConflict(
          `"${combo}" is already used by "${HOTKEY_LABELS[conflictingAction[0]]}"`
        );
        // Still set it -- user was warned, and they can fix the other one
      } else {
        setConflict(null);
      }

      const updated: HotkeyConfig = { ...hotkeys, [editingKey]: combo };
      setHotkeys(updated);
      setEditingKey(null);
      showToast(`Hotkey updated: ${HOTKEY_LABELS[editingKey]} = ${combo}`, "success");
    };

    listenerRef.current = handler;
    window.addEventListener("keydown", handler, { capture: true });

    return () => {
      window.removeEventListener("keydown", handler, { capture: true });
      listenerRef.current = null;
    };
  }, [editingKey, hotkeys, setHotkeys]);

  const handleRowClick = useCallback((action: keyof HotkeyConfig) => {
    setConflict(null);
    setEditingKey(action);
  }, []);

  const handleResetDefaults = useCallback(() => {
    setHotkeys(DEFAULT_HOTKEYS);
    setEditingKey(null);
    setConflict(null);
    showToast("Hotkeys reset to defaults", "info");
  }, [setHotkeys]);

  const handleCancelEdit = useCallback(() => {
    setEditingKey(null);
    setConflict(null);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-border/30 bg-card/50 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Keyboard Shortcuts
            </h3>
          </div>
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Reset all hotkeys to defaults"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to Defaults
          </button>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          Click on any binding to change it, then press your desired key combination.
        </p>
      </div>

      {/* Conflict warning */}
      {conflict && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-400">
          {conflict}
        </div>
      )}

      {/* Hotkey table */}
      <div className="overflow-hidden rounded-xl border border-border/30 bg-card/50">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/20 bg-secondary/20">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Action
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Binding
              </th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(HOTKEY_LABELS) as (keyof HotkeyConfig)[]).map(
              (action, idx, arr) => {
                const isEditing = editingKey === action;
                const binding = hotkeys[action] || DEFAULT_HOTKEYS[action];
                return (
                  <tr
                    key={action}
                    onClick={() => handleRowClick(action)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowClick(action);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Change hotkey for ${HOTKEY_LABELS[action]}, currently ${binding}`}
                    className={`cursor-pointer transition-colors duration-100 ${
                      isEditing
                        ? "bg-primary/10"
                        : "hover:bg-accent/50"
                    } ${idx < arr.length - 1 ? "border-b border-border/10" : ""}`}
                  >
                    <td className="px-4 py-2.5 text-foreground/80">
                      {HOTKEY_LABELS[action]}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEditing ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="animate-pulse rounded-lg bg-primary/20 px-2.5 py-1 font-mono text-primary">
                            Press a key...
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEdit();
                            }}
                            className="rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <kbd className="rounded-lg bg-secondary/60 px-2 py-1 font-mono text-[11px] text-foreground">
                          {binding}
                        </kbd>
                      )}
                    </td>
                  </tr>
                );
              }
            )}
          </tbody>
        </table>
      </div>

      {/* Info */}
      <p className="text-[11px] text-muted-foreground/50">
        Changes are saved automatically. Global shortcuts require Ctrl or Cmd modifier.
      </p>
    </div>
  );
}
