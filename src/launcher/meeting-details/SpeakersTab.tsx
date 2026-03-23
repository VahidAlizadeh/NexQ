import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { Meeting, SpeakerIdentity } from "../../lib/types";
import { Users, Mic, Volume2, Check, X, Pencil } from "lucide-react";
import { formatDurationLong } from "../../lib/utils";
import { SpeakerTimeline } from "./SpeakerTimeline";

interface SpeakersTabProps {
  meeting: Meeting;
  onSegmentClick?: (segmentIndex: number) => void;
}

const SPEAKER_COLORS = [
  "#4a6cf7", // blue
  "#a855f7", // purple
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
];

function speakerColorFor(index: number): string {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

/** Compute talk time share as a percentage (0–100) */
function talkTimePercent(speaker: SpeakerIdentity, allSpeakers: SpeakerIdentity[]): number {
  const total = allSpeakers.reduce((acc, s) => acc + (s.stats?.talk_time_ms ?? 0), 0);
  if (total === 0) return 0;
  return Math.round(((speaker.stats?.talk_time_ms ?? 0) / total) * 100);
}

interface SpeakerRowProps {
  speaker: SpeakerIdentity;
  color: string;
  allSpeakers: SpeakerIdentity[];
  onRename: (id: string, newName: string) => void;
}

function SpeakerRow({ speaker, color, allSpeakers, onRename }: SpeakerRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(speaker.display_name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(speaker.display_name);
    setIsEditing(true);
  }, [speaker.display_name]);

  const handleSave = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== speaker.display_name) {
      onRename(speaker.id, trimmed);
    }
    setIsEditing(false);
  }, [editName, speaker.id, speaker.display_name, onRename]);

  const handleCancel = useCallback(() => {
    setEditName(speaker.display_name);
    setIsEditing(false);
  }, [speaker.display_name]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    else if (e.key === "Escape") handleCancel();
  }, [handleSave, handleCancel]);

  const pct = talkTimePercent(speaker, allSpeakers);
  const talkTime = speaker.stats?.talk_time_ms
    ? formatDurationLong(speaker.stats.talk_time_ms)
    : "—";

  // Detect if it's a built-in label (User/Them) vs a named speaker
  const isFixed = speaker.source === "fixed";
  const originalLabel = isFixed ? null : `Originally ${speaker.id}`;

  return (
    <div className="group flex items-start gap-3 rounded-xl px-3 py-3 hover:bg-secondary/20 transition-colors">
      {/* Color dot */}
      <div
        className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />

      {/* Name + edit */}
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              maxLength={80}
              className="flex-1 rounded-md border border-primary/30 bg-background px-2 py-0.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            <button
              onClick={handleSave}
              className="rounded p-0.5 text-success hover:bg-success/10 cursor-pointer"
              aria-label="Save name"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              onClick={handleCancel}
              className="rounded p-0.5 text-muted-foreground hover:bg-secondary cursor-pointer"
              aria-label="Cancel"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground">{speaker.display_name}</span>
            {!isFixed && (
              <button
                onClick={handleStartEdit}
                className="rounded p-0.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:bg-secondary hover:text-foreground transition-opacity cursor-pointer"
                aria-label={`Rename ${speaker.display_name}`}
              >
                <Pencil className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        )}

        {/* History hint */}
        {originalLabel && !isEditing && speaker.display_name !== speaker.id && (
          <p className="text-[10px] text-muted-foreground/40">{originalLabel}</p>
        )}

        {/* Stats bar */}
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
            <span>{talkTime} talk time</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-secondary/40">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </div>
          <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground/40">
            {speaker.stats?.segment_count !== undefined && (
              <span>{speaker.stats.segment_count} segments</span>
            )}
            {speaker.stats?.word_count !== undefined && (
              <span>{speaker.stats.word_count.toLocaleString()} words</span>
            )}
          </div>
        </div>
      </div>

      {/* Source icon */}
      <div className="shrink-0 text-muted-foreground/30 mt-0.5">
        {speaker.id === "User" || speaker.id === "Interviewer" ? (
          <Mic className="h-3.5 w-3.5" aria-label="Microphone" />
        ) : (
          <Volume2 className="h-3.5 w-3.5" aria-label="System audio" />
        )}
      </div>
    </div>
  );
}

