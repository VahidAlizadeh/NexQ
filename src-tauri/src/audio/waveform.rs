use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaveformData {
    pub sample_rate: u32,   // peaks per minute
    pub duration_ms: u64,
    pub peaks: Vec<[f32; 2]>, // [min, max] normalized to -1.0..1.0
}

/// Extract waveform peaks from a WAV file.
/// Resolution: ~200 peaks per minute (~3.3 peaks/second).
pub fn extract_peaks(wav_path: &Path) -> Result<WaveformData, String> {
    let reader = hound::WavReader::open(wav_path)
        .map_err(|e| format!("Failed to open WAV: {}", e))?;

    let spec = reader.spec();
    let sample_rate = spec.sample_rate;
    let total_samples: Vec<i16> = reader
        .into_samples::<i16>()
        .filter_map(|s| s.ok())
        .collect();

    if total_samples.is_empty() {
        return Ok(WaveformData {
            sample_rate: 200,
            duration_ms: 0,
            peaks: vec![],
        });
    }

    let duration_ms = (total_samples.len() as u64 * 1000) / sample_rate as u64;

    // ~3.33 peaks per second = 200 per minute
    let peaks_per_second = 200.0 / 60.0;
    let samples_per_peak = (sample_rate as f64 / peaks_per_second) as usize;
    let samples_per_peak = samples_per_peak.max(1);

    let mut peaks = Vec::new();
    for chunk in total_samples.chunks(samples_per_peak) {
        let mut min_val: f32 = 0.0;
        let mut max_val: f32 = 0.0;
        for &sample in chunk {
            let normalized = sample as f32 / i16::MAX as f32;
            if normalized < min_val {
                min_val = normalized;
            }
            if normalized > max_val {
                max_val = normalized;
            }
        }
        peaks.push([min_val, max_val]);
    }

    Ok(WaveformData {
        sample_rate: 200,
        duration_ms,
        peaks,
    })
}

/// Write waveform data to a JSON file.
pub fn write_waveform_json(data: &WaveformData, output_path: &Path) -> Result<(), String> {
    let json = serde_json::to_string(data)
        .map_err(|e| format!("Failed to serialize waveform: {}", e))?;
    std::fs::write(output_path, json)
        .map_err(|e| format!("Failed to write waveform file: {}", e))?;
    Ok(())
}
