import type { DemoScenario } from './types';
import type { TranscriptSegment, Speaker, LogEntry } from '../../lib/types';
import { useMeetingStore } from '../../stores/meetingStore';
import { useSpeakerStore } from '../../stores/speakerStore';
import { useTranscriptStore } from '../../stores/transcriptStore';
import { useStreamStore } from '../../stores/streamStore';
import { useCallLogStore } from '../../stores/callLogStore';
import { useBookmarkStore } from '../../stores/bookmarkStore';
import { useActionItemStore } from '../../stores/actionItemStore';
import { useTopicSectionStore } from '../../stores/topicSectionStore';

// ---------------------------------------------------------------------------
// Transcript data
// ---------------------------------------------------------------------------

const SEGMENTS: { id: string; speaker: Speaker; speakerId: string; ms: number; text: string }[] = [
  {
    id: 'demo-seg-201',
    speaker: 'Them',
    speakerId: 'them',
    ms: 30000,
    text: "Today we'll cover consensus algorithms, specifically Raft and Paxos.",
  },
  {
    id: 'demo-seg-202',
    speaker: 'Them',
    speakerId: 'them',
    ms: 60000,
    text: 'The key insight is that in a distributed system, we need a way to agree on a single value.',
  },
  {
    id: 'demo-seg-203',
    speaker: 'Them',
    speakerId: 'them',
    ms: 90000,
    text: 'Raft simplifies this by electing a leader. The leader handles all client requests.',
  },
  {
    id: 'demo-seg-204',
    speaker: 'Them',
    speakerId: 'them',
    ms: 120000,
    text: 'The election timeout is randomized to avoid split votes. This is homework item one \u2014 implement leader election.',
  },
  {
    id: 'demo-seg-205',
    speaker: 'Them',
    speakerId: 'them',
    ms: 150000,
    text: "Now let's look at how Paxos differs. Paxos uses a proposer-acceptor model.",
  },
  {
    id: 'demo-seg-206',
    speaker: 'Them',
    speakerId: 'them',
    ms: 180000,
    text: "The key difference is that Paxos doesn't require a stable leader.",
  },
  {
    id: 'demo-seg-207',
    speaker: 'Them',
    speakerId: 'them',
    ms: 210000,
    text: 'Both achieve consensus but with different trade-offs in complexity and performance.',
  },
];

// ---------------------------------------------------------------------------
// AI response content (Recap mode)
// ---------------------------------------------------------------------------

const AI_RESPONSE = `**Lecture Recap \u2014 Consensus Algorithms**

**Key concepts covered:**
- Consensus algorithms allow distributed systems to agree on a single value despite failures
- Two main approaches discussed: Raft (leader-based) and Paxos (proposer-acceptor)

**Raft:**
- Simplifies consensus through leader election
- Leader handles all client requests and log replication
- Randomized election timeouts prevent split votes
- Easier to understand and implement than Paxos

**Paxos:**
- Uses a proposer-acceptor model without requiring a stable leader
- More flexible but significantly more complex to implement correctly
- Better suited for environments where leader stability is not guaranteed

**Trade-offs:**
- Raft prioritizes understandability and implementation simplicity
- Paxos offers more theoretical generality at the cost of complexity

**Action item:** Implement Raft leader election algorithm (homework #1)`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegment(data: (typeof SEGMENTS)[number]): TranscriptSegment {
  return {
    id: data.id,
    text: data.text,
    speaker: data.speaker,
    speaker_id: data.speakerId,
    timestamp_ms: data.ms,
    is_final: true,
    confidence: 0.95,
  };
}

function makeLogEntry(): LogEntry {
  const now = Date.now();
  return {
    id: 'demo-log-lecture-001',
    timestamp: now,
    mode: 'Recap',
    provider: 'openai',
    model: 'gpt-4o',
    status: 'complete',
    startedAt: now - 1400,
    firstTokenAt: now - 1300,
    completedAt: now,
    totalTokens: 380,
    latencyMs: 1400,
    responseContent: AI_RESPONSE,
    responseContentClean: AI_RESPONSE,
    actualSystemPrompt: '',
    actualUserPrompt: 'Provide a recap of the lecture so far.',
    includeTranscript: true,
    includeRag: false,
    includeInstructions: false,
    includeQuestion: false,
    temperature: null,
    ragQuery: null,
    ragChunks: [],
    ragChunksFiltered: 0,
    ragTotalCandidates: 0,
    transcriptWindowSeconds: 300,
    transcriptSegmentsCount: 7,
    transcriptSegmentsTotal: 7,
    snapshotTranscript: '',
    snapshotContext: '',
    reconstructedSystemPrompt: '',
    errorMessage: null,
  };
}

