import { useState, useEffect, useCallback } from "react";
import type { Meeting } from "../../lib/types";
import { getMeeting } from "../../lib/ipc";
import { onTranscriptFinal } from "../../lib/events";
import { useMeetingStore } from "../../stores/meetingStore";
import { useMeetingStats } from "../../hooks/useMeetingStats";
import { useTranscriptSearch } from "../../hooks/useTranscriptSearch";
import { useSummaryGeneration } from "../../hooks/useSummaryGeneration";
import { showToast } from "../../stores/toastStore";
import { MeetingHeader, type LayoutMode } from "./MeetingHeader";
import { MeetingTabBar, type MeetingTab } from "./MeetingTabBar";
import { TranscriptView } from "./TranscriptView";
import { SummaryView } from "./SummaryView";
import { AIInteractionLog } from "./AIInteractionLog";
import {
  formatTimestamp,
  formatDurationLong,
  getSpeakerLabel,
  getModeLabel,
} from "../../lib/utils";
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
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    try { return (localStorage.getItem("nexq_meeting_layout") as LayoutMode) || "single"; }
    catch { return "single"; }
  });

  const handleLayoutChange = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode);
    try { localStorage.setItem("nexq_meeting_layout", mode); } catch {}
  }, []);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        if (activeTab === "transcript" || layoutMode === "split") {
          e.preventDefault();
          search.open();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        if (activeTab === "summary" || layoutMode === "split") {
          e.preventDefault();
          if (!summaryGeneration.isGenerating && meeting && !meeting.summary) {
            summaryGeneration.generate();
          }
        }
      }
      if (e.key === "Escape" && search.isOpen) search.close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeTab, layoutMode, search, summaryGeneration, meeting]);

  // Export
  const handleExport = useCallback(async () => {
    if (!meeting) return;
    try {
      const md = meetingToMarkdown(meeting);
      const { save } = await import("@tauri-apps/plugin-dialog");
      const filePath = await save({
        defaultPath: `${meeting.title.replace(/[^a-zA-Z0-9 ]/g, "").trim()}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (filePath) {
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        await writeTextFile(filePath, md);
        showToast("Meeting exported", "success");
      }
    } catch (err) {
      console.error("[MeetingDetails] Export failed:", err);
      showToast("Export failed", "error");
    }
  }, [meeting]);

  const handleTitleChanged = useCallback((title: string) => {
    setMeeting((prev) => (prev ? { ...prev, title } : prev));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading...</p>
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

  // ═══════════════════════════════════════════
  // SPLIT LAYOUT — Transcript left, Tabs right
  // ═══════════════════════════════════════════
  if (layoutMode === "split") {
    return (
      <div className="flex h-full flex-col">
        <MeetingHeader
          meeting={meeting}
          stats={stats}
          onBack={onBack}
          onTitleChanged={handleTitleChanged}
          layoutMode={layoutMode}
          onLayoutChange={handleLayoutChange}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Transcript (always visible) */}
          <div className="flex flex-1 flex-col border-r border-border/10 min-w-0">
            <div className="px-5 py-1.5 border-b border-border/10">
              <span className="text-xs font-semibold text-muted-foreground/50">
                Transcript
                <span className="ml-1.5 text-muted-foreground/30">{meeting.transcript.length}</span>
              </span>
            </div>
            <TranscriptView segments={meeting.transcript} search={search} meetingStartTime={new Date(meeting.start_time).getTime()} />
          </div>

          {/* Right: Tabbed content */}
          <div className="flex w-[45%] min-w-[300px] max-w-[500px] flex-col">
            <MeetingTabBar
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              meeting={meeting}
            />
            <div className="flex-1 overflow-y-auto">
              {activeTab === "transcript" && (
                <TranscriptView segments={meeting.transcript} search={search} meetingStartTime={new Date(meeting.start_time).getTime()} />
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
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // SINGLE COLUMN LAYOUT
  // ═══════════════════════════════════════════
  return (
    <div className="flex h-full flex-col">
      <MeetingHeader
        meeting={meeting}
        stats={stats}
        onBack={onBack}
        onTitleChanged={handleTitleChanged}
        layoutMode={layoutMode}
        onLayoutChange={handleLayoutChange}
      />

      <MeetingTabBar activeTab={activeTab} setActiveTab={setActiveTab} meeting={meeting} />

      <div className="flex-1 overflow-y-auto">
        {activeTab === "transcript" && (
          <TranscriptView segments={meeting.transcript} search={search} meetingStartTime={new Date(meeting.start_time).getTime()} />
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
      </div>
    </div>
  );
}

function meetingToMarkdown(meeting: Meeting): string {
  let md = `# ${meeting.title}\n\n`;
  md += `**Date:** ${new Date(meeting.start_time).toLocaleString()}\n`;
  if (meeting.duration_seconds) md += `**Duration:** ${formatDurationLong(meeting.duration_seconds * 1000)}\n`;
  md += `**Segments:** ${meeting.transcript.length}\n\n`;
  if (meeting.summary) md += `## Summary\n\n${meeting.summary}\n\n`;
  if (meeting.transcript.length > 0) {
    const meetingStart = new Date(meeting.start_time).getTime();
    md += `## Transcript\n\n`;
    for (const seg of meeting.transcript) {
      md += `**[${formatTimestamp(Math.max(0, seg.timestamp_ms - meetingStart))}] ${getSpeakerLabel(seg.speaker)}:** ${seg.text}\n\n`;
    }
  }
  if (meeting.ai_interactions.length > 0) {
    md += `## AI Interactions\n\n`;
    for (const ai of meeting.ai_interactions) {
      md += `### ${getModeLabel(ai.mode)} (${ai.provider}/${ai.model})\n\n${ai.response}\n\n---\n\n`;
    }
  }
  return md;
}
