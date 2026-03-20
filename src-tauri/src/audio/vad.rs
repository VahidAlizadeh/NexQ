// Sub-PRD 3: Voice Activity Detection
// Energy-threshold VAD, 1.5s silence detection, speech segment finalization

use std::time::Instant;

/// Speech state machine
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SpeechState {
    /// No speech detected
    Silence,
    /// Active speech detected
    Speech,
    /// Speech may have ended, waiting for silence timeout
    SpeechEnding,
}

/// Result of processing an audio chunk through VAD
#[derive(Debug, Clone)]
pub struct VadResult {
    /// Whether the current chunk contains speech
    pub is_speech: bool,
    /// Whether a speech segment has just ended (silence timeout exceeded)
    pub speech_ended: bool,
    /// Current RMS energy level (0.0 - 1.0 normalized)
    pub energy: f32,
}

/// Energy-threshold based Voice Activity Detector
pub struct VoiceActivityDetector {
    /// RMS energy threshold for speech detection (for 16-bit audio)
    speech_threshold: f32,
    /// Duration of silence required to finalize a speech segment (in seconds)
    silence_timeout_secs: f32,
    /// Current state
    state: SpeechState,
    /// When silence started (for timeout tracking)
    silence_start: Option<Instant>,
    /// Smoothed energy level for hysteresis
    smoothed_energy: f32,
    /// Smoothing factor (0-1, higher = more smoothing)
    smoothing_alpha: f32,
}

impl VoiceActivityDetector {
    /// Create a new VAD with default settings.
    /// Default speech threshold: 300 (for 16-bit PCM)
    /// Default silence timeout: 1.5 seconds
    pub fn new() -> Self {
        Self {
            speech_threshold: 300.0,
            silence_timeout_secs: 1.5,
            state: SpeechState::Silence,
            silence_start: None,
            smoothed_energy: 0.0,
            smoothing_alpha: 0.3,
        }
    }

    /// Create a new VAD with custom thresholds.
    pub fn with_config(speech_threshold: f32, silence_timeout_secs: f32) -> Self {
        Self {
            speech_threshold,
            silence_timeout_secs,
            state: SpeechState::Silence,
            silence_start: None,
            smoothed_energy: 0.0,
            smoothing_alpha: 0.3,
        }
    }

    /// Process a chunk of 16-bit PCM audio data and return VAD result.
    pub fn process_chunk(&mut self, pcm_data: &[i16]) -> VadResult {
        let raw_energy = calculate_rms(pcm_data);

        // Apply exponential moving average for smoother transitions
        self.smoothed_energy =
            self.smoothing_alpha * raw_energy + (1.0 - self.smoothing_alpha) * self.smoothed_energy;

        let is_above_threshold = self.smoothed_energy > self.speech_threshold;
        let mut speech_ended = false;

        match self.state {
            SpeechState::Silence => {
                if is_above_threshold {
                    self.state = SpeechState::Speech;
                    self.silence_start = None;
                    log::debug!("VAD: Speech started (energy: {:.1})", self.smoothed_energy);
                }
            }
            SpeechState::Speech => {
                if !is_above_threshold {
                    self.state = SpeechState::SpeechEnding;
                    self.silence_start = Some(Instant::now());
                }
            }
            SpeechState::SpeechEnding => {
                if is_above_threshold {
                    // Speech resumed before timeout
                    self.state = SpeechState::Speech;
                    self.silence_start = None;
                } else if let Some(silence_start) = self.silence_start {
                    let elapsed = silence_start.elapsed().as_secs_f32();
                    if elapsed >= self.silence_timeout_secs {
                        // Silence timeout exceeded — speech segment ended
                        self.state = SpeechState::Silence;
                        self.silence_start = None;
                        speech_ended = true;
                        log::debug!(
                            "VAD: Speech ended after {:.1}s silence",
                            self.silence_timeout_secs
                        );
                    }
                }
            }
        }

        let is_speech = self.state == SpeechState::Speech || self.state == SpeechState::SpeechEnding;

        // Normalize energy to 0.0-1.0 range (i16 max RMS ~= 23170)
        let normalized_energy = (self.smoothed_energy / 23170.0).clamp(0.0, 1.0);

        VadResult {
            is_speech,
            speech_ended,
            energy: normalized_energy,
        }
    }

    /// Get the current speech state.
    pub fn state(&self) -> SpeechState {
        self.state
    }

    /// Reset the VAD state to silence.
    pub fn reset(&mut self) {
        self.state = SpeechState::Silence;
        self.silence_start = None;
        self.smoothed_energy = 0.0;
    }

    /// Update the speech threshold at runtime.
    pub fn set_threshold(&mut self, threshold: f32) {
        self.speech_threshold = threshold;
    }
}

/// Calculate RMS (Root Mean Square) energy of 16-bit PCM samples.
pub fn calculate_rms(samples: &[i16]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }

    let sum_sq: f64 = samples
        .iter()
        .map(|&s| (s as f64) * (s as f64))
        .sum();

    (sum_sq / samples.len() as f64).sqrt() as f32
}

/// Calculate peak amplitude of 16-bit PCM samples, normalized to 0.0 - 1.0.
pub fn calculate_peak(samples: &[i16]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }

    let max_abs = samples.iter().map(|s| s.unsigned_abs() as u32).max().unwrap_or(0);
    max_abs as f32 / i16::MAX as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rms_silence() {
        let silence = vec![0i16; 1600];
        let rms = calculate_rms(&silence);
        assert!(rms < 1.0);
    }

    #[test]
    fn test_rms_signal() {
        // Generate a simple signal
        let signal: Vec<i16> = (0..1600).map(|i| ((i % 100) * 100) as i16).collect();
        let rms = calculate_rms(&signal);
        assert!(rms > 0.0);
    }

    #[test]
    fn test_peak_silence() {
        let silence = vec![0i16; 100];
        assert_eq!(calculate_peak(&silence), 0.0);
    }

    #[test]
    fn test_peak_max() {
        let signal = vec![i16::MAX];
        let peak = calculate_peak(&signal);
        assert!((peak - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_vad_silence_to_speech() {
        let mut vad = VoiceActivityDetector::new();

        // Send silence
        let silence = vec![0i16; 1600];
        let result = vad.process_chunk(&silence);
        assert!(!result.is_speech);

        // Send loud signal
        let loud: Vec<i16> = vec![5000; 1600];
        let result = vad.process_chunk(&loud);
        assert!(result.is_speech);
    }

    #[test]
    fn test_vad_empty_input() {
        let mut vad = VoiceActivityDetector::new();
        let result = vad.process_chunk(&[]);
        assert!(!result.is_speech);
        assert!(!result.speech_ended);
    }
}