/** Resolve a segment to its speaker ID — normalises "User"→"you", "Them"→"them" */
function resolveSpeakerId(seg: { speaker: string; speaker_id?: string }): string {
  if (seg.speaker_id) return seg.speaker_id;
  if (seg.speaker === "User") return "you";
  if (seg.speaker === "Them") return "them";
  return seg.speaker;
}

/** Synthesise speaker stats from the actual transcript segments */
function syntheticSpeakersFromTranscript(meeting: Meeting): SpeakerIdentity[] {
  const counts: Record<string, { segments: number; words: number; talkMs: number; speaker: string }> = {};
  for (const seg of meeting.transcript) {
    const key = resolveSpeakerId(seg);
    if (!counts[key]) counts[key] = { segments: 0, words: 0, talkMs: 0, speaker: seg.speaker };
    counts[key].segments++;
    const wordCount = seg.text.split(/\s+/).filter(Boolean).length;
    counts[key].words += wordCount;
    counts[key].talkMs += wordCount * 200;
  }
  return Object.entries(counts).map(([id, stats]) => ({
    id,
    display_name: id === "you" ? "You" : id === "them" ? "Them" : stats.speaker,
    source: "fixed" as const,
    stats: {
      segment_count: stats.segments,
      word_count: stats.words,
      talk_time_ms: stats.talkMs,
      last_spoke_ms: 0,
    },
  }));
}

export function SpeakersTab({ meeting, onSegmentClick }: SpeakersTabProps) {
  // Always recompute stats from transcript (stored talk_time_ms may be 0),
  // then merge display names/colors from stored speakers for renamed speakers.
  const [speakersState, setSpeakersState] = useState<SpeakerIdentity[]>(() => {
    const synthetic = meeting.transcript.length > 0
      ? syntheticSpeakersFromTranscript(meeting)
      : [];
    if (synthetic.length === 0) return meeting.speakers ?? [];
    if (meeting.speakers && meeting.speakers.length > 0) {
      const storedMap = new Map(meeting.speakers.map(s => [s.id, s]));
      return synthetic.map(s => {
        const stored = storedMap.get(s.id);
        if (stored) {
          return { ...s, display_name: stored.display_name, color: stored.color, source: stored.source };
        }
        return s;
      });
    }
    return synthetic;
  });

  const handleRename = useCallback((id: string, newName: string) => {
    setSpeakersState((prev) =>
      prev.map((s) => (s.id === id ? { ...s, display_name: newName } : s))
    );
    // Note: persisting to DB requires a future IPC command (Task 23+)
  }, []);

  // Compute meeting timing for the temporal timeline
  const meetingStartMs = useMemo(
    () => new Date(meeting.start_time).getTime(),
    [meeting.start_time]
  );

  const meetingDurationMs = useMemo(() => {
    if (meeting.duration_seconds) return meeting.duration_seconds * 1000;
    // Fallback: derive from transcript timestamps
    if (meeting.transcript.length >= 2) {
      const first = meeting.transcript[0].timestamp_ms;
      const last = meeting.transcript[meeting.transcript.length - 1].timestamp_ms;
      if (last > first) return last - first;
    }
    return 0;
  }, [meeting.duration_seconds, meeting.transcript]);

  if (speakersState.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
        <Users className="mb-3 h-6 w-6" />
        <p className="text-xs font-medium">No speaker data</p>
        <p className="mt-1 text-[11px] text-muted-foreground/40">
          Speaker data appears after meetings with diarization
        </p>
      </div>
    );
  }

  return (
    <div className="p-3">
      {/* Temporal timeline */}
      {meeting.transcript.length >= 2 && meetingDurationMs > 0 && (
        <SpeakerTimeline
          segments={meeting.transcript}
          speakers={speakersState}
          meetingStartMs={meetingStartMs}
          meetingDurationMs={meetingDurationMs}
          onSegmentClick={onSegmentClick}
        />
      )}

      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
        {speakersState.length} Speaker{speakersState.length !== 1 ? "s" : ""}
      </div>
      <div className="space-y-0.5">
        {speakersState.map((speaker, i) => (
          <SpeakerRow
            key={speaker.id}
            speaker={speaker}
            color={speaker.color ?? speakerColorFor(i)}
            allSpeakers={speakersState}
            onRename={handleRename}
          />
        ))}
      </div>
    </div>
  );
}
