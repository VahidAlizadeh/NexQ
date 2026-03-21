use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{command, AppHandle, Emitter, Manager};
use tokio::sync::mpsc;

use crate::audio::device_manager;
use crate::audio::session_monitor;
use crate::audio::vad::{calculate_peak, calculate_rms, VoiceActivityDetector};
use crate::audio::{AudioCaptureManager, AudioLevel, AudioSource};
use crate::stt::provider::STTProvider;
use crate::state::AppState;

/// List all available audio input and output devices.
#[command]
pub async fn list_audio_devices() -> Result<String, String> {
    let device_list = device_manager::enumerate_devices()?;
    serde_json::to_string(&device_list).map_err(|e| format!("Failed to serialize devices: {}", e))
}

/// Start dual audio capture (mic + system).
#[command]
pub async fn start_capture(
    app: AppHandle,
    mic_device_id: String,
    system_device_id: String,
) -> Result<(), String> {
    let state = app.state::<AppState>();

    // Check if already capturing
    {
        let guard = state
            .audio
            .lock()
            .map_err(|_| "Audio state lock poisoned".to_string())?;
        if let Some(ref mgr) = *guard {
            if mgr.is_capturing() {
                return Err("Capture already in progress".to_string());
            }
        }
    }

    // Create the audio chunk channel
    let (tx, mut rx) = mpsc::channel::<crate::audio::AudioChunk>(256);

    // Initialize and start the manager
    {
        let mut guard = state
            .audio
            .lock()
            .map_err(|_| "Audio state lock poisoned".to_string())?;
        let mgr = guard.get_or_insert_with(AudioCaptureManager::new);
        mgr.start_capture(&mic_device_id, &system_device_id, tx)?;
    }

    // ---- System Audio STT (for remote party in calls) ----
    // Mic transcription is handled by Web Speech API in the frontend.
    // System audio (WASAPI loopback = other party in Zoom/Meet) needs a
    // cloud STT provider (Deepgram/Whisper/Azure/Groq) configured in Settings.
    // If no cloud provider is configured, system audio won't be transcribed.
    let system_stt: Option<Box<dyn STTProvider>> = {
        let stt_config = state.stt.as_ref().and_then(|stt_arc| {
            let router = stt_arc.lock().ok()?;
            let provider_type = router.active_provider_type()?.clone();
            use crate::stt::provider::STTProviderType;
            if provider_type == STTProviderType::WindowsNative {
                return None; // WindowsNative can't transcribe system audio
            }
            Some((
                provider_type,
                router.deepgram_api_key.clone(),
                router.deepgram_config.clone(),
                router.whisper_api_key.clone(),
                router.azure_speech_key.clone(),
                router.azure_speech_region.clone(),
                router.groq_whisper_api_key.clone(),
                router.language.clone(),
            ))
        });

        match stt_config {
            Some((pt, dk, dg_cfg, wk, ak, ar, gk, lang)) => {
                use crate::stt::provider::STTProviderType;
                let p: Box<dyn STTProvider> = match pt {
                    STTProviderType::Deepgram => {
                        let mut p = match dk.as_deref() {
                            Some(k) => crate::stt::deepgram::DeepgramSTT::with_api_key(k),
                            None => crate::stt::deepgram::DeepgramSTT::new(),
                        };
                        p.set_language(&lang);
                        p.set_config(dg_cfg);
                        Box::new(p)
                    }
                    STTProviderType::WhisperApi => {
                        let mut p = match wk.as_deref() {
                            Some(k) => crate::stt::whisper_api::WhisperApiSTT::with_api_key(k),
                            None => crate::stt::whisper_api::WhisperApiSTT::new(),
                        };
                        p.set_language(&lang);
                        Box::new(p)
                    }
                    STTProviderType::AzureSpeech => {
                        let mut p = match (ak.as_deref(), ar.as_deref()) {
                            (Some(k), Some(r)) => crate::stt::azure_speech::AzureSpeechSTT::with_config(k, r),
                            _ => crate::stt::azure_speech::AzureSpeechSTT::new(),
                        };
                        p.set_language(&lang);
                        Box::new(p)
                    }
                    STTProviderType::GroqWhisper => {
                        let mut p = match gk.as_deref() {
                            Some(k) => crate::stt::groq_whisper::GroqWhisperSTT::with_api_key(k),
                            None => crate::stt::groq_whisper::GroqWhisperSTT::new(),
                        };
                        p.set_language(&lang);
                        Box::new(p)
                    }
                    _ => return Ok(()), // shouldn't reach
                };
                Some(p)
            }
            None => {
                log::info!(
                    "No cloud STT configured — system audio (remote party) won't be transcribed. \
                     Set up Deepgram/Whisper/Azure/Groq in Settings → STT."
                );
                None
            }
        }
    };

    // Start system STT if available
    let (sys_stt_tx, mut sys_stt_rx) =
        mpsc::channel::<crate::stt::provider::TranscriptResult>(256);
    let mut system_stt_provider = system_stt;
    let has_system_stt = if let Some(ref mut provider) = system_stt_provider {
        match provider.start_stream(sys_stt_tx).await {
            Ok(()) => {
                log::info!("System audio STT started (remote party transcription)");
                true
            }
            Err(e) => {
                log::warn!("Failed to start system STT: {}", e);
                system_stt_provider = None;
                false
            }
        }
    } else {
        false
    };

    // Emit transcript events from system audio STT (speaker = "Them")
    // Uses the SegmentAccumulator to merge consecutive segments within a
    // configurable pause threshold, producing longer, more readable lines.
    if has_system_stt {
        let stt_app = app.clone();
        let intel_arc = app.state::<AppState>().intelligence.clone();
        let pause_threshold = app.state::<AppState>().pause_threshold_ms.clone();
        tokio::spawn(async move {
            use std::sync::atomic::Ordering;
            let threshold = pause_threshold.load(Ordering::Relaxed);
            let mut accumulator =
                crate::stt::segment_accumulator::SegmentAccumulator::new(threshold);

            while let Some(result) = sys_stt_rx.recv().await {
                // Check for runtime threshold changes
                let current_threshold = pause_threshold.load(Ordering::Relaxed);
                accumulator.set_pause_threshold(current_threshold);

                let outputs = accumulator.feed_result(result);
                for output in outputs {
                    let event_name = if output.is_final {
                        "transcript_final"
                    } else {
                        "transcript_update"
                    };
                    let payload = serde_json::json!({
                        "segment": {
                            "id": output.id,
                            "text": output.text,
                            "speaker": output.speaker,
                            "timestamp_ms": output.timestamp_ms,
                            "is_final": output.is_final,
                            "confidence": output.confidence
                        }
                    });
                    let _ = stt_app.emit(event_name, &payload);

                    // Push final segments to the intelligence engine's
                    // transcript buffer so the AI has access to what "Them" said.
                    if output.is_final {
                        if let Some(ref intel) = intel_arc {
                            if let Ok(mut engine) = intel.lock() {
                                engine.push_transcript(
                                    output.text.clone(),
                                    "Them".to_string(),
                                    output.timestamp_ms,
                                    true,
                                );
                            }
                        }
                    }
                }
            }
        });
    }

    // Grab the recorder handle for optional WAV recording
    let recorder = {
        let guard = state.audio.lock().map_err(|_| "lock poisoned".to_string())?;
        guard.as_ref().and_then(|mgr| mgr.get_recorder())
    };

    // Audio processing task: levels + recording + system STT feed
    // (Mic STT is handled by Web Speech API in the frontend)
    let app_handle = app.clone();
    tokio::spawn(async move {
        let mut vad = VoiceActivityDetector::new();
        let mut mic_emit_counter: u32 = 0;
        let mut system_emit_counter: u32 = 0;

        while let Some(mut chunk) = rx.recv().await {
            let vad_result = vad.process_chunk(&chunk.pcm_data);
            chunk.is_speech = vad_result.is_speech;

            // Emit audio levels — separate counters per source for independent update rates
            let should_emit = match chunk.source {
                AudioSource::Mic => {
                    mic_emit_counter += 1;
                    mic_emit_counter % 3 == 0
                }
                AudioSource::System => {
                    system_emit_counter += 1;
                    system_emit_counter % 3 == 0
                }
            };
            if should_emit {
                let rms = calculate_rms(&chunk.pcm_data);
                let peak = calculate_peak(&chunk.pcm_data);
                let level = AudioLevel {
                    source: chunk.source.clone(),
                    level: (rms / 3000.0).min(1.0),
                    peak,
                };
                let _ = app_handle.emit("audio_level", &level);
            }

            // Write to WAV recorder if active
            if let Some(ref rec) = recorder {
                rec.write_samples(&chunk.pcm_data);
            }

            // Feed ONLY system audio to the cloud STT provider
            if chunk.source == AudioSource::System {
                if let Some(ref mut provider) = system_stt_provider {
                    let _ = provider.feed_audio(chunk).await;
                }
            }
        }

        // Clean shutdown
        if let Some(ref mut provider) = system_stt_provider {
            let _ = provider.stop_stream().await;
        }
        log::info!("Audio processing task exiting");
    });

    log::info!("Audio capture started via command");
    Ok(())
}

