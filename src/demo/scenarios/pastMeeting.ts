import type { DemoScenario } from './types';
import type {
  MeetingSummary,
  TranscriptSegment,
  LogEntry,
  MeetingBookmark,
  ActionItem,
} from '../../lib/types';
import { useMeetingStore } from '../../stores/meetingStore';
import { useTranscriptStore } from '../../stores/transcriptStore';
import { useCallLogStore } from '../../stores/callLogStore';
import { useBookmarkStore } from '../../stores/bookmarkStore';
import { useActionItemStore } from '../../stores/actionItemStore';
import { useSpeakerStore } from '../../stores/speakerStore';
import { useStreamStore } from '../../stores/streamStore';

// ---------------------------------------------------------------------------
// Recent meetings data
// ---------------------------------------------------------------------------

function makeRecentMeetings(): MeetingSummary[] {
  const now = Date.now();
  const todayBase = new Date(now);
  todayBase.setHours(10, 30, 0, 0);

  const yesterdayBase = new Date(now - 1 * 86400000);
  yesterdayBase.setHours(14, 0, 0, 0);

  const twoDaysAgo = new Date(now - 2 * 86400000);
  twoDaysAgo.setHours(9, 0, 0, 0);

  const threeDaysAgo = new Date(now - 3 * 86400000);
  threeDaysAgo.setHours(15, 0, 0, 0);

  const fourDaysAgo = new Date(now - 4 * 86400000);
  fourDaysAgo.setHours(11, 0, 0, 0);

  return [
    {
      id: 'demo-past-001',
      title: 'Technical Interview — Google',
      start_time: todayBase.toISOString(),
      end_time: new Date(todayBase.getTime() + 45 * 60000).toISOString(),
      duration_seconds: 2700,
      segment_count: 127,
      has_summary: true,
      audio_mode: 'online',
      ai_scenario: 'interview',
      speaker_count: 2,
    },
    {
      id: 'demo-past-002',
      title: 'CS 301 — Distributed Systems',
      start_time: yesterdayBase.toISOString(),
      end_time: new Date(yesterdayBase.getTime() + 75 * 60000).toISOString(),
      duration_seconds: 4500,
      segment_count: 89,
      has_summary: true,
      audio_mode: 'online',
      ai_scenario: 'lecture',
      speaker_count: 1,
    },
    {
      id: 'demo-past-003',
      title: 'Sprint Planning — Q2 Roadmap',
      start_time: twoDaysAgo.toISOString(),
      end_time: new Date(twoDaysAgo.getTime() + 30 * 60000).toISOString(),
      duration_seconds: 1800,
      segment_count: 64,
      has_summary: true,
      audio_mode: 'online',
      ai_scenario: 'team_meeting',
      speaker_count: 4,
    },
    {
      id: 'demo-past-004',
      title: 'Mock Interview Practice',
      start_time: threeDaysAgo.toISOString(),
      end_time: new Date(threeDaysAgo.getTime() + 25 * 60000).toISOString(),
      duration_seconds: 1500,
      segment_count: 52,
      has_summary: false,
      audio_mode: 'online',
      ai_scenario: 'interview',
      speaker_count: 2,
    },
    {
      id: 'demo-past-005',
      title: 'Office Hours — Prof. Chen',
      start_time: fourDaysAgo.toISOString(),
      end_time: new Date(fourDaysAgo.getTime() + 20 * 60000).toISOString(),
      duration_seconds: 1200,
      segment_count: 31,
      has_summary: false,
      audio_mode: 'online',
      ai_scenario: 'lecture',
      speaker_count: 2,
    },
  ];
}

// ---------------------------------------------------------------------------
// Transcript data — interview conversation for first meeting
// ---------------------------------------------------------------------------

