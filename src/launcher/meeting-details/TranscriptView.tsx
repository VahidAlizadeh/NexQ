import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import type { TranscriptSegment, SpeakerIdentity } from "../../lib/types";
import type { TranscriptSearchState } from "../../hooks/useTranscriptSearch";
import {
  formatTimestamp,
  getSpeakerLabel,
  getSpeakerColor,
} from "../../lib/utils";
import { FileText, Search, ChevronUp, ChevronDown, X } from "lucide-react";

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  search: TranscriptSearchState;
  meetingStartTime?: number;
  /** Saved speakers from meeting — used for post-meeting label/color resolution */
  speakers?: SpeakerIdentity[];
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

// Speaker colors for timeline blocks
const TIMELINE_COLORS: Record<string, string> = {
  User: "hsl(var(--info))",
  Interviewer: "hsl(var(--primary))",
  Them: "hsl(var(--success))",
  Unknown: "hsl(var(--muted-foreground))",
};

export function TranscriptView({ segments, search, meetingStartTime, speakers, searchInputRef }: TranscriptViewProps) {
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const localSearchInputRef = useRef<HTMLInputElement | null>(null);
  const setInputRef = useCallback((el: HTMLInputElement | null) => {
    localSearchInputRef.current = el;
    if (searchInputRef) (searchInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
  }, [searchInputRef]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const toElapsed = (ms: number) =>
    meetingStartTime ? Math.max(0, ms - meetingStartTime) : ms;

  // Build speaker lookup from saved speakers for label/color resolution
  const speakerMap = useMemo(() => {
    if (!speakers || speakers.length === 0) return null;
    const map = new Map<string, SpeakerIdentity>();
    for (const s of speakers) map.set(s.id, s);
    return map;
  }, [speakers]);

  const resolveSpeakerLabel = (seg: TranscriptSegment): string => {
    if (speakerMap && seg.speaker_id) {
      const s = speakerMap.get(seg.speaker_id);
      if (s) return s.display_name;
    }
    return getSpeakerLabel(seg.speaker);
  };

  const resolveSpeakerColorClass = (seg: TranscriptSegment): string => {
    if (speakerMap && seg.speaker_id) {
      const s = speakerMap.get(seg.speaker_id);
      if (s?.color) return ""; // use inline style instead
    }
    return getSpeakerColor(seg.speaker);
  };

  const resolveSpeakerColorHex = (seg: TranscriptSegment): string | undefined => {
    if (speakerMap && seg.speaker_id) {
      const s = speakerMap.get(seg.speaker_id);
      if (s?.color) return s.color;
    }
    return undefined;
  };

  // Search: scroll to match
  useEffect(() => {
    if (search.totalMatches === 0) return;
    const match = search.matches[search.currentMatchIndex];
    if (!match) return;
    segmentRefs.current[match.segmentIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [search.currentMatchIndex, search.matches, search.totalMatches]);

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
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50">
        <FileText className="mb-3 h-8 w-8" />
        <p className="text-sm font-medium">No transcript segments</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Always-visible search bar */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/20 mx-1 mt-1 mb-1.5 px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <input
          ref={setInputRef}
          type="text"
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (e.shiftKey) search.prevMatch();
              else search.nextMatch();
            }
          }}
          placeholder="Search transcript..."
          maxLength={200}
          aria-label="Search transcript"
          className="flex-1 bg-transparent text-xs text-foreground/90 placeholder:text-muted-foreground/50 outline-none"
        />
        {search.query && search.totalMatches > 0 && (
          <span className="shrink-0 text-xs tabular-nums font-medium text-muted-foreground/60">
            {search.currentMatchIndex + 1} of {search.totalMatches}
          </span>
        )}
        {search.query && search.totalMatches === 0 && (
          <span className="shrink-0 text-xs text-red-400/60">No matches</span>
        )}
        {search.query && (
          <div className="flex items-center gap-0.5 border-l border-border/20 pl-2">
            <button
              onClick={search.prevMatch}
              disabled={search.totalMatches === 0}
              className="rounded-md p-1 text-muted-foreground/50 hover:bg-secondary hover:text-foreground disabled:opacity-25 cursor-pointer"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={search.nextMatch}
              disabled={search.totalMatches === 0}
              className="rounded-md p-1 text-muted-foreground/50 hover:bg-secondary hover:text-foreground disabled:opacity-25 cursor-pointer"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => search.setQuery("")}
              className="rounded-md p-1 text-muted-foreground/50 hover:bg-secondary hover:text-foreground cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Timeline */}
      <TimelineScrubber
        segments={segments}
        selectedIndex={selectedIndex}
        onJump={handleTimelineJump}
        meetingStartTime={meetingStartTime}
      />

      {/* Transcript rows */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border/20">
        <div className="px-4 py-2">
          {segments.map((segment, i) => {
            const offsets = segmentMatches.get(i);
            const isSearchMatch = i === activeMatchSegment;
            const isSelected = i === selectedIndex;

            return (
              <div
                key={segment.id || i}
                ref={(el) => { segmentRefs.current[i] = el; }}
                onClick={() => handleSegmentClick(i)}
                className={`flex items-start gap-3 rounded-lg px-3 py-2 cursor-pointer transition-all duration-100 border-l-2 ${
                  segment.speaker === "User" ? "border-l-speaker-user/20" : "border-l-speaker-interviewer/20"
                } ${
                  isSelected
                    ? "bg-primary/10 ring-1 ring-primary/20"
                    : isSearchMatch
                      ? "bg-highlight/10 ring-1 ring-highlight/20"
                      : "hover:bg-secondary/20"
                }`}
              >
                {/* Timestamp */}
                <span className={`shrink-0 pt-0.5 text-xs tabular-nums font-medium ${
                  isSelected ? "text-primary/70" : "text-muted-foreground/50"
                }`}>
                  {formatTimestamp(toElapsed(segment.timestamp_ms))}
                </span>

                {/* Speaker */}
                <span
                  className={`shrink-0 pt-0.5 text-xs font-bold ${resolveSpeakerColorClass(segment)}`}
                  style={resolveSpeakerColorHex(segment) ? { color: resolveSpeakerColorHex(segment) } : undefined}
                >
                  {resolveSpeakerLabel(segment)}
                </span>

                {/* Text content */}
                <span className={`flex-1 text-sm leading-relaxed ${
                  isSelected ? "text-foreground" : "text-foreground/80"
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

// ── Text highlighting ──

function highlightText(text: string, query: string, offsets: number[], isActive: boolean): React.ReactNode {
  if (!query || offsets.length === 0) return text;
  const needle = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;
  const sorted = [...offsets].sort((a, b) => a - b);
  for (const offset of sorted) {
    if (offset > lastEnd) parts.push(text.slice(lastEnd, offset));
    parts.push(
      <mark key={offset} className={`rounded px-0.5 ${isActive ? "bg-highlight/40 text-highlight" : "bg-highlight/20 text-highlight/70"}`}>
        {text.slice(offset, offset + needle.length)}
      </mark>
    );
    lastEnd = offset + needle.length;
  }
  if (lastEnd < text.length) parts.push(text.slice(lastEnd));
  return <>{parts}</>;
}

// ── Timeline Scrubber ──

function TimelineScrubber({
  segments,
  selectedIndex,
  onJump,
  meetingStartTime,
}: {
  segments: TranscriptSegment[];
  selectedIndex: number | null;
  onJump: (index: number) => void;
  meetingStartTime?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    x: number;
    segmentIndex: number;
    timestamp: string;
    speaker: string;
    text: string;
  } | null>(null);

  if (segments.length < 2) return null;

  const firstTs = segments[0].timestamp_ms;
  const lastTs = segments[segments.length - 1].timestamp_ms;
  const totalDuration = lastTs - firstTs;
  if (totalDuration <= 0) return null;

  // Build merged speaker blocks
  const blocks: { speaker: string; startPct: number; widthPct: number }[] = [];
  let bStart = 0;
  let bSpeaker = segments[0].speaker;
  for (let i = 1; i <= segments.length; i++) {
    if (i === segments.length || segments[i].speaker !== bSpeaker) {
      const endTs = i < segments.length ? segments[i].timestamp_ms : lastTs;
      const startPct = ((segments[bStart].timestamp_ms - firstTs) / totalDuration) * 100;
      const widthPct = ((endTs - segments[bStart].timestamp_ms) / totalDuration) * 100;
      if (widthPct > 0.1) blocks.push({ speaker: bSpeaker, startPct, widthPct });
      if (i < segments.length) { bStart = i; bSpeaker = segments[i].speaker; }
    }
  }

  const findClosest = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const hoverTs = firstTs + ratio * totalDuration;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < segments.length; i++) {
      const d = Math.abs(segments[i].timestamp_ms - hoverTs);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return { x, idx: best };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const r = findClosest(e.clientX);
    if (!r) return;
    const seg = segments[r.idx];
    const elapsedMs = meetingStartTime ? Math.max(0, seg.timestamp_ms - meetingStartTime) : seg.timestamp_ms;
    setHover({
      x: r.x,
      segmentIndex: r.idx,
      timestamp: formatTimestamp(elapsedMs),
      speaker: getSpeakerLabel(seg.speaker),
      text: seg.text.length > 50 ? seg.text.slice(0, 50) + "..." : seg.text,
    });
  };

  const handleClick = () => { if (hover) onJump(hover.segmentIndex); };

  // Selected position
  const selPct = selectedIndex !== null
    ? ((segments[selectedIndex].timestamp_ms - firstTs) / totalDuration) * 100
    : null;

  // Format as m:ss
  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  // Duration label for the track
  const durationSec = Math.floor(totalDuration / 1000);
  const durationLabel = durationSec >= 3600
    ? `${Math.floor(durationSec / 3600)}h ${Math.floor((durationSec % 3600) / 60)}m`
    : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

  return (
    <div className="mx-4 mt-2 mb-1">
      {/* Tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2"
          style={{ left: `calc(1rem + ${hover.x}px)`, marginTop: -36 }}
        >
          <div className="rounded-lg border border-border/30 bg-card px-3 py-1.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tabular-nums text-foreground">{hover.timestamp}</span>
              <span className="text-xs text-muted-foreground/60">{hover.speaker}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground/50 max-w-[250px] truncate">{hover.text}</p>
          </div>
        </div>
      )}

      {/* Time labels + track */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs tabular-nums font-medium text-muted-foreground/40 w-8">
          {fmtTime(firstTs - (meetingStartTime || firstTs))}
        </span>

        {/* Track */}
        <div
          ref={containerRef}
          className="relative flex-1 h-4 cursor-pointer rounded-lg bg-secondary/20 overflow-hidden"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
          onClick={handleClick}
        >
          {blocks.map((b, i) => (
            <div
              key={i}
              className="absolute top-0 h-full rounded-sm"
              style={{
                left: `${b.startPct}%`,
                width: `${b.widthPct}%`,
                backgroundColor: TIMELINE_COLORS[b.speaker] || TIMELINE_COLORS.Unknown,
                opacity: 0.55,
              }}
            />
          ))}

          {/* Selected marker */}
          {selPct !== null && (
            <div
              className="absolute top-0 h-full w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
              style={{ left: `${selPct}%` }}
            />
          )}

          {/* Hover line */}
          {hover && (
            <div
              className="pointer-events-none absolute top-0 h-full w-px bg-white/40"
              style={{ left: hover.x }}
            />
          )}
        </div>

        <span className="shrink-0 text-xs tabular-nums font-medium text-muted-foreground/40 w-8 text-right">
          {fmtTime(lastTs - (meetingStartTime || firstTs))}
        </span>
      </div>

      {/* Duration badge */}
      <div className="flex justify-center mt-0.5">
        <span className="text-meta text-muted-foreground/30">{durationLabel}</span>
      </div>
    </div>
  );
}
