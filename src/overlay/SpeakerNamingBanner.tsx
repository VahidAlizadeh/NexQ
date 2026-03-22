// Task 14: Speaker naming prompt banner
// Shows when speakerStore.pendingNaming is set (new diarized speaker detected).
// Prompts user to name the speaker, with auto-dismiss after 10 seconds.

import { useState, useEffect, useRef } from "react";
import { useSpeakerStore } from "../stores/speakerStore";
import { UserPlus, X } from "lucide-react";

export function SpeakerNamingBanner() {
  const pendingNaming = useSpeakerStore((s) => s.pendingNaming);
  const renameSpeaker = useSpeakerStore((s) => s.renameSpeaker);
  const dismissNaming = useSpeakerStore((s) => s.dismissNaming);
  const getSpeakerDisplayName = useSpeakerStore((s) => s.getSpeakerDisplayName);

  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset input and restart auto-dismiss timer when pendingNaming changes
  useEffect(() => {
    if (!pendingNaming) return;
    setName("");
    inputRef.current?.focus();

    timerRef.current = setTimeout(() => {
      dismissNaming();
    }, 10000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pendingNaming, dismissNaming]);

  if (!pendingNaming) return null;

  const defaultName = getSpeakerDisplayName(pendingNaming);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      renameSpeaker(pendingNaming, trimmed);
    } else {
      dismissNaming();
    }
  };

  return (
    <div className="mx-1 mb-1.5 rounded-lg border border-purple-400/20 bg-purple-400/5 px-3 py-2 animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-2">
        <UserPlus className="h-3.5 w-3.5 shrink-0 text-purple-400" />
        <span className="text-xs text-muted-foreground/80 shrink-0">
          New speaker detected:
          <span className="ml-1 font-semibold text-purple-400">{defaultName}</span>
        </span>
        <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter name..."
            maxLength={40}
            className="flex-1 min-w-0 rounded-md bg-white/5 border border-purple-400/20 px-2 py-0.5 text-xs text-foreground/90 placeholder:text-muted-foreground/40 outline-none focus:border-purple-400/40 focus:bg-white/8"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md bg-purple-400/15 px-2 py-0.5 text-xs font-medium text-purple-400 hover:bg-purple-400/25 transition-colors cursor-pointer"
          >
            Save
          </button>
          <button
            type="button"
            onClick={dismissNaming}
            className="shrink-0 rounded-md p-0.5 text-muted-foreground/50 hover:text-muted-foreground/80 hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Skip naming"
          >
            <X className="h-3 w-3" />
          </button>
        </form>
      </div>
    </div>
  );
}
