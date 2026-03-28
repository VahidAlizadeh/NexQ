import type { DemoScenario } from './types';
import type { TranscriptSegment, Speaker, TranslationResult, LogEntry } from '../../lib/types';
import { useMeetingStore } from '../../stores/meetingStore';
import { useSpeakerStore } from '../../stores/speakerStore';
import { useTranscriptStore } from '../../stores/transcriptStore';
import { useTranslationStore } from '../../stores/translationStore';
import { useStreamStore } from '../../stores/streamStore';
import { useCallLogStore } from '../../stores/callLogStore';

// ---------------------------------------------------------------------------
// Transcript data
// ---------------------------------------------------------------------------

const SEGMENTS: { id: string; speaker: Speaker; speakerId: string; ms: number; text: string }[] = [
  {
    id: 'demo-seg-101',
    speaker: 'Interviewer',
    speakerId: 'them',
    ms: 134000,
    text: "Let's move on to the technical portion. Can you walk me through how you'd design a real-time data pipeline?",
  },
  {
    id: 'demo-seg-102',
    speaker: 'User',
    speakerId: 'you',
    ms: 142000,
    text: "Sure. I'd start with an event-driven architecture using Kafka as the message broker.",
  },
  {
    id: 'demo-seg-103',
    speaker: 'Interviewer',
    speakerId: 'them',
    ms: 151000,
    text: 'Good. How would you handle backpressure if the consumers can\'t keep up?',
  },
  {
    id: 'demo-seg-104',
    speaker: 'User',
    speakerId: 'you',
    ms: 158000,
    text: "I'd implement consumer group scaling combined with a dead letter queue for failures.",
  },
  {
    id: 'demo-seg-105',
    speaker: 'Interviewer',
    speakerId: 'them',
    ms: 167000,
    text: 'What about exactly-once delivery guarantees? How would you approach that?',
  },
  {
    id: 'demo-seg-106',
    speaker: 'User',
    speakerId: 'you',
    ms: 175000,
    text: 'Kafka supports idempotent producers and transactional writes. Combined with consumer offset commits within the same transaction, you get exactly-once semantics end-to-end.',
  },
  {
    id: 'demo-seg-107',
    speaker: 'Interviewer',
    speakerId: 'them',
    ms: 184000,
    text: 'And how do you monitor the health of such a pipeline in production?',
  },
];

// ---------------------------------------------------------------------------
// Chinese translations
// ---------------------------------------------------------------------------

const TRANSLATIONS: TranslationResult[] = [
  {
    segment_id: 'demo-seg-101',
    original_text: SEGMENTS[0].text,
    translated_text: '让我们进入技术环节。你能给我讲讲你会如何设计一个实时数据管道吗？',
    source_lang: 'en',
    target_lang: 'zh',
    provider: 'microsoft',
  },
  {
    segment_id: 'demo-seg-102',
    original_text: SEGMENTS[1].text,
    translated_text: '当然。我会从一个以Kafka作为消息代理的事件驱动架构开始。',
    source_lang: 'en',
    target_lang: 'zh',
    provider: 'microsoft',
  },
  {
    segment_id: 'demo-seg-103',
    original_text: SEGMENTS[2].text,
    translated_text: '很好。如果消费者跟不上，你会如何处理背压？',
    source_lang: 'en',
    target_lang: 'zh',
    provider: 'microsoft',
  },
  {
    segment_id: 'demo-seg-104',
    original_text: SEGMENTS[3].text,
    translated_text: '我会实现消费者组扩展，并结合死信队列来处理失败。',
    source_lang: 'en',
    target_lang: 'zh',
    provider: 'microsoft',
  },
  {
    segment_id: 'demo-seg-105',
    original_text: SEGMENTS[4].text,
    translated_text: '那精确一次交付保证呢？你会怎么实现？',
    source_lang: 'en',
    target_lang: 'zh',
    provider: 'microsoft',
  },
  {
    segment_id: 'demo-seg-106',
    original_text: SEGMENTS[5].text,
    translated_text: 'Kafka支持幂等生产者和事务性写入。结合同一事务内的消费者偏移量提交，可以实现端到端的精确一次语义。',
    source_lang: 'en',
    target_lang: 'zh',
    provider: 'microsoft',
  },
  {
    segment_id: 'demo-seg-107',
    original_text: SEGMENTS[6].text,
    translated_text: '在生产环境中，你如何监控这种管道的健康状况？',
    source_lang: 'en',
    target_lang: 'zh',
    provider: 'microsoft',
  },
];

