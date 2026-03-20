// Sub-PRD 6: Sliding window ring buffer (default 120s, configurable)

use std::collections::VecDeque;

/// A single transcript segment stored in the buffer.
#[derive(Debug, Clone)]
pub struct BufferSegment {
    pub text: String,
    pub speaker: String,
    pub timestamp_ms: u64,
    pub is_final: bool,
}

/// Thread-safe sliding window ring buffer for recent transcript segments.
/// Keeps segments within a configurable time window (default 120s).
pub struct TranscriptBuffer {
    segments: VecDeque<BufferSegment>,
    window_seconds: u64,
    max_segments: usize,
}

impl TranscriptBuffer {
    pub fn new() -> Self {
        Self {
            segments: VecDeque::new(),
            window_seconds: 120,
            max_segments: 500,
        }
    }

    /// Push a new transcript segment into the buffer.
    /// Automatically prunes segments older than the configured window.
    pub fn push_segment(
        &mut self,
        text: String,
        speaker: String,
        timestamp_ms: u64,
        is_final: bool,
    ) {
        let segment = BufferSegment {
            text,
            speaker,
            timestamp_ms,
            is_final,
        };

        self.segments.push_back(segment);

        // Enforce max capacity
        while self.segments.len() > self.max_segments {
            self.segments.pop_front();
        }

        // Prune old segments based on the time window
        self.prune(timestamp_ms);
    }

    /// Get recent transcript text within the specified number of seconds
    /// from the most recent segment.
    pub fn get_recent_text(&self, window_seconds: u64) -> String {
        if self.segments.is_empty() {
            return String::new();
        }

        let latest_ts = self
            .segments
            .back()
            .map(|s| s.timestamp_ms)
            .unwrap_or(0);
        let cutoff_ms = latest_ts.saturating_sub(window_seconds * 1000);

        let mut parts: Vec<String> = Vec::new();
        for seg in &self.segments {
            if seg.timestamp_ms >= cutoff_ms && seg.is_final {
                let speaker_label = match seg.speaker.as_str() {
                    "User" => "You",
                    "Interviewer" => "Interviewer",
                    _ => "Unknown",
                };
                parts.push(format!("[{}]: {}", speaker_label, seg.text));
            }
        }

        parts.join("\n")
    }

    /// Get all text in the buffer (only final segments).
    pub fn get_all_text(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        for seg in &self.segments {
            if seg.is_final {
                let speaker_label = match seg.speaker.as_str() {
                    "User" => "You",
                    "Interviewer" => "Interviewer",
                    _ => "Unknown",
                };
                parts.push(format!("[{}]: {}", speaker_label, seg.text));
            }
        }
        parts.join("\n")
    }

    /// Clear all segments from the buffer.
    pub fn clear(&mut self) {
        self.segments.clear();
    }

    /// Set the window size in seconds.
    pub fn set_window_seconds(&mut self, seconds: u64) {
        self.window_seconds = seconds;
    }

    /// Get the current window size in seconds.
    pub fn window_seconds(&self) -> u64 {
        self.window_seconds
    }

    /// Get the number of segments currently in the buffer.
    pub fn len(&self) -> usize {
        self.segments.len()
    }

    /// Check if the buffer is empty.
    pub fn is_empty(&self) -> bool {
        self.segments.is_empty()
    }

    /// Prune segments older than the time window relative to the given timestamp.
    fn prune(&mut self, current_ms: u64) {
        let cutoff_ms = current_ms.saturating_sub(self.window_seconds * 1000);
        while let Some(front) = self.segments.front() {
            if front.timestamp_ms < cutoff_ms {
                self.segments.pop_front();
            } else {
                break;
            }
        }
    }
}
