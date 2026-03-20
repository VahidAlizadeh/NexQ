// Segment Accumulator — merges consecutive STT segments from the same speaker
// until a configurable word-gap (pause) threshold is exceeded.
//
// Sits between the STT provider output and IPC event emission.
// Interim results pass through immediately (same segment ID for in-place replacement).
// Final results are merged into the current accumulated segment until a pause
// or speaker change triggers finalization.

use super::provider::TranscriptResult;

/// Output from the accumulator — one or two segments per `feed_result` call.
#[derive(Debug, Clone)]
pub struct AccumulatorOutput {
    pub id: String,
    pub text: String,
    pub speaker: String,
    pub timestamp_ms: u64,
    pub is_final: bool,
    pub confidence: f32,
}

pub struct SegmentAccumulator {
    /// Configurable pause duration in ms (default: 3000ms)
    pause_threshold_ms: u64,
    /// Accumulated text for the current (in-progress) segment
    current_text: String,
    /// Speaker for the current segment
    current_speaker: String,
    /// Timestamp of the first word in the current segment
    current_start_ms: u64,
    /// Timestamp of the most recent final result
    last_word_ms: u64,
    /// Monotonic counter for generating unique segment IDs
    segment_counter: u64,
    /// Whether we have an active accumulated segment
    has_active: bool,
}

impl SegmentAccumulator {
    pub fn new(pause_threshold_ms: u64) -> Self {
        Self {
            pause_threshold_ms,
            current_text: String::new(),
            current_speaker: String::new(),
            current_start_ms: 0,
            last_word_ms: 0,
            segment_counter: 0,
            has_active: false,
        }
    }

    /// Process a transcript result and return accumulated outputs.
    ///
    /// Returns 0-2 outputs:
    /// - Interim result: emits a single interim output with the accumulated text + interim text
    /// - Final result, same speaker, within pause: merges text, returns updated final
    /// - Final result, speaker change or pause exceeded: finalizes old segment + starts new
    pub fn feed_result(&mut self, result: TranscriptResult) -> Vec<AccumulatorOutput> {
        let speaker = result
            .speaker
            .clone()
            .unwrap_or_else(|| "Unknown".to_string());

        // Interim results: pass through with accumulated prefix for display
        if !result.is_final {
            let display_text = if self.has_active {
                format!("{} {}", self.current_text, result.text)
            } else {
                result.text.clone()
            };
            let id = format!("acc_{}", self.segment_counter + 1);
            return vec![AccumulatorOutput {
                id,
                text: display_text,
                speaker,
                timestamp_ms: if self.has_active {
                    self.current_start_ms
                } else {
                    result.timestamp_ms
                },
                is_final: false,
                confidence: result.confidence,
            }];
        }

        // Final result — decide whether to merge or start a new segment
        let mut outputs = Vec::new();

        let speaker_changed = self.has_active && speaker != self.current_speaker;
        let pause_exceeded = self.has_active
            && self.last_word_ms > 0
            && result.timestamp_ms.saturating_sub(self.last_word_ms) >= self.pause_threshold_ms;

        if speaker_changed || pause_exceeded {
            // Finalize the current accumulated segment
            if self.has_active && !self.current_text.is_empty() {
                outputs.push(AccumulatorOutput {
                    id: format!("acc_{}", self.segment_counter),
                    text: self.current_text.clone(),
                    speaker: self.current_speaker.clone(),
                    timestamp_ms: self.current_start_ms,
                    is_final: true,
                    confidence: result.confidence,
                });
            }
            // Start a new segment
            self.segment_counter += 1;
            self.current_text = result.text.clone();
            self.current_speaker = speaker.clone();
            self.current_start_ms = result.timestamp_ms;
            self.last_word_ms = result.timestamp_ms;
            self.has_active = true;

            // Emit the new segment as a final (it may get merged with later results)
            outputs.push(AccumulatorOutput {
                id: format!("acc_{}", self.segment_counter),
                text: self.current_text.clone(),
                speaker,
                timestamp_ms: self.current_start_ms,
                is_final: true,
                confidence: result.confidence,
            });
        } else if self.has_active {
            // Merge into current segment
            if !self.current_text.is_empty() {
                self.current_text.push(' ');
            }
            self.current_text.push_str(&result.text);
            self.last_word_ms = result.timestamp_ms;

            // Emit updated merged segment as final (replaces previous with same ID)
            outputs.push(AccumulatorOutput {
                id: format!("acc_{}", self.segment_counter),
                text: self.current_text.clone(),
                speaker,
                timestamp_ms: self.current_start_ms,
                is_final: true,
                confidence: result.confidence,
            });
        } else {
            // First segment ever
            self.segment_counter += 1;
            self.current_text = result.text.clone();
            self.current_speaker = speaker.clone();
            self.current_start_ms = result.timestamp_ms;
            self.last_word_ms = result.timestamp_ms;
            self.has_active = true;

            outputs.push(AccumulatorOutput {
                id: format!("acc_{}", self.segment_counter),
                text: self.current_text.clone(),
                speaker,
                timestamp_ms: self.current_start_ms,
                is_final: true,
                confidence: result.confidence,
            });
        }

        outputs
    }

    /// Force-finalize the current accumulated segment (e.g., on meeting end).
    pub fn flush(&mut self) -> Option<AccumulatorOutput> {
        if self.has_active && !self.current_text.is_empty() {
            let output = AccumulatorOutput {
                id: format!("acc_{}", self.segment_counter),
                text: self.current_text.clone(),
                speaker: self.current_speaker.clone(),
                timestamp_ms: self.current_start_ms,
                is_final: true,
                confidence: 1.0,
            };
            self.current_text.clear();
            self.has_active = false;
            Some(output)
        } else {
            None
        }
    }

    /// Update the pause threshold at runtime.
    pub fn set_pause_threshold(&mut self, ms: u64) {
        self.pause_threshold_ms = ms;
    }
}
