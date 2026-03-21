import { useRef, useEffect, useMemo, useState, useCallback } from "react";
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

// Speaker gradient colors for scrubber segments
const SCRUBBER_GRADIENTS: Record<string, string> = {
  User: "from-blue-500 to-blue-400",
  Interviewer: "from-purple-500 to-purple-400",
  Them: "from-emerald-500 to-emerald-400",
  Unknown: "from-gray-500 to-gray-400",
};

// Timeline scrubber bar with hover tooltip
function TimelineScrubber({
  segments,
  onJump,
}: {
  segments: TranscriptSegment[];
  onJump: (index: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    timestamp: string;
    speaker: string;
    segmentIndex: number;
  }>({ visible: false, x: 0, timestamp: "", speaker: "", segmentIndex: 0 });

  if (segments.length < 2) return null;

  const firstTs = segments[0].timestamp_ms;
  const lastTs = segments[segments.length - 1].timestamp_ms;
  const totalDuration = lastTs - firstTs;
  if (totalDuration <= 0) return null;

  // Find which segment corresponds to a given x position
  const handleMouseMove = (e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const hoverTs = firstTs + ratio * totalDuration;

    // Find the closest segment
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < segments.length; i++) {
      const dist = Math.abs(segments[i].timestamp_ms - hoverTs);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }

    setTooltip({
      visible: true,
      x: Math.max(30, Math.min(x, rect.width - 30)),
      timestamp: formatTimestamp(segments[closestIdx].timestamp_ms),
      speaker: getSpeakerLabel(segments[closestIdx].speaker),
      segmentIndex: closestIdx,
    });
  };

  const handleMouseLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  const handleClick = (e: React.MouseEvent) => {
    if (tooltip.visible) {
      onJump(tooltip.segmentIndex);
    }
  };

  // Pre-compute segment blocks (merge consecutive same-speaker segments for cleaner look)
  const blocks: { speaker: string; startRatio: number; widthRatio: number }[] = [];
  let blockStart = 0;
  let blockSpeaker = segments[0].speaker;
  for (let i = 1; i <= segments.length; i++) {
    const seg = segments[i];
    if (i === segments.length || seg.speaker !== blockSpeaker) {
      const endTs = i < segments.length ? segments[i].timestamp_ms : lastTs;
      const startRatio = (segments[blockStart].timestamp_ms - firstTs) / totalDuration;
      const widthRatio = (endTs - segments[blockStart].timestamp_ms) / totalDuration;
      if (widthRatio > 0.002) {
        blocks.push({ speaker: blockSpeaker, startRatio, widthRatio });
      }
      if (i < segments.length) {
        blockStart = i;
        blockSpeaker = seg.speaker;
      }
    }
  }

  return (
    <div className="relative mx-5 mt-3 mb-1">
      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="pointer-events-none absolute -top-8 z-20 -translate-x-1/2"
          style={{ left: tooltip.x }}
        >
          <div className="rounded-lg border border-border/30 bg-card/95 px-2 py-1 shadow-lg backdrop-blur-sm">
            <span className="text-[10px] font-medium tabular-nums text-foreground/90">
              {tooltip.timestamp}
            </span>
            <span className="ml-1.5 text-[10px] text-muted-foreground/60">
              {tooltip.speaker}
            </span>
          </div>
          <div className="mx-auto h-1.5 w-px bg-primary/40" />
        </div>
      )}

      {/* Scrubber track */}
      <div
        ref={containerRef}
        className="relative h-2 cursor-pointer rounded-full bg-secondary/30"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {blocks.map((block, i) => (
          <div
            key={i}
            className={`absolute top-0 h-full rounded-full bg-gradient-to-r ${
              SCRUBBER_GRADIENTS[block.speaker] || SCRUBBER_GRADIENTS.Unknown
            } opacity-75 transition-opacity hover:opacity-100`}
            style={{
              left: `${block.startRatio * 100}%`,
              width: `${block.widthRatio * 100}%`,
            }}
          />
        ))}
        {/* Hover indicator line */}
        {tooltip.visible && (
          <div
            className="pointer-events-none absolute top-0 h-full w-px bg-primary/60"
            style={{ left: tooltip.x }}
          />
        )}
      </div>
    </div>
  );
}
