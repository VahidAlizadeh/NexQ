// WaveformCanvas — canvas-based waveform visualization with markers and scrubbing
// Renders waveform bars, bookmark markers, topic section dividers, and a glowing playhead.
// Supports click-to-seek and drag-to-scrub.

import React, { useRef, useEffect, useCallback } from "react";
import type { WaveformData, MeetingBookmark, TopicSection } from "@/lib/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WaveformCanvasProps {
  waveformData: WaveformData;
  currentTimeMs: number;
  durationMs: number;
  meetingStartMs: number;
  recordingOffsetMs: number;
  bookmarks?: MeetingBookmark[];
  topicSections?: TopicSection[];
  onSeek: (ms: number) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLOR_PLAYED = "#818cf8";                          // indigo — played bars
const COLOR_UNPLAYED = "rgba(255, 255, 255, 0.10)";     // subtle white — unplayed bars
const COLOR_PLAYHEAD = "#818cf8";                        // indigo — playhead line
const COLOR_BOOKMARK = "#f59e0b";                        // amber — bookmark dots
const COLOR_TOPIC = "rgba(16, 185, 129, 0.40)";         // emerald — topic dividers

const BAR_GAP_RATIO = 0.25;   // fraction of bar slot taken by gap
const PLAYHEAD_WIDTH = 2;     // px (logical)
const BOOKMARK_RADIUS = 2.5;  // px (logical) — ~5 px diameter
const BOOKMARK_GLOW_BLUR = 6; // px shadow blur for bookmark dots
const PLAYHEAD_GLOW_BLUR = 8; // px shadow blur for playhead

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WaveformCanvas({
  waveformData,
  currentTimeMs,
  durationMs,
  bookmarks = [],
  topicSections = [],
  onSeek,
  className,
}: WaveformCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef(false);

  // -------------------------------------------------------------------------
  // Core draw function — memoised so resize / effect can call it cheaply
  // -------------------------------------------------------------------------

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const logicalW = container.clientWidth;
    const logicalH = container.clientHeight;

    // Resize canvas backing store to match container + DPR
    if (canvas.width !== Math.round(logicalW * dpr) || canvas.height !== Math.round(logicalH * dpr)) {
      canvas.width = Math.round(logicalW * dpr);
      canvas.height = Math.round(logicalH * dpr);
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, logicalW, logicalH);

    if (durationMs <= 0 || waveformData.peaks.length === 0) return;

    const peaks = waveformData.peaks;
    const numBars = peaks.length;
    const progress = Math.min(1, Math.max(0, currentTimeMs / durationMs));
    const playheadX = progress * logicalW;

    // --- slot & bar geometry ---
    const slotW = logicalW / numBars;
    const gapW = slotW * BAR_GAP_RATIO;
    const barW = Math.max(1, slotW - gapW);

    // --- waveform bars ---
    for (let i = 0; i < numBars; i++) {
      const [min, max] = peaks[i];
      // Normalise amplitudes (peaks are -1..1 or 0..1 depending on encoder)
      const amplitude = Math.max(Math.abs(min), Math.abs(max));
      const barH = Math.max(2, amplitude * logicalH);
      const x = i * slotW + gapW / 2;
      const y = (logicalH - barH) / 2;

      const barCenter = x + barW / 2;
      ctx.fillStyle = barCenter <= playheadX ? COLOR_PLAYED : COLOR_UNPLAYED;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, barW / 2);
      ctx.fill();
    }

    // --- topic section dividers (dashed vertical lines) ---
    if (topicSections.length > 0) {
      ctx.save();
      ctx.strokeStyle = COLOR_TOPIC;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (const section of topicSections) {
        if (section.start_ms <= 0) continue; // skip if at very beginning
        const x = (section.start_ms / durationMs) * logicalW;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, logicalH);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // --- bookmark markers (amber dots at top edge) ---
    if (bookmarks.length > 0) {
      ctx.save();
      ctx.shadowColor = COLOR_BOOKMARK;
      ctx.shadowBlur = BOOKMARK_GLOW_BLUR;
      ctx.fillStyle = COLOR_BOOKMARK;
      for (const bookmark of bookmarks) {
        const x = (bookmark.timestamp_ms / durationMs) * logicalW;
        const y = BOOKMARK_RADIUS + 1; // sit just inside the top edge
        ctx.beginPath();
        ctx.arc(x, y, BOOKMARK_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // --- playhead (glowing vertical line) ---
    ctx.save();
    ctx.shadowColor = COLOR_PLAYHEAD;
    ctx.shadowBlur = PLAYHEAD_GLOW_BLUR;
    ctx.strokeStyle = COLOR_PLAYHEAD;
    ctx.lineWidth = PLAYHEAD_WIDTH;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, logicalH);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }, [waveformData, currentTimeMs, durationMs, bookmarks, topicSections]);

  // -------------------------------------------------------------------------
  // ResizeObserver — redraw whenever container size changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      draw();
    });
    observer.observe(container);
    // Initial draw
    draw();

    return () => observer.disconnect();
  }, [draw]);

  // Redraw whenever draw deps change (currentTimeMs, waveformData, etc.)
  useEffect(() => {
    draw();
  }, [draw]);

  // -------------------------------------------------------------------------
  // Interaction helpers
  // -------------------------------------------------------------------------

  const seekFromEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || durationMs <= 0) return;
      const rect = canvas.getBoundingClientRect();
      const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      onSeek(fraction * durationMs);
    },
    [durationMs, onSeek]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      isDragging.current = true;
      seekFromEvent(e);
    },
    [seekFromEvent]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging.current) return;
      seekFromEvent(e);
    },
    [seekFromEvent]
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      seekFromEvent(e);
    },
    [seekFromEvent]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          cursor: "pointer",
          display: "block",
        }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}

export default WaveformCanvas;
