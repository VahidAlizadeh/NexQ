// Task 15: Speaker Stats Panel
// Collapsible panel showing per-speaker talk time %, word count, last spoke.

import { useSpeakerStore } from "../stores/speakerStore";
import { BarChart3 } from "lucide-react";

interface SpeakerStatsPanelProps {
  isOpen: boolean;
}

function formatRelativeTime(lastSpokeMs: number): string {
  if (!lastSpokeMs) return "—";
  const diffMs = Date.now() - lastSpokeMs;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export function SpeakerStatsPanel({ isOpen }: SpeakerStatsPanelProps) {
  const speakers = useSpeakerStore((s) => s.getAllSpeakers());

  if (!isOpen) return null;

  const totalTalkMs = speakers.reduce((sum, s) => sum + s.stats.talk_time_ms, 0);

  return (
    <div className="border-t border-border/20 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-2">
        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="text-meta font-semibold uppercase tracking-wider text-muted-foreground/60">
          Speaker Stats
        </span>
      </div>

      {speakers.length === 0 ? (
        <p className="text-xs text-muted-foreground/50 py-1">No speakers tracked yet.</p>
      ) : (
        <div className="space-y-1.5">
          {speakers.map((speaker) => {
            const talkPct = totalTalkMs > 0
              ? Math.round((speaker.stats.talk_time_ms / totalTalkMs) * 100)
              : 0;
            const color = speaker.color ?? "#6366f1";

            return (
              <div key={speaker.id} className="flex items-center gap-2">
                {/* Speaker name */}
                <span
                  className="shrink-0 text-xs font-semibold w-20 truncate"
                  style={{ color }}
                  title={speaker.display_name}
                >
                  {speaker.display_name}
                </span>

                {/* Talk time bar */}
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${talkPct}%`, backgroundColor: color, opacity: 0.7 }}
                  />
                </div>

                {/* Percentage */}
                <span className="shrink-0 text-meta tabular-nums text-muted-foreground/60 w-8 text-right">
                  {talkPct}%
                </span>

                {/* Word count */}
                <span className="shrink-0 text-meta tabular-nums text-muted-foreground/50 w-14 text-right">
                  {speaker.stats.word_count}w
                </span>

                {/* Last spoke */}
                <span className="shrink-0 text-meta text-muted-foreground/40 w-16 text-right">
                  {formatRelativeTime(speaker.stats.last_spoke_ms)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