/// Stop all audio capture.
#[command]
pub async fn stop_capture(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();

    // Restore original default capture device if IPolicyConfig override was active
    restore_default_device_if_overridden(&state, &app);

    let mut guard = state
        .audio
        .lock()
        .map_err(|_| "Audio state lock poisoned".to_string())?;

    match guard.as_mut() {
        Some(mgr) => {
            mgr.stop_capture();
            log::info!("Audio capture stopped via command");
            Ok(())
        }
        None => Err("No audio manager initialized".to_string()),
    }
}

/// Get current audio levels for UI meters.
#[command]
pub async fn get_audio_level(app: AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    let guard = state
        .audio
        .lock()
        .map_err(|_| "Audio state lock poisoned".to_string())?;

    match guard.as_ref() {
        Some(mgr) => {
            let (mic_level, _system_level) = mgr.get_audio_levels();
            serde_json::to_string(&mic_level)
                .map_err(|e| format!("Failed to serialize audio level: {}", e))
        }
        None => Ok(r#"{"source":"Mic","level":0.0,"peak":0.0}"#.to_string()),
    }
}

/// Start a real audio test on a device — opens a capture stream and emits
/// audio_level events so the frontend level meter shows live data.
/// For input (mic): opens cpal input stream.
/// For output (system): starts WASAPI loopback capture.
#[command]
pub async fn start_audio_test(
    app: AppHandle,
    device_id: String,
    is_input: bool,
) -> Result<(), String> {
    let state = app.state::<AppState>();

    // Start test capture and get the audio chunk receiver
    let (mut rx, detected_flag) = {
        let mut guard = state
            .audio
            .lock()
            .map_err(|_| "Audio state lock poisoned".to_string())?;
        let mgr = guard.get_or_insert_with(AudioCaptureManager::new);
        let rx = mgr.start_test(&device_id, is_input)?;
        let detected = Arc::clone(&mgr.test_audio_detected);
        (rx, detected)
    };

    // Spawn a tokio task that reads audio chunks from the test stream
    // and emits audio_level events to the frontend for the level meter.
    let app_clone = app.clone();
    tokio::spawn(async move {
        while let Some(chunk) = rx.recv().await {
            let rms = calculate_rms(&chunk.pcm_data);
            let peak = calculate_peak(&chunk.pcm_data);

            // Mark audio as detected if we get any meaningful signal
            if rms > 100.0 {
                detected_flag.store(true, Ordering::SeqCst);
            }

            let level = AudioLevel {
                source: if is_input {
                    AudioSource::Mic
                } else {
                    AudioSource::System
                },
                level: (rms / 3000.0).min(1.0),
                peak,
            };
            let _ = app_clone.emit("audio_level", &level);
        }
        log::info!("Audio test processing task exiting");
    });

    Ok(())
}

/// Stop an active audio test and return whether audio was detected.
#[command]
pub async fn stop_audio_test(app: AppHandle) -> Result<bool, String> {
    let state = app.state::<AppState>();
    let mut guard = state
        .audio
        .lock()
        .map_err(|_| "Audio state lock poisoned".to_string())?;

    match guard.as_mut() {
        Some(mgr) => Ok(mgr.stop_test()),
        None => Ok(false),
    }
}

/// Test whether a specific audio device can be opened (legacy quick check).
#[command]
pub async fn test_audio_device(device_id: String) -> Result<bool, String> {
    device_manager::test_device(&device_id)
}

/// Enable or disable audio recording to file.
#[command]
pub async fn set_recording_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut guard = state
        .audio
        .lock()
        .map_err(|_| "Audio state lock poisoned".to_string())?;

    match guard.as_mut() {
        Some(mgr) => {
            mgr.set_recording_enabled(enabled);
            Ok(())
        }
        None => {
            log::info!(
                "Recording {} (will take effect when capture starts)",
                if enabled { "enabled" } else { "disabled" }
            );
            Ok(())
        }
    }
}