// ---------------------------------------------------------------------------
// AI response content
// ---------------------------------------------------------------------------

const AI_RESPONSE = `**Pipeline Monitoring Strategy**

For production monitoring of a Kafka-based data pipeline, I'd recommend a layered approach:

1. **Metrics layer** — Prometheus + Grafana dashboards tracking consumer lag, throughput (messages/sec), error rates, and partition health across all topics.

2. **Alerting** — PagerDuty integration with tiered alerts: P1 for consumer lag exceeding 5 minutes, P2 for error rate spikes above 1%, P3 for throughput anomalies.

3. **Distributed tracing** — Jaeger or OpenTelemetry spans across producer → broker → consumer to identify latency bottlenecks and trace individual messages through the pipeline.

4. **Health checks** — Liveness and readiness probes on each service. Dead letter queue depth monitored separately with auto-alerts when DLQ grows beyond threshold.

5. **Schema registry monitoring** — Track schema evolution and compatibility checks to catch serialization issues before they cascade.`;

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
    id: 'demo-log-interview-001',
    timestamp: now,
    mode: 'Assist',
    provider: 'openai',
    model: 'gpt-4o',
    status: 'complete',
    startedAt: now - 1200,
    firstTokenAt: now - 1100,
    completedAt: now,
    totalTokens: 420,
    latencyMs: 1200,
    responseContent: AI_RESPONSE,
    responseContentClean: AI_RESPONSE,
    actualSystemPrompt: '',
    actualUserPrompt: 'How do you monitor the health of such a pipeline in production?',
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
    transcriptSegmentsCount: 7,
    transcriptSegmentsTotal: 7,
    snapshotTranscript: '',
    snapshotContext: '',
    reconstructedSystemPrompt: '',
    errorMessage: null,
  };
}

// ---------------------------------------------------------------------------
// populate() — instant final state for screenshot mode
// ---------------------------------------------------------------------------

function populate(): void {
  const now = Date.now();

  // 1. Meeting state
  useMeetingStore.setState({
    activeMeeting: {
      id: 'demo-interview-001',
      title: 'Technical Interview',
      start_time: new Date(now - 180000).toISOString(),
      end_time: null,
      duration_seconds: null,
      transcript: [],
      ai_interactions: [],
      summary: null,
      config_snapshot: null,
      audio_mode: 'online',
      ai_scenario: 'interview',
    },
    currentView: 'overlay',
    isRecording: true,
    audioMode: 'online',
    aiScenario: 'interview',
    elapsedMs: 180000,
    meetingStartTime: now - 180000,
  });

  // 2. Speakers
  useSpeakerStore.getState().initForOnline();
  useSpeakerStore.getState().renameSpeaker('them', 'Interviewer');
  // Update stats for both speakers
  useSpeakerStore.getState().updateStats('them', 48, 22000); // 4 segments worth
  useSpeakerStore.getState().updateStats('them', 0, 0);
  useSpeakerStore.getState().updateStats('them', 0, 0);
  useSpeakerStore.getState().updateStats('them', 0, 0);
  useSpeakerStore.getState().updateStats('you', 36, 18000); // 3 segments worth
  useSpeakerStore.getState().updateStats('you', 0, 0);
  useSpeakerStore.getState().updateStats('you', 0, 0);

  // 3. Transcript — 7 segments
  const { appendSegment } = useTranscriptStore.getState();
  for (const seg of SEGMENTS) {
    appendSegment(makeSegment(seg));
  }

  // 4. Translation
  useTranslationStore.setState({
    autoTranslateActive: true,
    targetLang: 'zh',
    displayMode: 'inline',
  });
  useTranslationStore.getState().addTranslations(TRANSLATIONS);

  // 5. AI response
  useStreamStore.setState({
    isStreaming: false,
    currentContent: AI_RESPONSE,
    _rawContent: AI_RESPONSE,
    currentMode: 'Assist',
    currentModel: 'gpt-4o',
    currentProvider: 'openai',
    latencyMs: 1200,
    error: null,
  });

  // 6. Call log
  const entry = makeLogEntry();
  useCallLogStore.getState().beginEntry(entry);
  useCallLogStore.getState().completeEntry(entry.id, 420, 1200);
}

