// ============================================================================
// NexQ Export Utilities — multi-format meeting export
// ============================================================================

import type { Meeting, TranscriptSegment, AIScenario } from "./types";
import { formatTimestamp, formatDurationLong, getSpeakerLabel, getModeLabel } from "./utils";
import { showToast } from "../stores/toastStore";

// ── Helpers ──────────────────────────────────────────────────────────────────

function meetingStartMs(meeting: Meeting): number {
  return new Date(meeting.start_time).getTime();
}

function segmentTime(seg: TranscriptSegment, startMs: number): string {
  return formatTimestamp(Math.max(0, seg.timestamp_ms - startMs));
}

function safeFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "meeting";
}

// ── Export: Markdown ──────────────────────────────────────────────────────────

export function exportToMarkdown(meeting: Meeting): string {
  const startMs = meetingStartMs(meeting);
  let md = `# ${meeting.title}\n\n`;
  md += `**Date:** ${new Date(meeting.start_time).toLocaleString()}\n`;
  if (meeting.duration_seconds) {
    md += `**Duration:** ${formatDurationLong(meeting.duration_seconds * 1000)}\n`;
  }
  if (meeting.audio_mode) {
    md += `**Mode:** ${meeting.audio_mode === "online" ? "Online" : "In-Person"}\n`;
  }
  if (meeting.ai_scenario) {
    md += `**Scenario:** ${meeting.ai_scenario.replace(/_/g, " ")}\n`;
  }
  md += `**Segments:** ${meeting.transcript.length}\n\n`;

  if (meeting.summary) {
    md += `## Summary\n\n${meeting.summary}\n\n`;
  }

  if (meeting.action_items && meeting.action_items.length > 0) {
    md += `## Action Items\n\n`;
    for (const item of meeting.action_items) {
      md += `- [${item.completed ? "x" : " "}] ${item.text}\n`;
    }
    md += "\n";
  }

  if (meeting.transcript.length > 0) {
    md += `## Transcript\n\n`;
    for (const seg of meeting.transcript) {
      md += `**[${segmentTime(seg, startMs)}] ${getSpeakerLabel(seg.speaker)}:** ${seg.text}\n\n`;
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

// ── Export: SRT ───────────────────────────────────────────────────────────────

function msToSrtTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const millis = ms % 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return (
    `${hours.toString().padStart(2, "0")}:` +
    `${minutes.toString().padStart(2, "0")}:` +
    `${seconds.toString().padStart(2, "0")},` +
    `${millis.toString().padStart(3, "0")}`
  );
}

export function exportToSRT(segments: TranscriptSegment[], startMs: number = 0): string {
  const lines: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segStart = Math.max(0, seg.timestamp_ms - startMs);
    // Estimate end: next segment start or +3 seconds
    const nextSeg = segments[i + 1];
    const segEnd = nextSeg
      ? Math.max(0, nextSeg.timestamp_ms - startMs)
      : segStart + 3000;

    lines.push(`${i + 1}`);
    lines.push(`${msToSrtTime(segStart)} --> ${msToSrtTime(segEnd)}`);
    lines.push(`${getSpeakerLabel(seg.speaker)}: ${seg.text}`);
    lines.push("");
  }
  return lines.join("\n");
}

// ── Export: JSON ──────────────────────────────────────────────────────────────

export function exportToJSON(meeting: Meeting): string {
  const data = {
    id: meeting.id,
    title: meeting.title,
    start_time: meeting.start_time,
    end_time: meeting.end_time,
    duration_seconds: meeting.duration_seconds,
    audio_mode: meeting.audio_mode,
    ai_scenario: meeting.ai_scenario,
    summary: meeting.summary,
    transcript: meeting.transcript,
    ai_interactions: meeting.ai_interactions,
    speakers: meeting.speakers,
    action_items: meeting.action_items,
    bookmarks: meeting.bookmarks,
    topic_sections: meeting.topic_sections,
  };
  return JSON.stringify(data, null, 2);
}

// ── Export: Study Notes (Lecture scenario) ────────────────────────────────────

export function exportStudyNotes(meeting: Meeting): string {
  const startMs = meetingStartMs(meeting);
  let md = `# Study Notes — ${meeting.title}\n\n`;
  md += `**Date:** ${new Date(meeting.start_time).toLocaleString()}\n`;
  if (meeting.duration_seconds) {
    md += `**Duration:** ${formatDurationLong(meeting.duration_seconds * 1000)}\n`;
  }
  md += "\n";

  if (meeting.summary) {
    md += `## Key Takeaways\n\n${meeting.summary}\n\n`;
  }

  if (meeting.topic_sections && meeting.topic_sections.length > 0) {
    md += `## Topics Covered\n\n`;
    for (const topic of meeting.topic_sections) {
      md += `### ${topic.title}\n`;
      md += `*Starts at ${formatTimestamp(topic.start_ms)}*\n\n`;
      // Segments within this topic
      const topicEnd = topic.end_ms ?? Infinity;
      const topicSegs = meeting.transcript.filter(
        (s) => s.timestamp_ms >= topic.start_ms && s.timestamp_ms < topicEnd
      );
      for (const seg of topicSegs) {
        md += `- **[${segmentTime(seg, startMs)}]** ${seg.text}\n`;
      }
      md += "\n";
    }
  } else if (meeting.transcript.length > 0) {
    md += `## Notes\n\n`;
    for (const seg of meeting.transcript) {
      md += `- **[${segmentTime(seg, startMs)}]** ${seg.text}\n`;
    }
    md += "\n";
  }

  if (meeting.action_items && meeting.action_items.length > 0) {
    md += `## Follow-Up Actions\n\n`;
    for (const item of meeting.action_items) {
      md += `- [${item.completed ? "x" : " "}] ${item.text}\n`;
    }
    md += "\n";
  }

  return md;
}

// ── Export: Meeting Minutes (Team Meeting scenario) ───────────────────────────

export function exportMeetingMinutes(meeting: Meeting): string {
  const startMs = meetingStartMs(meeting);
  let md = `# Meeting Minutes — ${meeting.title}\n\n`;
  md += `**Date:** ${new Date(meeting.start_time).toLocaleString()}\n`;
  if (meeting.duration_seconds) {
    md += `**Duration:** ${formatDurationLong(meeting.duration_seconds * 1000)}\n`;
  }
  if (meeting.speakers && meeting.speakers.length > 0) {
    md += `**Attendees:** ${meeting.speakers.map((s) => s.display_name).join(", ")}\n`;
  }
  md += "\n";

  if (meeting.summary) {
    md += `## Summary\n\n${meeting.summary}\n\n`;
  }

  if (meeting.topic_sections && meeting.topic_sections.length > 0) {
    md += `## Agenda Items\n\n`;
    for (const topic of meeting.topic_sections) {
      md += `### ${topic.title}\n\n`;
      const topicEnd = topic.end_ms ?? Infinity;
      const topicSegs = meeting.transcript.filter(
        (s) => s.timestamp_ms >= topic.start_ms && s.timestamp_ms < topicEnd
      );
      for (const seg of topicSegs) {
        md += `**${getSpeakerLabel(seg.speaker)}** *(${segmentTime(seg, startMs)})*: ${seg.text}\n\n`;
      }
    }
  } else if (meeting.transcript.length > 0) {
    md += `## Discussion\n\n`;
    for (const seg of meeting.transcript) {
      md += `**${getSpeakerLabel(seg.speaker)}** *(${segmentTime(seg, startMs)})*: ${seg.text}\n\n`;
    }
  }

  if (meeting.action_items && meeting.action_items.length > 0) {
    md += `## Action Items\n\n`;
    for (const item of meeting.action_items) {
      const assignee = meeting.speakers?.find((s) => s.id === item.assignee_speaker_id);
      md += `- [${item.completed ? "x" : " "}] ${item.text}`;
      if (assignee) md += ` *(${assignee.display_name})*`;
      md += "\n";
    }
    md += "\n";
  }

  return md;
}

// ── Scenario-specific export registry ────────────────────────────────────────

interface ScenarioExportFormat {
  label: string;
  extension: string;
  fn: (meeting: Meeting) => string;
}

export function getScenarioExportFormat(scenario: AIScenario | undefined): ScenarioExportFormat | null {
  switch (scenario) {
    case "lecture":
      return { label: "Study Notes", extension: "md", fn: exportStudyNotes };
    case "team_meeting":
      return { label: "Meeting Minutes", extension: "md", fn: exportMeetingMinutes };
    default:
      return null;
  }
}

// ── File save helper ─────────────────────────────────────────────────────────

interface SaveOptions {
  defaultName: string;
  extension: string;
  filterLabel: string;
  content: string;
}

export async function saveExportFile({ defaultName, extension, filterLabel, content }: SaveOptions): Promise<boolean> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const filePath = await save({
      defaultPath: `${safeFilename(defaultName)}.${extension}`,
      filters: [{ name: filterLabel, extensions: [extension] }],
    });
    if (!filePath) return false;
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(filePath, content);
    showToast("Exported successfully", "success");
    return true;
  } catch (err) {
    console.error("[Export] Failed:", err);
    showToast("Export failed — check disk space", "error");
    return false;
  }
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export async function exportMeetingAsMarkdown(meeting: Meeting): Promise<boolean> {
  return saveExportFile({
    defaultName: meeting.title,
    extension: "md",
    filterLabel: "Markdown",
    content: exportToMarkdown(meeting),
  });
}

export async function exportMeetingAsSRT(meeting: Meeting): Promise<boolean> {
  const startMs = meetingStartMs(meeting);
  return saveExportFile({
    defaultName: meeting.title,
    extension: "srt",
    filterLabel: "SRT Subtitles",
    content: exportToSRT(meeting.transcript, startMs),
  });
}

export async function exportMeetingAsJSON(meeting: Meeting): Promise<boolean> {
  return saveExportFile({
    defaultName: meeting.title,
    extension: "json",
    filterLabel: "JSON",
    content: exportToJSON(meeting),
  });
}

export async function exportMeetingScenario(meeting: Meeting): Promise<boolean> {
  const fmt = getScenarioExportFormat(meeting.ai_scenario);
  if (!fmt) return false;
  return saveExportFile({
    defaultName: `${meeting.title} — ${fmt.label}`,
    extension: fmt.extension,
    filterLabel: fmt.label,
    content: fmt.fn(meeting),
  });
}