// ---------------------------------------------------------------------------
// populate() \u2014 instant final state for screenshot mode
// ---------------------------------------------------------------------------

function populate(): void {
  const now = Date.now();

  // 1. Meeting state
  useMeetingStore.setState({
    activeMeeting: {
      id: 'demo-lecture-001',
      title: 'CS 301 \u2014 Distributed Systems',
      start_time: new Date(now - 210000).toISOString(),
      end_time: null,
      duration_seconds: null,
      transcript: [],
      ai_interactions: [],
      summary: null,
      config_snapshot: null,
      audio_mode: 'online',
      ai_scenario: 'lecture',
    },
    currentView: 'overlay',
    isRecording: true,
    audioMode: 'online',
    aiScenario: 'lecture',
    elapsedMs: 210000,
    meetingStartTime: now - 210000,
  });

  // 2. Speaker: Prof. Chen (use "them" speaker, rename)
  useSpeakerStore.getState().initForOnline();
  useSpeakerStore.getState().renameSpeaker('them', 'Prof. Chen');
  // Update stats: 7 segments from Prof. Chen
  for (const seg of SEGMENTS) {
    const wordCount = seg.text.split(/\s+/).length;
    useSpeakerStore.getState().updateStats('them', wordCount, 5000);
  }

  // 3. Transcript \u2014 7 segments
  const { appendSegment } = useTranscriptStore.getState();
  for (const seg of SEGMENTS) {
    appendSegment(makeSegment(seg));
  }

  // 4. Topic sections
  useTopicSectionStore.getState().addSection({
    id: 'demo-topic-001',
    title: 'Consensus Algorithms',
    start_ms: 0,
  });
  useTopicSectionStore.getState().addSection({
    id: 'demo-topic-002',
    title: 'Paxos vs Raft',
    start_ms: 150000,
  });

  // 5. Bookmark
  useBookmarkStore.getState().addBookmark(90000, 'Leader election explanation', 'demo-seg-203');

  // 6. Action item
  useActionItemStore.getState().addItem({
    id: 'demo-action-001',
    text: 'Implement leader election (homework)',
    timestamp_ms: 120000,
    completed: false,
  });

  // 7. AI response (Recap mode)
  useStreamStore.setState({
    isStreaming: false,
    currentContent: AI_RESPONSE,
    _rawContent: AI_RESPONSE,
    currentMode: 'Recap',
    currentModel: 'gpt-4o',
    currentProvider: 'openai',
    latencyMs: 1400,
    error: null,
  });

  // 8. Call log: 1 Recap entry
  const entry = makeLogEntry();
  useCallLogStore.getState().beginEntry(entry);
  useCallLogStore.getState().completeEntry(entry.id, 380, 1400);
}

// ---------------------------------------------------------------------------
// play() \u2014 15-second animated timeline
// ---------------------------------------------------------------------------

