import { useRef, useEffect, useMemo } from "react";
import type { TranscriptSegment } from "../../lib/types";
import type { TranscriptSearchState } from "../../hooks/useTranscriptSearch";
import { TranscriptSearch } from "./TranscriptSearch";
import {
  formatTimestamp,
  getSpeakerLabel,
  getSpeakerColor,
} from "../../lib/utils";
import { FileText } from "lucide-react";

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  search: TranscriptSearchState;
}

// Speaker colors for the timeline scrubber
const SCRUBBER_COLORS: Record<string, string> = {
  User: "bg-blue-500/70",
  Interviewer: "bg-purple-500/70",
  Them: "bg-emerald-500/70",
  Unknown: "bg-muted-foreground/40",
};

export function TranscriptView({ segments, search }: TranscriptViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Auto-scroll to current match
  useEffect(() => {
    if (search.totalMatches === 0) return;
    const match = search.matches[search.currentMatchIndex];
    if (!match) return;
    const el = segmentRefs.current[match.segmentIndex];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [search.currentMatchIndex, search.matches, search.totalMatches]);

  // Build set of segment indices that have the current active match
  const activeMatchSegment = search.totalMatches > 0
    ? search.matches[search.currentMatchIndex]?.segmentIndex ?? -1
    : -1;

  // Build match lookup per segment for highlighting
  const segmentMatches = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const m of search.matches) {
      if (!map.has(m.segmentIndex)) map.set(m.segmentIndex, []);
      map.get(m.segmentIndex)!.push(m.startOffset);
    }
    return map;
  }, [search.matches]);

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/60">
        <FileText className="mb-4 h-7 w-7" />
        <p className="text-sm font-medium">No transcript segments</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Search overlay */}
      <TranscriptSearch search={search} />

      {/* Timeline scrubber */}
      <TimelineScrubber
        segments={segments}
        onJump={(index) => {
          segmentRefs.current[index]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }}
      />

      {/* Segments */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className="space-y-0.5 p-5">
          {segments.map((segment, i) => {
            const offsets = segmentMatches.get(i);
            const isActiveSegment = i === activeMatchSegment;

            return (
              <div
                key={segment.id || i}
                ref={(el) => { segmentRefs.current[i] = el; }}
                className={`flex gap-3 rounded-lg px-3 py-2 transition-colors ${
                  isActiveSegment
                    ? "bg-yellow-400/10 ring-1 ring-yellow-400/20"
                    : "hover:bg-secondary/20"
                }`}
              >
                <span className="shrink-0 pt-0.5 text-[10px] tabular-nums text-muted-foreground/60">
                  {formatTimestamp(segment.timestamp_ms)}
                </span>
                <span
                  className={`shrink-0 pt-0.5 text-[10px] font-medium ${getSpeakerColor(segment.speaker)}`}
                >
                  {getSpeakerLabel(segment.speaker)}
                </span>
                <span className="text-xs leading-relaxed text-foreground/85">
                  {offsets
                    ? highlightText(segment.text, search.query, offsets, isActiveSegment)
                    : segment.text}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Highlight matching text spans
function highlightText(
  text: string,
  query: string,
  offsets: number[],
  isActive: boolean
): React.ReactNode {
  if (!query || offsets.length === 0) return text;

  const needle = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  const sorted = [...offsets].sort((a, b) => a - b);

  for (const offset of sorted) {
    if (offset > lastEnd) {
      parts.push(text.slice(lastEnd, offset));
    }
    parts.push(
      <mark
        key={offset}
        className={`rounded px-0.5 ${
          isActive ? "bg-yellow-400/50 text-yellow-100" : "bg-yellow-400/25 text-yellow-200"
        }`}
      >
        {text.slice(offset, offset + needle.length)}
      </mark>
    );
    lastEnd = offset + needle.length;
  }

  if (lastEnd < text.length) {
    parts.push(text.slice(lastEnd));
  }

  return <>{parts}</>;
}

// Timeline scrubber bar
function TimelineScrubber({
  segments,
  onJump,
}: {
  segments: TranscriptSegment[];
  onJump: (index: number) => void;
}) {
  if (segments.length < 2) return null;

  const firstTs = segments[0].timestamp_ms;
  const lastTs = segments[segments.length - 1].timestamp_ms;
  const totalDuration = lastTs - firstTs;
  if (totalDuration <= 0) return null;

  return (
    <div className="flex h-1.5 mx-5 mt-3 mb-1 gap-px rounded-full overflow-hidden bg-secondary/20">
      {segments.map((seg, i) => {
        const nextTs = segments[i + 1]?.timestamp_ms ?? lastTs;
        const duration = nextTs - seg.timestamp_ms;
        const widthPercent = (duration / totalDuration) * 100;
        if (widthPercent < 0.2) return null;

        return (
          <div
            key={seg.id || i}
            className={`${SCRUBBER_COLORS[seg.speaker] || SCRUBBER_COLORS.Unknown} cursor-pointer transition-opacity hover:opacity-80`}
            style={{ flexGrow: widthPercent }}
            onClick={() => onJump(i)}
            title={`${getSpeakerLabel(seg.speaker)} - ${formatTimestamp(seg.timestamp_ms)}`}
          />
        );
      })}
    </div>
  );
}
