import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import type { TranscriptSegment, SpeakerIdentity, MeetingBookmark, TranslationResult, TranslationDisplayMode } from "../../lib/types";
import type { TranscriptSearchState } from "../../hooks/useTranscriptSearch";
import { useAudioPlayerStore } from "../../stores/audioPlayerStore";
import { useAudioTranscriptSync } from "../../hooks/useAudioTranscriptSync";
import {
  formatTimestamp,
  getSpeakerLabel,
  getSpeakerColor,
} from "../../lib/utils";
import { mergeConsecutiveSegments } from "../../lib/mergeSegments";
import { FileText, Search, ChevronUp, ChevronDown, X, Bookmark as BookmarkIcon, Globe, RefreshCw } from "lucide-react";
import { createPortal } from "react-dom";
import { TranscriptContextMenu } from "../../overlay/TranscriptContextMenu";
import { addMeetingBookmark, deleteMeetingBookmark, updateMeetingBookmark } from "../../lib/ipc";
import { showToast } from "../../stores/toastStore";
import { useConfigStore } from "../../stores/configStore";
import { ColorPickerButton } from "../../components/ColorPickerButton";

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  search: TranscriptSearchState;
  meetingStartTime?: number;
  /** Recording offset in ms — used for audio-transcript sync */
  recordingOffsetMs?: number;
  /** Saved speakers from meeting — used for post-meeting label/color resolution */
  speakers?: SpeakerIdentity[];
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  /** Bookmarks for this meeting — read from meeting data */
  bookmarks?: MeetingBookmark[];
  /** Meeting ID for IPC bookmark mutations */
  meetingId?: string;
  /** Callback to update parent state after bookmark mutations */
  onBookmarksChanged?: (bookmarks: MeetingBookmark[]) => void;
  /** Raw segment index to scroll to on mount (from speaker timeline click) */
  initialScrollToIndex?: number | null;
  /** Called after the initial scroll is handled */
  onScrollHandled?: () => void;
  /** Translations map: segmentId → TranslationResult */
  translations?: Map<string, TranslationResult>;
  /** Set of segment IDs currently being translated */
  translatingSegments?: Set<string>;
  /** Current translation display mode */
  translationDisplayMode?: TranslationDisplayMode;
  /** Current target language from translation settings */
  currentTargetLang?: string;
  /** Whether translations are visible (eye toggle) */
  showTranslations?: boolean;
  /** Callback for on-demand per-segment translation */
  onTranslateSegment?: (segmentId: string, text: string) => void;
  /** Callback for retranslating a mismatched segment */
  onRetranslateSegment?: (segmentId: string, text: string) => void;
}

// Speaker colors for timeline blocks
const TIMELINE_COLORS: Record<string, string> = {
  User: "hsl(var(--info))",
  Interviewer: "hsl(var(--primary))",
  Them: "hsl(var(--success))",
  Unknown: "hsl(var(--muted-foreground))",
};

