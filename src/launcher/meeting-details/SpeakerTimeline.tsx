import { useMemo, useState, useRef, useCallback } from "react";
import type { TranscriptSegment, SpeakerIdentity } from "../../lib/types";
import { formatTimestamp } from "../../lib/utils";

interface SpeakerTimelineProps {
  segments: TranscriptSegment[];
  speakers: SpeakerIdentity[];
  meetingStartMs: number;
  meetingDurationMs: number;
  onSegmentClick?: (segmentIndex: number) => void;
}

const FALLBACK_COLORS = [
  "#4a6cf7", // blue
  "#a855f7", // purple
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
];

interface SegmentBlock {
  segmentIndex: number;
  leftPct: number;
  widthPct: number;
  text: string;
  timestampMs: number;
}

export function SpeakerTimeline({
  segments,
  speakers,
  meetingStartMs,
  meetingDurationMs,
  onSegmentClick,
}: SpeakerTimelineProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    timestamp: string;
    text: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build speaker_id -> segment blocks map (normalised keys, merged adjacent blocks)
  const speakerSegments = useMemo(() => {
    if (meetingDurationMs <= 0) return new Map<string, SegmentBlock[]>();

    const map = new Map<string, SegmentBlock[]>();

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      // Normalise key to match speaker IDs: "User"→"you", "Them"→"them"
      const key = seg.speaker_id
        || (seg.speaker === "User" ? "you" : seg.speaker === "Them" ? "them" : seg.speaker);

      if (!map.has(key)) map.set(key, []);

      const leftPct =
        ((seg.timestamp_ms - meetingStartMs) / meetingDurationMs) * 100;
      const wordCount = seg.text.split(/\s+/).filter(Boolean).length;
      const estimatedMs = wordCount * 200;
      const widthPct = Math.max(
        0.5,
        (estimatedMs / meetingDurationMs) * 100
      );

      const blocks = map.get(key)!;
      const last = blocks.length > 0 ? blocks[blocks.length - 1] : null;

      // Merge with previous block if gap < 1% of timeline (reduces visual noise)
      if (last && leftPct - (last.leftPct + last.widthPct) < 1) {
        last.widthPct = Math.max(last.widthPct, leftPct + widthPct - last.leftPct);
      } else {
        blocks.push({
          segmentIndex: i,
          leftPct: Math.max(0, Math.min(leftPct, 100)),
          widthPct: Math.min(widthPct, 100 - Math.max(0, leftPct)),
          text: seg.text,
          timestampMs: seg.timestamp_ms,
        });
      }
    }

    return map;
  }, [segments, meetingStartMs, meetingDurationMs]);

  // Filter speakers to only those with segments
  const activeSpeakers = useMemo(
    () =>
      speakers.filter((s) => {
        const blocks = speakerSegments.get(s.id);
        return blocks && blocks.length > 0;
      }),
    [speakers, speakerSegments]
  );

  // Time axis markers every 10 minutes
  const timeMarkers = useMemo(() => {
    if (meetingDurationMs <= 0) return [];
    const markers: { pct: number; label: string }[] = [];
    const intervalMs = 10 * 60 * 1000; // 10 minutes
    let t = intervalMs;
    while (t < meetingDurationMs) {
      markers.push({
        pct: (t / meetingDurationMs) * 100,
        label: formatTimestamp(t),
      });
      t += intervalMs;
    }
    return markers;
  }, [meetingDurationMs]);

  const handleBlockHover = useCallback(
    (e: React.MouseEvent, block: SegmentBlock) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const elapsedMs = Math.max(0, block.timestampMs - meetingStartMs);
      const preview =
        block.text.length > 50 ? block.text.slice(0, 50) + "..." : block.text;
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        timestamp: formatTimestamp(elapsedMs),
        text: preview,
      });
    },
    [meetingStartMs]
  );

  const handleBlockLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleBlockClick = useCallback(
    (segmentIndex: number) => {
      onSegmentClick?.(segmentIndex);
    },
    [onSegmentClick]
  );

  if (activeSpeakers.length === 0 || meetingDurationMs <= 0) return null;

  return (
    <div ref={containerRef} className="relative border-b border-border/10 px-3 pb-2 pt-1.5">
      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-30 -translate-x-1/2"
          style={{ left: tooltip.x, top: tooltip.y - 32 }}
        >
          <div className="rounded-md border border-border/30 bg-card px-2 py-1 shadow-lg backdrop-blur-md">
            <span className="text-[10px] font-bold tabular-nums text-foreground">
              {tooltip.timestamp}
            </span>
            <span className="ml-1.5 text-[10px] text-muted-foreground/60 max-w-[200px] truncate inline-block align-bottom">
              {tooltip.text}
            </span>
          </div>
        </div>
      )}

      {/* Timeline rows */}
      <div className="space-y-0.5">
        {activeSpeakers.map((speaker, speakerIdx) => {
          const color =
            speaker.color || FALLBACK_COLORS[speakerIdx % FALLBACK_COLORS.length];
          const blocks = speakerSegments.get(speaker.id) ?? [];

          return (
            <div key={speaker.id} className="flex items-center gap-1.5">
              {/* Speaker name */}
              <span
                className="w-[60px] shrink-0 truncate text-[10px] font-medium text-muted-foreground/60 text-right"
                title={speaker.display_name}
              >
                {speaker.display_name}
              </span>

              {/* Timeline bar */}
              <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-secondary/15">
                {/* Time markers */}
                {timeMarkers.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full w-px bg-border/10"
                    style={{ left: `${m.pct}%` }}
                  />
                ))}

                {/* Segment blocks */}
                {blocks.map((block) => (
                  <div
                    key={block.segmentIndex}
                    className="absolute top-0 h-full rounded-[1px] cursor-pointer transition-opacity hover:opacity-100"
                    style={{
                      left: `${block.leftPct}%`,
                      width: `${block.widthPct}%`,
                      backgroundColor: color,
                      opacity: 0.65,
                    }}
                    onMouseEnter={(e) => handleBlockHover(e, block)}
                    onMouseMove={(e) => handleBlockHover(e, block)}
                    onMouseLeave={handleBlockLeave}
                    onClick={() => handleBlockClick(block.segmentIndex)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time axis labels */}
      {timeMarkers.length > 0 && (
        <div className="relative mt-0.5 ml-[66px]">
          {timeMarkers.map((m, i) => (
            <span
              key={i}
              className="absolute -translate-x-1/2 text-meta text-muted-foreground/25"
              style={{ left: `${m.pct}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
