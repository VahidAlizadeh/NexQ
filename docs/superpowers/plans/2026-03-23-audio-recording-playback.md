# Audio Recording & Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add meeting audio recording with post-meeting Opus compression, waveform-visualized player, bidirectional transcript sync, and keyboard shortcuts.

**Architecture:** Rust backend handles WAV recording → Opus encoding → waveform peak extraction as a post-meeting pipeline. Frontend uses HTML5 `<audio>` with `convertFileSrc()` for playback, a canvas-rendered waveform, and a Zustand store for player state. A single `seekToTimestamp()` function wires all existing navigation into audio seek.

**Tech Stack:** Rust (opus/ogg crates, hound), React 18, Zustand, HTML5 Canvas, HTML5 Audio, Tauri 2 IPC + asset protocol

**Spec:** `docs/superpowers/specs/2026-03-23-audio-recording-playback-design.md`

---

## Task 1: TypeScript Types + DB Migration

**Files:**
- Modify: `src/lib/types.ts:56-73` (Meeting interface)
- Modify: `src-tauri/src/db/migrations.rs` (add v5)
- Modify: `src-tauri/src/db/meetings.rs:10-32` (Meeting struct), `98-106` (MeetingUpdate), `248-311` (update_meeting)

- [ ] **Step 1: Add RecordingInfo type and extend Meeting in types.ts**

In `src/lib/types.ts`, add after the existing interfaces (around line 135):

```typescript
export interface RecordingInfo {
  path: string;
  size_bytes: number;
  duration_ms: number;
  waveform_path: string;
  offset_ms: number;
}
```

And extend the `Meeting` interface (around line 73) by adding:

```typescript
recording_info?: RecordingInfo | null;
```

- [ ] **Step 2: Add WaveformData type in types.ts**

```typescript
export interface WaveformData {
  sample_rate: number;
  duration_ms: number;
  peaks: [number, number][];
}
```

- [ ] **Step 3: Add v5 migration in Rust**

In `src-tauri/src/db/migrations.rs`, add a new migration function following the v4 pattern:

```rust
pub fn v5_recording_columns(conn: &Connection) -> Result<(), rusqlite::Error> {
    let columns = [
        "ALTER TABLE meetings ADD COLUMN recording_path TEXT",
        "ALTER TABLE meetings ADD COLUMN recording_size INTEGER",
        "ALTER TABLE meetings ADD COLUMN waveform_path TEXT",
        "ALTER TABLE meetings ADD COLUMN recording_offset_ms INTEGER",
    ];
    for sql in &columns {
        match conn.execute(sql, []) {
            Ok(_) => {}
            Err(e) => {
                let msg = e.to_string();
                if !msg.contains("duplicate column name") {
                    return Err(e);
                }
            }
        }
    }
    Ok(())
}
```

Call this from the `run_migrations` function (or wherever v1-v4 are called).

- [ ] **Step 4: Update Rust Meeting struct in meetings.rs**

Add to the `Meeting` struct (after existing fields around line 32):

```rust
pub recording_path: Option<String>,
pub recording_size: Option<i64>,
pub waveform_path: Option<String>,
pub recording_offset_ms: Option<i64>,
```

Update `MeetingUpdate` struct similarly with Optional fields.

Update the `get_meeting` function's SELECT query and row mapping to include the new columns.

Update the `update_meeting` function's dynamic SET clause builder to handle the new fields.

- [ ] **Step 5: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src-tauri/src/db/migrations.rs src-tauri/src/db/meetings.rs
git commit -m "feat(recording): add RecordingInfo types + v5 DB migration for recording columns"
```

---

## Task 2: Waveform Peak Extraction Module

**Files:**
- Create: `src-tauri/src/audio/waveform.rs`
- Modify: `src-tauri/src/audio/mod.rs` (add module declaration)

- [ ] **Step 1: Create waveform.rs with peak extraction function**

Create `src-tauri/src/audio/waveform.rs`:

```rust
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
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
```

- [ ] **Step 2: Add module declaration in audio/mod.rs**

In `src-tauri/src/audio/mod.rs`, add near the other module declarations:

```rust
pub mod waveform;
```

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/audio/waveform.rs src-tauri/src/audio/mod.rs
git commit -m "feat(recording): add waveform peak extraction module"
```

---

## Task 3: Opus Encoding Module

**Files:**
- Create: `src-tauri/src/audio/encoder.rs`
- Modify: `src-tauri/src/audio/mod.rs` (add module)
- Modify: `src-tauri/Cargo.toml` (add opus + ogg crates)

- [ ] **Step 1: Add opus and ogg dependencies to Cargo.toml**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
ogg = "0.9"
audiopus = { version = "0.3", features = ["static"] }
```

The `static` feature on `audiopus` vendors libopus so no system dependency is needed on Windows.

- [ ] **Step 2: Create encoder.rs with WAV → Opus/OGG encoding**

Create `src-tauri/src/audio/encoder.rs`:

```rust
use audiopus::{coder::Encoder as OpusEncoder, Application, Channels, SampleRate};
use ogg::writing::PacketWriteEndInfo;
use std::path::Path;

const OPUS_SAMPLE_RATE: u32 = 16000;
const OPUS_BITRATE: i32 = 32000; // 32kbps for mono voice
const FRAME_SIZE: usize = 960; // 60ms at 16kHz

