import { useEffect, useState } from "react";
import { listMeetings } from "../lib/ipc";
import { useMeetingStore } from "../stores/meetingStore";
import type { MeetingSummary } from "../lib/types";

/**
 * Hook that checks for unfinished meetings on app startup.
 * A meeting is considered unfinished if it has a start_time but no end_time
 * (i.e., duration_seconds is null and end_time is null).
 */
export function useCrashRecovery() {
  const [checked, setChecked] = useState(false);
  const unfinishedMeeting = useMeetingStore((s) => s.unfinishedMeeting);
  const setUnfinishedMeeting = useMeetingStore((s) => s.setUnfinishedMeeting);

  useEffect(() => {
    if (checked) return;

    async function checkUnfinished() {
      try {
        const meetings = await listMeetings(50, 0);
        // Find meetings with no end_time (duration_seconds will be null)
        const unfinished = meetings.find(
          (m: MeetingSummary) => m.end_time === null
        );

        if (unfinished) {
          setUnfinishedMeeting(unfinished);
        }
      } catch (err) {
        console.error("[crashRecovery] Failed to check for unfinished meetings:", err);
      } finally {
        setChecked(true);
      }
    }

    checkUnfinished();
  }, [checked, setUnfinishedMeeting]);

  const dismissUnfinished = () => {
    setUnfinishedMeeting(null);
  };

  return {
    unfinishedMeeting,
    dismissUnfinished,
  };
}