const SEGMENTS: TranscriptSegment[] = [
  {
    id: 'demo-past-seg-001',
    text: "Welcome! Let's start with your background. Tell me about a system you designed at scale.",
    speaker: 'Interviewer',
    speaker_id: 'them',
    timestamp_ms: 60000,
    is_final: true,
    confidence: 0.96,
  },
  {
    id: 'demo-past-seg-002',
    text: 'At my previous role, I designed a distributed event processing system handling 2 million events per second.',
    speaker: 'User',
    speaker_id: 'you',
    timestamp_ms: 75000,
    is_final: true,
    confidence: 0.94,
  },
  {
    id: 'demo-past-seg-003',
    text: 'Interesting. What was the partition strategy and how did you handle hot partitions?',
    speaker: 'Interviewer',
    speaker_id: 'them',
    timestamp_ms: 95000,
    is_final: true,
    confidence: 0.95,
  },
  {
    id: 'demo-past-seg-004',
    text: 'We used consistent hashing with virtual nodes. For hot partitions, we implemented a spillover mechanism that dynamically redistributes load.',
    speaker: 'User',
    speaker_id: 'you',
    timestamp_ms: 110000,
    is_final: true,
    confidence: 0.93,
  },
  {
    id: 'demo-past-seg-005',
    text: "Good approach. Now let's talk about failure scenarios. What happens when a node goes down?",
    speaker: 'Interviewer',
    speaker_id: 'them',
    timestamp_ms: 135000,
    is_final: true,
    confidence: 0.97,
  },
  {
    id: 'demo-past-seg-006',
    text: 'We have a gossip protocol for failure detection with a 3-second timeout. On failure, the partition map is recalculated and traffic is rerouted within 5 seconds.',
    speaker: 'User',
    speaker_id: 'you',
    timestamp_ms: 150000,
    is_final: true,
    confidence: 0.92,
  },
  {
    id: 'demo-past-seg-007',
    text: 'How do you ensure data consistency during that failover window?',
    speaker: 'Interviewer',
    speaker_id: 'them',
    timestamp_ms: 175000,
    is_final: true,
    confidence: 0.95,
  },
  {
    id: 'demo-past-seg-008',
    text: 'We use write-ahead logs replicated to two secondary nodes. During failover, the secondary with the most recent WAL position is promoted.',
    speaker: 'User',
    speaker_id: 'you',
    timestamp_ms: 190000,
    is_final: true,
    confidence: 0.94,
  },
  {
    id: 'demo-past-seg-009',
    text: "Excellent. Let's move to the system design question. How would you design a URL shortener at Google scale?",
    speaker: 'Interviewer',
    speaker_id: 'them',
    timestamp_ms: 220000,
    is_final: true,
    confidence: 0.96,
  },
  {
    id: 'demo-past-seg-010',
    text: "I'd start with the core requirements: high read throughput, low latency, and globally distributed. For the ID generation, I'd use a base62 encoding of a Snowflake-style ID.",
    speaker: 'User',
    speaker_id: 'you',
    timestamp_ms: 240000,
    is_final: true,
    confidence: 0.93,
  },
];

// ---------------------------------------------------------------------------
// Call log entries
// ---------------------------------------------------------------------------

