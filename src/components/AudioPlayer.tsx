// AudioPlayer — Spotify-style sticky bottom bar audio player
// Uses an invisible <audio> element for playback and delegates
// waveform visualization to WaveformCanvas.

import React, { useRef, useEffect, useCallback } from "react";
import { readFile, copyFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { useAudioPlayerStore } from "@/stores/audioPlayerStore";
import { WaveformCanvas } from "@/components/WaveformCanvas";
import type { WaveformData, MeetingBookmark, TopicSection } from "@/lib/types";

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AudioPlayerProps {
  meetingId: string;
  meetingStartMs: number;
  recordingPath: string;
  recordingSize: number;
  recordingOffsetMs: number;
  durationMs: number;
  waveformData: WaveformData | null;
  bookmarks?: MeetingBookmark[];
  topicSections?: TopicSection[];
}

// ---------------------------------------------------------------------------
// SVG icon helpers (inline, no external deps)
// ---------------------------------------------------------------------------

function PlayIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M3 2.5L11 7L3 11.5V2.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2.5" y="2" width="3.5" height="10" rx="1" />
      <rect x="8" y="2" width="3.5" height="10" rx="1" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5" />
      <path d="M1.5 10h9" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// AudioPlayer component
// ---------------------------------------------------------------------------

export function AudioPlayer({
  meetingStartMs,
  recordingPath,
  recordingSize,
  recordingOffsetMs,
  durationMs,
  waveformData,
  bookmarks = [],
  topicSections = [],
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  const {
    isPlaying,
    currentTimeMs,
    playbackSpeed,
    volume,
    toggle,
    seekToTime,
    cycleSpeed,
    setVolume,
    setAudioElement,
    setSyncContext,
    setDuration,
    updateCurrentTime,
    pause,
  } = useAudioPlayerStore();

  const setGainNode = useAudioPlayerStore((s) => s.setGainNode);

  // -------------------------------------------------------------------------
  // Mount: wire up audio element + Web Audio API for volume amplification
  // -------------------------------------------------------------------------

  const blobUrlRef = useRef<string | null>(null);

  // Set up Web Audio API GainNode (once per audio element lifetime)
  const ensureGainNode = useCallback((audio: HTMLAudioElement) => {
    if (sourceNodeRef.current) return; // already connected

    try {
      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(audio);
      sourceNodeRef.current = source;

      const gain = ctx.createGain();
      gain.gain.value = useAudioPlayerStore.getState().volume;
      source.connect(gain);
      gain.connect(ctx.destination);
      setGainNode(gain);

      // Keep audio.volume at 1.0 — GainNode handles all volume control
      audio.volume = 1.0;
    } catch (err) {
      console.warn("Web Audio API setup failed, falling back to audio.volume:", err);
    }
  }, [setGainNode]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    setAudioElement(audio);
    setSyncContext(meetingStartMs, recordingOffsetMs);
    setDuration(durationMs);

    const handleEnded = () => { pause(); };

    // Resume AudioContext on play (browser requires user gesture)
    const handlePlay = () => {
      if (audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume();
      }
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);

    // Load audio file and set up gain node after loading
    const loadAudio = async () => {
      try {
        const bytes = await readFile(recordingPath);
        const mimeType = recordingPath.endsWith(".ogg") ? "audio/ogg" : "audio/wav";
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        audio.src = url;
        audio.preload = "auto";

        // Connect GainNode after src is set
        ensureGainNode(audio);
      } catch (err) {
        console.error("Failed to load audio file:", err);
      }
    };
    loadAudio();

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setAudioElement(null);
      setGainNode(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingPath]);

  // Sync context updates (meetingStartMs, recordingOffsetMs, durationMs)
  useEffect(() => {
    setSyncContext(meetingStartMs, recordingOffsetMs);
  }, [meetingStartMs, recordingOffsetMs, setSyncContext]);

  useEffect(() => {
    setDuration(durationMs);
  }, [durationMs, setDuration]);

  // -------------------------------------------------------------------------
  // RAF loop for smooth time tracking while playing
  // -------------------------------------------------------------------------

  const startRaf = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const tick = () => {
      updateCurrentTime(audio.currentTime * 1000);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [updateCurrentTime]);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isPlaying) {
      startRaf();
    } else {
      stopRaf();
    }
    return stopRaf;
  }, [isPlaying, startRaf, stopRaf]);

  // -------------------------------------------------------------------------
  // Download handler
  // -------------------------------------------------------------------------

  const handleDownload = useCallback(async () => {
    try {
      const ext = recordingPath.endsWith(".ogg") ? "ogg" : "wav";
      const savePath = await save({
        defaultPath: `meeting-recording.${ext}`,
        filters: [{ name: "Audio", extensions: [ext] }],
      });
      if (savePath) {
        await copyFile(recordingPath, savePath);
      }
    } catch (err) {
      console.error("Download failed:", err);
    }
  }, [recordingPath]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const effectiveDuration = durationMs > 0 ? durationMs : 1;

  return (
    <div className="border-t border-border/10 bg-card/95 backdrop-blur-xl px-5 py-2.5 flex items-center gap-3 select-none">
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="auto" className="hidden" />

      {/* Play / Pause button */}
      <button
        onClick={toggle}
        className="flex-shrink-0 w-[30px] h-[30px] rounded-full flex items-center justify-center
          text-white/70 hover:text-white hover:bg-indigo-500/20 active:bg-indigo-500/30
          transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* Current time */}
      <span className="flex-shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground w-[36px] text-right">
        {formatTime(currentTimeMs)}
      </span>

      {/* Waveform — takes up all remaining space */}
      <div className="flex-1 h-[36px] min-w-0">
        {waveformData ? (
          <WaveformCanvas
            waveformData={waveformData}
            currentTimeMs={currentTimeMs}
            durationMs={effectiveDuration}
            meetingStartMs={meetingStartMs}
            recordingOffsetMs={recordingOffsetMs}
            bookmarks={bookmarks}
            topicSections={topicSections}
            onSeek={seekToTime}
            className="w-full h-full"
          />
        ) : (
          /* Placeholder track bar when no waveform data yet */
          <div className="w-full h-full flex items-center">
            <div className="w-full h-[3px] rounded-full bg-white/[0.06]" />
          </div>
        )}
      </div>

      {/* Total duration */}
      <span className="flex-shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground w-[36px]">
        {formatTime(durationMs)}
      </span>

      {/* Volume control */}
      <div className="flex-shrink-0 flex items-center gap-1.5 group">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="text-muted-foreground/50">
          <path d="M2 4.5h1.5L6 2.5v7L3.5 7.5H2a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5z" />
          {volume > 0 && <path d="M7.5 3.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1" />}
          {volume > 1 && <path d="M9 2a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="1" />}
        </svg>
        <input
          type="range"
          min="0"
          max="200"
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          className="w-16 h-1 accent-indigo-400 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
          title={`Volume: ${Math.round(volume * 100)}%`}
          aria-label="Volume"
        />
        <span className="text-[8px] text-muted-foreground/40 tabular-nums w-[26px]">
          {Math.round(volume * 100)}%
        </span>
      </div>

      {/* Speed pill */}
      <button
        onClick={() => cycleSpeed("up")}
        className="flex-shrink-0 text-[10px] font-semibold
          bg-white/[0.06] hover:bg-white/[0.1] active:bg-white/[0.14]
          px-1.5 py-0.5 rounded transition-colors duration-150
          text-muted-foreground hover:text-foreground
          focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
        aria-label="Cycle playback speed"
        title="Click to increase speed"
      >
        {playbackSpeed}x
      </button>

      {/* Download button */}
      <button
        onClick={handleDownload}
        className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded
          text-muted-foreground hover:text-foreground
          hover:bg-white/[0.06] active:bg-white/[0.1]
          transition-colors duration-150
          focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
        aria-label="Download recording"
        title="Download recording"
      >
        <DownloadIcon />
      </button>

      {/* File size */}
      <span className="flex-shrink-0 text-[9px] text-muted-foreground/30 tabular-nums">
        {formatFileSize(recordingSize)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AudioPlayerSkeleton — shown while post-meeting Opus conversion is in progress
// ---------------------------------------------------------------------------

export function AudioPlayerSkeleton() {
  return (
    <div className="border-t border-border/10 bg-card/95 backdrop-blur-xl px-5 py-2.5 flex items-center gap-3 select-none">
      {/* Play button placeholder */}
      <div className="flex-shrink-0 w-[30px] h-[30px] rounded-full bg-white/[0.06] animate-pulse" />

      {/* Time placeholder */}
      <div className="flex-shrink-0 w-[36px] h-[10px] rounded bg-white/[0.06] animate-pulse" />

      {/* Waveform track placeholder */}
      <div className="flex-1 h-[36px] min-w-0 flex items-center">
        <div className="w-full h-[3px] rounded-full bg-white/[0.06] animate-pulse" />
      </div>

      {/* Duration placeholder */}
      <div className="flex-shrink-0 w-[36px] h-[10px] rounded bg-white/[0.06] animate-pulse" />

      {/* Processing label */}
      <span className="flex-shrink-0 text-[10px] text-muted-foreground/40 animate-pulse">
        Processing audio...
      </span>
    </div>
  );
}

export default AudioPlayer;
