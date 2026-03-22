// Speaker color palette — 8 distinct colors for diarized speakers
// "you" and "them" use existing colors; diarized speakers assigned in order

export const SPEAKER_COLORS = [
  "#f97316", // orange (also used for "them" in online)
  "#22c55e", // green (also used for "you" in online)
  "#3b82f6", // blue
  "#eab308", // yellow
  "#ec4899", // pink
  "#14b8a6", // teal
  "#ef4444", // red
  "#6366f1", // indigo
] as const;

export const FIXED_SPEAKER_COLORS: Record<string, string> = {
  you: "#22c55e",
  them: "#f97316",
  room: "#a855f7",
};

export function getSpeakerColor(speakerId: string, orderIndex: number): string {
  if (speakerId in FIXED_SPEAKER_COLORS) {
    return FIXED_SPEAKER_COLORS[speakerId];
  }
  return SPEAKER_COLORS[orderIndex % SPEAKER_COLORS.length];
}

// Badge colors for audio mode
export const MODE_COLORS = {
  online: { text: "#4a6cf7", bg: "rgba(74,108,247,0.15)" },
  in_person: { text: "#a855f7", bg: "rgba(168,85,247,0.15)" },
} as const;
