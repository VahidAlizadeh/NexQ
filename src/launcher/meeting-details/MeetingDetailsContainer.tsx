import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Meeting, RecordingInfo, TranslationResult } from "../../lib/types";
import { getMeeting, getRecordingInfo, getAllMeetingTranslations, translateSegments } from "../../lib/ipc";
import { onTranscriptFinal, onRecordingReady, onTranslationResult, onTranslationError } from "../../lib/events";
import { useMeetingStore } from "../../stores/meetingStore";
import { useTranslationStore } from "../../stores/translationStore";
import { useConfigStore } from "../../stores/configStore";
import { useMeetingStats } from "../../hooks/useMeetingStats";
import { useTranscriptSearch } from "../../hooks/useTranscriptSearch";
import { useSummaryGeneration } from "../../hooks/useSummaryGeneration";
import { useActionItemsExtraction } from "../../hooks/useActionItemsExtraction";
import { useBookmarkSuggestions } from "../../hooks/useBookmarkSuggestions";
import { useAudioKeyboardShortcuts } from "../../hooks/useAudioKeyboardShortcuts";
import { exportMeetingAsMarkdown } from "../../lib/export";
import { mergeConsecutiveSegments } from "../../lib/mergeSegments";
import { MeetingHeader } from "./MeetingHeader";
import { MeetingTabBar, type MeetingTab } from "./MeetingTabBar";
import { TranscriptView } from "./TranscriptView";
import { SummaryView } from "./SummaryView";
import { AIInteractionLog } from "./AIInteractionLog";
import { SpeakersTab } from "./SpeakersTab";
import { ActionItemsTab } from "./ActionItemsTab";
import { BookmarksTab } from "./BookmarksTab";
import { AudioPlayer, AudioPlayerSkeleton } from "../../components/AudioPlayer";
import { Loader2 } from "lucide-react";

interface MeetingDetailsProps {
  meetingId: string;
  onBack: () => void;
}

