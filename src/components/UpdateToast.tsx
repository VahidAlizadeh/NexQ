import { Download, CheckCircle, RotateCcw } from "lucide-react";

// == Download progress toast ================================================

interface DownloadToastProps {
  version: string;
  downloadedBytes: number;
  totalBytes: number | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateDownloadToast({
  version,
  downloadedBytes,
  totalBytes,
}: DownloadToastProps) {
  const pct =
    totalBytes && totalBytes > 0
      ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
      : null;

  const sizeLabel = totalBytes
    ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
    : formatBytes(downloadedBytes);

  return (
    <div
      role="status"
      aria-live="polite"
      className="min-w-[300px] rounded-xl border border-border/20 bg-card/90 px-4 py-3 shadow-lg backdrop-blur-md"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
          <Download className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground/90">
            Downloading v{version}
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground">{sizeLabel}</span>
            {pct !== null && (
              <span className="text-xs font-medium text-amber-400">
                {pct}%
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted/40">
            <div
              className="h-full rounded-full bg-amber-400/70 transition-all duration-300 ease-out"
              style={{ width: pct !== null ? `${pct}%` : "30%" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// == Update ready toast =====================================================

interface ReadyToastProps {
  version: string;
  onRestart: () => void;
}

export function UpdateReadyToast({ version, onRestart }: ReadyToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-w-[300px] rounded-xl border border-border/20 bg-card/90 px-4 py-3 shadow-lg backdrop-blur-md"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
          <CheckCircle className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground/90">
            Update ready
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            v{version} will apply on restart
          </p>
        </div>

        {/* Restart button */}
        <button
          onClick={onRestart}
          className="shrink-0 flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25"
        >
          <RotateCcw className="h-3 w-3" />
          Restart
        </button>
      </div>
    </div>
  );
}
