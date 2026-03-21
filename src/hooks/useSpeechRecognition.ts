/**
 * Real-time speech-to-text using the Web Speech API (SpeechRecognition).
 *
 * Works in Tauri's WebView2 (Chromium-based) on Windows.
 * Produces interim results that stream into the current segment,
 * and final results when the speaker pauses — creating a new block.
 *
 * This replaces the backend Windows STT stub with actual transcription.
 */

import { useEffect, useRef } from "react";
import { useMeetingStore } from "../stores/meetingStore";
import { useTranscriptStore } from "../stores/transcriptStore";
import { useConfigStore } from "../stores/configStore";
import { pushTranscript } from "../lib/ipc";

// Web Speech API types (not in all TS libs)
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

/**
 * Hook that runs browser-native speech recognition while a meeting is active.
 * Produces real transcription — interim results stream into the current segment,
 * final results (on pause) create a new segment block.
 *
 * Speaker label is always "User" because Web Speech API captures from
 * the browser's default microphone (cannot capture system/loopback audio).
 */
export function useSpeechRecognition() {
  const isRecording = useMeetingStore((s) => s.isRecording);

  // Derive a stable boolean from the config — only re-runs when the
  // web_speech active status actually changes, not on every config mutation.
  const usesWebSpeech = useConfigStore((s) => {
    const cfg = s.meetingAudioConfig;
    if (!cfg) return false;
    return (
      (cfg.you.stt_provider === "web_speech" && cfg.you.is_input_device) ||
      (cfg.them.stt_provider === "web_speech" && cfg.them.is_input_device)
    );
  });

  // Use a ref for updateInterimSegment so it's always fresh
  // without being a dependency that triggers effect re-runs.
  const updateInterimRef = useRef(useTranscriptStore.getState().updateInterimSegment);
  useEffect(() => {
    return useTranscriptStore.subscribe((s) => {
      updateInterimRef.current = s.updateInterimSegment;
    });
  }, []);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const segmentCounterRef = useRef(0);
  const shouldRestartRef = useRef(false);
  const sessionPrefixRef = useRef("");
  // Instance ID to prevent stale onend handlers from interfering
  const instanceIdRef = useRef(0);

  useEffect(() => {
    // Always clean up any existing recognition first
    if (recognitionRef.current) {
      shouldRestartRef.current = false;
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }

    // Don't start if meeting isn't recording or web_speech isn't active
    if (!isRecording || !usesWebSpeech) {
      return;
    }

    // Check for Web Speech API support
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[STT] Web Speech API not supported in this WebView");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = "en-US";

    // Web Speech API always captures from the browser's default mic.
    const speakerLabel: "User" | "Them" = "User";

    const currentConfig = useConfigStore.getState().meetingAudioConfig;
    console.log(
      "[STT] Web Speech API speaker label:",
      speakerLabel,
      "| Config:",
      currentConfig
        ? `you=${currentConfig.you.stt_provider}, them=${currentConfig.them.stt_provider}`
        : "null"
    );

    recognitionRef.current = recognition;
    shouldRestartRef.current = true;
    sessionPrefixRef.current = Date.now().toString(36).slice(-4);
    const myInstanceId = ++instanceIdRef.current;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        const confidence = result[0].confidence || 0.9;

        if (!transcript) continue;

        const segId = `web_${sessionPrefixRef.current}_${segmentCounterRef.current + 1}`;

        if (result.isFinal) {
          segmentCounterRef.current += 1;
          const now = Date.now();
          updateInterimRef.current({
            id: segId,
            text: transcript,
            speaker: speakerLabel,
            timestamp_ms: now,
            is_final: true,
            confidence,
          });
          pushTranscript(transcript, speakerLabel, now, true).catch(() => {});
        } else {
          updateInterimRef.current({
            id: segId,
            text: transcript,
            speaker: speakerLabel,
            timestamp_ms: Date.now(),
            is_final: false,
            confidence: 0,
          });
        }
      }
    };

    recognition.onerror = (event: Event & { error: string }) => {
      const error = event.error;
      if (error === "no-speech" || error === "aborted") return;
      console.error("[STT] Speech recognition error:", error);
      if (error === "not-allowed") {
        console.error(
          "[STT] Microphone access denied for Web Speech API. " +
            "Grant mic permission in the browser/WebView settings."
        );
      }
    };

    recognition.onend = () => {
      // Only restart if this is still the current instance
      if (instanceIdRef.current !== myInstanceId) return;
      if (!shouldRestartRef.current || !recognitionRef.current) return;

      // Web Speech API stops after ~60s of continuous recognition — restart
      setTimeout(() => {
        if (instanceIdRef.current !== myInstanceId) return;
        if (!shouldRestartRef.current || !recognitionRef.current) return;

        // Check fresh config — don't restart if web_speech was disabled
        const freshCfg = useConfigStore.getState().meetingAudioConfig;
        const stillActive =
          (freshCfg?.you.stt_provider === "web_speech" && freshCfg?.you.is_input_device) ||
          (freshCfg?.them.stt_provider === "web_speech" && freshCfg?.them.is_input_device);
        if (!stillActive) {
          console.log("[STT] Web Speech onend: config no longer uses web_speech — not restarting");
          return;
        }

        try {
          recognitionRef.current!.start();
          console.log("[STT] Web Speech API auto-restarted");
        } catch {
          // Will retry on next onend cycle
        }
      }, 300);
    };

    try {
      recognition.start();
      console.log("[STT] Web Speech API recognition started");
    } catch (err) {
      console.warn("[STT] Recognition start deferred:", err);
    }

    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
    };
  }, [isRecording, usesWebSpeech]);
}
