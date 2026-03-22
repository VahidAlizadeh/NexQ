// Task 14: Topic section divider for transcript
// Purple horizontal divider with topic title and timestamp.

import type { TopicSection } from "../lib/types";
import { formatDuration } from "../lib/utils";

interface TopicSectionDividerProps {
  section: TopicSection;
}

export function TopicSectionDivider({ section }: TopicSectionDividerProps) {
  const timeLabel = formatDuration(section.start_ms);

  return (
    <div className="flex items-center gap-2 my-2 px-1">
      <div className="flex-1 h-px bg-purple-400/20" />
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-meta tabular-nums text-purple-400/50">{timeLabel}</span>
        <span className="text-[10px] font-semibold tracking-wider uppercase text-purple-400/80 px-2 py-0.5 rounded-full border border-purple-400/20 bg-purple-400/5">
          {section.title}
        </span>
      </div>
      <div className="flex-1 h-px bg-purple-400/20" />
    </div>
  );
}
