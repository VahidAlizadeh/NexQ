// Runs meeting-critical hooks at the App level so they persist
// even when the user navigates away from the overlay view.
// This ensures transcription, timers, and persistence continue
// in the background regardless of which page is displayed.

import { useMeetingStore } from "../stores/meetingStore";
import { useMeetingTimer } from "../hooks/useMeetingTimer";
import { useTranscriptPersistence } from "../hooks/useTranscriptPersistence";
import { useTranscript } from "../hooks/useTranscript";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useAudioConfigSync } from "../hooks/useAudioConfigSync";
import { useStreamBuffer } from "../hooks/useStreamBuffer";
import { useCallLogCapture } from "../hooks/useCallLogCapture";
import { useSTTStatus } from "../hooks/useSTTStatus";
import { useDevLog } from "../hooks/useDevLog";

export function ActiveMeetingProvider() {
  const activeMeeting = useMeetingStore((s) => s.activeMeeting);

  // Only run hooks when there's an active meeting
  if (!activeMeeting) return null;

  return <ActiveMeetingHooks />;
}

// Separate component so hooks don't run conditionally
function ActiveMeetingHooks() {
  useMeetingTimer();
  useTranscript();
  useSpeechRecognition();
  useAudioConfigSync();
  useTranscriptPersistence();
  useStreamBuffer();
  useCallLogCapture();
  useSTTStatus();
  useDevLog();

  return null;
}