// ---------------------------------------------------------------------------
// play() — 15-second animated timeline
// ---------------------------------------------------------------------------

function play(): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const now = Date.now();

  // Helper to schedule a timeout and track it
  function schedule(fn: () => void, delayMs: number) {
    timers.push(setTimeout(fn, delayMs));
  }

  // 0s — Set up meeting state (empty transcript/translation/AI)
  useMeetingStore.setState({
    activeMeeting: {
      id: 'demo-interview-001',
      title: 'Technical Interview',
      start_time: new Date(now).toISOString(),
      end_time: null,
      duration_seconds: null,
      transcript: [],
      ai_interactions: [],
      summary: null,
      config_snapshot: null,
      audio_mode: 'online',
      ai_scenario: 'interview',
    },
    currentView: 'overlay',
    isRecording: true,
    audioMode: 'online',
    aiScenario: 'interview',
    elapsedMs: 134000,
    meetingStartTime: now - 134000,
  });
  useSpeakerStore.getState().initForOnline();
  useSpeakerStore.getState().renameSpeaker('them', 'Interviewer');

  const { appendSegment } = useTranscriptStore.getState();

  // 0.5s — First Them line
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[0]));
    useSpeakerStore.getState().updateStats('them', 18, 8000);
    useMeetingStore.setState({ elapsedMs: 142000 });
  }, 500);

  // 2s — First You line
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[1]));
    useSpeakerStore.getState().updateStats('you', 14, 6000);
    useMeetingStore.setState({ elapsedMs: 151000 });
  }, 2000);

  // 3.5s — Second Them line
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[2]));
    useSpeakerStore.getState().updateStats('them', 12, 5000);
    useMeetingStore.setState({ elapsedMs: 158000 });
  }, 3500);

  // 5s — Second You line
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[3]));
    useSpeakerStore.getState().updateStats('you', 14, 5000);
    useMeetingStore.setState({ elapsedMs: 167000 });
  }, 5000);

  // 6.5s — Enable translation and add translations for existing 4 segments
  schedule(() => {
    useTranslationStore.setState({
      autoTranslateActive: true,
      targetLang: 'zh',
      displayMode: 'inline',
    });
    useTranslationStore.getState().addTranslations(TRANSLATIONS.slice(0, 4));
  }, 6500);

  // 8s — Third Them line (with translation)
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[4]));
    useSpeakerStore.getState().updateStats('them', 12, 5000);
    useMeetingStore.setState({ elapsedMs: 175000 });
    useTranslationStore.getState().addTranslation(TRANSLATIONS[4]);
  }, 8000);

  // 9.5s — Third You line (with translation)
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[5]));
    useSpeakerStore.getState().updateStats('you', 22, 7000);
    useMeetingStore.setState({ elapsedMs: 184000 });
    useTranslationStore.getState().addTranslation(TRANSLATIONS[5]);
  }, 9500);

  // 11s — Final Them question (with translation)
  schedule(() => {
    appendSegment(makeSegment(SEGMENTS[6]));
    useSpeakerStore.getState().updateStats('them', 12, 5000);
    useMeetingStore.setState({ elapsedMs: 186000 });
    useTranslationStore.getState().addTranslation(TRANSLATIONS[6]);
  }, 11000);

  // 11.5s — Show question detection via stream store "thinking" state
  schedule(() => {
    useStreamStore.getState().startStream('Assist', 'gpt-4o', 'openai');
  }, 11500);

  // 13s — Start streaming AI response
  const tokens = AI_RESPONSE.split(' ');
  const tokenDelay = 1400 / tokens.length; // Spread over ~1.4 seconds

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
      useStreamStore.getState().endStream(1200);
      useCallLogStore.getState().completeEntry(entry.id, 420, 1200);
    }, tokens.length * tokenDelay + 100);
  }, 13000);

  // Cleanup function — cancel all timers
  return () => {
    for (const id of timers) {
      clearTimeout(id);
    }
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const liveInterviewScenario: DemoScenario = {
  id: 'live-interview',
  name: 'Technical Interview',
  description: 'Live interview with real-time transcript, translation, and AI assist',
  icon: '🎤',
  supportsPlay: true,
  window: 'overlay',
  populate,
  play,
};
