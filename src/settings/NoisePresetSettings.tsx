// Noise preset settings — radio-style selection for in-person meeting audio environments.

import { useConfigStore } from "../stores/configStore";
import { NOISE_PRESETS } from "../lib/scenarios";

const PRESET_ICONS: Record<string, string> = {
  quiet_office: "🏢",
  classroom: "🎓",
  conference_hall: "🏛️",
  cafe: "☕",
};

export function NoisePresetSettings() {
  const noisePreset = useConfigStore((s) => s.noisePreset);
  const setNoisePreset = useConfigStore((s) => s.setNoisePreset);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-foreground">Noise Environment</label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Primarily affects in-person meetings
        </p>
      </div>

      <div className="space-y-2">
        {/* "None" option */}
        <button
          onClick={() => setNoisePreset(null)}
          className={`group w-full rounded-xl border px-4 py-3 text-left transition-all duration-150 cursor-pointer ${
            noisePreset === null
              ? "border-primary/50 bg-primary/5 shadow-sm shadow-primary/10"
              : "border-border/30 bg-card/40 hover:border-border/60 hover:bg-accent/20"
          }`}
        >
          <div className="flex items-center gap-3">
            {/* Radio circle */}
            <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150 ${
              noisePreset === null
                ? "border-primary"
                : "border-border/50 group-hover:border-border"
            }`}>
              {noisePreset === null && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <div>
              <p className={`text-xs font-medium transition-colors duration-150 ${
                noisePreset === null ? "text-primary" : "text-foreground"
              }`}>
                Default
              </p>
              <p className="mt-0.5 text-meta text-muted-foreground/60">
                No noise filtering — use provider defaults
              </p>
            </div>
          </div>
        </button>

        {NOISE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => setNoisePreset(preset.id)}
            className={`group w-full rounded-xl border px-4 py-3 text-left transition-all duration-150 cursor-pointer ${
              noisePreset === preset.id
                ? "border-primary/50 bg-primary/5 shadow-sm shadow-primary/10"
                : "border-border/30 bg-card/40 hover:border-border/60 hover:bg-accent/20"
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Radio circle */}
              <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150 ${
                noisePreset === preset.id
                  ? "border-primary"
                  : "border-border/50 group-hover:border-border"
              }`}>
                {noisePreset === preset.id && (
                  <div className="h-2 w-2 rounded-full bg-primary" />
                )}
              </div>
              {/* Icon */}
              <span className="text-base leading-none" aria-hidden="true">
                {PRESET_ICONS[preset.id] ?? "🎙️"}
              </span>
              {/* Text */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`text-xs font-medium transition-colors duration-150 ${
                    noisePreset === preset.id ? "text-primary" : "text-foreground"
                  }`}>
                    {preset.name}
                  </p>
                  <span className="text-meta text-muted-foreground/40 tabular-nums">
                    VAD {Math.round(preset.vad_sensitivity * 100)}% · Gate {preset.noise_gate_db} dB
                  </span>
                </div>
                <p className="mt-0.5 text-meta text-muted-foreground/60">
                  {preset.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
