import type { MeetingSummary } from "../lib/types";
import { getDateGroup } from "../lib/utils";
import { MeetingCard } from "./MeetingCard";
import { Mic } from "lucide-react";

interface RecentMeetingsProps {
  meetings: MeetingSummary[];
  onSelect: (meetingId: string) => void;
  onDelete: (meetingId: string) => void;
  onRename: (meetingId: string, newTitle: string) => void;
  favorites?: Set<string>;
  onToggleFavorite?: (meetingId: string) => void;
  activeMeetingId?: string | null;
}

/** Groups meetings by date category: Today, Yesterday, This Week, Earlier */
function groupMeetingsByDate(
  meetings: MeetingSummary[]
): Map<string, MeetingSummary[]> {
  const groups = new Map<string, MeetingSummary[]>();
  const order = ["Today", "Yesterday", "This Week", "Earlier"];

  for (const label of order) {
    groups.set(label, []);
  }

  for (const meeting of meetings) {
    const group = getDateGroup(meeting.start_time);
    const list = groups.get(group);
    if (list) {
      list.push(meeting);
    } else {
      groups.set(group, [meeting]);
    }
  }

  for (const [key, value] of groups) {
    if (value.length === 0) {
      groups.delete(key);
    }
  }

  return groups;
}

export function RecentMeetings({
  meetings,
  onSelect,
  onDelete,
  onRename,
  favorites,
  onToggleFavorite,
  activeMeetingId,
}: RecentMeetingsProps) {
  if (meetings.length === 0) {
    return (
      <div className="dash-main flex flex-col items-center justify-center rounded-2xl border border-border/20 bg-secondary/10 py-14">
        <div className="empty-state-float mb-3 rounded-full bg-primary/8 p-3.5">
          <Mic className="h-4.5 w-4.5 text-primary/35" />
        </div>
        <p className="text-xs font-medium text-muted-foreground/50">
          No meetings yet
        </p>
        <p className="mt-1 text-meta text-muted-foreground/60">
          Start a meeting to see it here
        </p>
      </div>
    );
  }

  const grouped = groupMeetingsByDate(meetings);

  // Running counter for staggered card entrance across all groups
  let cardIndex = 0;

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([dateGroup, groupMeetings]) => (
        <div key={dateGroup}>
          <h3 className="mb-2 text-meta font-semibold uppercase tracking-wider text-muted-foreground/60">
            {dateGroup}
          </h3>
          <div className="space-y-1.5">
            {groupMeetings.map((meeting) => {
              const idx = cardIndex++;
              return (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onRename={onRename}
                  isFavorite={favorites?.has(meeting.id) ?? false}
                  onToggleFavorite={onToggleFavorite}
                  isLive={meeting.id === activeMeetingId}
                  staggerIndex={idx}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
