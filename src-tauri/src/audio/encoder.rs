// Sub-PRD 3: Opus encoding module
// Encodes a 16kHz mono 16-bit PCM WAV file to OGG/Opus format.
// Output is suitable for playback in WebView2 (Chromium-based) via HTML5 <audio>.

use hound::WavReader;
use ogg::writing::{PacketWriteEndInfo, PacketWriter};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

// libopus_sys FFI bindings
use libopus_sys::{
    opus_encode, opus_encoder_create, opus_encoder_ctl, opus_encoder_destroy,
    OPUS_APPLICATION_VOIP, OPUS_OK, OPUS_SET_BITRATE_REQUEST,
};

/// Audio parameters — must match recorder.rs
const SAMPLE_RATE: u32 = 16_000;
const CHANNELS: u16 = 1;
/// 60 ms frame at 16 kHz = 960 samples
const FRAME_SAMPLES: usize = 960;
/// Target bitrate in bps (32 kbps)
const TARGET_BITRATE_BPS: i32 = 32_000;
/// Max size of a single encoded Opus packet (generous upper-bound)
const MAX_PACKET_BYTES: usize = 4000;

/// Encode a 16kHz mono 16-bit PCM WAV file to an OGG/Opus file.
///
/// Reads `wav_path`, encodes every 60 ms frame with Opus VOIP mode at 32 kbps,
/// writes a standards-compliant OGG container with proper OpusHead / OpusTags
/// header packets, and returns the size (bytes) of the output file.
pub fn encode_wav_to_opus(wav_path: &Path, opus_path: &Path) -> Result<u64, String> {
    // ── 1. Open + validate WAV ────────────────────────────────────────────────
    let mut reader =
        WavReader::open(wav_path).map_err(|e| format!("Failed to open WAV: {}", e))?;

    let spec = reader.spec();
    if spec.channels != CHANNELS {
        return Err(format!(
            "Expected mono WAV (1 channel), got {} channels",
            spec.channels
        ));
    }
    if spec.sample_rate != SAMPLE_RATE {
        return Err(format!(
            "Expected 16000 Hz WAV, got {} Hz",
            spec.sample_rate
        ));
    }

    // Collect all samples upfront for simpler frame iteration
    let samples: Vec<i16> = reader
        .samples::<i16>()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read WAV samples: {}", e))?;

    // ── 2. Create Opus encoder ────────────────────────────────────────────────
    let mut error: i32 = 0;
    let encoder = unsafe {
        opus_encoder_create(
            SAMPLE_RATE as i32,
            CHANNELS as i32,
            OPUS_APPLICATION_VOIP as i32,
            &mut error,
        )
    };

    if encoder.is_null() || error != OPUS_OK as i32 {
        return Err(format!("Failed to create Opus encoder (error {})", error));
    }

    // Guard that drops/destroys the encoder on exit
    struct EncoderGuard(*mut libopus_sys::OpusEncoder);
    impl Drop for EncoderGuard {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { opus_encoder_destroy(self.0) };
            }
        }
    }
    let _guard = EncoderGuard(encoder);

    // Set bitrate to 32 kbps
    let rc = unsafe { opus_encoder_ctl(encoder, OPUS_SET_BITRATE_REQUEST as i32, TARGET_BITRATE_BPS) };
    if rc != OPUS_OK as i32 {
        return Err(format!("Failed to set Opus bitrate (error {})", rc));
    }

    // ── 3. Open output file + OGG writer ─────────────────────────────────────
    let out_file =
        File::create(opus_path).map_err(|e| format!("Failed to create output file: {}", e))?;
    let buf_writer = BufWriter::new(out_file);
    let mut pkt_writer = PacketWriter::new(buf_writer);

    // Arbitrary serial number — any non-zero value is fine for a single-stream file
    let serial: u32 = 0x4e455851; // "NEXQ" in little-endian ASCII

    // ── 4. Write OpusHead header packet (RFC 7845 §5.1) ──────────────────────
    // Spec: magic + version + channel count + pre-skip + sample rate + gain + channel map
    let pre_skip: u16 = 312; // standard 6.5 ms pre-skip for 48 kHz internal rate
    let opus_head = build_opus_head(CHANNELS as u8, pre_skip, SAMPLE_RATE);
    pkt_writer
        .write_packet(
            opus_head,
            serial,
            PacketWriteEndInfo::EndPage, // header packet must end its page
            0,
        )
        .map_err(|e| format!("Failed to write OpusHead: {}", e))?;

    // ── 5. Write OpusTags header packet (RFC 7845 §5.2) ──────────────────────
    let opus_tags = build_opus_tags("NexQ Encoder");
    pkt_writer
        .write_packet(
            opus_tags,
            serial,
            PacketWriteEndInfo::EndPage, // comment header must also end its page
            0,
        )
        .map_err(|e| format!("Failed to write OpusTags: {}", e))?;

    // ── 6. Encode frames ──────────────────────────────────────────────────────
    let mut output_buf = vec![0u8; MAX_PACKET_BYTES];
    let total_samples = samples.len();
    let total_frames = (total_samples + FRAME_SAMPLES - 1) / FRAME_SAMPLES;

    // Absolute granule position tracks the number of samples encoded so far
    // (in the codec's internal 48 kHz rate — multiply by 3 since 16k * 3 = 48k)
    let mut granule_pos: u64 = 0;

    for frame_idx in 0..total_frames {
        let start = frame_idx * FRAME_SAMPLES;
        let end = (start + FRAME_SAMPLES).min(total_samples);
        let is_last = frame_idx + 1 == total_frames;

        // Build frame buffer — pad with zeros if last frame is short
        let mut frame_buf = [0i16; FRAME_SAMPLES];
        let chunk = &samples[start..end];
        frame_buf[..chunk.len()].copy_from_slice(chunk);

        // Encode
        let encoded_len = unsafe {
            opus_encode(
                encoder,
                frame_buf.as_ptr(),
                FRAME_SAMPLES as i32,
                output_buf.as_mut_ptr(),
                MAX_PACKET_BYTES as i32,
            )
        };

        if encoded_len < 0 {
            return Err(format!(
                "Opus encode error on frame {}: {}",
                frame_idx, encoded_len
            ));
        }

        let packet_data = output_buf[..encoded_len as usize].to_vec();

        // Advance granule position (convert 16k samples to 48k granules)
        granule_pos += (FRAME_SAMPLES as u64) * 3;

        let end_info = if is_last {
            PacketWriteEndInfo::EndStream
        } else {
            PacketWriteEndInfo::NormalPacket
        };

        pkt_writer
            .write_packet(packet_data, serial, end_info, granule_pos)
            .map_err(|e| format!("Failed to write OGG packet {}: {}", frame_idx, e))?;
    }

    // Flush (PacketWriter writes are flushed by drop, but flush the BufWriter explicitly)
    pkt_writer
        .into_inner()
        .flush()
        .map_err(|e| format!("Failed to flush output: {}", e))?;

    // ── 7. Return output file size ────────────────────────────────────────────
    let metadata = std::fs::metadata(opus_path)
        .map_err(|e| format!("Failed to stat output file: {}", e))?;

    log::info!(
        "Encoded {} samples ({:.1}s) → {} bytes OGG/Opus: {}",
        total_samples,
        total_samples as f64 / SAMPLE_RATE as f64,
        metadata.len(),
        opus_path.display()
    );

    Ok(metadata.len())
}

