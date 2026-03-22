// Task 14: Bookmark inline marker for transcript
// Shown inline with a yellow accent, timestamp, and optional note.

import type { MeetingBookmark } from "../lib/types";
import { Bookmark } from "lucide-react";
import { formatDuration } from "../lib/utils";

interface BookmarkMarkerProps {
  bookmark: MeetingBookmark;
}

export function BookmarkMarker({ bookmark }: BookmarkMarkerProps) {
  const timeLabel = formatDuration(bookmark.timestamp_ms);

  return (
    <div className="flex items-center gap-1.5 my-1 px-1.5 py-0.5 rounded-md border-l-2 border-l-yellow-400/60 bg-yellow-400/5">
      <Bookmark className="h-3 w-3 shrink-0 text-yellow-400/80 fill-current" />
      <span className="text-meta tabular-nums text-yellow-400/70 shrink-0">{timeLabel}</span>
      {bookmark.note && (
        <span className="text-xs text-muted-foreground/70 truncate">{bookmark.note}</span>
      )}
    </div>
  );
}
