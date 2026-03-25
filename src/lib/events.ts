// ============================================================================
// NexQ Events — Typed listen() wrappers for all IPC events
// ============================================================================

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AudioLevelEvent,
  BatchTranslationProgress,
  ModelDownloadProgress,
  OllamaPullProgressEvent,
  QuestionDetectedEvent,
  RagIndexProgressEvent,
  StreamEndEvent,
  StreamStartEvent,
  StreamTokenEvent,
  TranscriptIndexedEvent,
  TranscriptUpdateEvent,
  TranslationResult,
} from "./types";

// == TRANSCRIPT EVENTS ==

export function onTranscriptUpdate(
  handler: (event: TranscriptUpdateEvent) => void
): Promise<UnlistenFn> {
  return listen<TranscriptUpdateEvent>("transcript_update", (e) =>
    handler(e.payload)
  );
}

export function onTranscriptFinal(
  handler: (event: TranscriptUpdateEvent) => void
): Promise<UnlistenFn> {
  return listen<TranscriptUpdateEvent>("transcript_final", (e) =>
    handler(e.payload)
  );
}

// == LLM STREAM EVENTS ==

export function onStreamStart(
  handler: (event: StreamStartEvent) => void
): Promise<UnlistenFn> {
  return listen<StreamStartEvent>("llm_stream_start", (e) =>
    handler(e.payload)
  );
}

export function onStreamToken(
  handler: (event: StreamTokenEvent) => void
): Promise<UnlistenFn> {
  return listen<StreamTokenEvent>("llm_stream_token", (e) =>
    handler(e.payload)
  );
}

export function onStreamEnd(
  handler: (event: StreamEndEvent) => void
): Promise<UnlistenFn> {
  return listen<StreamEndEvent>("llm_stream_end", (e) => handler(e.payload));
}

export function onStreamError(
  handler: (error: string) => void
): Promise<UnlistenFn> {
  return listen<string>("llm_stream_error", (e) => handler(e.payload));
}

// == QUESTION DETECTION EVENTS ==

export function onQuestionDetected(
  handler: (event: QuestionDetectedEvent) => void
): Promise<UnlistenFn> {
  return listen<QuestionDetectedEvent>("question_detected", (e) =>
    handler(e.payload)
  );
}

// == AUDIO EVENTS ==

export function onAudioLevel(
  handler: (event: AudioLevelEvent) => void
): Promise<UnlistenFn> {
  return listen<AudioLevelEvent>("audio_level", (e) => handler(e.payload));
}

export function onAudioDeviceChange(
  handler: () => void
): Promise<UnlistenFn> {
  return listen("audio_device_change", () => handler());
}

// == MEETING EVENTS ==

export function onMeetingStarted(
  handler: (meetingId: string) => void
): Promise<UnlistenFn> {
  return listen<string>("meeting_started", (e) => handler(e.payload));
}

export function onMeetingEnded(
  handler: (meetingId: string) => void
): Promise<UnlistenFn> {
  return listen<string>("meeting_ended", (e) => handler(e.payload));
}

// == MODEL DOWNLOAD EVENTS ==

export function onModelDownloadProgress(
  handler: (event: ModelDownloadProgress) => void
): Promise<UnlistenFn> {
  return listen<ModelDownloadProgress>("model_download_progress", (e) =>
    handler(e.payload)
  );
}

// == RAG EVENTS ==

export function onRagIndexProgress(
  handler: (event: RagIndexProgressEvent) => void
): Promise<UnlistenFn> {
  return listen<RagIndexProgressEvent>("rag_index_progress", (e) =>
    handler(e.payload)
  );
}

export function onOllamaPullProgress(
  handler: (event: OllamaPullProgressEvent) => void
): Promise<UnlistenFn> {
  return listen<OllamaPullProgressEvent>("ollama_pull_progress", (e) =>
    handler(e.payload)
  );
}

export function onTranscriptIndexed(
  handler: (event: TranscriptIndexedEvent) => void
): Promise<UnlistenFn> {
  return listen<TranscriptIndexedEvent>("transcript_indexed", (e) =>
    handler(e.payload)
  );
}

// == STT STATUS EVENTS ==

export interface STTConnectionStatusEvent {
  provider: string;
  party: string;
  status: string; // "connecting", "connected", "error", "disconnected", "reconnecting"
  message?: string;
}

export interface STTDebugEvent {
  level: string; // "info", "warn", "error"
  source: string;
  message: string;
  timestamp_ms: number;
  /** When set, the frontend updates the last entry with this key in-place. */
  replace_key?: string;
}

export function onSTTConnectionStatus(
  handler: (event: STTConnectionStatusEvent) => void
): Promise<UnlistenFn> {
  return listen<STTConnectionStatusEvent>("stt_connection_status", (e) =>
    handler(e.payload)
  );
}

export function onSTTDebug(
  handler: (event: STTDebugEvent) => void
): Promise<UnlistenFn> {
  return listen<STTDebugEvent>("stt_debug", (e) => handler(e.payload));
}

// == TOPIC DETECTION EVENTS ==

export function onTopicDetected(
  handler: (payload: import("./types").TopicSection) => void
): Promise<UnlistenFn> {
  return listen<import("./types").TopicSection>("topic_detected", (event) =>
    handler(event.payload)
  );
}


// == SPEAKER DETECTION EVENTS ==

export interface SpeakerDetectedEvent {
  speaker_id: string;
  meeting_id: string;
}

export function onSpeakerDetected(
  handler: (payload: SpeakerDetectedEvent) => void
): Promise<UnlistenFn> {
  return listen<SpeakerDetectedEvent>("speaker_detected", (event) =>
    handler(event.payload)
  );
}

// == RECORDING EVENTS ==

export interface RecordingReadyEvent {
  meeting_id: string;
  recording_path: string;
  recording_size: number;
  waveform_path: string;
}

export function onRecordingReady(
  handler: (event: RecordingReadyEvent) => void
): Promise<UnlistenFn> {
  return listen<RecordingReadyEvent>("recording_ready", (e) => handler(e.payload));
}

export function onRecordingError(
  handler: (event: string) => void
): Promise<UnlistenFn> {
  return listen<string>("recording_error", (e) => handler(e.payload));
}

// == Events: Translation ==

export function onTranslationResult(handler: (result: TranslationResult) => void): Promise<UnlistenFn> {
  return listen<TranslationResult>("translation_result", (e) => handler(e.payload));
}

export function onTranslationError(handler: (error: { segment_id?: string; error: string }) => void): Promise<UnlistenFn> {
  return listen<{ segment_id?: string; error: string }>("translation_error", (e) => handler(e.payload));
}

export function onBatchTranslationProgress(handler: (progress: BatchTranslationProgress) => void): Promise<UnlistenFn> {
  return listen<BatchTranslationProgress>("batch_translation_progress", (e) => handler(e.payload));
}

// Tray events are handled via raw listen() calls in App.tsx