/// Encode a WAV file to Opus in an OGG container.
/// Returns the output file size in bytes.
pub fn encode_wav_to_opus(wav_path: &Path, opus_path: &Path) -> Result<u64, String> {
    // Read WAV
    let reader = hound::WavReader::open(wav_path)
        .map_err(|e| format!("Failed to open WAV: {}", e))?;

    let spec = reader.spec();
    if spec.sample_rate != OPUS_SAMPLE_RATE {
        return Err(format!(
            "WAV sample rate {} != expected {}",
            spec.sample_rate, OPUS_SAMPLE_RATE
        ));
    }

    let samples: Vec<i16> = reader
        .into_samples::<i16>()
        .filter_map(|s| s.ok())
        .collect();

    // Initialize Opus encoder
    let mut encoder = OpusEncoder::new(
        SampleRate::Hz16000,
        Channels::Mono,
        Application::Voip,
    )
    .map_err(|e| format!("Failed to create Opus encoder: {:?}", e))?;

    encoder
        .set_bitrate(audiopus::Bitrate::BitsPerSecond(OPUS_BITRATE))
        .map_err(|e| format!("Failed to set bitrate: {:?}", e))?;

    // Initialize OGG writer
    let output_file = std::fs::File::create(opus_path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;
    let mut ogg_writer = ogg::PacketWriter::new(output_file);

    // Write Opus header packets (OpusHead + OpusTags)
    let opus_head = build_opus_head();
    ogg_writer
        .write_packet(opus_head, 0, PacketWriteEndInfo::EndPage, 0)
        .map_err(|e| format!("Failed to write OpusHead: {}", e))?;

    let opus_tags = build_opus_tags();
    ogg_writer
        .write_packet(opus_tags, 0, PacketWriteEndInfo::EndPage, 0)
        .map_err(|e| format!("Failed to write OpusTags: {}", e))?;

    // Encode frames
    let mut output_buf = vec![0u8; 4000]; // max Opus packet size
    let mut granule_pos: u64 = 0;

    let total_frames = (samples.len() + FRAME_SIZE - 1) / FRAME_SIZE;
    for (i, chunk) in samples.chunks(FRAME_SIZE).enumerate() {
        // Pad last frame if needed
        let frame: Vec<i16> = if chunk.len() < FRAME_SIZE {
            let mut padded = chunk.to_vec();
            padded.resize(FRAME_SIZE, 0);
            padded
        } else {
            chunk.to_vec()
        };

        let encoded_len = encoder
            .encode(&frame, &mut output_buf)
            .map_err(|e| format!("Opus encode error: {:?}", e))?;

        granule_pos += FRAME_SIZE as u64;

        let end_info = if i == total_frames - 1 {
            PacketWriteEndInfo::EndStream
        } else {
            PacketWriteEndInfo::NormalPacket
        };

        ogg_writer
            .write_packet(
                output_buf[..encoded_len].to_vec(),
                0,
                end_info,
                granule_pos,
            )
            .map_err(|e| format!("Failed to write OGG packet: {}", e))?;
    }

    // Get file size
    let file_size = std::fs::metadata(opus_path)
        .map_err(|e| format!("Failed to get file size: {}", e))?
        .len();

    Ok(file_size)
}

fn build_opus_head() -> Vec<u8> {
    let mut head = Vec::with_capacity(19);
    head.extend_from_slice(b"OpusHead");
    head.push(1); // version
    head.push(1); // channel count
    head.extend_from_slice(&0u16.to_le_bytes()); // pre-skip
    head.extend_from_slice(&OPUS_SAMPLE_RATE.to_le_bytes()); // input sample rate
    head.extend_from_slice(&0i16.to_le_bytes()); // output gain
    head.push(0); // channel mapping family
    head
}

fn build_opus_tags() -> Vec<u8> {
    let mut tags = Vec::new();
    tags.extend_from_slice(b"OpusTags");
    let vendor = b"NexQ";
    tags.extend_from_slice(&(vendor.len() as u32).to_le_bytes());
    tags.extend_from_slice(vendor);
    tags.extend_from_slice(&0u32.to_le_bytes()); // no user comments
    tags
}
```

- [ ] **Step 3: Add module declaration in audio/mod.rs**

```rust
pub mod encoder;
```

- [ ] **Step 4: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles. If `audiopus` has issues on Windows, fall back to `opus` crate with vendored feature, or use `libopus-sys` with `static` feature. Adjust imports accordingly.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/audio/encoder.rs src-tauri/src/audio/mod.rs
git commit -m "feat(recording): add Opus encoding module (WAV to OGG/Opus)"
```

---

## Task 4: Recording Offset Capture + Post-Meeting Pipeline

**Files:**
- Modify: `src-tauri/src/audio/recorder.rs:21-28` (RecorderHandle — add offset tracking)
- Modify: `src-tauri/src/audio/mod.rs:407-435` (start/stop recording — capture offset)
- Modify: `src-tauri/src/commands/meeting_commands.rs:69-109` (end_meeting — trigger pipeline)
- Modify: `src-tauri/src/db/meetings.rs` (update recording fields)

- [ ] **Step 1: Add recording_start_time to RecorderHandle**

In `src-tauri/src/audio/recorder.rs`, extend `RecorderHandle` struct (around line 21):

```rust
pub struct RecorderHandle {
    sample_tx: Option<std_mpsc::Sender<RecorderMessage>>,
    writer_thread: Option<std::thread::JoinHandle<Option<PathBuf>>>,
    output_path: PathBuf,
    pub start_time_ms: u64, // epoch ms when recording started
}
```

Set `start_time_ms` in `start_recording()` using:
```rust
start_time_ms: std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap()
    .as_millis() as u64,
```

- [ ] **Step 2: Add post-meeting processing function**

In `src-tauri/src/audio/mod.rs` or a new helper, add a function that runs the full pipeline:

```rust
use crate::audio::{waveform, encoder};

/// Post-meeting audio processing: extract peaks, encode to Opus, update DB.
/// Runs async (spawned as tokio task).
pub async fn process_recording(
    wav_path: PathBuf,
    meeting_id: String,
    recording_offset_ms: i64,
    db: Arc<Mutex<DatabaseManager>>,
    app_handle: AppHandle,
) {
    let recordings_dir = wav_path.parent().unwrap().to_path_buf();
    let waveform_path = recordings_dir.join(format!("{}.waveform.json", meeting_id));
    let opus_path = recordings_dir.join(format!("{}.ogg", meeting_id));

    // Step 1: Extract waveform peaks
    let waveform_result = tokio::task::spawn_blocking({
        let wav = wav_path.clone();
        let wf = waveform_path.clone();
        move || {
            let data = waveform::extract_peaks(&wav)?;
            waveform::write_waveform_json(&data, &wf)?;
            Ok::<_, String>(())
        }
    }).await;

    if let Err(e) = waveform_result.unwrap_or(Err("Task panicked".into())) {
        log::error!("Waveform extraction failed: {}", e);
        let _ = app_handle.emit("recording_error", e);
        return;
    }

    // Step 2: Encode to Opus
    let encode_result = tokio::task::spawn_blocking({
        let wav = wav_path.clone();
        let opus = opus_path.clone();
        move || encoder::encode_wav_to_opus(&wav, &opus)
    }).await;

    let (final_path, file_size) = match encode_result.unwrap_or(Err("Task panicked".into())) {
        Ok(size) => {
            // Opus succeeded — delete WAV
            let _ = std::fs::remove_file(&wav_path);
            (opus_path.to_string_lossy().to_string(), size as i64)
        }
        Err(e) => {
            log::warn!("Opus encoding failed, keeping WAV: {}", e);
            let size = std::fs::metadata(&wav_path)
                .map(|m| m.len() as i64)
                .unwrap_or(0);
            (wav_path.to_string_lossy().to_string(), size)
        }
    };

    // Step 3: Update DB
    if let Some(db_lock) = &*db.lock().unwrap() {
        // Use update_meeting with the new recording fields
        let _ = db_lock.update_meeting_recording(
            &meeting_id,
            &final_path,
            file_size,
            &waveform_path.to_string_lossy(),
            recording_offset_ms,
        );
    }

    // Step 4: Emit ready event
    let _ = app_handle.emit("recording_ready", serde_json::json!({
        "meeting_id": meeting_id,
        "recording_path": final_path,
        "recording_size": file_size,
        "waveform_path": waveform_path.to_string_lossy().to_string(),
    }));
}
```

- [ ] **Step 3: Wire pipeline into end_meeting command**

In `src-tauri/src/commands/meeting_commands.rs`, after the existing `end_meeting` logic (around line 109):

1. Check if recorder was active (get `recording_start_time_ms` from AudioCaptureManager)
2. Stop the recorder, get WAV path
3. Calculate `recording_offset_ms = recorder.start_time_ms - meeting_start_epoch_ms`
4. Spawn the async `process_recording` task
5. Return immediately to frontend (processing is async)

- [ ] **Step 4: Add update_meeting_recording helper in meetings.rs**

```rust
pub fn update_meeting_recording(
    &self,
    meeting_id: &str,
    recording_path: &str,
    recording_size: i64,
    waveform_path: &str,
    recording_offset_ms: i64,
) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE meetings SET recording_path = ?1, recording_size = ?2, waveform_path = ?3, recording_offset_ms = ?4 WHERE id = ?5",
        rusqlite::params![recording_path, recording_size, waveform_path, recording_offset_ms, meeting_id],
    ).map_err(|e| format!("Failed to update recording: {}", e))?;
    Ok(())
}
```

- [ ] **Step 5: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/audio/ src-tauri/src/commands/meeting_commands.rs src-tauri/src/db/meetings.rs
git commit -m "feat(recording): add post-meeting pipeline (waveform + Opus + DB update)"
```

---

## Task 5: New IPC Commands + Frontend Wrappers

**Files:**
- Create: `src-tauri/src/commands/recording_commands.rs`
- Modify: `src-tauri/src/lib.rs` (register commands)
- Modify: `src/lib/ipc.ts` (add wrappers)
- Modify: `src/lib/events.ts` (add recording events)

- [ ] **Step 1: Create recording_commands.rs**

```rust
use crate::state::AppState;
use serde::Serialize;
use tauri::{command, AppHandle, Manager, State};

#[derive(Debug, Serialize)]
pub struct RecordingInfo {
    pub path: String,
    pub size_bytes: i64,
    pub duration_ms: u64,
    pub waveform_path: String,
    pub offset_ms: i64,
}

#[command]
pub async fn get_recording_info(
    meeting_id: String,
    state: State<'_, AppState>,
) -> Result<Option<RecordingInfo>, String> {
    let db = state.database.lock().map_err(|e| e.to_string())?;
    let db = db.as_ref().ok_or("Database not initialized")?;

    // Query recording columns from meetings table
    let conn = db.get_conn().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT recording_path, recording_size, waveform_path, recording_offset_ms FROM meetings WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let result = stmt.query_row(rusqlite::params![meeting_id], |row| {
        let path: Option<String> = row.get(0)?;
        let size: Option<i64> = row.get(1)?;
        let waveform: Option<String> = row.get(2)?;
        let offset: Option<i64> = row.get(3)?;
        Ok((path, size, waveform, offset))
    }).map_err(|e| e.to_string())?;

    match result {
        (Some(path), Some(size), Some(waveform), Some(offset)) => {
            // Read waveform to get duration_ms
            let waveform_content = std::fs::read_to_string(&waveform).unwrap_or_default();
            let duration_ms = serde_json::from_str::<serde_json::Value>(&waveform_content)
                .ok()
                .and_then(|v| v["duration_ms"].as_u64())
                .unwrap_or(0);

            Ok(Some(RecordingInfo {
                path,
                size_bytes: size,
                duration_ms,
                waveform_path: waveform,
                offset_ms: offset,
            }))
        }
        _ => Ok(None),
    }
}

#[command]
pub async fn get_recording_file_url(
    meeting_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Returns the absolute filesystem path. Frontend uses convertFileSrc()
    // from @tauri-apps/api/core to convert to a WebView-accessible URL.
    let db = state.database.lock().map_err(|e| e.to_string())?;
    let db = db.as_ref().ok_or("Database not initialized")?;

    let conn = db.get_conn().map_err(|e| e.to_string())?;
    let path: String = conn
        .query_row(
            "SELECT recording_path FROM meetings WHERE id = ?1",
            rusqlite::params![meeting_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("No recording found: {}", e))?;

    Ok(path)
}

#[command]
pub async fn delete_recording(
    meeting_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.database.lock().map_err(|e| e.to_string())?;
    let db = db.as_ref().ok_or("Database not initialized")?;

    let conn = db.get_conn().map_err(|e| e.to_string())?;

    // Get paths before clearing
    let (recording_path, waveform_path): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT recording_path, waveform_path FROM meetings WHERE id = ?1",
            rusqlite::params![meeting_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    // Delete files
    if let Some(p) = &recording_path {
        let _ = std::fs::remove_file(p);
    }
    if let Some(p) = &waveform_path {
        let _ = std::fs::remove_file(p);
    }

    // Clear DB fields
    conn.execute(
        "UPDATE meetings SET recording_path = NULL, recording_size = NULL, waveform_path = NULL, recording_offset_ms = NULL WHERE id = ?1",
        rusqlite::params![meeting_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}
```

- [ ] **Step 2: Register commands in lib.rs**

In `src-tauri/src/lib.rs`, add the import and register commands:

```rust
use commands::recording_commands;
```

Add to the `generate_handler!` macro:
```rust
recording_commands::get_recording_info,
recording_commands::get_recording_file_url,
recording_commands::delete_recording,
```

- [ ] **Step 3: Add IPC wrappers in ipc.ts**

In `src/lib/ipc.ts`, add:

```typescript
export async function getRecordingInfo(meetingId: string): Promise<RecordingInfo | null> {
  return invoke<RecordingInfo | null>("get_recording_info", { meetingId });
}

export async function getRecordingFileUrl(meetingId: string): Promise<string> {
  return invoke<string>("get_recording_file_url", { meetingId });
}

export async function deleteRecording(meetingId: string): Promise<void> {
  return invoke("delete_recording", { meetingId });
}
```

Import `RecordingInfo` from types.ts at the top.

- [ ] **Step 4: Add recording events in events.ts**

In `src/lib/events.ts`, add:

```typescript
export function onRecordingReady(handler: (event: { meeting_id: string; recording_path: string; recording_size: number; waveform_path: string }) => void) {
  return listen<{ meeting_id: string; recording_path: string; recording_size: number; waveform_path: string }>("recording_ready", (e) => handler(e.payload));
}

export function onRecordingError(handler: (event: string) => void) {
  return listen<string>("recording_error", (e) => handler(e.payload));
}
```

- [ ] **Step 5: Verify frontend compiles**

Run: `npm run build`
Expected: TypeScript check passes

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/recording_commands.rs src-tauri/src/lib.rs src/lib/ipc.ts src/lib/events.ts
git commit -m "feat(recording): add IPC commands for recording info, file URL, and deletion"
```

---

## Task 6: Move Recording Toggle to MeetingSetupModal

**Files:**
- Modify: `src/launcher/MeetingSetupModal.tsx:280-336` (add toggle between scenario picker and remember checkbox)
- Modify: `src/stores/configStore.ts:267-270` (ensure persistence)

- [ ] **Step 1: Add recording toggle state to MeetingSetupModal**

In `src/launcher/MeetingSetupModal.tsx`, import `useConfigStore` and get `recordingEnabled` + `setRecordingEnabled`:

```typescript
const { recordingEnabled, setRecordingEnabled } = useConfigStore();
```

- [ ] **Step 2: Add recording toggle UI between scenario picker and remember checkbox**

Insert between the scenario section (around line 320) and the remember checkbox (around line 323):

```tsx
{/* Recording Toggle */}
<div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3">
  <div className="flex items-center gap-2.5">
    <div className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
    <div>
      <p className="text-sm font-medium">Record Audio</p>
      <p className="text-xs text-muted-foreground">Save as file for playback</p>
    </div>
  </div>
  <Switch
    checked={recordingEnabled}
    onCheckedChange={(checked) => {
      setRecordingEnabled(checked); // handles both local state + IPC persistence
    }}
    className="data-[state=checked]:bg-red-500"
  />
</div>
```

Note: Use the shadcn Switch component. The `setRecordingEnabled` from configStore handles both local state and IPC persistence.

- [ ] **Step 3: Add REC badge to compact view**

In the compact view section (where mode and scenario badges are shown), add when `recordingEnabled`:

```tsx
{recordingEnabled && (
  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400 ring-1 ring-red-500/20">
    <span className="h-1 w-1 rounded-full bg-red-500 animate-pulse" />
    REC
  </span>
)}
```

- [ ] **Step 4: Wire recording state into meeting start flow**

In the `handleStart` function, ensure `setRecordingEnabled` IPC is called before capture starts:

```typescript
// Already handled — configStore.setRecordingEnabled calls both the store setter and ipc.setRecordingEnabled
```

- [ ] **Step 5: Verify UI renders correctly**

Run: `npm run dev`
Open the app, click "Start Meeting", verify the recording toggle appears between Scenario and Remember checkbox.

- [ ] **Step 6: Commit**

```bash
git add src/launcher/MeetingSetupModal.tsx
git commit -m "feat(recording): add recording toggle to MeetingSetupModal"
```

---

## Task 7: Remove Settings Toggle + Fix REC Badge

**Files:**
- Modify: `src/settings/AudioSettings.tsx:226-243` (remove recording toggle)
- Modify: `src/overlay/OverlayView.tsx:100-105` (fix badge condition)

- [ ] **Step 1: Remove recording toggle from AudioSettings**

In `src/settings/AudioSettings.tsx`, remove lines 226-243 (the entire recording toggle `<div>` block). Also remove the `handleRecordingToggle` function if it's no longer referenced elsewhere.

- [ ] **Step 2: Fix REC badge condition in OverlayView**

In `src/overlay/OverlayView.tsx`, around line 100:

Change:
```tsx
{isRecording && (
```

To:
```tsx
{recordingEnabled && (
```

Add import at top:
```tsx
const { recordingEnabled } = useConfigStore();
```

- [ ] **Step 3: Enhance REC badge animation**

Add a CSS keyframe for the breathing ring effect. In the badge wrapper, add:

```tsx
{recordingEnabled && (
  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive ring-1 ring-destructive/30 animate-[breathe_2s_ease-in-out_infinite]">
    <span className="relative flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
    </span>
    REC
  </span>
)}
```

Add to your global CSS or tailwind config:
```css
@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
```

- [ ] **Step 4: Verify both changes**

Run: `npm run dev`
1. Open Settings → Audio tab → recording toggle should be gone
2. Start a meeting with recording ON → REC badge should appear with breathing animation
3. Start a meeting with recording OFF → no REC badge

- [ ] **Step 5: Commit**

```bash
git add src/settings/AudioSettings.tsx src/overlay/OverlayView.tsx
git commit -m "feat(recording): remove settings toggle, fix REC badge to use recordingEnabled"
```

---

## Task 8: AudioPlayerStore (Zustand)

**Files:**
- Create: `src/stores/audioPlayerStore.ts`

- [ ] **Step 1: Create the audio player store**

Create `src/stores/audioPlayerStore.ts`:

```typescript
import { create } from "zustand";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

interface AudioPlayerState {
  // State
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
  playbackSpeed: number;
  activeSegmentId: string | null;
  audioElement: HTMLAudioElement | null;

  // Sync context (set when loading a meeting)
  meetingStartMs: number;
  recordingOffsetMs: number;

  // Actions
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seekToTime: (ms: number) => void;
  seekToTimestamp: (absoluteTimestampMs: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  cycleSpeed: (direction: "up" | "down") => void;
  setAudioElement: (el: HTMLAudioElement | null) => void;
  setDuration: (ms: number) => void;
  updateCurrentTime: (ms: number) => void;
  setActiveSegmentId: (id: string | null) => void;
  setSyncContext: (meetingStartMs: number, recordingOffsetMs: number) => void;
  reset: () => void;
}

const initialState = {
  isPlaying: false,
  currentTimeMs: 0,
  durationMs: 0,
  playbackSpeed: 1,
  activeSegmentId: null,
  audioElement: null,
  meetingStartMs: 0,
  recordingOffsetMs: 0,
};

export const useAudioPlayerStore = create<AudioPlayerState>((set, get) => ({
  ...initialState,

  play: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.play();
      set({ isPlaying: true });
    }
  },

  pause: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.pause();
      set({ isPlaying: false });
    }
  },

  toggle: () => {
    const { isPlaying } = get();
    if (isPlaying) get().pause();
    else get().play();
  },

  seekToTime: (ms: number) => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.currentTime = Math.max(0, ms / 1000);
      set({ currentTimeMs: Math.max(0, ms) });
    }
  },

  seekToTimestamp: (absoluteTimestampMs: number) => {
    const { isPlaying, meetingStartMs, recordingOffsetMs } = get();
    if (!isPlaying) return; // Only seek during playback
    const audioMs = absoluteTimestampMs - meetingStartMs - recordingOffsetMs;
    get().seekToTime(Math.max(0, audioMs));
  },

  setPlaybackSpeed: (speed: number) => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.playbackRate = speed;
    }
    set({ playbackSpeed: speed });
  },

  cycleSpeed: (direction: "up" | "down") => {
    const { playbackSpeed } = get();
    const currentIndex = SPEED_OPTIONS.indexOf(playbackSpeed as any);
    const idx = currentIndex === -1 ? 2 : currentIndex; // default to 1x
    const newIndex =
      direction === "up"
        ? Math.min(idx + 1, SPEED_OPTIONS.length - 1)
        : Math.max(idx - 1, 0);
    get().setPlaybackSpeed(SPEED_OPTIONS[newIndex]);
  },

  setAudioElement: (el) => set({ audioElement: el }),
  setDuration: (ms) => set({ durationMs: ms }),
  updateCurrentTime: (ms) => set({ currentTimeMs: ms }),
  setActiveSegmentId: (id) => set({ activeSegmentId: id }),
  setSyncContext: (meetingStartMs, recordingOffsetMs) =>
    set({ meetingStartMs, recordingOffsetMs }),

  reset: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.pause();
      audioElement.src = "";
    }
    set(initialState);
  },
}));
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/stores/audioPlayerStore.ts
git commit -m "feat(recording): add AudioPlayerStore (Zustand) for playback state"
```

---

## Task 9: WaveformCanvas Component

**Files:**
- Create: `src/components/WaveformCanvas.tsx`

- [ ] **Step 1: Create the waveform canvas component**

Create `src/components/WaveformCanvas.tsx`:

```tsx
import { useRef, useEffect, useCallback } from "react";
import type { WaveformData, MeetingBookmark, TopicSection } from "@/lib/types";

interface WaveformCanvasProps {
  waveformData: WaveformData;
  currentTimeMs: number;
  durationMs: number;
  meetingStartMs: number;
  recordingOffsetMs: number;
  bookmarks?: MeetingBookmark[];
  topicSections?: TopicSection[];
  onSeek: (ms: number) => void;
  className?: string;
}

const PLAYED_COLOR = "#818cf8";
const UNPLAYED_COLOR = "rgba(255, 255, 255, 0.1)";
const PLAYHEAD_COLOR = "#818cf8";
const BOOKMARK_COLOR = "#f59e0b";
const TOPIC_COLOR = "rgba(16, 185, 129, 0.4)";

export function WaveformCanvas({
  waveformData,
  currentTimeMs,
  durationMs,
  meetingStartMs,
  recordingOffsetMs,
  bookmarks = [],
  topicSections = [],
  onSeek,
  className,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const progress = durationMs > 0 ? currentTimeMs / durationMs : 0;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = width / dpr;
    const h = height / dpr;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const peaks = waveformData.peaks;
    if (peaks.length === 0) {
      ctx.restore();
      return;
    }

    const barWidth = w / peaks.length;
    const playheadX = progress * w;
    const midY = h / 2;

    // Draw waveform bars
    for (let i = 0; i < peaks.length; i++) {
      const [min, max] = peaks[i];
      const x = i * barWidth;
      const barH = Math.max(2, (max - min) * midY);
      const y = midY - barH / 2;

      ctx.fillStyle = x < playheadX ? PLAYED_COLOR : UNPLAYED_COLOR;
      ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barH);
    }

    // Draw topic section dividers
    for (const section of topicSections) {
      const sectionMs = section.start_ms - meetingStartMs - recordingOffsetMs;
      const x = (sectionMs / durationMs) * w;
      if (x >= 0 && x <= w) {
        ctx.strokeStyle = TOPIC_COLOR;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw bookmark markers
    for (const bookmark of bookmarks) {
      const bookmarkMs = bookmark.timestamp_ms - meetingStartMs - recordingOffsetMs;
      const x = (bookmarkMs / durationMs) * w;
      if (x >= 0 && x <= w) {
        ctx.fillStyle = BOOKMARK_COLOR;
        ctx.shadowColor = "rgba(245, 158, 11, 0.4)";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(x, 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Draw playhead
    ctx.fillStyle = PLAYHEAD_COLOR;
    ctx.shadowColor = "rgba(129, 140, 248, 0.5)";
    ctx.shadowBlur = 6;
    ctx.fillRect(playheadX - 1, 0, 2, h);
    ctx.shadowBlur = 0;

    ctx.restore();
  }, [waveformData, progress, durationMs, meetingStartMs, recordingOffsetMs, bookmarks, topicSections]);

  // Resize canvas to container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      draw();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  // Redraw on state change
  useEffect(() => {
    draw();
  }, [draw]);

  // Click to seek
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = x / rect.width;
    onSeek(fraction * durationMs);
  };

  // Drag to scrub
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const x = Math.max(0, Math.min(ev.clientX - rect.left, rect.width));
      const fraction = x / rect.width;
      onSeek(fraction * durationMs);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div ref={containerRef} className={className}>
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-pointer"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/WaveformCanvas.tsx
git commit -m "feat(recording): add WaveformCanvas component with markers and scrubbing"
```

---

## Task 10: AudioPlayer Bottom Bar Component

**Files:**
- Create: `src/components/AudioPlayer.tsx`

- [ ] **Step 1: Create the AudioPlayer component**

Create `src/components/AudioPlayer.tsx`:

```tsx
import { useEffect, useRef, useCallback } from "react";
import { useAudioPlayerStore } from "@/stores/audioPlayerStore";
import { WaveformCanvas } from "@/components/WaveformCanvas";
import { getRecordingFileUrl } from "@/lib/ipc";
import type { WaveformData, MeetingBookmark, TopicSection } from "@/lib/types";
import { convertFileSrc } from "@tauri-apps/api/core";

interface AudioPlayerProps {
  meetingId: string;
  meetingStartMs: number;
  recordingPath: string;
  recordingSize: number;
  recordingOffsetMs: number;
  durationMs: number;
  waveformData: WaveformData | null;
  bookmarks?: MeetingBookmark[];
  topicSections?: TopicSection[];
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AudioPlayer({
  meetingId,
  meetingStartMs,
  recordingPath,
  recordingSize,
  recordingOffsetMs,
  durationMs,
  waveformData,
  bookmarks = [],
  topicSections = [],
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number>(0);

  const {
    isPlaying,
    currentTimeMs,
    playbackSpeed,
    setAudioElement,
    setSyncContext,
    setDuration,
    updateCurrentTime,
    toggle,
    seekToTime,
    cycleSpeed,
    reset,
  } = useAudioPlayerStore();

  // Initialize audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const audioUrl = convertFileSrc(recordingPath);
    audio.src = audioUrl;
    audio.playbackRate = playbackSpeed;
    setAudioElement(audio);
    setSyncContext(meetingStartMs, recordingOffsetMs);
    setDuration(durationMs);

    audio.addEventListener("ended", () => {
      useAudioPlayerStore.setState({ isPlaying: false });
    });

    audio.addEventListener("loadedmetadata", () => {
      const dur = audio.duration * 1000;
      if (dur && isFinite(dur)) setDuration(dur);
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      reset();
    };
  }, [meetingId, recordingPath]);

  // RAF loop for smooth time tracking
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        updateCurrentTime(audio.currentTime * 1000);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, updateCurrentTime]);

  const handleSeek = useCallback(
    (ms: number) => seekToTime(ms),
    [seekToTime]
  );

  const handleDownload = async () => {
    const url = convertFileSrc(recordingPath);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meeting-${meetingId}.ogg`;
    a.click();
  };

  const displayDuration = durationMs;

  return (
    <div className="border-t border-border/10 bg-card/95 backdrop-blur-xl px-5 py-2.5">
      <audio ref={audioRef} preload="auto" />
      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={toggle}
          className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" className="text-indigo-400">
              <rect x="1" y="0" width="3" height="12" rx="1" />
              <rect x="6" y="0" width="3" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" className="text-indigo-400 ml-0.5">
              <path d="M0 0l10 6-10 6z" />
            </svg>
          )}
        </button>

        {/* Current time */}
        <span className="text-[10px] font-semibold text-muted-foreground tabular-nums min-w-[32px]">
          {formatTime(currentTimeMs)}
        </span>

        {/* Waveform */}
        {waveformData ? (
          <WaveformCanvas
            waveformData={waveformData}
            currentTimeMs={currentTimeMs}
            durationMs={displayDuration}
            meetingStartMs={meetingStartMs}
            recordingOffsetMs={recordingOffsetMs}
            bookmarks={bookmarks}
            topicSections={topicSections}
            onSeek={handleSeek}
            className="flex-1 h-6"
          />
        ) : (
          <div className="flex-1 h-6 rounded bg-muted/10 animate-pulse" />
        )}

        {/* Duration */}
        <span className="text-[10px] text-muted-foreground/50 tabular-nums min-w-[32px]">
          {formatTime(displayDuration)}
        </span>

        {/* Speed control */}
        <button
          onClick={() => cycleSpeed("up")}
          className="text-[10px] font-semibold text-muted-foreground bg-white/[0.06] hover:bg-white/[0.1] px-1.5 py-0.5 rounded transition-colors"
        >
          {playbackSpeed}x
        </button>

        {/* Download */}
        <button
          onClick={handleDownload}
          className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          aria-label="Download recording"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M7 1v8m0 0l-3-3m3 3l3-3M2 11h10" />
          </svg>
        </button>

        {/* File size */}
        <span className="text-[9px] text-muted-foreground/30">
          {formatFileSize(recordingSize)}
        </span>
      </div>
    </div>
  );
}

/** Skeleton shown while recording is being processed */
export function AudioPlayerSkeleton() {
  return (
    <div className="border-t border-border/10 bg-card/95 backdrop-blur-xl px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="h-[30px] w-[30px] rounded-full bg-muted/10 animate-pulse" />
        <div className="flex-1 h-6 rounded bg-muted/10 animate-pulse" />
        <span className="text-[10px] text-muted-foreground/40 animate-pulse">Processing audio...</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors. Note: `convertFileSrc` import may need adjustment depending on Tauri 2 API version — check `@tauri-apps/api` docs.

- [ ] **Step 3: Commit**

```bash
git add src/components/AudioPlayer.tsx
git commit -m "feat(recording): add AudioPlayer bottom bar with waveform, speed, download"
```

---

## Task 11: Audio-Transcript Sync Hook

**Files:**
- Create: `src/hooks/useAudioTranscriptSync.ts`

- [ ] **Step 1: Create the sync hook**

Create `src/hooks/useAudioTranscriptSync.ts`:

```typescript
import { useEffect, useRef } from "react";
import { useAudioPlayerStore } from "@/stores/audioPlayerStore";
import type { TranscriptSegment } from "@/lib/types";

/**
 * Syncs audio playback position to transcript segments.
 * Updates activeSegmentId in the audio player store.
 * Also handles auto-scroll to the active segment.
 */
export function useAudioTranscriptSync(
  segments: TranscriptSegment[],
  meetingStartMs: number,
  recordingOffsetMs: number,
  segmentRefs?: React.MutableRefObject<Map<string, HTMLElement>>
) {
  const currentTimeMs = useAudioPlayerStore((s) => s.currentTimeMs);
  const isPlaying = useAudioPlayerStore((s) => s.isPlaying);
  const setActiveSegmentId = useAudioPlayerStore((s) => s.setActiveSegmentId);
  const lastManualScrollRef = useRef(0);
  const autoScrollEnabledRef = useRef(true);

  // Track user manual scrolling to pause auto-scroll
  useEffect(() => {
    const handleWheel = () => {
      lastManualScrollRef.current = Date.now();
      autoScrollEnabledRef.current = false;

      // Re-enable auto-scroll after 5 seconds of no manual scrolling
      setTimeout(() => {
        if (Date.now() - lastManualScrollRef.current >= 4900) {
          autoScrollEnabledRef.current = true;
        }
      }, 5000);
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  // Find active segment based on audio position
  useEffect(() => {
    if (!isPlaying || segments.length === 0) return;

    let activeId: string | null = null;

    // Find the last segment whose audio-relative time <= currentTimeMs
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      const segAudioMs = seg.timestamp_ms - meetingStartMs - recordingOffsetMs;
      if (segAudioMs <= currentTimeMs) {
        activeId = seg.id;
        break;
      }
    }

    setActiveSegmentId(activeId);

    // Auto-scroll to active segment
    if (activeId && autoScrollEnabledRef.current && segmentRefs?.current) {
      const el = segmentRefs.current.get(activeId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [currentTimeMs, isPlaying, segments, meetingStartMs, recordingOffsetMs, setActiveSegmentId, segmentRefs]);

  // Clear active segment when playback stops
  useEffect(() => {
    if (!isPlaying) return;
    return () => {
      // Keep activeSegmentId on pause (don't clear)
    };
  }, [isPlaying]);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAudioTranscriptSync.ts
git commit -m "feat(recording): add audio-transcript sync hook"
```

---

## Task 12: Integrate Player + Sync into MeetingDetailsContainer

**Files:**
- Modify: `src/launcher/meeting-details/MeetingDetailsContainer.tsx` (add player + load recording data)
- Modify: `src/launcher/meeting-details/TranscriptView.tsx` (active segment highlighting + click-to-seek)

- [ ] **Step 1: Load recording info in MeetingDetailsContainer**

In `MeetingDetailsContainer.tsx`, add state and effect to load recording data:

```typescript
import { AudioPlayer, AudioPlayerSkeleton } from "@/components/AudioPlayer";
import { getRecordingInfo } from "@/lib/ipc";
import { onRecordingReady } from "@/lib/events";
import { useAudioPlayerStore } from "@/stores/audioPlayerStore";
import type { RecordingInfo, WaveformData } from "@/lib/types";

// State
const [recordingInfo, setRecordingInfo] = useState<RecordingInfo | null>(null);
const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
const [recordingProcessing, setRecordingProcessing] = useState(false);

// Load recording info when meeting loads
useEffect(() => {
  if (!meeting?.id) return;
  getRecordingInfo(meeting.id).then((info) => {
    if (info) {
      setRecordingInfo(info);
      // Load waveform data
      fetch(convertFileSrc(info.waveform_path))
        .then((r) => r.json())
        .then(setWaveformData)
        .catch(console.error);
    }
  });
}, [meeting?.id]);

// Listen for recording_ready event (post-meeting processing complete)
useEffect(() => {
  const unlisten = onRecordingReady((data) => {
    if (data.meeting_id === meeting?.id) {
      setRecordingProcessing(false);
      getRecordingInfo(meeting.id).then(setRecordingInfo);
    }
  });
  return () => { unlisten.then((fn) => fn()); };
}, [meeting?.id]);
```

- [ ] **Step 2: Add AudioPlayer to the component's render, below the tab content**

At the bottom of the component's return JSX, after the tab content and before the closing wrapper div:

```tsx
{/* Audio Player — sticky bottom bar */}
{recordingProcessing && <AudioPlayerSkeleton />}
{recordingInfo && !recordingProcessing && (
  <AudioPlayer
    meetingId={meeting.id}
    meetingStartMs={new Date(meeting.start_time).getTime()}
    recordingPath={recordingInfo.path}
    recordingSize={recordingInfo.size_bytes}
    recordingOffsetMs={recordingInfo.offset_ms}
    durationMs={recordingInfo.duration_ms}
    waveformData={waveformData}
    bookmarks={meeting.bookmarks}
    topicSections={meeting.topic_sections}
  />
)}
```

Ensure the container uses `flex flex-col h-full` so the player sticks to the bottom and the tab content scrolls above it.

- [ ] **Step 3: Add active segment highlighting to TranscriptView**

In `TranscriptView.tsx`, import the player store and apply highlight styling:

```typescript
import { useAudioPlayerStore } from "@/stores/audioPlayerStore";

// Inside the component:
const activeSegmentId = useAudioPlayerStore((s) => s.activeSegmentId);
```

For each segment's wrapper div, add conditional styling:

```tsx
className={cn(
  "...", // existing classes
  activeSegmentId === segment.id && "border-l-2 border-indigo-400 bg-indigo-500/[0.08]"
)}
```

- [ ] **Step 4: Add click-to-seek on transcript segments**

In the segment click handler, add seek logic:

```typescript
const { isPlaying, seekToTimestamp } = useAudioPlayerStore();

const handleSegmentClick = (segment: TranscriptSegment) => {
  if (isPlaying) {
    seekToTimestamp(segment.timestamp_ms);
  }
  // ...existing navigation logic
};
```

- [ ] **Step 5: Initialize sync hook in TranscriptView**

```typescript
import { useAudioTranscriptSync } from "@/hooks/useAudioTranscriptSync";

// Inside the component, after segmentRefs setup:
useAudioTranscriptSync(
  segments,
  meetingStartMs,
  recordingOffsetMs,
  segmentRefs
);
```

Pass `meetingStartMs` and `recordingOffsetMs` as props from MeetingDetailsContainer.

- [ ] **Step 6: Verify UI works**

Run: `npm run dev`
1. Open a meeting with a recording
2. Player should appear at the bottom
3. Play audio → transcript highlights should follow
4. Click a transcript line during playback → audio should seek

- [ ] **Step 7: Commit**

```bash
git add src/launcher/meeting-details/MeetingDetailsContainer.tsx src/launcher/meeting-details/TranscriptView.tsx
git commit -m "feat(recording): integrate player + bidirectional transcript sync"
```

---

## Task 13: Wire seekToTimestamp into All Navigation

**Files:**
- Modify: `src/launcher/meeting-details/BookmarksTab.tsx`
- Modify: `src/launcher/meeting-details/SpeakersTab.tsx`
- Modify: `src/launcher/meeting-details/ActionItemsTab.tsx`

- [ ] **Step 1: Wire bookmarks navigation**

In `BookmarksTab.tsx`, import the player store and add seek to the bookmark click handler:

```typescript
import { useAudioPlayerStore } from "@/stores/audioPlayerStore";

const { isPlaying, seekToTimestamp } = useAudioPlayerStore();

// In the bookmark click handler (where it navigates to transcript):
const handleBookmarkClick = (bookmark: MeetingBookmark) => {
  if (isPlaying) {
    seekToTimestamp(bookmark.timestamp_ms);
  }
  // ...existing navigation (onNavigateToBookmark, etc.)
};
```

- [ ] **Step 2: Wire speaker timeline navigation**

In `SpeakersTab.tsx` (or `SpeakerTimeline.tsx`), add seek to the segment click handler:

```typescript
import { useAudioPlayerStore } from "@/stores/audioPlayerStore";

const { isPlaying, seekToTimestamp } = useAudioPlayerStore();

// In onSegmentClick handler:
const handleSegmentClick = (segmentIndex: number) => {
  const segment = segments[segmentIndex];
  if (segment && isPlaying) {
    seekToTimestamp(segment.timestamp_ms);
  }
  // ...existing onSegmentClick prop call
};
```

- [ ] **Step 3: Wire action items navigation**

In `ActionItemsTab.tsx`, add seek when clicking an action item's timestamp:

```typescript
import { useAudioPlayerStore } from "@/stores/audioPlayerStore";

const { isPlaying, seekToTimestamp } = useAudioPlayerStore();

// Add click handler to the timestamp display in each action item:
const handleActionTimestampClick = (item: ActionItem) => {
  if (isPlaying) {
    seekToTimestamp(item.timestamp_ms);
  }
  // Optionally navigate to transcript too
};
```

- [ ] **Step 4: Verify all navigation paths seek during playback**

Run: `npm run dev`
1. Play audio in a meeting with bookmarks, speakers, and action items
2. Switch to Bookmarks tab → click a bookmark → audio should seek
3. Switch to Speakers tab → click timeline block → audio should seek
4. Switch to Action Items tab → click timestamp → audio should seek
5. When NOT playing, all clicks should behave as before (no audio interaction)

- [ ] **Step 5: Commit**

```bash
git add src/launcher/meeting-details/BookmarksTab.tsx src/launcher/meeting-details/SpeakersTab.tsx src/launcher/meeting-details/ActionItemsTab.tsx
git commit -m "feat(recording): wire seekToTimestamp into bookmarks, speakers, action items"
```

---

## Task 14: Keyboard Shortcuts Hook

**Files:**
- Create: `src/hooks/useAudioKeyboardShortcuts.ts`
- Modify: `src/launcher/meeting-details/MeetingDetailsContainer.tsx` (mount hook)

- [ ] **Step 1: Create the keyboard shortcuts hook**

Create `src/hooks/useAudioKeyboardShortcuts.ts`:

```typescript
import { useEffect } from "react";
import { useAudioPlayerStore } from "@/stores/audioPlayerStore";

const INTERACTIVE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function useAudioKeyboardShortcuts() {
  const audioElement = useAudioPlayerStore((s) => s.audioElement);

  useEffect(() => {
    if (!audioElement) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire when typing in inputs or focused on buttons
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (INTERACTIVE_TAGS.has(tag)) return;
      if (document.activeElement?.getAttribute("role") === "button") return;

      const store = useAudioPlayerStore.getState();

      switch (e.key) {
        case " ":
          e.preventDefault();
          store.toggle();
          break;
        case "ArrowLeft":
          e.preventDefault();
          store.seekToTime(store.currentTimeMs - (e.shiftKey ? 15000 : 5000));
          break;
        case "ArrowRight":
          e.preventDefault();
          store.seekToTime(store.currentTimeMs + (e.shiftKey ? 15000 : 5000));
          break;
        case "[":
          e.preventDefault();
          store.cycleSpeed("down");
          break;
        case "]":
          e.preventDefault();
          store.cycleSpeed("up");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audioElement]);
}
```

- [ ] **Step 2: Mount the hook in MeetingDetailsContainer**

In `MeetingDetailsContainer.tsx`, add:

```typescript
import { useAudioKeyboardShortcuts } from "@/hooks/useAudioKeyboardShortcuts";

// Inside the component:
useAudioKeyboardShortcuts();
```

- [ ] **Step 3: Verify shortcuts work**

Run: `npm run dev`
1. Open a meeting with recording
2. Press Space → audio plays/pauses
3. Press Left/Right arrows → skips 5s
4. Press Shift+Left/Right → skips 15s
5. Press `[` and `]` → speed changes
6. Click into a search input → Space types a space (doesn't toggle playback)

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAudioKeyboardShortcuts.ts src/launcher/meeting-details/MeetingDetailsContainer.tsx
git commit -m "feat(recording): add keyboard shortcuts for audio playback"
```

---

## Task 15: Version Bump + Final Verification

**Files:**
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Bump version**

In `src/lib/version.ts`:

```typescript
export const NEXQ_VERSION = "2.10.0";
export const NEXQ_BUILD_DATE = "2026-03-23";
```

- [ ] **Step 2: Full build check**

Run: `npm run build`
Expected: TypeScript check + Vite build pass with no errors

- [ ] **Step 3: Rust build check**

Run: `cd src-tauri && cargo build`
Expected: Full compilation succeeds

- [ ] **Step 4: Manual integration test**

1. Start the app: `npx tauri dev`
2. Open MeetingSetupModal → verify recording toggle present
3. Start meeting with recording ON → verify REC badge shows
4. End meeting → verify "Processing audio..." skeleton appears
5. After processing → verify player appears at bottom
6. Play → waveform animates, transcript highlights
7. Click transcript line → audio seeks
8. Switch tabs → player persists
9. Test keyboard shortcuts
10. Download recording → file downloads

- [ ] **Step 5: Commit**

```bash
git add src/lib/version.ts
git commit -m "chore: bump version to 2.10.0 for audio recording & playback"
```
