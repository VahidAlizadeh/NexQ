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
 * Speaker label is determined by the meetingAudioConfig:
 * - If "You" uses web_speech → speaker is "User"
 * - If "Them" uses web_speech → speaker is "Them"
 * - Default (no config): speaker is "User"
 */
export function useSpeechRecognition() {
  const isRecording = useMeetingStore((s) => s.isRecording);
  const meetingStartTime = useMeetingStore((s) => s.meetingStartTime);
  const updateInterimSegment = useTranscriptStore(
    (s) => s.updateInterimSegment
  );
  const appendSegment = useTranscriptStore((s) => s.appendSegment);
  const meetingAudioConfig = useConfigStore((s) => s.meetingAudioConfig);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const segmentCounterRef = useRef(0);
  const shouldRestartRef = useRef(false);
  // Unique prefix per session to prevent ID collisions on mid-meeting restarts
  const sessionPrefixRef = useRef("");

  useEffect(() => {
    if (!isRecording) {
      // Stop recognition when meeting ends
      if (recognitionRef.current) {
        shouldRestartRef.current = false;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      return;
    }

    // Only activate Web Speech if at least one party with an input device
    // has web_speech as their STT provider
    const currentCfg = useConfigStore.getState().meetingAudioConfig;
    const youUsesWebSpeech =
      currentCfg?.you.stt_provider === "web_speech" &&
      currentCfg?.you.is_input_device;
    const themUsesWebSpeech =
      currentCfg?.them.stt_provider === "web_speech" &&
      currentCfg?.them.is_input_device;

    if (!youUsesWebSpeech && !themUsesWebSpeech) {
      console.log("[STT] No party with input device uses web_speech — skipping");
      return;
    }

    // Check for Web Speech API support
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn(
        "[STT] Web Speech API not supported in this WebView"
      );
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // Use configured language or default to en-US
    recognition.lang = "en-US"; // Could be made configurable

    // Web Speech API always captures from the browser's default mic (your
    // physical microphone). It can NEVER capture system/loopback audio.
    // Therefore the speaker label should always be "User" — regardless of
    // which party has web_speech configured. If a user assigns web_speech
    // to "Them" by mistake, it still captures YOUR mic, so label it "User".
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
    // Generate unique prefix for this session to avoid ID collisions on restart
    sessionPrefixRef.current = Date.now().toString(36).slice(-4);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.trim();
        const confidence = result[0].confidence || 0.9;

        if (!transcript) continue;

        // Use the SAME id for interim and final so final replaces interim in-place
        const segId = `web_${sessionPrefixRef.current}_${segmentCounterRef.current + 1}`;

        if (result.isFinal) {
          segmentCounterRef.current += 1;
          const now = Date.now();

          // Replace the interim segment in-place with the final version
          updateInterimSegment({
            id: segId,
            text: transcript,
            speaker: speakerLabel,
            timestamp_ms: now,
            is_final: true,
            confidence,
          });

          // Push to backend intelligence engine for AI context
          pushTranscript(transcript, speakerLabel, now, true).catch(() => {});
        } else {
          // Interim result — updates in-place (same id as the eventual final)
          updateInterimSegment({
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
      // "no-speech" is normal — just means silence, keep going
      // "aborted" happens when we stop intentionally
      if (error === "no-speech" || error === "aborted") {
        return;
      }
      console.error("[STT] Speech recognition error:", error);
      // "not-allowed" means mic permission denied — Web Speech won't work
      if (error === "not-allowed") {
        console.error(
          "[STT] Microphone access denied for Web Speech API. " +
            "Grant mic permission in the browser/WebView settings."
        );
      }
    };

    let isRunning = false;

    recognition.onstart = () => {
      isRunning = true;
    };

    recognition.onend = () => {
      isRunning = false;
      // Auto-restart if meeting is still active
      // Web Speech API stops after ~60s of continuous recognition
      if (shouldRestartRef.current && recognitionRef.current) {
        setTimeout(() => {
          if (shouldRestartRef.current && recognitionRef.current && !isRunning) {
            // Check fresh config — if no party uses web_speech anymore (provider
            // switched mid-meeting), don't restart the old recognition instance.
            const freshCfg = useConfigStore.getState().meetingAudioConfig;
            const stillUsesWebSpeech =
              (freshCfg?.you.stt_provider === "web_speech" && freshCfg?.you.is_input_device) ||
              (freshCfg?.them.stt_provider === "web_speech" && freshCfg?.them.is_input_device);
            if (!stillUsesWebSpeech) {
              console.log("[STT] Web Speech onend: config no longer uses web_speech — not restarting");
              return;
            }
            try {
              recognitionRef.current.start();
            } catch {
              // ignore — will retry on next onend
            }
          }
        }, 200);
      }
    };

    // Start recognition (with guard against double-start)
    try {
      recognition.start();
      console.log("[STT] Web Speech API recognition started");
    } catch (err) {
      console.warn("[STT] Recognition start deferred:", err);
    }

    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
    };
  }, [isRecording, meetingStartTime, updateInterimSegment, appendSegment, meetingAudioConfig]);
}