// ── OGG/Opus header builders ──────────────────────────────────────────────────

/// Build the OpusHead binary packet (RFC 7845 §5.1).
///
/// Layout (19 bytes for mono, channel-mapping family 0):
///   8  bytes – magic "OpusHead"
///   1  byte  – version (1)
///   1  byte  – channel count
///   2  bytes – pre-skip (LE u16)
///   4  bytes – input sample rate (LE u32, informational)
///   2  bytes – output gain (LE i16, 0 = no gain)
///   1  byte  – channel mapping family (0 = RTP, ≤2 channels)
fn build_opus_head(channels: u8, pre_skip: u16, sample_rate: u32) -> Vec<u8> {
    let mut buf = Vec::with_capacity(19);
    buf.extend_from_slice(b"OpusHead");
    buf.push(1); // version
    buf.push(channels);
    buf.extend_from_slice(&pre_skip.to_le_bytes());
    buf.extend_from_slice(&sample_rate.to_le_bytes());
    buf.extend_from_slice(&0i16.to_le_bytes()); // output gain = 0
    buf.push(0); // channel mapping family 0
    buf
}

/// Build the OpusTags binary packet (RFC 7845 §5.2).
///
/// Minimal implementation: vendor string only, zero user comments.
fn build_opus_tags(vendor: &str) -> Vec<u8> {
    let vendor_bytes = vendor.as_bytes();
    let len = 8 + 4 + vendor_bytes.len() + 4; // magic + vendor_len + vendor + comment_list_len
    let mut buf = Vec::with_capacity(len);
    buf.extend_from_slice(b"OpusTags");
    buf.extend_from_slice(&(vendor_bytes.len() as u32).to_le_bytes());
    buf.extend_from_slice(vendor_bytes);
    buf.extend_from_slice(&0u32.to_le_bytes()); // zero user comments
    buf
}
