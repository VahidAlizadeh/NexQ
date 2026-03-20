// Log-mel filterbank feature extractor for streaming ASR models.
//
// Extracts 80-dimensional log-mel features from 16kHz PCM audio,
// matching the training configuration used by sherpa-onnx streaming
// zipformer models.

use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use std::sync::Arc;

const SAMPLE_RATE: f32 = 16000.0;
const FRAME_LENGTH_SAMPLES: usize = 400; // 25ms at 16kHz
const FRAME_SHIFT_SAMPLES: usize = 160; // 10ms at 16kHz
const FFT_SIZE: usize = 512;
const NUM_MELS: usize = 80;
const PRE_EMPHASIS: f32 = 0.97;
const FLOOR: f32 = 1e-10;

fn hz_to_mel(hz: f32) -> f32 {
    2595.0 * (1.0 + hz / 700.0).log10()
}

fn mel_to_hz(mel: f32) -> f32 {
    700.0 * (10.0_f32.powf(mel / 2595.0) - 1.0)
}

/// Build triangular mel filterbank matrix [NUM_MELS x (FFT_SIZE/2 + 1)].
fn build_mel_filterbank() -> Vec<Vec<f32>> {
    let num_fft_bins = FFT_SIZE / 2 + 1; // 257
    let mel_low = hz_to_mel(0.0);
    let mel_high = hz_to_mel(SAMPLE_RATE / 2.0);

    // NUM_MELS + 2 equally spaced mel points
    let mel_points: Vec<f32> = (0..NUM_MELS + 2)
        .map(|i| mel_low + (mel_high - mel_low) * i as f32 / (NUM_MELS + 1) as f32)
        .collect();
    let hz_points: Vec<f32> = mel_points.iter().map(|&m| mel_to_hz(m)).collect();
    let bin_points: Vec<f32> = hz_points
        .iter()
        .map(|&hz| hz * FFT_SIZE as f32 / SAMPLE_RATE)
        .collect();

    let mut filterbank = vec![vec![0.0f32; num_fft_bins]; NUM_MELS];

    for m in 0..NUM_MELS {
        let left = bin_points[m];
        let center = bin_points[m + 1];
        let right = bin_points[m + 2];

        for k in 0..num_fft_bins {
            let kf = k as f32;
            if kf >= left && kf <= center && center > left {
                filterbank[m][k] = (kf - left) / (center - left);
            } else if kf > center && kf <= right && right > center {
                filterbank[m][k] = (right - kf) / (right - center);
            }
        }
    }

    filterbank
}

/// Streaming log-mel filterbank feature extractor.
///
/// Maintains internal state (leftover samples, pre-emphasis continuity)
/// across calls to `process_chunk`, producing frame-aligned 80-dim features.
pub struct FbankExtractor {
    leftover: Vec<f32>,
    prev_sample: f32,
    window: Vec<f32>,
    mel_filterbank: Vec<Vec<f32>>,
    fft: Arc<dyn rustfft::Fft<f32>>,
}

impl FbankExtractor {
    pub fn new() -> Self {
        let window: Vec<f32> = (0..FRAME_LENGTH_SAMPLES)
            .map(|i| {
                0.5 * (1.0
                    - (2.0 * std::f32::consts::PI * i as f32
                        / (FRAME_LENGTH_SAMPLES - 1) as f32)
                        .cos())
            })
            .collect();

        let mel_filterbank = build_mel_filterbank();

        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);

        Self {
            leftover: Vec::new(),
            prev_sample: 0.0,
            window,
            mel_filterbank,
            fft,
        }
    }

    /// Process a chunk of f32 audio samples (normalized to [-1, 1]).
    /// Returns a Vec of 80-dimensional log-mel feature vectors.
    pub fn process_chunk(&mut self, audio: &[f32]) -> Vec<Vec<f32>> {
        if audio.is_empty() {
            return Vec::new();
        }

        // Prepend leftover samples from previous chunk
        let mut samples = Vec::with_capacity(self.leftover.len() + audio.len());
        samples.extend_from_slice(&self.leftover);
        samples.extend_from_slice(audio);

        let mut frames = Vec::new();
        let num_fft_bins = FFT_SIZE / 2 + 1;
        let mut offset = 0;

        while offset + FRAME_LENGTH_SAMPLES <= samples.len() {
            let frame = &samples[offset..offset + FRAME_LENGTH_SAMPLES];

            // Pre-emphasis
            let mut emphasized = Vec::with_capacity(FRAME_LENGTH_SAMPLES);
            for i in 0..FRAME_LENGTH_SAMPLES {
                let prev = if i == 0 && offset == 0 {
                    self.prev_sample
                } else if i == 0 {
                    samples[offset - 1]
                } else {
                    frame[i - 1]
                };
                emphasized.push(frame[i] - PRE_EMPHASIS * prev);
            }

            // Apply Hann window + zero-pad to FFT_SIZE
            let mut windowed: Vec<Complex<f32>> = Vec::with_capacity(FFT_SIZE);
            for i in 0..FRAME_LENGTH_SAMPLES {
                windowed.push(Complex::new(emphasized[i] * self.window[i], 0.0));
            }
            windowed.resize(FFT_SIZE, Complex::new(0.0, 0.0));

            // FFT
            self.fft.process(&mut windowed);

            // Power spectrum (first num_fft_bins bins)
            let power: Vec<f32> = windowed[..num_fft_bins]
                .iter()
                .map(|c| c.norm_sqr())
                .collect();

            // Apply mel filterbank + log
            let mut mel_energies = vec![0.0f32; NUM_MELS];
            for m in 0..NUM_MELS {
                let mut energy = 0.0f32;
                for k in 0..num_fft_bins {
                    energy += self.mel_filterbank[m][k] * power[k];
                }
                mel_energies[m] = energy.max(FLOOR).ln();
            }

            frames.push(mel_energies);
            offset += FRAME_SHIFT_SAMPLES;
        }

        // Save leftover samples for next chunk
        self.leftover = samples[offset..].to_vec();

        // Update prev_sample for pre-emphasis continuity
        if !audio.is_empty() {
            self.prev_sample = *audio.last().unwrap();
        }

        frames
    }

    /// Reset the extractor state (between utterances/segments).
    pub fn reset(&mut self) {
        self.leftover.clear();
        self.prev_sample = 0.0;
    }
}