/// Peak level entry returned by get_audio_peak_levels.
#[derive(serde::Serialize, Clone)]
pub struct DevicePeakLevel {
    pub device_id: String,
    pub level: f32,
}

/// Return the current peak audio level (0.0–1.0) for every active audio
/// endpoint simultaneously, without opening any capture streams.
///
/// Uses Win32 IAudioMeterInformation — the same mechanism Windows uses in
/// Sound Control Panel. Works for both input (mic) and output (speaker/loopback)
/// devices. All devices are read in one synchronous pass (~1–3 ms).
#[command]
pub async fn get_audio_peak_levels() -> Result<Vec<DevicePeakLevel>, String> {
    #[cfg(target_os = "windows")]
    {
        tokio::task::spawn_blocking(get_all_peak_levels_win)
            .await
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec![])
    }
}

#[cfg(target_os = "windows")]
fn get_all_peak_levels_win() -> Result<Vec<DevicePeakLevel>, String> {
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
    unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        // S_FALSE (0x1) means already initialized on this thread — that's fine
        if hr.is_err() && hr.0 != 1 {
            return Err(format!("COM init failed: {:?}", hr));
        }
        let results = read_all_peaks_raw();
        CoUninitialize();
        Ok(results)
    }
}

/// Read peak levels for all active audio endpoints.
/// Caller must have already called CoInitializeEx on this thread.
#[cfg(target_os = "windows")]
fn read_all_peaks_raw() -> Vec<DevicePeakLevel> {
    use windows::Win32::Media::Audio::{
        Endpoints::IAudioMeterInformation,
        IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            match CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) {
                Ok(e) => e,
                Err(_) => return vec![],
            };
        // EDataFlow::eAll = 2 — enumerate both render and capture endpoints
        let e_all = windows::Win32::Media::Audio::EDataFlow(2);
        let collection = match enumerator.EnumAudioEndpoints(e_all, DEVICE_STATE_ACTIVE) {
            Ok(c) => c,
            Err(_) => return vec![],
        };
        let count = collection.GetCount().unwrap_or(0);
        let mut results = Vec::with_capacity(count as usize);
        for i in 0..count {
            let device = match collection.Item(i) {
                Ok(d) => d,
                Err(_) => continue,
            };
            // Use the friendly name as device_id so it matches cpal's name-based IDs
            // used by the frontend device list (device_manager::enumerate_devices).
            let name = match get_device_friendly_name(&device) {
                Some(n) => n,
                None => continue,
            };
            let meter: IAudioMeterInformation = match device.Activate(CLSCTX_ALL, None) {
                Ok(m) => m,
                Err(_) => continue,
            };
            let peak = meter.GetPeakValue().unwrap_or(0.0);
            results.push(DevicePeakLevel { device_id: name, level: peak });
        }
        results
    }
}

/// Extract the friendly name from a Windows audio endpoint device,
/// matching the format that cpal uses for device names.
#[cfg(target_os = "windows")]
fn get_device_friendly_name(device: &windows::Win32::Media::Audio::IMMDevice) -> Option<String> {
    use windows::Win32::UI::Shell::PropertiesSystem::PROPERTYKEY;
    use windows::core::GUID;
    unsafe {
        // PKEY_Device_FriendlyName = {a45c254e-df1c-4efd-8020-67d146a850e0}, 14
        let pkey = PROPERTYKEY {
            fmtid: GUID::from_values(
                0xa45c254e,
                0xdf1c,
                0x4efd,
                [0x80, 0x20, 0x67, 0xd1, 0x46, 0xa8, 0x50, 0xe0],
            ),
            pid: 14,
        };
        let store = device.OpenPropertyStore(windows::Win32::System::Com::STGM(0)).ok()?;
        let prop = store.GetValue(&pkey).ok()?;
        let s = format!("{}", prop);
        if s.is_empty() || s == "VT_EMPTY" {
            return None;
        }
        Some(s)
    }
}

/// Holds a WASAPI capture client opened on an input endpoint.
/// Keeping this alive activates the audio engine's peak metering for the device.
/// Without an active capture client, IAudioMeterInformation returns 0 for input devices.
#[cfg(target_os = "windows")]
struct InputPeakActivator {
    client: windows::Win32::Media::Audio::IAudioClient,
    capture: windows::Win32::Media::Audio::IAudioCaptureClient,
}

#[cfg(target_os = "windows")]
impl InputPeakActivator {
    /// Drain any accumulated capture buffers so they don't overflow.
    unsafe fn drain(&self) {
        loop {
            let size = self.capture.GetNextPacketSize().unwrap_or(0);
            if size == 0 {
                break;
            }
            let mut buf = std::ptr::null_mut();
            let mut frames = 0u32;
            let mut flags = 0u32;
            if self.capture
                .GetBuffer(&mut buf, &mut frames, &mut flags, None, None)
                .is_ok()
            {
                let _ = self.capture.ReleaseBuffer(frames);
            } else {
                break;
            }
        }
    }
}

/// Open shared-mode WASAPI capture streams on all active input endpoints.
/// This activates the audio engine's peak metering for capture devices.
#[cfg(target_os = "windows")]
fn activate_input_peak_meters() -> Vec<InputPeakActivator> {
    use windows::Win32::Media::Audio::*;
    use windows::Win32::System::Com::*;

    let mut activators = Vec::new();
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            match CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) {
                Ok(e) => e,
                Err(_) => return vec![],
            };

        // eCapture = 1 — only input endpoints
        let collection = match enumerator.EnumAudioEndpoints(EDataFlow(1), DEVICE_STATE_ACTIVE) {
            Ok(c) => c,
            Err(_) => return vec![],
        };

        let count = collection.GetCount().unwrap_or(0);
        for i in 0..count {
            let device = match collection.Item(i) {
                Ok(d) => d,
                Err(_) => continue,
            };
            let client: IAudioClient = match device.Activate(CLSCTX_ALL, None) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let format_ptr = match client.GetMixFormat() {
                Ok(f) => f,
                Err(_) => continue,
            };

            // Initialize shared-mode with 200ms buffer
            let init_ok = client
                .Initialize(
                    AUDCLNT_SHAREMODE_SHARED,
                    0,
                    2_000_000, // 200ms in 100-nanosecond units
                    0,
                    format_ptr,
                    None,
                )
                .is_ok();
            CoTaskMemFree(Some(format_ptr as *const _));
            if !init_ok {
                continue;
            }

            let capture: IAudioCaptureClient = match client.GetService() {
                Ok(c) => c,
                Err(_) => continue,
            };
            if client.Start().is_err() {
                continue;
            }
            activators.push(InputPeakActivator { client, capture });
        }
    }
    log::info!(
        "Device monitor: activated peak metering on {} input endpoints",
        activators.len()
    );
    activators
}

