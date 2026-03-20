// Sub-PRD 4: Individual transcript line component
// Displays timestamp, speaker label, and text for a single transcript segment.

import { useState } from "react";
import type { TranscriptSegment } from "../lib/types";
import { getSpeakerColor, getSpeakerLabel } from "../lib/utils";
import { useMeetingStore } from "../stores/meetingStore";

interface TranscriptLineProps {
  segment: TranscriptSegment;
  /** Optional search query to highlight matches */
  searchQuery?: string;
}

/**
 * Renders a single transcript segment with:
 * - Formatted timestamp (MM:SS)
 * - Speaker label with color coding (blue for User, orange for Interviewer)
 * - Text content (italic/lighter for interim, normal for final)
 * - Hover state showing full timestamp with milliseconds
 */
export function TranscriptLine({ segment, searchQuery }: TranscriptLineProps) {
  const [isHovered, setIsHovered] = useState(false);
  const meetingStartTime = useMeetingStore((s) => s.meetingStartTime);

  // Convert epoch timestamp to elapsed time since meeting start
  const elapsedMs = meetingStartTime
    ? Math.max(0, segment.timestamp_ms - meetingStartTime)
    : segment.timestamp_ms;

  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = elapsedMs % 1000;

  const shortTimestamp = hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
  const fullTimestamp = `${shortTimestamp}.${String(millis).padStart(3, "0")}`;

  const speakerColor = getSpeakerColor(segment.speaker);
  const speakerLabel = getSpeakerLabel(segment.speaker);

  // Highlight search matches in text
  const renderText = () => {
    const text = segment.text;

    if (!searchQuery || searchQuery.trim().length === 0) {
      return <span>{text}</span>;
    }

    const query = searchQuery.trim().toLowerCase();
    const lowerText = text.toLowerCase();
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let matchIndex = lowerText.indexOf(query, lastIndex);

    while (matchIndex !== -1) {
      // Text before match
      if (matchIndex > lastIndex) {
        parts.push(
          <span key={`t-${lastIndex}`}>{text.slice(lastIndex, matchIndex)}</span>
        );
      }
      // Highlighted match
      parts.push(
        <span
          key={`m-${matchIndex}`}
          className="rounded-sm bg-yellow-400/30 px-0.5 text-yellow-200"
        >
          {text.slice(matchIndex, matchIndex + query.length)}
        </span>
      );
      lastIndex = matchIndex + query.length;
      matchIndex = lowerText.indexOf(query, lastIndex);
    }

    // Remaining text after last match
    if (lastIndex < text.length) {
      parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }

    return <>{parts}</>;
  };

  return (
    <div
      className="group flex items-start gap-2 rounded-lg px-1.5 py-1 transition-colors duration-100 hover:bg-accent/30"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Timestamp */}
      <span
        className="mt-0.5 shrink-0 text-[10px] tabular-nums text-muted-foreground/60"
        title={fullTimestamp}
      >
        {isHovered ? fullTimestamp : shortTimestamp}
      </span>

      {/* Speaker label */}
      <span
        className={`mt-0.5 shrink-0 text-[10px] font-semibold ${speakerColor}`}
      >
        {speakerLabel}
      </span>

      {/* Text content */}
      <span
        className={`text-xs leading-relaxed ${
          segment.is_final
            ? "text-foreground/90"
            : "text-foreground/50 italic"
        }`}
      >
        {renderText()}
      </span>

      {/* Confidence indicator for low-confidence results */}
      {segment.is_final && segment.confidence > 0 && segment.confidence < 0.7 && (
        <span
          className="mt-px shrink-0 text-[9px] text-muted-foreground/60"
          title={`Confidence: ${Math.round(segment.confidence * 100)}%`}
        >
          ?
        </span>
      )}
    </div>
  );
}
