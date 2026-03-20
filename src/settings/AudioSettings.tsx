// Sub-PRD 3: Audio device selection, level meters, recording toggle

import { useEffect, useState } from "react";
import { useConfigStore } from "../stores/configStore";
import { useAudioLevel } from "../hooks/useAudioLevel";
import {
  listAudioDevices,
  startAudioTest,
  stopAudioTest,
  setRecordingEnabled,
} from "../lib/ipc";
import { showToast } from "../stores/toastStore";
import type { AudioDevice, AudioDeviceList } from "../lib/types";

export function AudioSettings() {
  const {
    micDeviceId,
    systemDeviceId,
    recordingEnabled,
    setMicDeviceId,
    setSystemDeviceId,
    setRecordingEnabled: setRecordingEnabledStore,
  } = useConfigStore();

  const { micLevel, systemLevel, micPeak, systemPeak } = useAudioLevel();

  const [devices, setDevices] = useState<AudioDeviceList>({
    inputs: [],
    outputs: [],
  });
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [testingDevice, setTestingDevice] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    deviceId: string;
    success: boolean;
  } | null>(null);

  // Load devices on mount
  useEffect(() => {
    loadDevices();
  }, []);

  async function loadDevices() {
    setLoadingDevices(true);
    try {
      const deviceList = await listAudioDevices();
      setDevices(deviceList);

      // Auto-select default devices if none selected
      if (!micDeviceId) {
        const defaultInput = deviceList.inputs.find((d) => d.is_default);
        if (defaultInput) {
          setMicDeviceId(defaultInput.id);
        }
      }
      if (!systemDeviceId) {
        const defaultOutput = deviceList.outputs.find((d) => d.is_default);
        if (defaultOutput) {
          setSystemDeviceId(defaultOutput.id);
        }
      }
    } catch (err) {
      console.error("Failed to load audio devices:", err);
    } finally {
      setLoadingDevices(false);
    }
  }

  async function handleTestDevice(deviceId: string, isInput: boolean) {
    setTestingDevice(deviceId);
    setTestResult(null);
    try {
      // Start real audio capture test — this emits audio_level events
      await startAudioTest(deviceId, isInput);

      // Let it capture for 3 seconds so the user sees the level meter
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Stop test and get whether audio was detected
      const detected = await stopAudioTest();
      setTestResult({ deviceId, success: detected });
    } catch (err) {
      console.error("Audio test failed:", err);
      setTestResult({ deviceId, success: false });
    } finally {
      setTestingDevice(null);
    }
  }

  async function handleRecordingToggle(enabled: boolean) {
    setRecordingEnabledStore(enabled);
    try {
      await setRecordingEnabled(enabled);
      showToast(
        enabled ? "Audio recording enabled" : "Audio recording disabled",
        "success"
      );
    } catch (err) {
      console.error("Failed to set recording:", err);
      showToast("Failed to toggle recording", "error");
    }
  }

  return (
    <div className="space-y-6">
      {/* Microphone Device */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Microphone</label>
        <div className="flex gap-2">
          <select
            value={micDeviceId || ""}
            onChange={(e) => setMicDeviceId(e.target.value || null)}
            disabled={loadingDevices}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">
              {loadingDevices ? "Loading..." : "Select microphone"}
            </option>
            {devices.inputs.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
                {device.is_default ? " (Default)" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() => micDeviceId && handleTestDevice(micDeviceId, true)}
            disabled={!micDeviceId || testingDevice !== null}
            className="rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {testingDevice === micDeviceId ? "Testing..." : "Test"}
          </button>
        </div>

        {/* Mic Level Meter */}
        <AudioLevelMeter
          level={micLevel}
          peak={micPeak}
          label="Mic"
        />

        {testingDevice === micDeviceId && (
          <p className="text-xs text-blue-400">
            Speak into your microphone...
          </p>
        )}
        {testResult && testResult.deviceId === micDeviceId && !testingDevice && (
          <p
            className={`text-xs ${testResult.success ? "text-green-500" : "text-yellow-500"}`}
          >
            {testResult.success
              ? "Audio detected — device is working"
              : "No audio detected — try speaking louder or check your mic"}
          </p>
        )}
      </div>

      {/* System Audio Device */}
      <div className="space-y-2">
        <label className="text-sm font-medium">System Audio (Output)</label>
        <div className="flex gap-2">
          <select
            value={systemDeviceId || ""}
            onChange={(e) => setSystemDeviceId(e.target.value || null)}
            disabled={loadingDevices}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">
              {loadingDevices ? "Loading..." : "Select output device"}
            </option>
            {devices.outputs.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
                {device.is_default ? " (Default)" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              systemDeviceId && handleTestDevice(systemDeviceId, false)
            }
            disabled={!systemDeviceId || testingDevice !== null}
            className="rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {testingDevice === systemDeviceId ? "Testing..." : "Test"}
          </button>
        </div>

        {/* System Level Meter */}
        <AudioLevelMeter
          level={systemLevel}
          peak={systemPeak}
          label="System"
        />

        {testingDevice === systemDeviceId && (
          <p className="text-xs text-blue-400">
            Play some audio on your computer...
          </p>
        )}
        {testResult && testResult.deviceId === systemDeviceId && !testingDevice && (
          <p
            className={`text-xs ${testResult.success ? "text-green-500" : "text-yellow-500"}`}
          >
            {testResult.success
              ? "Audio detected — device is working"
              : "No audio detected — try playing something on your speakers"}
          </p>
        )}
      </div>

      {/* Refresh Devices */}
      <button
        onClick={loadDevices}
        disabled={loadingDevices}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        {loadingDevices ? "Refreshing..." : "Refresh devices"}
      </button>

      {/* Recording Toggle */}
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">Record audio to file</p>
          <p className="text-xs text-muted-foreground">
            Save meeting audio as WAV for later review
          </p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={recordingEnabled}
            onChange={(e) => handleRecordingToggle(e.target.checked)}
            className="peer sr-only"
          />
          <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full"></div>
        </label>
      </div>
    </div>
  );
}

/**
 * Horizontal audio level meter with green/yellow/red zones.
 */
function AudioLevelMeter({
  level,
  peak,
  label,
}: {
  level: number;
  peak: number;
  label: string;
}) {
  // Clamp values to 0-1
  const clampedLevel = Math.min(Math.max(level, 0), 1);
  const clampedPeak = Math.min(Math.max(peak, 0), 1);

  // Determine color based on level
  const getBarColor = () => {
    if (clampedLevel > 0.8) return "bg-red-500";
    if (clampedLevel > 0.5) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-xs text-muted-foreground">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
        {/* Level bar */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-75 ${getBarColor()}`}
          style={{ width: `${clampedLevel * 100}%` }}
        />
        {/* Peak indicator */}
        {clampedPeak > 0.01 && (
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground/60"
            style={{ left: `${clampedPeak * 100}%` }}
          />
        )}
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
        {Math.round(clampedLevel * 100)}
      </span>
    </div>
  );
}