export function TranscriptView({ segments, search, meetingStartTime, recordingOffsetMs = 0, speakers, searchInputRef, bookmarks, meetingId, onBookmarksChanged, initialScrollToIndex, onScrollHandled, translations, translatingSegments, translationDisplayMode, currentTargetLang, showTranslations = true, onTranslateSegment, onRetranslateSegment }: TranscriptViewProps) {
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Map-based refs keyed by segment ID — used by useAudioTranscriptSync
  const segmentRefsMap = useRef<Map<string, HTMLElement>>(new Map());
  const localSearchInputRef = useRef<HTMLInputElement | null>(null);
  const setInputRef = useCallback((el: HTMLInputElement | null) => {
    localSearchInputRef.current = el;
    if (searchInputRef) (searchInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
  }, [searchInputRef]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; segmentIndex: number } | null>(null);
  const [noteEdit, setNoteEdit] = useState<{ bookmarkId: string; note: string } | null>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  // Hover translation tooltip state
  const [hoverTranslation, setHoverTranslation] = useState<{
    translation: TranslationResult;
    x: number;
    y: number;
  } | null>(null);

  // Audio player store — for active segment highlighting and click-to-seek
  const activeSegmentId = useAudioPlayerStore((s) => s.activeSegmentId);
  const isPlaying = useAudioPlayerStore((s) => s.isPlaying);
  const seekToTimestamp = useAudioPlayerStore((s) => s.seekToTimestamp);

  // Typeset settings — shared with meeting overlay
  const transcriptFontSize = useConfigStore((s) => s.transcriptFontSize);
  const transcriptTextColor = useConfigStore((s) => s.transcriptTextColor);
  const translationFontSize = useConfigStore((s) => s.translationFontSize);
  const translationTextColor = useConfigStore((s) => s.translationTextColor);
  const setTranscriptFontSize = useConfigStore((s) => s.setTranscriptFontSize);
  const setTranscriptTextColor = useConfigStore((s) => s.setTranscriptTextColor);
  const setTranslationFontSize = useConfigStore((s) => s.setTranslationFontSize);
  const setTranslationTextColor = useConfigStore((s) => s.setTranslationTextColor);

  // Bidirectional sync: audio position → active transcript segment + auto-scroll
  useAudioTranscriptSync(
    segments,
    meetingStartTime ?? 0,
    recordingOffsetMs,
    segmentRefsMap,
  );

  const toElapsed = (ms: number) =>
    meetingStartTime ? Math.max(0, ms - meetingStartTime) : ms;

  // Build bookmark lookup by segment_id
  const bookmarkBySegment = useMemo(() => {
    const map = new Map<string, MeetingBookmark>();
    if (bookmarks) {
      for (const b of bookmarks) {
        if (b.segment_id) map.set(b.segment_id, b);
      }
    }
    return map;
  }, [bookmarks]);

  // Build speaker lookup from saved speakers for label/color resolution
  const speakerMap = useMemo(() => {
    if (!speakers || speakers.length === 0) return null;
    const map = new Map<string, SpeakerIdentity>();
    for (const s of speakers) map.set(s.id, s);
    return map;
  }, [speakers]);

  // Merge consecutive same-speaker segments for cleaner display
  const mergedSegments = useMemo(
    () => mergeConsecutiveSegments(segments),
    [segments]
  );

  // Map raw segment indices → merged segment indices (for search compatibility)
  const rawToMergedIndex = useMemo(() => {
    const map = new Map<number, number>();
    let rawIdx = 0;
    for (let mi = 0; mi < mergedSegments.length; mi++) {
      const ms = mergedSegments[mi];
      for (let k = 0; k < ms.mergedCount; k++) {
        map.set(rawIdx, mi);
        rawIdx++;
      }
    }
    return map;
  }, [mergedSegments]);

  const resolveSpeakerLabel = (seg: TranscriptSegment): string => {
    if (speakerMap && seg.speaker_id) {
      const s = speakerMap.get(seg.speaker_id);
      if (s) return s.display_name;
    }
    return getSpeakerLabel(seg.speaker);
  };

  const resolveSpeakerColorClass = (seg: TranscriptSegment): string => {
    if (speakerMap && seg.speaker_id) {
      const s = speakerMap.get(seg.speaker_id);
      if (s?.color) return ""; // use inline style instead
    }
    return getSpeakerColor(seg.speaker);
  };

  const resolveSpeakerColorHex = (seg: TranscriptSegment): string | undefined => {
    if (speakerMap && seg.speaker_id) {
      const s = speakerMap.get(seg.speaker_id);
      if (s?.color) return s.color;
    }
    return undefined;
  };

  // Scroll to a specific segment (from speaker timeline click)
  useEffect(() => {
    if (initialScrollToIndex == null) return;
    const mergedIdx = rawToMergedIndex.get(initialScrollToIndex) ?? initialScrollToIndex;
    // Defer to next frame to ensure refs are populated after mount
    requestAnimationFrame(() => {
      const el = segmentRefs.current[mergedIdx];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setSelectedIndex(mergedIdx);
      }
      onScrollHandled?.();
    });
  }, [initialScrollToIndex, rawToMergedIndex, onScrollHandled]);

  // Search: scroll to match (remap raw index → merged index)
  useEffect(() => {
    if (search.totalMatches === 0) return;
    const match = search.matches[search.currentMatchIndex];
    if (!match) return;
    const mergedIdx = rawToMergedIndex.get(match.segmentIndex) ?? match.segmentIndex;
    segmentRefs.current[mergedIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [search.currentMatchIndex, search.matches, search.totalMatches, rawToMergedIndex]);

  const activeMatchSegment = search.totalMatches > 0
    ? rawToMergedIndex.get(search.matches[search.currentMatchIndex]?.segmentIndex ?? -1) ?? -1
    : -1;

  const segmentMatches = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const m of search.matches) {
      // Remap raw segment index to merged segment index
      const mergedIdx = rawToMergedIndex.get(m.segmentIndex) ?? m.segmentIndex;
      if (!map.has(mergedIdx)) map.set(mergedIdx, []);
      map.get(mergedIdx)!.push(m.startOffset);
    }
    return map;
  }, [search.matches, rawToMergedIndex]);

  // Bookmark handlers (IPC-based for past meetings)
  const handleToggleBookmark = useCallback(async (seg: TranscriptSegment) => {
    if (!meetingId || !onBookmarksChanged) return;
    const existing = seg.id ? bookmarkBySegment.get(seg.id) : undefined;
    if (existing) {
      try {
        await deleteMeetingBookmark(existing.id);
        onBookmarksChanged((bookmarks ?? []).filter(b => b.id !== existing.id));
      } catch (err) {
        console.error("[TranscriptView] Delete bookmark failed:", err);
        showToast("Failed to remove bookmark", "error");
      }
    } else {
      const newBookmark: MeetingBookmark = {
        id: crypto.randomUUID(),
        timestamp_ms: seg.timestamp_ms,
        segment_id: seg.id,
        created_at: new Date().toISOString(),
      };
      try {
        await addMeetingBookmark(JSON.stringify({ ...newBookmark, meeting_id: meetingId }));
        onBookmarksChanged([...(bookmarks ?? []), newBookmark]);
      } catch (err) {
        console.error("[TranscriptView] Add bookmark failed:", err);
        showToast("Failed to add bookmark", "error");
      }
    }
  }, [meetingId, bookmarks, bookmarkBySegment, onBookmarksChanged]);

  const handleAddNote = useCallback(async (seg: TranscriptSegment) => {
    if (!meetingId || !onBookmarksChanged) return;
    let bm = seg.id ? bookmarkBySegment.get(seg.id) : undefined;
    if (!bm) {
      bm = {
        id: crypto.randomUUID(),
        timestamp_ms: seg.timestamp_ms,
        segment_id: seg.id,
        created_at: new Date().toISOString(),
      };
      try {
        await addMeetingBookmark(JSON.stringify({ ...bm, meeting_id: meetingId }));
        onBookmarksChanged([...(bookmarks ?? []), bm]);
      } catch (err) {
        console.error("[TranscriptView] Add bookmark for note failed:", err);
        showToast("Failed to create bookmark", "error");
        return;
      }
    }
    setNoteEdit({ bookmarkId: bm.id, note: bm.note ?? "" });
  }, [meetingId, bookmarks, bookmarkBySegment, onBookmarksChanged]);

  const handleSaveNote = useCallback(async () => {
    if (!noteEdit || !onBookmarksChanged) return;
    const trimmedNote = noteEdit.note.trim() || undefined;
    try {
      await updateMeetingBookmark(noteEdit.bookmarkId, trimmedNote ?? null);
      onBookmarksChanged(
        (bookmarks ?? []).map(b => b.id === noteEdit.bookmarkId ? { ...b, note: trimmedNote } : b)
      );
    } catch (err) {
      console.error("[TranscriptView] Update bookmark note failed:", err);
      showToast("Failed to save note", "error");
    }
    setNoteEdit(null);
  }, [noteEdit, bookmarks, onBookmarksChanged]);

  const handleCopyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard", "success");
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, segmentIndex: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, segmentIndex });
  }, []);

  const handleTimelineJump = (index: number) => {
    setSelectedIndex(index);
    segmentRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSegmentClick = (index: number, segment: TranscriptSegment) => {
    setSelectedIndex(selectedIndex === index ? null : index);
    // Click-to-seek: only seeks when audio is already playing
    if (isPlaying) {
      seekToTimestamp(segment.timestamp_ms);
    }
  };

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50">
        <FileText className="mb-3 h-8 w-8" />
        <p className="text-sm font-medium">No transcript segments</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* Always-visible search bar */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/20 mx-1 mt-1 mb-1.5 px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <input
          ref={setInputRef}
          type="text"
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (e.shiftKey) search.prevMatch();
              else search.nextMatch();
            }
          }}
          placeholder="Search transcript..."
          maxLength={200}
          aria-label="Search transcript"
          className="flex-1 bg-transparent text-xs text-foreground/90 placeholder:text-muted-foreground/50 outline-none"
        />
        {search.query && search.totalMatches > 0 && (
          <span className="shrink-0 text-xs tabular-nums font-medium text-muted-foreground/60">
            {search.currentMatchIndex + 1} of {search.totalMatches}
          </span>
        )}
        {search.query && search.totalMatches === 0 && (
          <span className="shrink-0 text-xs text-red-400/60">No matches</span>
        )}
        {search.query && (
          <div className="flex items-center gap-0.5 border-l border-border/20 pl-2">
            <button
              onClick={search.prevMatch}
              disabled={search.totalMatches === 0}
              className="rounded-md p-1 text-muted-foreground/50 hover:bg-secondary hover:text-foreground disabled:opacity-25 cursor-pointer"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={search.nextMatch}
              disabled={search.totalMatches === 0}
              className="rounded-md p-1 text-muted-foreground/50 hover:bg-secondary hover:text-foreground disabled:opacity-25 cursor-pointer"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => search.setQuery("")}
              className="rounded-md p-1 text-muted-foreground/50 hover:bg-secondary hover:text-foreground cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Timeline */}
      <TimelineScrubber
        segments={segments}
        selectedIndex={selectedIndex}
        onJump={handleTimelineJump}
        meetingStartTime={meetingStartTime}
      />

      {/* Transcript rows */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border/20">
        <div className="px-4 py-2">
          {mergedSegments.map((segment, i) => {
            const offsets = segmentMatches.get(i);
            const isSearchMatch = i === activeMatchSegment;
            const isSelected = i === selectedIndex;
            const segBookmark = segment.id ? bookmarkBySegment.get(segment.id) : undefined;
            const isBookmarked = !!segBookmark;
            const isActiveSegment = activeSegmentId !== null && segment.originalIds.includes(activeSegmentId);

            return (
              <div
                key={segment.id || i}
                ref={(el) => {
                  segmentRefs.current[i] = el;
                  // Populate map for all original IDs in this merged segment
                  if (el) {
                    for (const id of segment.originalIds) {
                      segmentRefsMap.current.set(id, el);
                    }
                  } else {
                    for (const id of segment.originalIds) {
                      segmentRefsMap.current.delete(id);
                    }
                  }
                }}
                onClick={() => handleSegmentClick(i, segment)}
                onContextMenu={meetingId ? (e) => handleContextMenu(e, i) : undefined}
                onMouseMove={showTranslations && translationDisplayMode === "hover" && segment.id && translations?.get(segment.id) ? (e) => {
                  setHoverTranslation({
                    translation: translations.get(segment.id!)!,
                    x: e.clientX,
                    y: e.clientY,
                  });
                } : undefined}
                onMouseLeave={hoverTranslation ? () => setHoverTranslation(null) : undefined}
                className={`group relative flex items-start gap-3 rounded-lg px-3 py-2 cursor-pointer transition-all duration-100 border-l-2 ${
                  isActiveSegment
                    ? "border-l-indigo-400 bg-indigo-500/[0.08]"
                    : segment.speaker === "User" ? "border-l-speaker-user/20" : "border-l-speaker-interviewer/20"
                } ${
                  isSelected
                    ? "bg-primary/10 ring-1 ring-primary/20"
                    : isSearchMatch
                      ? "bg-highlight/10 ring-1 ring-highlight/20"
                      : isActiveSegment
                        ? ""
                        : "hover:bg-secondary/20"
                }`}
              >
                {/* Timestamp */}
                <span className={`shrink-0 pt-0.5 text-xs tabular-nums font-medium ${
                  isSelected ? "text-primary/70" : "text-muted-foreground/50"
                }`}>
                  {formatTimestamp(toElapsed(segment.timestamp_ms))}
                </span>

                {/* Bookmarked indicator — subtle filled icon near speaker label */}
                {isBookmarked && (
                  <BookmarkIcon className="mt-1 h-2.5 w-2.5 shrink-0 fill-primary text-primary opacity-60" />
                )}

                {/* Speaker */}
                <span
                  className={`shrink-0 pt-0.5 text-xs font-bold ${resolveSpeakerColorClass(segment)}`}
                  style={resolveSpeakerColorHex(segment) ? { color: resolveSpeakerColorHex(segment) } : undefined}
                >
                  {resolveSpeakerLabel(segment)}
                </span>

                {/* Text content + bookmark note */}
                <div className="flex-1 min-w-0">
                  <span
                    className="leading-relaxed"
                    style={{
                      fontSize: `${transcriptFontSize}px`,
                      color: isSelected ? undefined : transcriptTextColor,
                    }}
                  >
                    {offsets
                      ? highlightText(segment.text, search.query, offsets, isSearchMatch)
                      : segment.text}
                  </span>

                  {/* Translation — inline or hover */}
                  {showTranslations && translations && (() => {
                    const segTranslation = segment.id ? translations.get(segment.id) : undefined;
                    const isSegTranslating = segment.id ? translatingSegments?.has(segment.id) : false;
                    const isMismatched = segTranslation && currentTargetLang && segTranslation.target_lang !== currentTargetLang;

                    if (isSegTranslating) {
                      return (
                        <div className="mt-1 leading-[1.5]" style={{ fontSize: `${translationFontSize}px` }}>
                          <span className="text-muted-foreground/40 animate-pulse">Translating...</span>
                        </div>
                      );
                    }

                    if (segTranslation && translationDisplayMode === "inline") {
                      return (
                        <div className="mt-1 flex items-baseline gap-1.5 leading-[1.5]">
                          <span style={{ fontSize: `${translationFontSize}px`, color: translationTextColor }}>
                            {segTranslation.translated_text}
                          </span>
                          <span className={`shrink-0 rounded px-1 py-px text-[9px] font-bold tracking-wide ${
                            isMismatched
                              ? "text-orange-400 bg-orange-500/[0.08] border border-orange-500/15"
                              : "text-muted-foreground/50 bg-white/[0.03]"
                          }`}>
                            {segTranslation.source_lang.toUpperCase()} → {segTranslation.target_lang.toUpperCase()}
                          </span>
                          {isMismatched && onRetranslateSegment && segment.id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onRetranslateSegment(segment.id!, segment.text); }}
                              className="shrink-0 flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-semibold text-orange-400 hover:bg-orange-500/[0.08] transition-colors cursor-pointer"
                              title={`Retranslate to ${currentTargetLang?.toUpperCase()}`}
                            >
                              <RefreshCw className="h-2.5 w-2.5" />
                              {currentTargetLang?.toUpperCase()}
                            </button>
                          )}
                        </div>
                      );
                    }

                    if (!segTranslation && onTranslateSegment && segment.id && currentTargetLang) {
                      return (
                        <button
                          onClick={(e) => { e.stopPropagation(); onTranslateSegment(segment.id!, segment.text); }}
                          className="mt-1 flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold text-muted-foreground/50 border border-dashed border-border/20 hover:text-primary/70 hover:border-primary/20 hover:bg-primary/[0.03] opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        >
                          <Globe className="h-2.5 w-2.5" />
                          Translate to {currentTargetLang.toUpperCase()}
                        </button>
                      );
                    }

                    return null;
                  })()}

                  {/* Bookmark note — quote-style, proportional to transcript text */}
                  {isBookmarked && segBookmark?.note && (
                    <div className="mt-1.5 flex items-start gap-2 rounded-md border-l-2 border-primary/30 bg-primary/5 px-2.5 py-1.5">
                      <p
                        className="leading-[1.5] text-primary/70 italic"
                        style={{ fontSize: `${Math.max(11, transcriptFontSize - 2)}px` }}
                      >
                        {segBookmark.note}
                      </p>
                    </div>
                  )}
                </div>

                {/* Hover bookmark icon — appears at right edge on hover */}
                {meetingId && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleBookmark(segment); }}
                      className="rounded p-0.5 hover:bg-accent/50 transition-colors cursor-pointer"
                      title={isBookmarked ? "Remove bookmark" : "Bookmark this line"}
                    >
                      <BookmarkIcon className={`h-3 w-3 ${isBookmarked ? "fill-primary text-primary" : "text-muted-foreground/40"}`} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Right-click context menu for bookmarks */}
          {contextMenu && mergedSegments[contextMenu.segmentIndex] && (
            <TranscriptContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              isBookmarked={!!(mergedSegments[contextMenu.segmentIndex].id && bookmarkBySegment.get(mergedSegments[contextMenu.segmentIndex].id!))}
              onBookmark={() => handleToggleBookmark(mergedSegments[contextMenu.segmentIndex])}
              onAddNote={() => handleAddNote(mergedSegments[contextMenu.segmentIndex])}
              onCopy={() => handleCopyText(mergedSegments[contextMenu.segmentIndex].text)}
              onClose={() => setContextMenu(null)}
            />
          )}
        </div>
      </div>

      {/* Typeset controls footer — matches meeting overlay */}
      <div className="flex items-center gap-3 mx-2 px-3 py-1.5 border-t border-border/10 text-[10px]">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-muted-foreground/60">Text</span>
          <button
            onClick={() => setTranscriptFontSize(Math.max(10, transcriptFontSize - 1))}
            className="flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold text-muted-foreground/60 hover:bg-secondary/30 cursor-pointer"
          >A</button>
          <span className="min-w-[18px] text-center tabular-nums font-semibold text-muted-foreground/50">{transcriptFontSize}</span>
          <button
            onClick={() => setTranscriptFontSize(Math.min(20, transcriptFontSize + 1))}
            className="flex h-5 w-5 items-center justify-center rounded text-[13px] font-bold text-muted-foreground/60 hover:bg-secondary/30 cursor-pointer"
          >A</button>
          <ColorPickerButton value={transcriptTextColor} onChange={setTranscriptTextColor} label="Text color" />
        </div>
        <div className="h-4 w-px bg-border/10" />
        <div className="flex items-center gap-1">
          <span className="font-semibold text-muted-foreground/60">Translation</span>
          <button
            onClick={() => setTranslationFontSize(Math.max(9, translationFontSize - 1))}
            className="flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold text-muted-foreground/60 hover:bg-secondary/30 cursor-pointer"
          >A</button>
          <span className="min-w-[18px] text-center tabular-nums font-semibold text-muted-foreground/50">{translationFontSize}</span>
          <button
            onClick={() => setTranslationFontSize(Math.min(18, translationFontSize + 1))}
            className="flex h-5 w-5 items-center justify-center rounded text-[13px] font-bold text-muted-foreground/60 hover:bg-secondary/30 cursor-pointer"
          >A</button>
          <ColorPickerButton value={translationTextColor} onChange={setTranslationTextColor} label="Translation color" />
        </div>
      </div>

      {/* Note editor modal */}
      {noteEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setNoteEdit(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border/30 bg-card p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-foreground mb-3">Bookmark Note</h3>
            <textarea
              ref={noteInputRef}
              value={noteEdit.note}
              onChange={(e) => setNoteEdit({ ...noteEdit, note: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSaveNote();
                if (e.key === "Escape") setNoteEdit(null);
              }}
              placeholder="Add a note..."
              rows={3}
              autoFocus
              className="w-full resize-none rounded-lg border border-border/30 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/40">Ctrl+Enter to save</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setNoteEdit(null)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNote}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hover translation tooltip */}
      {hoverTranslation && createPortal(
        <div
          className="fixed z-[9999] max-w-[420px] rounded-lg border border-white/15 px-3.5 py-2.5 shadow-2xl pointer-events-none"
          style={{
            backgroundColor: '#1a1a2e',
            left: `${Math.min(hoverTranslation.x + 16, window.innerWidth - 440)}px`,
            top: `${Math.max(8, hoverTranslation.y - 90)}px`,
          }}
        >
          <p style={{ fontSize: `${translationFontSize + 1}px`, color: translationTextColor }} className="leading-[1.6]">
            {hoverTranslation.translation.translated_text}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5 text-[0.6rem] text-muted-foreground/50">
            <span className="rounded bg-white/8 px-1.5 py-0.5 font-medium tracking-wider">
              {hoverTranslation.translation.source_lang.toUpperCase()} → {hoverTranslation.translation.target_lang.toUpperCase()}
            </span>
            <span>·</span>
            <span>{hoverTranslation.translation.provider}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Text highlighting ──

function highlightText(text: string, query: string, offsets: number[], isActive: boolean): React.ReactNode {
  if (!query || offsets.length === 0) return text;
  const needle = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;
  const sorted = [...offsets].sort((a, b) => a - b);
  for (const offset of sorted) {
    if (offset > lastEnd) parts.push(text.slice(lastEnd, offset));
    parts.push(
      <mark key={offset} className={`rounded px-0.5 ${isActive ? "bg-highlight/40 text-highlight" : "bg-highlight/20 text-highlight/70"}`}>
        {text.slice(offset, offset + needle.length)}
      </mark>
    );
    lastEnd = offset + needle.length;
  }
  if (lastEnd < text.length) parts.push(text.slice(lastEnd));
  return <>{parts}</>;
}

// ── Timeline Scrubber ──

function TimelineScrubber({
  segments,
  selectedIndex,
  onJump,
  meetingStartTime,
}: {
  segments: TranscriptSegment[];
  selectedIndex: number | null;
  onJump: (index: number) => void;
  meetingStartTime?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    x: number;
    segmentIndex: number;
    timestamp: string;
    speaker: string;
    text: string;
  } | null>(null);

  if (segments.length < 2) return null;

  const firstTs = segments[0].timestamp_ms;
  const lastTs = segments[segments.length - 1].timestamp_ms;
  const totalDuration = lastTs - firstTs;
  if (totalDuration <= 0) return null;

  // Build merged speaker blocks
  const blocks: { speaker: string; startPct: number; widthPct: number }[] = [];
  let bStart = 0;
  let bSpeaker = segments[0].speaker;
  for (let i = 1; i <= segments.length; i++) {
    if (i === segments.length || segments[i].speaker !== bSpeaker) {
      const endTs = i < segments.length ? segments[i].timestamp_ms : lastTs;
      const startPct = ((segments[bStart].timestamp_ms - firstTs) / totalDuration) * 100;
      const widthPct = ((endTs - segments[bStart].timestamp_ms) / totalDuration) * 100;
      if (widthPct > 0.1) blocks.push({ speaker: bSpeaker, startPct, widthPct });
      if (i < segments.length) { bStart = i; bSpeaker = segments[i].speaker; }
    }
  }

  const findClosest = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const hoverTs = firstTs + ratio * totalDuration;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < segments.length; i++) {
      const d = Math.abs(segments[i].timestamp_ms - hoverTs);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return { x, idx: best };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const r = findClosest(e.clientX);
    if (!r) return;
    const seg = segments[r.idx];
    const elapsedMs = meetingStartTime ? Math.max(0, seg.timestamp_ms - meetingStartTime) : seg.timestamp_ms;
    setHover({
      x: r.x,
      segmentIndex: r.idx,
      timestamp: formatTimestamp(elapsedMs),
      speaker: getSpeakerLabel(seg.speaker),
      text: seg.text.length > 50 ? seg.text.slice(0, 50) + "..." : seg.text,
    });
  };

  const handleClick = () => { if (hover) onJump(hover.segmentIndex); };

  // Selected position
  const selPct = selectedIndex !== null
    ? ((segments[selectedIndex].timestamp_ms - firstTs) / totalDuration) * 100
    : null;

  // Format as m:ss
  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  // Duration label for the track
  const durationSec = Math.floor(totalDuration / 1000);
  const durationLabel = durationSec >= 3600
    ? `${Math.floor(durationSec / 3600)}h ${Math.floor((durationSec % 3600) / 60)}m`
    : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

  return (
    <div className="mx-4 mt-2 mb-1">
      {/* Tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2"
          style={{ left: `calc(1rem + ${hover.x}px)`, marginTop: -36 }}
        >
          <div className="rounded-lg border border-border/30 bg-card px-3 py-1.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tabular-nums text-foreground">{hover.timestamp}</span>
              <span className="text-xs text-muted-foreground/60">{hover.speaker}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground/50 max-w-[250px] truncate">{hover.text}</p>
          </div>
        </div>
      )}

      {/* Time labels + track */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs tabular-nums font-medium text-muted-foreground/40 w-8">
          {fmtTime(firstTs - (meetingStartTime || firstTs))}
        </span>

        {/* Track */}
        <div
          ref={containerRef}
          className="relative flex-1 h-4 cursor-pointer rounded-lg bg-secondary/20 overflow-hidden"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
          onClick={handleClick}
        >
          {blocks.map((b, i) => (
            <div
              key={i}
              className="absolute top-0 h-full rounded-sm"
              style={{
                left: `${b.startPct}%`,
                width: `${b.widthPct}%`,
                backgroundColor: TIMELINE_COLORS[b.speaker] || TIMELINE_COLORS.Unknown,
                opacity: 0.55,
              }}
            />
          ))}

          {/* Selected marker */}
          {selPct !== null && (
            <div
              className="absolute top-0 h-full w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
              style={{ left: `${selPct}%` }}
            />
          )}

          {/* Hover line */}
          {hover && (
            <div
              className="pointer-events-none absolute top-0 h-full w-px bg-white/40"
              style={{ left: hover.x }}
            />
          )}
        </div>

        <span className="shrink-0 text-xs tabular-nums font-medium text-muted-foreground/40 w-8 text-right">
          {fmtTime(lastTs - (meetingStartTime || firstTs))}
        </span>
      </div>

      {/* Duration badge */}
      <div className="flex justify-center mt-0.5">
        <span className="text-meta text-muted-foreground/30">{durationLabel}</span>
      </div>
    </div>
  );
}