function play(): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const now = Date.now();

  function schedule(fn: () => void, delayMs: number) {
    timers.push(setTimeout(fn, delayMs));
  }

  // 0s \u2014 Set up meeting state (empty transcript)
  useMeetingStore.setState({
    activeMeeting: {
      id: 'demo-lecture-001',
      title: 'CS 301 \u2014 Distributed Systems',
      start_time: new Date(now).toISOString(),
      end_time: null,
      duration_seconds: null,
      transcript: [],
      ai_interactions: [],
      summary: null,
      config_snapshot: null,
      audio_mode: 'online',
      ai_scenario: 'lecture',
    },
    currentView: 'overlay',
    isRecording: true,
    audioMode: 'online',
    aiScenario: 'lecture',
    elapsedMs: 30000,
    meetingStartTime: now - 30000,
  });
  useSpeakerStore.getState().initForOnline();
  useSpeakerStore.getState().renameSpeaker('them', 'Prof. Chen');

  // Add initial topic section
  useTopicSectionStore.getState().addSection({
    id: 'demo-topic-001',
    title: 'Consensus Algorithms',
    start_ms: 0,
  });

  const { appendSegment } = useTranscriptStore.getState();

  // 0.5s \u2014 First segment
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[0]));
    useSpeakerStore.getState().updateStats('them', 10, 5000);
    useMeetingStore.setState({ elapsedMs: 60000 });
  }, 500);

  // 2s \u2014 Second segment
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[1]));
    useSpeakerStore.getState().updateStats('them', 18, 5000);
    useMeetingStore.setState({ elapsedMs: 90000 });
  }, 2000);

  // 3.5s \u2014 Third segment (leader election)
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[2]));
    useSpeakerStore.getState().updateStats('them', 12, 5000);
    useMeetingStore.setState({ elapsedMs: 90000 });
  }, 3500);

  // 4.5s \u2014 Bookmark on the leader election segment
  schedule(() => {
    useBookmarkStore.getState().addBookmark(90000, 'Leader election explanation', 'demo-seg-203');
  }, 4500);

  // 5.5s \u2014 Fourth segment (homework mention)
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[3]));
    useSpeakerStore.getState().updateStats('them', 16, 5000);
    useMeetingStore.setState({ elapsedMs: 120000 });
  }, 5500);

  // 6.5s \u2014 Action item detected
  schedule(() => {
    useActionItemStore.getState().addItem({
      id: 'demo-action-001',
      text: 'Implement leader election (homework)',
      timestamp_ms: 120000,
      completed: false,
    });
  }, 6500);

  // 7.5s \u2014 Fifth segment (Paxos introduction)
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[4]));
    useSpeakerStore.getState().updateStats('them', 11, 5000);
    useMeetingStore.setState({ elapsedMs: 150000 });
  }, 7500);

  // 8.5s \u2014 New topic section: Paxos vs Raft
  schedule(() => {
    useTopicSectionStore.getState().addSection({
      id: 'demo-topic-002',
      title: 'Paxos vs Raft',
      start_ms: 150000,
    });
  }, 8500);

  // 9.5s \u2014 Sixth segment
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[5]));
    useSpeakerStore.getState().updateStats('them', 10, 5000);
    useMeetingStore.setState({ elapsedMs: 180000 });
  }, 9500);

  // 11s \u2014 Seventh segment (final)
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[6]));
    useSpeakerStore.getState().updateStats('them', 11, 5000);
    useMeetingStore.setState({ elapsedMs: 210000 });
  }, 11000);

  // 11.5s \u2014 Start Recap stream
  schedule(() => {
    useStreamStore.getState().startStream('Recap', 'gpt-4o', 'openai');
  }, 11500);

  // 13s \u2014 Stream AI recap response
  const tokens = AI_RESPONSE.split(' ');
  const tokenDelay = 1400 / tokens.length;

  schedule(() => {
    // Begin call log entry
    const entry = makeLogEntry();
    entry.status = 'sending';
    entry.completedAt = null;
    entry.totalTokens = null;
    entry.latencyMs = null;
    entry.responseContent = '';
    entry.responseContentClean = '';
    useCallLogStore.getState().beginEntry(entry);

    // Stream tokens
    tokens.forEach((token, i) => {
      schedule(() => {
        useStreamStore.getState().appendToken((i === 0 ? '' : ' ') + token);
      }, i * tokenDelay);
    });

    // End stream after all tokens
    schedule(() => {
      useStreamStore.getState().endStream(1400);
      useCallLogStore.getState().completeEntry(entry.id, 380, 1400);
    }, tokens.length * tokenDelay + 100);
  }, 13000);

  // Cleanup function \u2014 cancel all timers
  return () => {
    for (const id of timers) {
      clearTimeout(id);
    }
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const liveLectureScenario: DemoScenario = {
  id: 'live-lecture',
  name: 'CS 301 \u2014 Distributed Systems',
  description: 'Lecture with topics, bookmarks, action items, and AI recap',
  icon: '\uD83C\uDF93',
  supportsPlay: true,
  window: 'overlay',
  populate,
  play,
};