export function MeetingDetails({ meetingId, onBack }: MeetingDetailsProps) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MeetingTab>("transcript");
  const [expandedInteraction, setExpandedInteraction] = useState<string | null>(null);
  const [scrollToSegmentIndex, setScrollToSegmentIndex] = useState<number | null>(null);
  const [recordingInfo, setRecordingInfo] = useState<RecordingInfo | null>(null);
  const [recordingProcessing, setRecordingProcessing] = useState(false);

  // Translation state for post-meeting view
  const [translations, setTranslations] = useState<Map<string, TranslationResult>>(new Map());
  const [translatingSegments, setTranslatingSegments] = useState<Set<string>>(new Set());
  const [translationsVisible, setTranslationsVisible] = useState(true);
  const [retranslating, setRetranslating] = useState(false);

  // Translation store selectors
  const displayMode = useTranslationStore((s) => s.displayMode);
  const setDisplayMode = useTranslationStore((s) => s.setDisplayMode);
  const currentTargetLang = useTranslationStore((s) => s.targetLang);
  const autoTranslateEnabled = useTranslationStore((s) => s.autoTranslateEnabled);
  const showPostMeetingTranslation = useConfigStore((s) => s.showPostMeetingTranslation);

  const loadMeeting = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMeeting(meetingId);
      setMeeting(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meeting");
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => { loadMeeting(); }, [loadMeeting]);

  // Live transcript subscription
  const activeMeetingId = useMeetingStore((s) => s.activeMeeting?.id);
  const isActiveMeeting = activeMeetingId === meetingId;

  useEffect(() => {
    if (!isActiveMeeting) return;
    const unlistenPromise = onTranscriptFinal((event) => {
      setMeeting((prev) => {
        if (!prev) return prev;
        return { ...prev, transcript: [...prev.transcript, event.segment] };
      });
    });
    return () => { unlistenPromise.then((unlisten) => unlisten()); };
  }, [isActiveMeeting]);

  // Load recording info when meeting loads (waveform_data is included in the response)
  useEffect(() => {
    if (!meeting?.id) return;
    getRecordingInfo(meeting.id).then((info) => {
      if (info) {
        setRecordingInfo(info);
      }
    });
  }, [meeting?.id]);

  // Listen for recording_ready event (fires when post-meeting processing completes)
  useEffect(() => {
    const unlisten = onRecordingReady((data) => {
      if (data.meeting_id === meeting?.id) {
        setRecordingProcessing(false);
        getRecordingInfo(meeting.id).then((info) => {
          if (info) {
            setRecordingInfo(info);
          }
        });
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [meeting?.id]);

  // Load all translations for this meeting
  useEffect(() => {
    if (!meetingId) return;
    getAllMeetingTranslations(meetingId).then((results) => {
      const map = new Map<string, TranslationResult>();
      // Results are ordered by created_at DESC — first match per segment wins
      for (const r of results) {
        if (r.segment_id && !map.has(r.segment_id)) {
          map.set(r.segment_id, r);
        }
      }
      // Second pass: override with currentTargetLang matches
      for (const r of results) {
        if (r.segment_id && r.target_lang === currentTargetLang) {
          map.set(r.segment_id, r);
        }
      }
      setTranslations(map);
    }).catch((err) => {
      console.error("[MeetingDetails] Failed to load translations:", err);
    });
  }, [meetingId, currentTargetLang]);

  // Listen for new translation results (from on-demand translating)
  useEffect(() => {
    const unlistenResult = onTranslationResult((result) => {
      if (result.segment_id) {
        setTranslations((prev) => {
          const next = new Map(prev);
          next.set(result.segment_id!, result);
          return next;
        });
        setTranslatingSegments((prev) => {
          const next = new Set(prev);
          next.delete(result.segment_id!);
          return next;
        });
      }
    });
    const unlistenError = onTranslationError((error) => {
      if (error.segment_id) {
        setTranslatingSegments((prev) => {
          const next = new Set(prev);
          next.delete(error.segment_id!);
          return next;
        });
      }
      setRetranslating(false);
    });
    return () => {
      unlistenResult.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, []);

  // Audio keyboard shortcuts (Space, Arrow keys, [ ])
  useAudioKeyboardShortcuts();

  // Hooks
  const stats = useMeetingStats(meeting);
  const search = useTranscriptSearch(meeting?.transcript ?? []);
  const summaryGeneration = useSummaryGeneration(meeting, (summary) => {
    setMeeting((prev) => (prev ? { ...prev, summary } : prev));
  });
  const actionExtraction = useActionItemsExtraction(meeting, (items) => {
    setMeeting((prev) => (prev ? { ...prev, action_items: items } : prev));
  });
  const bookmarkSuggestions = useBookmarkSuggestions(meeting, (newBookmark) => {
    setMeeting((prev) =>
      prev
        ? { ...prev, bookmarks: [...(prev.bookmarks ?? []), newBookmark] }
        : prev,
    );
  });
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        if (activeTab === "transcript") {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        if (activeTab === "summary") {
          e.preventDefault();
          if (!summaryGeneration.isGenerating && meeting && !meeting.summary) {
            summaryGeneration.generate();
          }
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeTab, summaryGeneration, meeting]);

  // On-demand translate a single segment
  const handleTranslateSegment = useCallback(async (segmentId: string, text: string) => {
    if (!meetingId || !currentTargetLang) return;
    setTranslatingSegments((prev) => new Set(prev).add(segmentId));
    try {
      await translateSegments([segmentId], [text], meetingId, currentTargetLang);
    } catch (err) {
      console.error("[MeetingDetails] Translate segment failed:", err);
      setTranslatingSegments((prev) => {
        const next = new Set(prev);
        next.delete(segmentId);
        return next;
      });
    }
  }, [meetingId, currentTargetLang]);

  // Retranslate a single mismatched segment
  const handleRetranslateSegment = useCallback(async (segmentId: string, text: string) => {
    await handleTranslateSegment(segmentId, text);
  }, [handleTranslateSegment]);

  // Retranslate all mismatched segments
  const handleRetranslateAll = useCallback(async () => {
    if (!meeting || !currentTargetLang) return;
    const mismatched = meeting.transcript
      .filter((s) => s.id && translations.has(s.id) && translations.get(s.id)!.target_lang !== currentTargetLang)
      .map((s) => ({ id: s.id!, text: s.text }));
    if (mismatched.length === 0) return;
    setRetranslating(true);
    for (const seg of mismatched) {
      setTranslatingSegments((prev) => new Set(prev).add(seg.id));
    }
    try {
      await translateSegments(
        mismatched.map((s) => s.id),
        mismatched.map((s) => s.text),
        meeting.id,
        currentTargetLang,
      );
    } catch (err) {
      console.error("[MeetingDetails] Retranslate all failed:", err);
    } finally {
      setRetranslating(false);
    }
  }, [meeting, translations, currentTargetLang]);

  // Translation toolbar stats — use merged segments to match what the user sees
  const mergedSegments = useMemo(
    () => meeting ? mergeConsecutiveSegments(meeting.transcript) : [],
    [meeting?.transcript]
  );
  const totalSegments = mergedSegments.length;
  const translatedCount = mergedSegments.filter((s) => s.id && translations.has(s.id)).length;
  const mismatchedCount = mergedSegments.filter(
    (s) => s.id && translations.has(s.id) && translations.get(s.id)!.target_lang !== currentTargetLang
  ).length;
  const showToolbar = showPostMeetingTranslation && (translations.size > 0 || autoTranslateEnabled);

  // Export
  const handleExport = useCallback(async () => {
    if (!meeting) return;
    await exportMeetingAsMarkdown(meeting);
  }, [meeting]);

  const handleTitleChanged = useCallback((title: string) => {
    setMeeting((prev) => (prev ? { ...prev, title } : prev));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading meeting data...</p>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-xs text-red-400">{error || "Meeting not found"}</p>
        <button onClick={onBack} className="text-xs text-primary hover:underline cursor-pointer">Go back</button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <MeetingHeader
        meeting={meeting}
        stats={stats}
        onBack={onBack}
        onTitleChanged={handleTitleChanged}
      />

      <MeetingTabBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        meeting={meeting}
        onGenerateSummary={() => {
          setActiveTab("summary");
          if (!summaryGeneration.isGenerating) {
            summaryGeneration.generate();
          }
        }}
        onExtractActions={() => {
          setActiveTab("actions");
          if (!actionExtraction.isExtracting) {
            actionExtraction.extract();
          }
        }}
        onSuggestBookmarks={() => {
          setActiveTab("bookmarks");
          if (!bookmarkSuggestions.isSuggesting) {
            bookmarkSuggestions.suggest();
          }
        }}
        isSummaryGenerating={summaryGeneration.isGenerating}
        isActionsExtracting={actionExtraction.isExtracting}
        isBookmarksSuggesting={bookmarkSuggestions.isSuggesting}
      />

      <div className={`flex-1 min-h-0 ${activeTab === "transcript" ? "overflow-hidden flex flex-col" : "overflow-y-auto"}`} role="tabpanel">
        {activeTab === "transcript" && (
          <TranscriptView
            segments={meeting.transcript}
            search={search}
            meetingStartTime={new Date(meeting.start_time).getTime()}
            recordingOffsetMs={recordingInfo?.offset_ms ?? 0}
            speakers={meeting.speakers}
            searchInputRef={searchInputRef}
            bookmarks={meeting.bookmarks}
            meetingId={meeting.id}
            onBookmarksChanged={(bookmarks) => setMeeting((prev) => prev ? { ...prev, bookmarks } : prev)}
            initialScrollToIndex={scrollToSegmentIndex}
            onScrollHandled={() => setScrollToSegmentIndex(null)}
            translations={translations}
            translatingSegments={translatingSegments}
            translationDisplayMode={displayMode}
            currentTargetLang={currentTargetLang}
            showTranslations={translationsVisible}
            onTranslateSegment={handleTranslateSegment}
            onRetranslateSegment={handleRetranslateSegment}
            showToolbar={showToolbar}
            translatedCount={translatedCount}
            totalSegments={totalSegments}
            mismatchedCount={mismatchedCount}
            onDisplayModeChange={setDisplayMode}
            onRetranslateAll={handleRetranslateAll}
            onToggleTranslationVisibility={() => setTranslationsVisible((v) => !v)}
            retranslating={retranslating}
          />
        )}
        {activeTab === "summary" && (
          <SummaryView meeting={meeting} generation={summaryGeneration} onExport={handleExport} />
        )}
        {activeTab === "ai" && (
          <AIInteractionLog
            interactions={meeting.ai_interactions}
            expandedId={expandedInteraction}
            onToggle={(id) => setExpandedInteraction(expandedInteraction === id ? null : id)}
          />
        )}
        {activeTab === "speakers" && (
          <SpeakersTab
            meeting={meeting}
            onSegmentClick={(idx) => {
              setScrollToSegmentIndex(idx);
              setActiveTab("transcript");
            }}
          />
        )}
        {activeTab === "actions" && (
          <ActionItemsTab
            meeting={meeting}
            extraction={actionExtraction}
            onItemsUpdated={(items) =>
              setMeeting((prev) => (prev ? { ...prev, action_items: items } : prev))
            }
          />
        )}
        {activeTab === "bookmarks" && (
          <BookmarksTab
            meeting={meeting}
            onBookmarkUpdated={(bookmarks) =>
              setMeeting((prev) => (prev ? { ...prev, bookmarks } : prev))
            }
            onNavigateToBookmark={(bookmark) => {
              // Find the segment index matching this bookmark
              const idx = meeting.transcript.findIndex(
                (s) => (bookmark.segment_id && s.id === bookmark.segment_id)
                  || s.timestamp_ms === bookmark.timestamp_ms
              );
              setScrollToSegmentIndex(idx >= 0 ? idx : null);
              setActiveTab("transcript");
            }}
            suggestions={bookmarkSuggestions}
          />
        )}
      </div>

      {/* Audio Player — sticky bottom bar */}
      {recordingProcessing && <AudioPlayerSkeleton />}
      {recordingInfo && !recordingProcessing && (
        <AudioPlayer
          meetingId={meeting.id}
          meetingStartMs={new Date(meeting.start_time).getTime()}
          recordingPath={recordingInfo.path}
          recordingSize={recordingInfo.size_bytes}
          recordingOffsetMs={recordingInfo.offset_ms}
          durationMs={recordingInfo.duration_ms}
          waveformData={recordingInfo.waveform_data ?? null}
          bookmarks={meeting.bookmarks}
          topicSections={meeting.topic_sections}
        />
      )}
    </div>
  );
}