/// Dedicated monitor thread: initializes COM once, reads all peak levels at ~60 fps,
/// and emits a `device_levels` Tauri event after each read.
/// Opens capture streams on input devices to activate their peak meters.
/// Exits when `stop` flips to false.
#[cfg(target_os = "windows")]
fn run_device_monitor_loop(app: tauri::AppHandle, stop: Arc<AtomicBool>) {
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
    unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        if hr.is_err() && hr.0 != 1 {
            return;
        }

        // Open capture streams on input devices to enable peak metering
        let input_activators = activate_input_peak_meters();

        while stop.load(Ordering::SeqCst) {
            // Drain capture buffers to prevent overflow
            for a in &input_activators {
                a.drain();
            }

            let levels = read_all_peaks_raw();
            if !levels.is_empty() {
                let _ = app.emit("device_levels", &levels);
            }
            std::thread::sleep(std::time::Duration::from_millis(16));
        }

        // Clean up capture streams
        for a in &input_activators {
            let _ = a.client.Stop();
        }

        CoUninitialize();
    }
}

/// Start the Live Monitor background thread.
/// Idempotent — stops any running monitor first, waits for it to exit, then starts fresh.
#[command]
pub async fn start_device_monitor(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let state = app.state::<crate::state::AppState>();

        // Signal any existing thread to stop
        state.device_monitor_running.store(false, Ordering::SeqCst);
        // Wait long enough for the old thread to see the flag (loop sleeps 16ms)
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;

        // Start fresh
        state.device_monitor_running.store(true, Ordering::SeqCst);
        let stop_flag = Arc::clone(&state.device_monitor_running);
        let app_clone = app.clone();
        std::thread::spawn(move || {
            run_device_monitor_loop(app_clone, stop_flag);
            // Don't reset the flag here — only start/stop commands manage it.
            // This prevents a race where an exiting thread resets the flag
            // after a new thread has already been started.
        });
    }
    Ok(())
}

/// Stop the Live Monitor background thread.
#[command]
pub async fn stop_device_monitor(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let state = app.state::<crate::state::AppState>();
        state.device_monitor_running.store(false, Ordering::SeqCst);
    }
    Ok(())
}

/// Enumerate active audio sessions (per-app audio awareness).
/// Returns JSON array of AudioSessionInfo.
#[command]
pub async fn get_audio_sessions() -> Result<String, String> {
    let sessions = session_monitor::enumerate_audio_sessions()?;
    serde_json::to_string(&sessions)
        .map_err(|e| format!("Failed to serialize audio sessions: {}", e))
}

