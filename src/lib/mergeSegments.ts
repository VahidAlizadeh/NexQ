import type { TranscriptSegment } from "./types";

export interface MergedSegment extends TranscriptSegment {
  mergedCount: number;
  originalIds: string[];
}

const MERGE_GAP_MS = 3000;
const MERGE_MAX_CHARS = 300;

function speakerKey(seg: TranscriptSegment): string {
  return seg.speaker_id ?? seg.speaker;
}

export function mergeConsecutiveSegments(segments: TranscriptSegment[]): MergedSegment[] {
  if (segments.length === 0) return [];

  const result: MergedSegment[] = [];
  let current: MergedSegment = {
    ...segments[0],
    mergedCount: 1,
    originalIds: [segments[0].id],
  };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const gap = seg.timestamp_ms - current.timestamp_ms;
    const sameKey = speakerKey(seg) === speakerKey(current);
    const wouldExceedLength = (current.text + " " + seg.text.trim()).length > MERGE_MAX_CHARS;

    if (sameKey && gap <= MERGE_GAP_MS && !wouldExceedLength && seg.is_final) {
      current = {
        ...current,
        text: current.text + " " + seg.text.trim(),
        confidence: Math.min(current.confidence, seg.confidence),
        mergedCount: current.mergedCount + 1,
        originalIds: [...current.originalIds, seg.id],
      };
    } else {
      result.push(current);
      current = {
        ...seg,
        mergedCount: 1,
        originalIds: [seg.id],
      };
    }
  }
  result.push(current);

  return result;
}
