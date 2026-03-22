// Sub-PRD 4 / Task 13: Individual transcript line component
// Displays timestamp, speaker label, and text for a single transcript segment.
// Speaker color is dynamic via speakerStore; confidence underline when enabled.

import { useState } from "react";
import type { TranscriptSegment } from "../lib/types";
import { useMeetingStore } from "../stores/meetingStore";
import { useSpeakerStore } from "../stores/speakerStore";
import { useConfigStore } from "../stores/configStore";

interface TranscriptLineProps {
  segment: TranscriptSegment;
  /** Optional search query to highlight matches */
  searchQuery?: string;
}

/**
 * Renders a single transcript segment with:
 * - Formatted timestamp (MM:SS)
 * - Speaker label with dynamic color from speakerStore
 * - Text content (italic/lighter for interim, normal for final)
 * - Confidence underline when confidenceHighlightEnabled and below threshold
 * - Hover state showing full timestamp with milliseconds
 */
export function TranscriptLine({ segment, searchQuery }: TranscriptLineProps) {
  const [isHovered, setIsHovered] = useState(false);
  const meetingStartTime = useMeetingStore((s) => s.meetingStartTime);
  const getSpeakerColor = useSpeakerStore((s) => s.getSpeakerColor);
  const getSpeakerDisplayName = useSpeakerStore((s) => s.getSpeakerDisplayName);
  const confidenceThreshold = useConfigStore((s) => s.confidenceThreshold);
  const confidenceHighlightEnabled = useConfigStore((s) => s.confidenceHighlightEnabled);

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

  // Resolve speaker ID — prefer explicit speaker_id, fall back to speaker field
  const speakerId = segment.speaker_id ?? (segment.speaker === "User" ? "you" : "them");
  const speakerHex = getSpeakerColor(speakerId);
  const speakerLabel = getSpeakerDisplayName(speakerId);

  // Confidence underline: low confidence text gets a dotted underline + reduced opacity
  const isLowConfidence =
    segment.is_final &&
    confidenceHighlightEnabled &&
    segment.confidence > 0 &&
    segment.confidence < confidenceThreshold;

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
          className="rounded-sm bg-highlight/30 px-0.5 text-highlight"
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
      className={`group flex items-start gap-2 rounded-lg px-1.5 py-1 transition-colors duration-100 hover:bg-accent/30 border-l-2 transcript-line-enter`}
      style={{ borderLeftColor: `${speakerHex}80` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Timestamp */}
      <span
        className="mt-0.5 shrink-0 text-meta tabular-nums text-muted-foreground/60"
        title={fullTimestamp}
      >
        {isHovered ? fullTimestamp : shortTimestamp}
      </span>

      {/* Speaker label */}
      <span
        className="mt-0.5 shrink-0 text-meta font-semibold"
        style={{ color: speakerHex }}
      >
        {speakerLabel}
      </span>

      {/* Text content */}
      <span
        className={`text-xs leading-relaxed ${
          segment.is_final
            ? "text-foreground/90"
            : "text-foreground/50 italic"
        } ${
          isLowConfidence
            ? "border-b border-dotted border-white/30 opacity-70"
            : ""
        }`}
        title={isLowConfidence ? `Confidence: ${Math.round(segment.confidence * 100)}%` : undefined}
      >
        {renderText()}
      </span>
    </div>
  );
}