/// Start per-party audio capture with independent STT pipelines.
///
/// Each party (You / Them) independently selects:
///   - An audio device (mic or output/loopback)
///   - An STT provider (web_speech, windows_native, deepgram, etc.)
///
/// If STT = "web_speech", Rust skips STT for that party (frontend handles it).
/// Audio is still captured for levels, recording, and (optionally) the other party's STT.
#[command]
pub async fn start_capture_per_party(
    app: AppHandle,
    you_config: String,
    them_config: String,
) -> Result<(), String> {
    use crate::audio::PartyAudioConfig;

    let you: PartyAudioConfig =
        serde_json::from_str(&you_config).map_err(|e| format!("Invalid you_config: {}", e))?;
    let them: PartyAudioConfig =
        serde_json::from_str(&them_config).map_err(|e| format!("Invalid them_config: {}", e))?;

    let state = app.state::<AppState>();

    // If already capturing, stop first (allows mid-meeting hot-swap)
    {
        // Restore any previous IPolicyConfig override before hot-swap
        restore_default_device_if_overridden(&state, &app);

        let mut guard = state
            .audio
            .lock()
            .map_err(|_| "Audio state lock poisoned".to_string())?;
        if let Some(ref mut mgr) = *guard {
            if mgr.is_capturing() {
                log::info!("start_capture_per_party: stopping existing capture for hot-swap");
                crate::stt::emit_stt_debug(&app, "info", "stt",
                    "Hot-swap: stopping existing audio capture + STT providers");
                mgr.stop_capture();
            }
        }
    }

    log::info!(
        "Starting per-party capture: You={{device='{}', input={}, stt={}}}, Them={{device='{}', input={}, stt={}}}",
        you.device_id,
        you.is_input_device,
        you.stt_provider,
        them.device_id,
        them.is_input_device,
        them.stt_provider
    );

    // Create the audio chunk channel
    let (tx, mut rx) = mpsc::channel::<crate::audio::AudioChunk>(256);

    // Use the existing AudioCaptureManager for the physical capture
    // Map "You" → mic device, "Them" → system device (backward compat with existing manager)
    let mic_device = if you.is_input_device {
        you.device_id.clone()
    } else {
        "default".to_string()
    };
    let system_device = if !them.is_input_device {
        them.device_id.clone()
    } else {
        "default".to_string()
    };

    {
        let mut guard = state
            .audio
            .lock()
            .map_err(|_| "Audio state lock poisoned".to_string())?;
        let mgr = guard.get_or_insert_with(AudioCaptureManager::new);
        log::info!(
            "AudioCaptureManager::start_capture mic='{}', system='{}'",
            mic_device, system_device
        );
        mgr.start_capture(&mic_device, &system_device, tx)?;
    }

    // ── IPolicyConfig: override system default mic if needed ──
    // Web Speech and Windows Speech always use the OS default recording device.
    // If the user selected a non-default device, temporarily change the system default.
    {
        let needs_override = |config: &crate::audio::PartyAudioConfig| -> bool {
            let provider = config.stt_provider.as_str();
            (provider == "web_speech" || provider == "windows_native")
                && config.is_input_device
                && config.device_id != "default"
        };

        if needs_override(&you) || needs_override(&them) {
            // Pick the device that needs the override (prefer "You" if both need it)
            let target_device = if needs_override(&you) {
                &you.device_id
            } else {
                &them.device_id
            };

            crate::stt::emit_stt_debug(&app, "info", "audio",
                &format!("IPolicyConfig: overriding default capture → '{}'", target_device));

            match crate::audio::device_default::override_default_capture_device(target_device) {
                Ok(Some(original)) => {
                    // Store original so we can restore it on stop
                    if let Ok(mut guard) = state.original_default_device.lock() {
                        *guard = Some(original.clone());
                    }
                    crate::stt::emit_stt_debug(&app, "info", "audio",
                        &format!("IPolicyConfig: saved original default '{}', override active", original));
                }
                Ok(None) => {
                    // Target was already the default — no override applied
                    crate::stt::emit_stt_debug(&app, "info", "audio",
                        "IPolicyConfig: selected device is already the default — no override needed");
                }
                Err(e) => {
                    crate::stt::emit_stt_debug(&app, "warn", "audio",
                        &format!("IPolicyConfig: override failed ({}). STT will use OS default mic.", e));
                }
            }
        }
    }

    // ── Create STT provider for "You" party (if not web_speech) ──
    let you_stt = create_stt_provider_for_party(&you, &state, &app, "You").await?;

    // ── Create STT provider for "Them" party (if not web_speech) ──
    let them_stt = create_stt_provider_for_party(&them, &state, &app, "Them").await?;

    // Start STT streams
    let (you_stt_tx, mut you_stt_rx) =
        mpsc::channel::<crate::stt::provider::TranscriptResult>(256);
    let (them_stt_tx, mut them_stt_rx) =
        mpsc::channel::<crate::stt::provider::TranscriptResult>(256);

    let mut you_stt_provider = you_stt;
    let mut them_stt_provider = them_stt;

    if let Some(ref mut provider) = you_stt_provider {
        crate::stt::emit_stt_debug(&app, "info", "stt",
            &format!("Starting 'You' STT ({})", you.stt_provider));
        match provider.start_stream(you_stt_tx).await {
            Ok(()) => {
                log::info!("'You' party STT started ({})", you.stt_provider);
                crate::stt::emit_stt_debug(&app, "info", "stt",
                    &format!("'You' STT started: {}", you.stt_provider));
            }
            Err(e) => {
                log::warn!("Failed to start 'You' STT: {}", e);
                crate::stt::emit_stt_debug(&app, "error", "stt",
                    &format!("'You' STT failed to start: {}", e));
                let _ = app.emit("stt_connection_status", serde_json::json!({
                    "provider": you.stt_provider,
                    "party": "You",
                    "status": "error",
                    "message": format!("Failed to start STT: {}", e)
                }));
                you_stt_provider = None;
            }
        }
    }

    if let Some(ref mut provider) = them_stt_provider {
        crate::stt::emit_stt_debug(&app, "info", "stt",
            &format!("Starting 'Them' STT ({})", them.stt_provider));
        match provider.start_stream(them_stt_tx).await {
            Ok(()) => {
                log::info!("'Them' party STT started ({})", them.stt_provider);
                crate::stt::emit_stt_debug(&app, "info", "stt",
                    &format!("'Them' STT started: {}", them.stt_provider));
            }
            Err(e) => {
                log::warn!("Failed to start 'Them' STT: {}", e);
                crate::stt::emit_stt_debug(&app, "error", "stt",
                    &format!("'Them' STT failed to start: {}", e));
                let _ = app.emit("stt_connection_status", serde_json::json!({
                    "provider": them.stt_provider,
                    "party": "Them",
                    "status": "error",
                    "message": format!("Failed to start STT: {}", e)
                }));
                them_stt_provider = None;
            }
        }
    }

    // Unique session prefix to avoid segment ID collisions across mid-meeting restarts.
    // Each restart of start_capture_per_party gets a distinct prefix, so segment IDs
    // like "you_a3_1" won't collide with "you_b7_1" from a previous session.
    let session_prefix = format!("{:x}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() % 0xFFFF);

    // Emit transcript events from "You" STT (speaker = "User")
    // If the provider supplies segment_id (dual-pass whisper.cpp), use it directly.
    // Otherwise, use the legacy counter-based scheme.
    if you_stt_provider.is_some() {
        let stt_app = app.clone();
        let prefix = session_prefix.clone();
        tokio::spawn(async move {
            let mut counter = 0u64;
            while let Some(result) = you_stt_rx.recv().await {
                let seg_id = if let Some(ref custom_id) = result.segment_id {
                    format!("you_{}_{}", prefix, custom_id)
                } else {
                    if result.is_final {
                        counter += 1;
                    }
                    if result.is_final {
                        format!("you_{}_{}", prefix, counter)
                    } else {
                        format!("you_{}_{}", prefix, counter + 1)
                    }
                };
                let event_name = if result.is_final {
                    "transcript_final"
                } else {
                    "transcript_update"
                };
                let payload = serde_json::json!({
                    "segment": {
                        "id": seg_id,
                        "text": result.text,
                        "speaker": "User",
                        "timestamp_ms": result.timestamp_ms,
                        "is_final": result.is_final,
                        "confidence": result.confidence
                    }
                });
                let _ = stt_app.emit(event_name, &payload);
            }
        });
    }

    // Emit transcript events from "Them" STT (speaker = "Them")
    if them_stt_provider.is_some() {
        let stt_app = app.clone();
        let prefix = session_prefix.clone();
        tokio::spawn(async move {
            let mut counter = 0u64;
            while let Some(result) = them_stt_rx.recv().await {
                let seg_id = if let Some(ref custom_id) = result.segment_id {
                    format!("them_{}_{}", prefix, custom_id)
                } else {
                    if result.is_final {
                        counter += 1;
                    }
                    if result.is_final {
                        format!("them_{}_{}", prefix, counter)
                    } else {
                        format!("them_{}_{}", prefix, counter + 1)
                    }
                };
                let event_name = if result.is_final {
                    "transcript_final"
                } else {
                    "transcript_update"
                };
                let payload = serde_json::json!({
                    "segment": {
                        "id": seg_id,
                        "text": result.text,
                        "speaker": "Them",
                        "timestamp_ms": result.timestamp_ms,
                        "is_final": result.is_final,
                        "confidence": result.confidence
                    }
                });
                let _ = stt_app.emit(event_name, &payload);
            }
        });
    }

    // Grab recorder handle
    let recorder = {
        let guard = state.audio.lock().map_err(|_| "lock poisoned".to_string())?;
        guard.as_ref().and_then(|mgr| mgr.get_recorder())
    };

    // Grab mute flags so the audio loop can check them lock-free
    let you_muted_flag = state.you_muted.clone();
    let them_muted_flag = state.them_muted.clone();

    // Audio processing task: levels + recording + STT feed per party
    let app_handle = app.clone();
    tokio::spawn(async move {
        // Separate VAD instances per audio source — sharing one VAD across
        // interleaved mic + system chunks corrupts smoothed_energy state.
        let mut mic_vad = VoiceActivityDetector::new();
        let mut sys_vad = VoiceActivityDetector::new();
        let mut mic_emit_ctr: u32 = 0;
        let mut sys_emit_ctr: u32 = 0;
        let mut mic_chunk_count: u64 = 0;
        let mut system_chunk_count: u64 = 0;

        // Time-based stats — emit only every 120s to reduce dev log noise
        let mut last_mic_stats = std::time::Instant::now();
        let mut last_sys_stats = std::time::Instant::now();
        let stats_interval = std::time::Duration::from_secs(120);

        // Track feed_audio errors per provider (emit once, not every chunk)
        let mut you_feed_error_emitted = false;
        let mut them_feed_error_emitted = false;

        while let Some(mut chunk) = rx.recv().await {
            // Apply VAD from the correct per-source instance
            let vad_result = match chunk.source {
                AudioSource::Mic => mic_vad.process_chunk(&chunk.pcm_data),
                AudioSource::System => sys_vad.process_chunk(&chunk.pcm_data),
            };
            chunk.is_speech = vad_result.is_speech;

            // Track chunk counts for diagnostics (time-based stats)
            match chunk.source {
                AudioSource::Mic => {
                    mic_chunk_count += 1;
                    if mic_chunk_count == 1 {
                        log::info!("First mic audio chunk received");
                        crate::stt::emit_stt_debug(&app_handle, "info", "audio",
                            "First mic chunk received — audio pipeline active");
                    }
                    if last_mic_stats.elapsed() >= stats_interval {
                        let rms = calculate_rms(&chunk.pcm_data);
                        crate::stt::emit_stt_debug_ex(&app_handle, "info", "audio",
                            &format!("Mic: {} chunks, speech={}, rms={:.0}", mic_chunk_count, chunk.is_speech, rms),
                            Some("audio_mic_stats"));
                        last_mic_stats = std::time::Instant::now();
                    }
                }
                AudioSource::System => {
                    system_chunk_count += 1;
                    if system_chunk_count == 1 {
                        log::info!("First system audio chunk received — 'Them' capture is active");
                        crate::stt::emit_stt_debug(&app_handle, "info", "audio",
                            "First system chunk received — system audio capture active");
                    }
                    if last_sys_stats.elapsed() >= stats_interval {
                        let rms = calculate_rms(&chunk.pcm_data);
                        crate::stt::emit_stt_debug_ex(&app_handle, "info", "audio",
                            &format!("System: {} chunks, speech={}, rms={:.0}", system_chunk_count, chunk.is_speech, rms),
                            Some("audio_sys_stats"));
                        last_sys_stats = std::time::Instant::now();
                    }
                }
            }

            // Emit audio levels — separate counters per source for independent update rates
            let should_emit = match chunk.source {
                AudioSource::Mic => {
                    mic_emit_ctr += 1;
                    mic_emit_ctr % 3 == 0
                }
                AudioSource::System => {
                    sys_emit_ctr += 1;
                    sys_emit_ctr % 3 == 0
                }
            };
            if should_emit {
                let rms = calculate_rms(&chunk.pcm_data);
                let peak = calculate_peak(&chunk.pcm_data);
                let level = AudioLevel {
                    source: chunk.source.clone(),
                    level: (rms / 3000.0).min(1.0),
                    peak,
                };
                let _ = app_handle.emit("audio_level", &level);
            }

            // Write to WAV recorder
            if let Some(ref rec) = recorder {
                rec.write_samples(&chunk.pcm_data);
            }

            // Route to the correct party's STT provider (surface errors once).
            // Mute gate: when a party is muted, skip feed_audio entirely —
            // audio levels + recording still flow, only STT is silenced.
            match chunk.source {
                AudioSource::Mic => {
                    if !you_muted_flag.load(Ordering::Relaxed) {
                        if let Some(ref mut provider) = you_stt_provider {
                            if let Err(e) = provider.feed_audio(chunk).await {
                                if !you_feed_error_emitted {
                                    crate::stt::emit_stt_debug(&app_handle, "error", "stt",
                                        &format!("'You' feed_audio error: {}", e));
                                    you_feed_error_emitted = true;
                                }
                            }
                        }
                    }
                }
                AudioSource::System => {
                    if !them_muted_flag.load(Ordering::Relaxed) {
                        if let Some(ref mut provider) = them_stt_provider {
                            if let Err(e) = provider.feed_audio(chunk).await {
                                if !them_feed_error_emitted {
                                    crate::stt::emit_stt_debug(&app_handle, "error", "stt",
                                        &format!("'Them' feed_audio error: {}", e));
                                    them_feed_error_emitted = true;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Clean shutdown
        if let Some(ref mut provider) = you_stt_provider {
            let _ = provider.stop_stream().await;
        }
        if let Some(ref mut provider) = them_stt_provider {
            let _ = provider.stop_stream().await;
        }

        // Restore IPolicyConfig override if active (crash recovery for async task exit)
        {
            let original = app_handle
                .try_state::<AppState>()
                .and_then(|s| s.original_default_device.lock().ok()?.take());
            if let Some(ref original_id) = original {
                let _ = crate::audio::device_default::restore_default_capture_device(original_id);
                log::info!("IPolicyConfig: restored default device on audio task exit");
            }
        }

        log::info!("Per-party audio processing task exiting");
    });

    log::info!("Per-party audio capture started");
    Ok(())
}

/// Create an STT provider for a party based on their config.
/// Returns None if the party uses web_speech (frontend-only).
///
/// API keys are read directly from the credential store (not the STTRouter)
/// because per-party mode never calls set_stt_provider(), so the router's
/// cached keys are always None.
async fn create_stt_provider_for_party(
    config: &crate::audio::PartyAudioConfig,
    state: &AppState,
    app: &AppHandle,
    party_role: &str,
) -> Result<Option<Box<dyn STTProvider>>, String> {
    use crate::stt::provider::STTProviderType;

    let stt_type = STTProviderType::from_str(&config.stt_provider)
        .ok_or_else(|| format!("Unknown STT provider: {}", config.stt_provider))?;

    crate::stt::emit_stt_debug(app, "info", "stt",
        &format!("[{}] Creating provider: {} (model: {})",
            party_role, config.stt_provider,
            config.local_model_id.as_deref().unwrap_or("n/a")));

    match stt_type {
        STTProviderType::WebSpeech => Ok(None), // Frontend handles this
        STTProviderType::WhisperCpp => {
            let model_id = config.local_model_id.as_deref().unwrap_or("base");
            let model_result = get_local_model_path(state, "whisper_cpp", model_id)
                .or_else(|_| find_any_downloaded_model(state, "whisper_cpp"));
            match model_result {
                Ok(model_path) => {
                    let lang = get_stt_language(state);
                    let whisper_config = state.whisper_config.clone();
                    let mut p = crate::stt::whisper_cpp::WhisperCppSTT::new(model_path, whisper_config);
                    p.set_language(&lang);
                    Ok(Some(Box::new(p)))
                }
                Err(e) => {
                    log::warn!(
                        "WhisperCpp: {} — no transcription for this party. \
                         Download the model in Settings.",
                        e
                    );
                    Ok(None)
                }
            }
        }
        STTProviderType::WindowsNative => {
            use crate::stt::windows_native::WindowsNativeSTT;
            let mut provider = if config.is_input_device {
                WindowsNativeSTT::for_mic()
            } else {
                WindowsNativeSTT::for_custom_stream()
            };
            provider.set_app_handle(app.clone());
            provider.set_party(party_role);
            Ok(Some(Box::new(provider)))
        }
        STTProviderType::Deepgram => {
            let lang = get_stt_language(state);
            let key = get_credential_key(state, "deepgram");
            log::info!("Deepgram key for '{}': {}", party_role, if key.is_some() { "present" } else { "MISSING" });
            let dg_config = get_deepgram_config(state);
            let mut p = match key.as_deref() {
                Some(k) => crate::stt::deepgram::DeepgramSTT::with_api_key(k),
                None => crate::stt::deepgram::DeepgramSTT::new(),
            };
            p.set_language(&lang);
            p.set_config(dg_config);
            p.set_app_handle(app.clone());
            p.set_party(party_role);
            Ok(Some(Box::new(p)))
        }
        STTProviderType::WhisperApi => {
            let lang = get_stt_language(state);
            let key = get_credential_key(state, "whisper_api");
            log::info!("WhisperApi key for '{}': {}", party_role, if key.is_some() { "present" } else { "MISSING" });
            let mut p = match key.as_deref() {
                Some(k) => crate::stt::whisper_api::WhisperApiSTT::with_api_key(k),
                None => crate::stt::whisper_api::WhisperApiSTT::new(),
            };
            p.set_language(&lang);
            Ok(Some(Box::new(p)))
        }
        STTProviderType::AzureSpeech => {
            let lang = get_stt_language(state);
            let key = get_credential_key(state, "azure_speech");
            let region = get_credential_key(state, "azure_speech_region");
            log::info!("Azure key for '{}': {}, region: {}", party_role,
                if key.is_some() { "present" } else { "MISSING" },
                if region.is_some() { "present" } else { "MISSING" });
            let mut p = match (key.as_deref(), region.as_deref()) {
                (Some(k), Some(r)) => crate::stt::azure_speech::AzureSpeechSTT::with_config(k, r),
                _ => crate::stt::azure_speech::AzureSpeechSTT::new(),
            };
            p.set_language(&lang);
            Ok(Some(Box::new(p)))
        }
        STTProviderType::GroqWhisper => {
            let lang = get_stt_language(state);
            let key = get_credential_key(state, "groq_whisper");
            log::info!("Groq key for '{}': {}", party_role, if key.is_some() { "present" } else { "MISSING" });
            let mut p = match key.as_deref() {
                Some(k) => crate::stt::groq_whisper::GroqWhisperSTT::with_api_key(k),
                None => crate::stt::groq_whisper::GroqWhisperSTT::new(),
            };
            p.set_language(&lang);
            // Use shared config Arc — provider reads latest config on each API call,
            // so settings changes take effect immediately without restarting
            p.set_shared_config(state.shared_groq_config.clone());
            p.set_app_handle(app.clone());
            p.set_party(party_role);
            Ok(Some(Box::new(p)))
        }
        STTProviderType::SherpaOnnx => {
            // Sherpa-ONNX now uses in-process ORT engine (same as ORT Streaming).
            // No separate sidecar binary needed — just the model files.
            let model_id = config.local_model_id.as_deref().unwrap_or("streaming-zipformer-en-20M");
            let model_result = get_local_model_path(state, "sherpa_onnx", model_id);
            match model_result {
                Ok(model_dir) => {
                    let lang = get_stt_language(state);
                    crate::stt::emit_stt_debug(app, "info", "stt",
                        &format!("[{}] SherpaOnnx loading model '{}' from {} (lang={})",
                            party_role, model_id, model_dir.display(), lang));
                    let mut p = crate::stt::ort_streaming::OrtStreamingSTT::new(model_dir);
                    p.set_language(&lang);
                    p.set_app_handle(app.clone());
                    Ok(Some(Box::new(p)))
                }
                Err(e) => {
                    crate::stt::emit_stt_debug(app, "error", "stt",
                        &format!("[{}] SherpaOnnx model '{}' not found: {}. Download in Settings.",
                            party_role, model_id, e));
                    Ok(None)
                }
            }
        }
        STTProviderType::OrtStreaming => {
            let model_id = config.local_model_id.as_deref().unwrap_or("zipformer-en-20M");
            let model_result = get_local_model_path(state, "ort_streaming", model_id);
            match model_result {
                Ok(model_dir) => {
                    let lang = get_stt_language(state);
                    crate::stt::emit_stt_debug(app, "info", "stt",
                        &format!("[{}] ORT loading model '{}' from {} (lang={})",
                            party_role, model_id, model_dir.display(), lang));
                    let mut p = crate::stt::ort_streaming::OrtStreamingSTT::new(model_dir);
                    p.set_language(&lang);
                    p.set_app_handle(app.clone());
                    Ok(Some(Box::new(p)))
                }
                Err(e) => {
                    crate::stt::emit_stt_debug(app, "error", "stt",
                        &format!("[{}] ORT model '{}' not found: {}. Download in Settings.",
                            party_role, model_id, e));
                    Ok(None)
                }
            }
        }
        STTProviderType::ParakeetTdt => {
            let model_id = config.local_model_id.as_deref().unwrap_or("parakeet-tdt-0.6b-int8");
            let model_result = get_local_model_path(state, "parakeet_tdt", model_id);
            match model_result {
                Ok(model_dir) => {
                    let lang = get_stt_language(state);
                    crate::stt::emit_stt_debug(app, "info", "stt",
                        &format!("[{}] Parakeet TDT loading model '{}' from {} (lang={})",
                            party_role, model_id, model_dir.display(), lang));
                    // Parakeet TDT uses the same ORT infrastructure as ort_streaming
                    let mut p = crate::stt::ort_streaming::OrtStreamingSTT::new(model_dir);
                    p.set_language(&lang);
                    p.set_app_handle(app.clone());
                    Ok(Some(Box::new(p)))
                }
                Err(e) => {
                    crate::stt::emit_stt_debug(app, "error", "stt",
                        &format!("[{}] Parakeet model '{}' not found: {}. Download in Settings.",
                            party_role, model_id, e));
                    Ok(None)
                }
            }
        }
    }
}

/// Find any downloaded model for an engine (fallback when requested model isn't available).
fn find_any_downloaded_model(
    state: &AppState,
    engine: &str,
) -> Result<std::path::PathBuf, String> {
    let model_mgr = state
        .model_manager
        .as_ref()
        .ok_or("Model manager not initialized")?;
    let mgr = model_mgr
        .lock()
        .map_err(|_| "Model manager lock poisoned".to_string())?;
    let engines = mgr.list_engines_with_status();
    for eng in &engines {
        if eng.engine == engine {
            for m in &eng.models {
                if m.is_downloaded {
                    if let Some(path) = mgr.get_model_path(engine, m.definition.model_id) {
                        log::info!(
                            "WhisperCpp: using fallback model '{}' (requested model unavailable)",
                            m.definition.model_id
                        );
                        return Ok(path);
                    }
                }
            }
        }
    }
    Err(format!("No {} models downloaded", engine))
}

/// Get the model path for a local STT engine from the ModelManager.
fn get_local_model_path(
    state: &AppState,
    engine: &str,
    model_id: &str,
) -> Result<std::path::PathBuf, String> {
    let model_mgr = state
        .model_manager
        .as_ref()
        .ok_or("Model manager not initialized")?;
    let mgr = model_mgr
        .lock()
        .map_err(|_| "Model manager lock poisoned".to_string())?;
    mgr.get_model_path(engine, model_id)
        .ok_or_else(|| format!("Model {}:{} not downloaded", engine, model_id))
}

/// Get the current STT language from the router.
fn get_stt_language(state: &AppState) -> String {
    state
        .stt
        .as_ref()
        .and_then(|stt| stt.lock().ok().map(|r| r.language.clone()))
        .unwrap_or_else(|| "en-US".to_string())
}

/// Read an API key directly from the credential store (Windows Credential Manager).
/// This bypasses the STTRouter, which only has keys when set_stt_provider() was called.
/// Per-party mode never calls set_stt_provider(), so we read credentials directly.
fn get_credential_key(state: &AppState, provider: &str) -> Option<String> {
    state.credentials.as_ref()
        .and_then(|cred_arc| cred_arc.lock().ok())
        .and_then(|cred| cred.get_key(provider).ok().flatten())
}

/// Get the current Deepgram config from the STT router.
fn get_deepgram_config(state: &AppState) -> crate::stt::deepgram::DeepgramConfig {
    state
        .stt
        .as_ref()
        .and_then(|stt| stt.lock().ok().map(|r| r.deepgram_config.clone()))
        .unwrap_or_default()
}

// ── IPolicyConfig restore helper ────────────────────────────────────

/// Restore the original default capture device if an IPolicyConfig override is active.
/// Safe to call even if no override was applied (no-op in that case).
/// Uses `take()` to atomically remove the stored value, preventing TOCTOU races
/// where a concurrent hot-swap could lose a newly-stored override.
fn restore_default_device_if_overridden(state: &AppState, app: &tauri::AppHandle) {
    // Atomically take the value — if another thread races, only one gets Some
    let original = match state.original_default_device.lock() {
        Ok(mut guard) => guard.take(),
        Err(_) => return,
    };

    if let Some(ref original_id) = original {
        crate::stt::emit_stt_debug(app, "info", "audio",
            &format!("IPolicyConfig: restoring default capture → '{}'", original_id));

        match crate::audio::device_default::restore_default_capture_device(original_id) {
            Ok(()) => {
                crate::stt::emit_stt_debug(app, "info", "audio",
                    "IPolicyConfig: default capture device restored");
            }
            Err(e) => {
                crate::stt::emit_stt_debug(app, "error", "audio",
                    &format!("IPolicyConfig: restore failed: {}", e));
            }
        }
    }
}

// ── Per-party mute control ──────────────────────────────────────────

/// Mute or unmute a specific audio source.
/// When muted, audio is still captured (levels + recording) but NOT forwarded to STT.
///
/// `source` must be "you" or "them".
#[command]
pub async fn set_source_muted(
    app: AppHandle,
    source: String,
    muted: bool,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    match source.as_str() {
        "you" => {
            state.you_muted.store(muted, Ordering::Relaxed);
            log::info!("'You' audio source {}", if muted { "muted" } else { "unmuted" });
        }
        "them" => {
            state.them_muted.store(muted, Ordering::Relaxed);
            log::info!("'Them' audio source {}", if muted { "muted" } else { "unmuted" });
        }
        _ => return Err(format!("Unknown source: '{}' (expected 'you' or 'them')", source)),
    }
    Ok(())
}

/// Get the current mute status for both sources.
#[command]
pub async fn get_mute_status(app: AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    let status = serde_json::json!({
        "you": state.you_muted.load(Ordering::Relaxed),
        "them": state.them_muted.load(Ordering::Relaxed),
    });
    serde_json::to_string(&status).map_err(|e| format!("Failed to serialize: {}", e))
}