function makeCallLogEntries(): LogEntry[] {
  const now = Date.now();
  const base: Omit<LogEntry, 'id' | 'timestamp' | 'mode' | 'responseContent' | 'responseContentClean' | 'actualUserPrompt' | 'startedAt' | 'completedAt'> = {
    provider: 'openai',
    model: 'gpt-4o',
    status: 'complete',
    firstTokenAt: now - 3000,
    totalTokens: 380,
    latencyMs: 950,
    actualSystemPrompt: '',
    includeTranscript: true,
    includeRag: false,
    includeInstructions: false,
    includeQuestion: true,
    temperature: null,
    ragQuery: null,
    ragChunks: [],
    ragChunksFiltered: 0,
    ragTotalCandidates: 0,
    transcriptWindowSeconds: 120,
    transcriptSegmentsCount: 10,
    transcriptSegmentsTotal: 10,
    snapshotTranscript: '',
    snapshotContext: '',
    reconstructedSystemPrompt: '',
    errorMessage: null,
  };

  return [
    {
      ...base,
      id: 'demo-past-log-001',
      timestamp: now - 600000,
      startedAt: now - 601000,
      completedAt: now - 600000,
      mode: 'Assist',
      actualUserPrompt: 'What are the key talking points for the system design question?',
      responseContent: 'Here are key talking points for the system design question:\n\n1. **Start with requirements** — Clarify functional vs non-functional requirements\n2. **Capacity estimation** — Calculate QPS, storage, and bandwidth\n3. **High-level design** — Draw the core components first\n4. **Deep dive** — Pick 2-3 components to discuss in detail\n5. **Trade-offs** — Discuss CAP theorem implications for your design',
      responseContentClean: 'Here are key talking points for the system design question:\n\n1. **Start with requirements** — Clarify functional vs non-functional requirements\n2. **Capacity estimation** — Calculate QPS, storage, and bandwidth\n3. **High-level design** — Draw the core components first\n4. **Deep dive** — Pick 2-3 components to discuss in detail\n5. **Trade-offs** — Discuss CAP theorem implications for your design',
    },
    {
      ...base,
      id: 'demo-past-log-002',
      timestamp: now - 300000,
      startedAt: now - 301000,
      completedAt: now - 300000,
      mode: 'WhatToSay',
      actualUserPrompt: 'How should I respond to the URL shortener question?',
      responseContent: "I'd recommend emphasizing your experience with distributed systems and walk through the design methodically:\n\n\"For a URL shortener at Google scale, I'd focus on three pillars: a globally distributed hash generation service using Snowflake IDs, a multi-tier caching strategy with CDN + Redis + local cache, and eventual consistency with read replicas across regions.\"",
      responseContentClean: "I'd recommend emphasizing your experience with distributed systems and walk through the design methodically:\n\n\"For a URL shortener at Google scale, I'd focus on three pillars: a globally distributed hash generation service using Snowflake IDs, a multi-tier caching strategy with CDN + Redis + local cache, and eventual consistency with read replicas across regions.\"",
    },
    {
      ...base,
      id: 'demo-past-log-003',
      timestamp: now - 60000,
      startedAt: now - 61000,
      completedAt: now - 60000,
      mode: 'MeetingSummary',
      actualUserPrompt: 'Summarize this interview meeting.',
      responseContent: 'Meeting covered system design fundamentals, behavioral questions about past experience with distributed event processing (2M events/sec), failure handling strategies (gossip protocol, WAL replication), and a URL shortener design exercise. Strong discussion of consistent hashing, hot partition spillover, and Snowflake ID generation.',
      responseContentClean: 'Meeting covered system design fundamentals, behavioral questions about past experience with distributed event processing (2M events/sec), failure handling strategies (gossip protocol, WAL replication), and a URL shortener design exercise. Strong discussion of consistent hashing, hot partition spillover, and Snowflake ID generation.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

function makeBookmarks(): MeetingBookmark[] {
  return [
    {
      id: 'demo-past-bk-001',
      timestamp_ms: 95000,
      segment_id: 'demo-past-seg-003',
      note: 'Hot partition question — good answer',
      created_at: new Date(Date.now() - 2400000).toISOString(),
    },
    {
      id: 'demo-past-bk-002',
      timestamp_ms: 175000,
      segment_id: 'demo-past-seg-007',
      note: 'Data consistency during failover',
      created_at: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: 'demo-past-bk-003',
      timestamp_ms: 220000,
      segment_id: 'demo-past-seg-009',
      note: 'System design question starts here',
      created_at: new Date(Date.now() - 1200000).toISOString(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Action items
// ---------------------------------------------------------------------------

function makeActionItems(): ActionItem[] {
  return [
    {
      id: 'demo-past-ai-001',
      text: 'Send follow-up thank you email',
      timestamp_ms: 240000,
      completed: false,
    },
    {
      id: 'demo-past-ai-002',
      text: 'Prepare system design deep-dive for final round',
      timestamp_ms: 240000,
      completed: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// populate()
// ---------------------------------------------------------------------------

function populate(): void {
  const meetings = makeRecentMeetings();

  // 1. Set launcher view with no active meeting, select first meeting
  useMeetingStore.setState({
    currentView: 'launcher',
    activeMeeting: null,
    recentMeetings: meetings,
    selectedMeetingId: meetings[0].id,
  });

  // 2. Transcript — 10 segments from the first meeting
  const { appendSegment } = useTranscriptStore.getState();
  for (const seg of SEGMENTS) {
    appendSegment(seg);
  }

  // 3. Call log — 3 entries
  const entries = makeCallLogEntries();
  for (const entry of entries) {
    useCallLogStore.getState().beginEntry(entry);
    useCallLogStore.getState().completeEntry(entry.id, entry.totalTokens ?? 380, entry.latencyMs ?? 950);
  }

  // 4. Bookmarks — 3 at different timestamps
  useBookmarkStore.setState({ bookmarks: makeBookmarks() });

  // 5. Action items — 2 items
  const items = makeActionItems();
  for (const item of items) {
    useActionItemStore.getState().addItem(item);
  }

  // 6. Speaker stats — 2 speakers
  useSpeakerStore.getState().initForOnline();
  useSpeakerStore.getState().renameSpeaker('them', 'Interviewer');
  // "You" — 42% talk time: 5 segments, ~180 words, ~1134000ms * 0.42
  // "Interviewer" — 58% talk time: 5 segments, ~130 words, ~1134000ms * 0.58
  const totalTalkMs = 2700000; // 45min in ms
  // Update stats segment-by-segment (updateStats increments segment_count each call)
  for (let i = 0; i < 5; i++) {
    useSpeakerStore.getState().updateStats('you', 36, Math.round((totalTalkMs * 0.42) / 5));
  }
  for (let i = 0; i < 5; i++) {
    useSpeakerStore.getState().updateStats('them', 26, Math.round((totalTalkMs * 0.58) / 5));
  }
}

// ---------------------------------------------------------------------------
// Meeting summary content for streaming
// ---------------------------------------------------------------------------

const MEETING_SUMMARY_CONTENT = `**Technical Interview — Google (Summary)**

**Overview:** 45-minute technical interview covering system design fundamentals, distributed systems experience, and a URL shortener design exercise.

**Key Topics Discussed:**
1. **Distributed Event Processing** — Candidate described a system handling 2M events/sec using consistent hashing with virtual nodes and a spillover mechanism for hot partitions.
2. **Failure Handling** — Gossip protocol for detection (3s timeout), WAL replication to two secondaries, automatic failover within 5 seconds.
3. **Data Consistency** — Write-ahead logs with secondary promotion based on most recent WAL position during failover windows.
4. **URL Shortener Design** — Proposed base62 encoding of Snowflake-style IDs, globally distributed architecture with high read throughput and low latency.

**Strengths:** Strong distributed systems knowledge, clear communication of trade-offs, practical experience with production systems at scale.

**Follow-up Items:** Send thank-you email, prepare deeper system design materials for potential final round.`;

// ---------------------------------------------------------------------------
// play() — 15-second animated timeline for reviewing a past meeting
// ---------------------------------------------------------------------------

function play(): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];

  // Helper to schedule a timeout and track it
  function schedule(fn: () => void, delayMs: number) {
    timers.push(setTimeout(fn, delayMs));
  }

  const meetings = makeRecentMeetings();
  const targetMeetingId = meetings[0].id; // 'demo-past-001'

  // 0s — Show launcher with 5 meetings in the list
  useMeetingStore.setState({
    currentView: 'launcher',
    activeMeeting: null,
    recentMeetings: meetings,
    selectedMeetingId: null,
  });

  // 2s — "Click" meeting #1: populate data then navigate into detail view
  schedule(() => {
    // Populate transcript with 10 segments
    const { appendSegment } = useTranscriptStore.getState();
    for (const seg of SEGMENTS) {
      appendSegment(seg);
    }

    // Initialize speakers
    useSpeakerStore.getState().initForOnline();
    useSpeakerStore.getState().renameSpeaker('them', 'Interviewer');
    const totalTalkMs = 2700000;
    for (let i = 0; i < 5; i++) {
      useSpeakerStore.getState().updateStats('you', 36, Math.round((totalTalkMs * 0.42) / 5));
    }
    for (let i = 0; i < 5; i++) {
      useSpeakerStore.getState().updateStats('them', 26, Math.round((totalTalkMs * 0.58) / 5));
    }

    // Bookmarks — show immediately with the meeting
    useBookmarkStore.setState({ bookmarks: makeBookmarks() });

    // Navigate into the meeting detail view
    useMeetingStore.setState({ selectedMeetingId: targetMeetingId });
  }, 2000);

  // 5s — Show call log entries appearing (3 entries: Assist, WhatToSay, MeetingSummary)
  schedule(() => {
    const entries = makeCallLogEntries();
    for (const entry of entries) {
      useCallLogStore.getState().beginEntry(entry);
      useCallLogStore.getState().completeEntry(entry.id, entry.totalTokens ?? 380, entry.latencyMs ?? 950);
    }
  }, 5000);

  // 7s — Show action items (2 items)
  schedule(() => {
    const items = makeActionItems();
    for (const item of items) {
      useActionItemStore.getState().addItem(item);
    }
  }, 7000);

  // 9s — "Generate Summary" — start streaming a meeting summary
  schedule(() => {
    useStreamStore.getState().startStream('MeetingSummary', 'gpt-4o', 'openai');

    // Stream tokens rapidly over ~3.5 seconds
    const tokens = MEETING_SUMMARY_CONTENT.split(' ');
    const tokenDelay = 3500 / tokens.length;

    tokens.forEach((token, i) => {
      schedule(() => {
        useStreamStore.getState().appendToken((i === 0 ? '' : ' ') + token);
      }, i * tokenDelay);
    });

    // Summary complete (4s after start)
    schedule(() => {
      useStreamStore.getState().endStream(1400);
    }, 4000);
  }, 9000);

  // Cleanup function — cancel all timers and reset selected meeting
  return () => {
    for (const id of timers) {
      clearTimeout(id);
    }
    useMeetingStore.setState({ selectedMeetingId: null });
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const pastMeetingScenario: DemoScenario = {
  id: 'past-meeting',
  name: 'Past Meeting History',
  description: 'Launcher with 5 recent meetings, transcript, call log, bookmarks, and action items',
  icon: '📋',
  supportsPlay: true,
  window: 'launcher',
  populate,
  play,
};
