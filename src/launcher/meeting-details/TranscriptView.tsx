import { useRef, useEffect, useMemo, useState } from "react";
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

// Speaker border/accent colors
const SPEAKER_ACCENT: Record<string, string> = {
  User: "border-l-blue-500",
  Interviewer: "border-l-purple-500",
  Them: "border-l-emerald-500",
  Unknown: "border-l-gray-500",
};

const SPEAKER_BG_ACTIVE: Record<string, string> = {
  User: "bg-blue-500/8",
  Interviewer: "bg-purple-500/8",
  Them: "bg-emerald-500/8",
  Unknown: "bg-gray-500/8",
};

// Timeline gradient colors
const TIMELINE_COLORS: Record<string, string> = {
  User: "#3b82f6",
  Interviewer: "#a855f7",
  Them: "#10b981",
  Unknown: "#6b7280",
};

export function TranscriptView({ segments, search }: TranscriptViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Auto-scroll to current search match
  useEffect(() => {
    if (search.totalMatches === 0) return;
    const match = search.matches[search.currentMatchIndex];
    if (!match) return;
    const el = segmentRefs.current[match.segmentIndex];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [search.currentMatchIndex, search.matches, search.totalMatches]);

  // Build match lookup per segment
  const activeMatchSegment = search.totalMatches > 0
    ? search.matches[search.currentMatchIndex]?.segmentIndex ?? -1
    : -1;

  const segmentMatches = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const m of search.matches) {
      if (!map.has(m.segmentIndex)) map.set(m.segmentIndex, []);
      map.get(m.segmentIndex)!.push(m.startOffset);
    }
    return map;
  }, [search.matches]);

  const handleTimelineJump = (index: number) => {
    setSelectedIndex(index);
    segmentRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSegmentClick = (index: number) => {
    setSelectedIndex(selectedIndex === index ? null : index);
  };

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
        <FileText className="mb-3 h-6 w-6" />
        <p className="text-xs font-medium">No transcript segments</p>
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
        selectedIndex={selectedIndex}
        onJump={handleTimelineJump}
      />

      {/* Transcript rows */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border/15">
        <div className="py-1">
          {segments.map((segment, i) => {
            const offsets = segmentMatches.get(i);
            const isSearchMatch = i === activeMatchSegment;
            const isSelected = i === selectedIndex;

            return (
              <div
                key={segment.id || i}
                ref={(el) => { segmentRefs.current[i] = el; }}
                onClick={() => handleSegmentClick(i)}
                className={`group flex items-start gap-0 border-l-2 px-3 py-1 cursor-pointer transition-all duration-100
                  ${SPEAKER_ACCENT[segment.speaker] || SPEAKER_ACCENT.Unknown}
                  ${isSelected
                    ? `${SPEAKER_BG_ACTIVE[segment.speaker] || SPEAKER_BG_ACTIVE.Unknown} border-l-3`
                    : isSearchMatch
                      ? "bg-yellow-400/8 border-l-yellow-400"
                      : "border-l-transparent hover:bg-secondary/15"
                  }`}
              >
                {/* Timestamp */}
                <span className={`shrink-0 w-10 pt-px text-[9px] tabular-nums ${
                  isSelected ? "text-foreground/60" : "text-muted-foreground/40"
                }`}>
                  {formatTimestamp(segment.timestamp_ms)}
                </span>
                {/* Speaker tag */}
                <span className={`shrink-0 w-8 pt-px text-[9px] font-semibold ${getSpeakerColor(segment.speaker)}`}>
                  {getSpeakerLabel(segment.speaker).slice(0, 3)}
                </span>
                {/* Text */}
                <span className={`flex-1 text-[11px] leading-relaxed ${
                  isSelected ? "text-foreground" : "text-foreground/75"
                }`}>
                  {offsets
                    ? highlightText(segment.text, search.query, offsets, isSearchMatch)
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

// Highlight matching text
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
    if (offset > lastEnd) parts.push(text.slice(lastEnd, offset));
    parts.push(
      <mark
        key={offset}
        className={`rounded px-0.5 ${
          isActive ? "bg-yellow-400/40 text-yellow-100" : "bg-yellow-400/20 text-yellow-200"
        }`}
      >
        {text.slice(offset, offset + needle.length)}
      </mark>
    );
    lastEnd = offset + needle.length;
  }
  if (lastEnd < text.length) parts.push(text.slice(lastEnd));
  return <>{parts}</>;
}

// ═══════════════════════════════════════════════
// Interactive Timeline Scrubber
// ═══════════════════════════════════════════════

function TimelineScrubber({
  segments,
  selectedIndex,
  onJump,
}: {
  segments: TranscriptSegment[];
  selectedIndex: number | null;
  onJump: (index: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{
    x: number;
    segmentIndex: number;
    timestamp: string;
    speaker: string;
  } | null>(null);

  if (segments.length < 2) return null;

  const firstTs = segments[0].timestamp_ms;
  const lastTs = segments[segments.length - 1].timestamp_ms;
  const totalDuration = lastTs - firstTs;
  if (totalDuration <= 0) return null;

  // Format time label (m:ss)
  const formatTimeLabel = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // Build merged blocks
  const blocks: { speaker: string; startRatio: number; widthRatio: number; startIdx: number; endIdx: number }[] = [];
  let bStart = 0;
  let bSpeaker = segments[0].speaker;
  for (let i = 1; i <= segments.length; i++) {
    if (i === segments.length || segments[i].speaker !== bSpeaker) {
      const endTs = i < segments.length ? segments[i].timestamp_ms : lastTs;
      const startRatio = (segments[bStart].timestamp_ms - firstTs) / totalDuration;
      const widthRatio = (endTs - segments[bStart].timestamp_ms) / totalDuration;
      if (widthRatio > 0.001) {
        blocks.push({ speaker: bSpeaker, startRatio, widthRatio, startIdx: bStart, endIdx: i - 1 });
      }
      if (i < segments.length) {
        bStart = i;
        bSpeaker = segments[i].speaker;
      }
    }
  }

  // Find closest segment to x position
  const findSegment = (clientX: number) => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const hoverTs = firstTs + ratio * totalDuration;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < segments.length; i++) {
      const dist = Math.abs(segments[i].timestamp_ms - hoverTs);
      if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    }
    return { x, segmentIndex: closestIdx };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const result = findSegment(e.clientX);
    if (!result) return;
    setHover({
      x: result.x,
      segmentIndex: result.segmentIndex,
      timestamp: formatTimestamp(segments[result.segmentIndex].timestamp_ms),
      speaker: getSpeakerLabel(segments[result.segmentIndex].speaker),
    });
  };

  const handleClick = () => {
    if (hover) onJump(hover.segmentIndex);
  };

  // Selected marker position
  const selectedRatio = selectedIndex !== null
    ? (segments[selectedIndex].timestamp_ms - firstTs) / totalDuration
    : null;

  // Time markers
  const midTs = firstTs + totalDuration / 2;

  return (
    <div className="relative mx-3 mt-1.5 mb-0.5">
      {/* Tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2"
          style={{ left: hover.x, top: -24 }}
        >
          <div className="flex items-center gap-1 rounded-md border border-border/25 bg-card/95 px-1.5 py-0.5 shadow-lg backdrop-blur-md">
            <span className="text-[9px] font-semibold tabular-nums text-foreground">{hover.timestamp}</span>
            <span className="text-[8px] text-muted-foreground/50">{hover.speaker}</span>
          </div>
        </div>
      )}

      {/* Track */}
      <div
        ref={containerRef}
        className="relative h-3 cursor-pointer rounded-md bg-secondary/20 overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        onClick={handleClick}
      >
        {/* Speaker blocks */}
        {blocks.map((block, i) => (
          <div
            key={i}
            className="absolute top-0 h-full transition-opacity"
            style={{
              left: `${block.startRatio * 100}%`,
              width: `${block.widthRatio * 100}%`,
              backgroundColor: TIMELINE_COLORS[block.speaker] || TIMELINE_COLORS.Unknown,
              opacity: 0.6,
            }}
          />
        ))}

        {/* Selected position marker */}
        {selectedRatio !== null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-white/90 shadow-[0_0_6px_rgba(255,255,255,0.5)]"
            style={{ left: `${selectedRatio * 100}%` }}
          />
        )}

        {/* Hover indicator */}
        {hover && (
          <div
            className="pointer-events-none absolute top-0 h-full w-px bg-white/50"
            style={{ left: hover.x }}
          />
        )}
      </div>

      {/* Time markers */}
      <div className="flex justify-between px-0.5 mt-px">
        <span className="text-[8px] tabular-nums text-muted-foreground/30">{formatTimeLabel(firstTs)}</span>
        <span className="text-[8px] tabular-nums text-muted-foreground/30">{formatTimeLabel(midTs)}</span>
        <span className="text-[8px] tabular-nums text-muted-foreground/30">{formatTimeLabel(lastTs)}</span>
      </div>
    </div>
  );
}
