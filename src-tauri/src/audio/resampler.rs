// Sub-PRD 3: Sample rate conversion -> 16kHz mono PCM

/// Resample audio from one sample rate to another using linear interpolation.
/// Converts multi-channel audio to mono first, then resamples.
///
/// Supports common rates: 44100, 48000, 96000 -> 16000
pub fn resample(input: &[i16], from_rate: u32, to_rate: u32, channels: u16) -> Vec<i16> {
    if input.is_empty() {
        return Vec::new();
    }

    // Step 1: Convert to mono if multi-channel
    let mono = if channels > 1 {
        to_mono(input, channels)
    } else {
        input.to_vec()
    };

    // Step 2: If rates match, no resampling needed
    if from_rate == to_rate {
        return mono;
    }

    // Step 3: Linear interpolation resampling
    let ratio = from_rate as f64 / to_rate as f64;
    let output_len = ((mono.len() as f64) / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let src_pos = i as f64 * ratio;
        let src_idx = src_pos as usize;
        let frac = src_pos - src_idx as f64;

        if src_idx + 1 < mono.len() {
            // Linear interpolation between two samples
            let sample = mono[src_idx] as f64 * (1.0 - frac) + mono[src_idx + 1] as f64 * frac;
            output.push(sample.round().clamp(i16::MIN as f64, i16::MAX as f64) as i16);
        } else if src_idx < mono.len() {
            output.push(mono[src_idx]);
        }
    }

    output
}

/// Convert interleaved multi-channel audio to mono by averaging channels.
fn to_mono(input: &[i16], channels: u16) -> Vec<i16> {
    let ch = channels as usize;
    let frame_count = input.len() / ch;
    let mut mono = Vec::with_capacity(frame_count);

    for frame in 0..frame_count {
        let mut sum: i32 = 0;
        for c in 0..ch {
            sum += input[frame * ch + c] as i32;
        }
        mono.push((sum / ch as i32) as i16);
    }

    mono
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity_resample() {
        let input = vec![100, 200, 300, 400, 500];
        let output = resample(&input, 16000, 16000, 1);
        assert_eq!(input, output);
    }

    #[test]
    fn test_downsample_48k_to_16k() {
        // 48kHz -> 16kHz is a 3:1 ratio
        let input: Vec<i16> = (0..480).map(|i| (i * 10) as i16).collect();
        let output = resample(&input, 48000, 16000, 1);
        // Output should be roughly 1/3 the size
        assert!((output.len() as f64 - 160.0).abs() < 2.0);
    }

    #[test]
    fn test_stereo_to_mono() {
        // Stereo: L=100, R=200, L=300, R=400
        let input = vec![100i16, 200, 300, 400];
        let mono = to_mono(&input, 2);
        assert_eq!(mono, vec![150, 350]);
    }

    #[test]
    fn test_empty_input() {
        let output = resample(&[], 48000, 16000, 1);
        assert!(output.is_empty());
    }
}
