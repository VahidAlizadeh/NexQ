import type { Meeting } from "../../lib/types";
import { Bookmark } from "lucide-react";
import { formatTimestamp, formatRelativeTime } from "../../lib/utils";

interface BookmarksTabProps {
  meeting: Meeting;
}

export function BookmarksTab({ meeting }: BookmarksTabProps) {
  const bookmarks = meeting.bookmarks ?? [];
  const meetingStartMs = new Date(meeting.start_time).getTime();

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
        <Bookmark className="mb-3 h-6 w-6" />
        <p className="text-xs font-medium">No bookmarks</p>
        <p className="mt-1 text-[11px] text-muted-foreground/40">
          Bookmark moments during meetings to revisit them here
        </p>
      </div>
    );
  }

  // Sort by timestamp
  const sorted = [...bookmarks].sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  return (
    <div className="p-3">
      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
        {bookmarks.length} bookmark{bookmarks.length !== 1 ? "s" : ""}
      </div>
      <div className="space-y-1">
        {sorted.map((bookmark) => {
          const relativeMs = Math.max(0, bookmark.timestamp_ms - meetingStartMs);
          return (
            <div
              key={bookmark.id}
              className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 hover:bg-secondary/20 transition-colors"
            >
              {/* Timestamp chip */}
              <div className="mt-0.5 shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5">
                <span className="tabular-nums text-[10px] font-semibold text-primary">
                  {formatTimestamp(relativeMs)}
                </span>
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                {bookmark.note ? (
                  <p className="text-xs leading-relaxed text-foreground/80">{bookmark.note}</p>
                ) : (
                  <p className="text-xs italic text-muted-foreground/40">No note</p>
                )}
                <p className="mt-0.5 text-[10px] text-muted-foreground/35">
                  {formatRelativeTime(bookmark.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
