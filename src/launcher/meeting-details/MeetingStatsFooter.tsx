import type { MeetingStats } from "../../hooks/useMeetingStats";
import {
  Clock,
  FileText,
  Zap,
  Mic,
  Volume2,
  Brain,
  Timer,
} from "lucide-react";

interface MeetingStatsFooterProps {
  stats: MeetingStats;
}

export function MeetingStatsFooter({ stats }: MeetingStatsFooterProps) {
  return (
    <div className="flex items-center gap-1 border-t border-border/15 px-5 py-2.5 overflow-x-auto">
      <StatPill icon={<Clock className="h-3 w-3" />} label={stats.durationDisplay} />
      <StatPill
        icon={<FileText className="h-3 w-3" />}
        label={`${stats.wordCount.toLocaleString()} words`}
      />
      {stats.wordsPerMinute > 0 && (
        <StatPill
          icon={<Zap className="h-3 w-3" />}
          label={`${stats.wordsPerMinute}/min`}
        />
      )}
      {stats.speakerBreakdown.map((s) => {
        const Icon = s.speaker === "User" || s.speaker === "Interviewer" ? Mic : Volume2;
        return (
          <StatPill
            key={s.speaker}
            icon={<Icon className={`h-3 w-3 ${s.color}`} />}
            label={`${s.speaker === "User" ? "You" : s.speaker} ${s.percentage}%`}
          />
        );
      })}
      {stats.aiCount > 0 && (
        <StatPill
          icon={<Brain className="h-3 w-3" />}
          label={`${stats.aiCount} AI`}
        />
      )}
      {stats.avgLatencyMs !== null && (
        <StatPill
          icon={<Timer className="h-3 w-3" />}
          label={`~${stats.avgLatencyMs}ms`}
        />
      )}
    </div>
  );
}

function StatPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full bg-secondary/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground/70">
      {icon}
      <span className="tabular-nums">{label}</span>
    </div>
  );
}
