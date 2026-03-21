// Sub-PRD 4: Rolling live transcript with auto-scroll and search
// Displays transcript segments with auto-scroll behavior and search/filter.

import { useEffect, useRef, useCallback } from "react";
import { useTranscriptStore } from "../stores/transcriptStore";
import { useMeetingStore } from "../stores/meetingStore";
import { useAudioLevel } from "../hooks/useAudioLevel";
import { useConfigStore } from "../stores/configStore";
import { TranscriptLine } from "./TranscriptLine";
import { Mic, MicOff, Volume2, VolumeX, Search, X } from "lucide-react";

export function TranscriptPanel() {
  const segments = useTranscriptStore((s) => s.segments);
  const searchQuery = useTranscriptStore((s) => s.searchQuery);
  const autoScroll = useTranscriptStore((s) => s.autoScroll);
  const setSearchQuery = useTranscriptStore((s) => s.setSearchQuery);
  const setAutoScroll = useTranscriptStore((s) => s.setAutoScroll);
  const isRecording = useMeetingStore((s) => s.isRecording);
  const meetingAudioConfig = useConfigStore((s) => s.meetingAudioConfig);
  const { micLevel, systemLevel } = useAudioLevel();
  const mutedYou = useConfigStore((s) => s.mutedYou);
  const mutedThem = useConfigStore((s) => s.mutedThem);
  const toggleMuteYou = useConfigStore((s) => s.toggleMuteYou);
  const toggleMuteThem = useConfigStore((s) => s.toggleMuteThem);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isSearchVisible = searchQuery.length > 0;

  // Auto-scroll to bottom when new segments arrive (if autoScroll is on)
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [segments, autoScroll]);

  // Detect manual scroll: if user scrolls up, pause auto-scroll.
  // If they scroll back to the bottom, resume it.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const isAtBottom =
      Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 30;

    if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    } else if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    }
  }, [autoScroll, setAutoScroll]);

  // Filter segments by search query
  const filteredSegments = searchQuery.trim()
    ? segments.filter((s) =>
        s.text.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : segments;

  // Count search matches
  const matchCount = searchQuery.trim()
    ? filteredSegments.length
    : 0;

  // Empty state
  if (segments.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/30">
            <Mic
              className={`h-5 w-5 ${
                isRecording
                  ? "text-primary/70 animate-pulse"
                  : "text-muted-foreground/50"
              }`}
            />
          </div>
          <p className="text-xs text-muted-foreground/70">
            {isRecording
              ? "Listening for speech..."
              : "Transcript will appear here..."}
          </p>
        </div>
        {isRecording && (
          <div className="mx-1 mb-1.5 space-y-1">
            <AudioActivityBar
              icon={<Mic className="h-3.5 w-3.5" />}
              mutedIcon={<MicOff className="h-3.5 w-3.5" />}
              label="You"
              level={micLevel}
              colorClass="bg-speaker-user"
              textClass="text-speaker-user"
              muted={mutedYou}
              onToggleMute={toggleMuteYou}
            />
            <AudioActivityBar
              icon={<Volume2 className="h-3.5 w-3.5" />}
              mutedIcon={<VolumeX className="h-3.5 w-3.5" />}
              label="Them"
              level={systemLevel}
              colorClass="bg-speaker-interviewer"
              textClass="text-speaker-interviewer"
              muted={mutedThem}
              onToggleMute={toggleMuteThem}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search bar (shown when there's a search query or toggled) */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/20 mx-1 mt-1 mb-1.5 px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search transcript..."
          className="flex-1 bg-transparent text-[11px] text-foreground/90 placeholder:text-muted-foreground/50 outline-none"
        />
        {searchQuery && (
          <>
            <span className="text-[10px] text-muted-foreground/60">
              {matchCount} match{matchCount !== 1 ? "es" : ""}
            </span>
            <button
              onClick={() => setSearchQuery("")}
              className="rounded-full p-0.5 text-muted-foreground/60 hover:text-foreground/70 hover:bg-accent/50"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {/* Transcript lines */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scroll-smooth px-1 py-1"
      >
        {filteredSegments.map((seg) => (
          <TranscriptLine
            key={seg.id}
            segment={seg}
            searchQuery={searchQuery}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Live audio activity indicators with mute controls */}
      {isRecording && (
        <div className="mx-1 mb-1.5 space-y-1">
          <AudioActivityBar
            icon={<Mic className="h-3.5 w-3.5" />}
            mutedIcon={<MicOff className="h-3.5 w-3.5" />}
            label="You"
            level={micLevel}
            colorClass="bg-speaker-user"
            textClass="text-speaker-user"
            muted={mutedYou}
            onToggleMute={toggleMuteYou}
          />
          <AudioActivityBar
            icon={<Volume2 className="h-3.5 w-3.5" />}
            mutedIcon={<VolumeX className="h-3.5 w-3.5" />}
            label="Them"
            level={systemLevel}
            colorClass="bg-speaker-interviewer"
            textClass="text-speaker-interviewer"
            muted={mutedThem}
            onToggleMute={toggleMuteThem}
          />
        </div>
      )}

      {/* Auto-scroll paused indicator */}
      {!autoScroll && segments.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true);
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
          className="mx-auto mb-1.5 rounded-full bg-primary/10 px-4 py-1 text-[10px] font-medium text-primary shadow-sm transition-colors hover:bg-primary/20"
        >
          Scroll to latest
        </button>
      )}
    </div>
  );
}

// -- Live audio level bar per party (with mute toggle) ------------------------

function AudioActivityBar({
  icon,
  mutedIcon,
  label,
  level,
  colorClass,
  textClass,
  muted,
  onToggleMute,
}: {
  icon: React.ReactNode;
  mutedIcon: React.ReactNode;
  label: string;
  level: number;
  colorClass: string;
  textClass: string;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const isActive = !muted && level > 0.02;
  // Logarithmic scaling: quiet → 15-50%, normal → 50-80%, loud → 80-100%
  const normalized = Math.min(1, level);
  const barWidth = isActive
    ? Math.min(100, Math.round(Math.log1p(normalized * 10) / Math.log1p(10) * 100))
    : 0;

  return (
    <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors duration-200 ${
      muted ? "bg-red-500/[0.03]" : "bg-muted/15"
    }`}>
      {/* Mute toggle */}
      <button
        onClick={onToggleMute}
        className={`shrink-0 rounded-md p-1 transition-all duration-150 cursor-pointer ${
          muted
            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
            : `hover:bg-accent/50 ${isActive ? textClass : "text-muted-foreground/60"}`
        }`}
        title={muted ? `Unmute ${label}` : `Mute ${label}`}
      >
        {muted ? mutedIcon : icon}
      </button>

      <span className={`shrink-0 text-[11px] font-semibold transition-colors duration-150 w-8 ${
        muted ? "text-red-400/60" : isActive ? textClass : "text-muted-foreground/60"
      }`}>
        {label}
      </span>

      <div className="flex-1 h-2.5 rounded-full bg-muted/30 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-100 ease-out ${
            muted ? "bg-muted-foreground/8" : colorClass
          }`}
          style={{
            width: muted ? "100%" : `${barWidth}%`,
            opacity: muted ? 0.3 : isActive ? 0.85 : 0.25,
          }}
        />
      </div>

      <span className={`shrink-0 w-10 text-right text-[10px] font-medium tabular-nums transition-colors duration-150 ${
        muted ? "text-red-400/40" : isActive ? textClass : "text-muted-foreground/60"
      }`}>
        {muted ? "Muted" : `${barWidth}%`}
      </span>

      {isActive && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colorClass} opacity-60`} />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${colorClass}`} />
        </span>
      )}
      {muted && (
        <span className="flex h-2 w-2 shrink-0 rounded-full bg-red-400/30" />
      )}
    </div>
  );
}
