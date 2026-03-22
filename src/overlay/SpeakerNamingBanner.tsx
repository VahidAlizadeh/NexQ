import { useState, useEffect, useRef } from "react";
import { useSpeakerStore } from "../stores/speakerStore";
import { useTranscriptStore } from "../stores/transcriptStore";
import { UserPlus, X } from "lucide-react";

export function SpeakerNamingBanner() {
  const pendingNaming = useSpeakerStore((s) => s.pendingNaming);
  const renameSpeaker = useSpeakerStore((s) => s.renameSpeaker);
  const dismissNaming = useSpeakerStore((s) => s.dismissNaming);
  const mergeSpeaker = useSpeakerStore((s) => s.mergeSpeaker);
  const speakers = useSpeakerStore((s) => s.speakers);
  const speakerOrder = useSpeakerStore((s) => s.speakerOrder);
  const reassignSpeaker = useTranscriptStore((s) => s.reassignSpeaker);

  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);
  const [timerProgress, setTimerProgress] = useState(100);
  // Ref to guard against stale closures during rapid speaker detection
  const pendingRef = useRef(pendingNaming);
  pendingRef.current = pendingNaming;

  // Reset input and restart auto-dismiss timer when pendingNaming changes
  useEffect(() => {
    if (!pendingNaming) return;
    setName("");
    setTimerProgress(100);
    startTimeRef.current = Date.now();
    inputRef.current?.focus();

    const TIMEOUT_MS = 10000;

    // Animate timer bar
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / TIMEOUT_MS) * 100);
      setTimerProgress(remaining);
    }, 100);

    timerRef.current = setTimeout(() => {
      dismissNaming();
    }, TIMEOUT_MS);

    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pendingNaming, dismissNaming]);

  if (!pendingNaming) return null;

  const pendingSpeaker = speakers[pendingNaming];
  const defaultName = pendingSpeaker?.display_name ?? pendingNaming;

  // Existing speakers available for merge (exclude the pending speaker itself)
  const mergeTargets = speakerOrder
    .filter((id) => id !== pendingNaming && id in speakers)
    .map((id) => speakers[id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const current = pendingRef.current;
    if (!current) return;
    const trimmed = name.trim();
    if (trimmed) {
      renameSpeaker(current, trimmed);
    } else {
      dismissNaming();
    }
  };

  const handleMerge = (targetId: string) => {
    const current = pendingRef.current;
    if (!current) return;
    // Order matters: reassign segments FIRST, then remove the speaker
    reassignSpeaker(current, targetId);
    mergeSpeaker(current, targetId);
  };

  return (
    <div className="mx-1 mb-1.5 rounded-lg border border-purple-400/20 bg-purple-400/5 px-3 py-2 animate-in slide-in-from-bottom-2 duration-200">
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <UserPlus className="h-3.5 w-3.5 shrink-0 text-purple-400" />
        <span className="text-xs text-muted-foreground/80">
          New speaker detected:
          <span className="ml-1 font-semibold text-purple-400">{defaultName}</span>
        </span>
        <button
          type="button"
          onClick={dismissNaming}
          className="ml-auto shrink-0 rounded-md p-0.5 text-muted-foreground/50 hover:text-muted-foreground/80 hover:bg-white/5 transition-colors cursor-pointer"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Two-action row */}
      <div className="flex gap-2">
        {/* Left: Name this speaker */}
        <div className="flex-1 rounded-md bg-white/[0.03] border border-white/[0.06] p-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-1.5">
            Name this speaker
          </div>
          <form onSubmit={handleSubmit} className="flex gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Professor Smith"
              maxLength={40}
              className="flex-1 min-w-0 rounded-md bg-white/5 border border-purple-400/20 px-2 py-1 text-xs text-foreground/90 placeholder:text-muted-foreground/40 outline-none focus:border-purple-400/40"
            />
            <button
              type="submit"
              className="shrink-0 rounded-md bg-purple-400/15 px-2.5 py-1 text-xs font-medium text-purple-400 hover:bg-purple-400/25 transition-colors cursor-pointer"
            >
              Save
            </button>
          </form>
        </div>

        {/* Right: Merge into existing */}
        {mergeTargets.length > 0 && (
          <div className="flex-1 rounded-md bg-white/[0.03] border border-white/[0.06] p-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-1.5">
              Actually this is...
            </div>
            <div className="flex flex-wrap gap-1">
              {mergeTargets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => handleMerge(target.id)}
                  className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-muted-foreground/70 hover:bg-white/[0.08] hover:text-foreground/80 transition-colors cursor-pointer"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: target.color ?? "#6b7280" }}
                  />
                  {target.display_name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Timer bar */}
      <div className="mt-2 h-[2px] rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-purple-400/30 transition-all duration-100"
          style={{ width: `${timerProgress}%` }}
        />
      </div>
    </div>
  );
}
