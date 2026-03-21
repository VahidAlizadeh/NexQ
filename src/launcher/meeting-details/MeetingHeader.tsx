import { useState, useCallback, useRef, useEffect } from "react";
import type { Meeting } from "../../lib/types";
import { renameMeeting } from "../../lib/ipc";
import { useMeetingStore } from "../../stores/meetingStore";
import {
  formatRelativeTime,
  formatDurationLong,
} from "../../lib/utils";
import { ArrowLeft, Pencil, Check, X } from "lucide-react";

interface MeetingHeaderProps {
  meeting: Meeting;
  onBack: () => void;
  onTitleChanged: (title: string) => void;
}

export function MeetingHeader({ meeting, onBack, onTitleChanged }: MeetingHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(meeting.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeMeetingId = useMeetingStore((s) => s.activeMeeting?.id);
  const loadRecentMeetings = useMeetingStore((s) => s.loadRecentMeetings);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = useCallback(() => {
    setEditTitle(meeting.title);
    setIsEditing(true);
  }, [meeting.title]);

  const handleSaveEdit = useCallback(async () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== meeting.title) {
      try {
        await renameMeeting(meeting.id, trimmed);
        onTitleChanged(trimmed);
        // Update active meeting title if this is the live meeting
        if (meeting.id === activeMeetingId) {
          const active = useMeetingStore.getState().activeMeeting;
          if (active) {
            useMeetingStore.getState().setActiveMeeting({ ...active, title: trimmed });
          }
        }
        await loadRecentMeetings();
      } catch (err) {
        console.error("[MeetingHeader] Failed to rename:", err);
      }
    }
    setIsEditing(false);
  }, [editTitle, meeting.id, meeting.title, activeMeetingId, onTitleChanged, loadRecentMeetings]);

  const handleCancelEdit = useCallback(() => {
    setEditTitle(meeting.title);
    setIsEditing(false);
  }, [meeting.title]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSaveEdit();
      else if (e.key === "Escape") handleCancelEdit();
    },
    [handleSaveEdit, handleCancelEdit]
  );

  const durationDisplay = meeting.duration_seconds
    ? formatDurationLong(meeting.duration_seconds * 1000)
    : "In progress";

  return (
    <div className="flex items-center gap-4 border-b border-border/20 px-6 py-4">
      <button
        onClick={onBack}
        className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="group min-w-0 flex-1">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              className="w-full rounded-lg border border-primary/30 bg-background px-3 py-1.5 text-base font-semibold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            <button
              onClick={handleSaveEdit}
              className="rounded-md p-1.5 text-green-400 hover:bg-green-400/10 cursor-pointer"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={handleCancelEdit}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={handleStartEdit}
          >
            <h2 className="truncate text-base font-semibold text-foreground">
              {meeting.title}
            </h2>
            <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        )}
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
          <span>{formatRelativeTime(meeting.start_time)}</span>
          <span className="text-muted-foreground/60">&middot;</span>
          <span>{durationDisplay}</span>
          <span className="text-muted-foreground/60">&middot;</span>
          <span>{meeting.transcript.length} segments</span>
        </div>
      </div>
    </div>
  );
}
