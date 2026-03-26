import { useMemo } from "react";
import { Download, ArrowRight, X } from "lucide-react";

interface UpdateDialogProps {
  currentVersion: string;
  newVersion: string;
  changelog: string | null;
  onUpdate: () => void;
  onLater: () => void;
  onSkip: () => void;
}

/** Tag color per changelog section heading */
const sectionTagStyles: Record<string, string> = {
  features: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "bug fixes": "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  fixes: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  improvements: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  performance: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  breaking: "bg-red-500/15 text-red-400 border-red-500/20",
};

interface ChangelogSection {
  heading: string;
  items: string[];
}

function parseChangelog(raw: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  let current: ChangelogSection | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();

    // Match markdown heading: ### Features, ### Bug Fixes, etc.
    const headingMatch = trimmed.match(/^###\s+(.+)$/);
    if (headingMatch) {
      current = { heading: headingMatch[1].trim(), items: [] };
      sections.push(current);
      continue;
    }

    // Match bullet items: * item or - item
    const itemMatch = trimmed.match(/^[*-]\s+(.+)$/);
    if (itemMatch && current) {
      current.items.push(itemMatch[1].trim());
    }
  }

  return sections.filter((s) => s.items.length > 0);
}

function getTagStyle(heading: string): string {
  const key = heading.toLowerCase();
  return sectionTagStyles[key] ?? "bg-muted/50 text-muted-foreground border-border/30";
}

export function UpdateDialog({
  currentVersion,
  newVersion,
  changelog,
  onUpdate,
  onLater,
  onSkip,
}: UpdateDialogProps) {
  const sections = useMemo(
    () => (changelog ? parseChangelog(changelog) : []),
    [changelog],
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* Card */}
      <div className="w-[420px] rounded-2xl border border-border/30 bg-card shadow-2xl">
        {/* Close button */}
        <div className="flex justify-end px-4 pt-3">
          <button
            onClick={onLater}
            className="rounded-lg p-1 text-muted-foreground/40 transition-colors hover:bg-accent hover:text-muted-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Hero section */}
        <div className="flex flex-col items-center px-6 pb-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Download className="h-6 w-6 text-primary" />
          </div>

          <h2 className="mt-4 text-base font-semibold text-foreground">
            A new version is available
          </h2>

          {/* Version badge */}
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/20 bg-muted/30 px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              v{currentVersion}
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-xs font-semibold text-primary">
              v{newVersion}
            </span>
          </div>
        </div>

        {/* Changelog section */}
        {sections.length > 0 && (
          <div className="mx-6 mb-5 max-h-[200px] overflow-y-auto rounded-xl border border-border/15 bg-muted/20 p-4">
            <div className="space-y-3">
              {sections.map((section) => (
                <div key={section.heading}>
                  <span
                    className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getTagStyle(section.heading)}`}
                  >
                    {section.heading}
                  </span>
                  <ul className="mt-1.5 space-y-1">
                    {section.items.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-xs leading-relaxed text-foreground/70"
                      >
                        <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-foreground/30" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions footer */}
        <div className="flex items-center justify-between border-t border-border/15 px-6 py-4">
          <button
            onClick={onSkip}
            className="text-xs font-medium text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            Skip this version
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onLater}
              className="rounded-lg border border-border/30 bg-secondary/30 px-4 py-2 text-xs font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
            >
              Later
            </button>
            <button
              onClick={onUpdate}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Update & Restart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
