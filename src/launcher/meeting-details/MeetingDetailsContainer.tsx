import { useState, useEffect, useCallback, useRef } from "react";
import type { Meeting } from "../../lib/types";
import { getMeeting } from "../../lib/ipc";
import { onTranscriptFinal } from "../../lib/events";
import { useMeetingStore } from "../../stores/meetingStore";
import { useMeetingStats } from "../../hooks/useMeetingStats";
import { useTranscriptSearch } from "../../hooks/useTranscriptSearch";
import { useSummaryGeneration } from "../../hooks/useSummaryGeneration";
import { useActionItemsExtraction } from "../../hooks/useActionItemsExtraction";
import { useBookmarkSuggestions } from "../../hooks/useBookmarkSuggestions";
import { exportMeetingAsMarkdown } from "../../lib/export";
import { MeetingHeader } from "./MeetingHeader";
import { MeetingTabBar, type MeetingTab } from "./MeetingTabBar";
import { TranscriptView } from "./TranscriptView";
import { SummaryView } from "./SummaryView";
import { AIInteractionLog } from "./AIInteractionLog";
import { SpeakersTab } from "./SpeakersTab";
import { ActionItemsTab } from "./ActionItemsTab";
import { BookmarksTab } from "./BookmarksTab";
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

      <div className="flex-1 overflow-y-auto" role="tabpanel">
        {activeTab === "transcript" && (
          <TranscriptView
            segments={meeting.transcript}
            search={search}
            meetingStartTime={new Date(meeting.start_time).getTime()}
            speakers={meeting.speakers}
            searchInputRef={searchInputRef}
            bookmarks={meeting.bookmarks}
            meetingId={meeting.id}
            onBookmarksChanged={(bookmarks) => setMeeting((prev) => prev ? { ...prev, bookmarks } : prev)}
            initialScrollToIndex={scrollToSegmentIndex}
            onScrollHandled={() => setScrollToSegmentIndex(null)}
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
    </div>
  );
}
