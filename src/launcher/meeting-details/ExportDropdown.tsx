import { useState, useRef, useEffect, useCallback } from "react";
import type { Meeting } from "../../lib/types";
import {
  exportMeetingAsMarkdown,
  exportMeetingAsSRT,
  exportMeetingAsJSON,
  exportMeetingScenario,
  getScenarioExportFormat,
} from "../../lib/export";
import { Download, FileText, Subtitles, Braces, ChevronDown, Loader2 } from "lucide-react";

interface ExportDropdownProps {
  meeting: Meeting;
}

interface ExportOption {
  label: string;
  description: string;
  icon: React.ReactNode;
  action: () => Promise<boolean>;
  variant?: "default" | "scenario";
}

export function ExportDropdown({ meeting }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  const handleExport = useCallback(async (key: string, action: () => Promise<boolean>) => {
    setLoadingKey(key);
    setIsOpen(false);
    try {
      await action();
    } finally {
      setLoadingKey(null);
    }
  }, []);

  const scenarioFmt = getScenarioExportFormat(meeting.ai_scenario);

  const baseOptions: ExportOption[] = [
    {
      label: "Markdown",
      description: "Full transcript + summary",
      icon: <FileText className="h-3.5 w-3.5" />,
      action: () => exportMeetingAsMarkdown(meeting),
    },
    {
      label: "SRT Subtitles",
      description: "Timed subtitle file",
      icon: <Subtitles className="h-3.5 w-3.5" />,
      action: () => exportMeetingAsSRT(meeting),
    },
    {
      label: "JSON",
      description: "Structured data export",
      icon: <Braces className="h-3.5 w-3.5" />,
      action: () => exportMeetingAsJSON(meeting),
    },
  ];

  const allOptions: ExportOption[] = scenarioFmt
    ? [
        ...baseOptions,
        {
          label: scenarioFmt.label,
          description: `Formatted for ${meeting.ai_scenario?.replace(/_/g, " ")}`,
          icon: <Download className="h-3.5 w-3.5" />,
          action: () => exportMeetingScenario(meeting),
          variant: "scenario",
        },
      ]
    : baseOptions;

  const isLoading = loadingKey !== null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        disabled={isLoading}
        className="flex items-center gap-1.5 rounded-lg border border-border/30 bg-secondary/30 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-all duration-150 hover:bg-secondary/50 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Export meeting"
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Export
        <ChevronDown
          className={`h-3 w-3 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-border/30 bg-card shadow-xl shadow-black/20"
          role="menu"
          aria-label="Export options"
        >
          <div className="px-3 py-2 border-b border-border/20">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
              Export as
            </p>
          </div>

          {allOptions.map((opt, i) => {
            const key = opt.label;
            const isScenario = opt.variant === "scenario";
            const separator = isScenario && allOptions.length > 1;

            return (
              <div key={key}>
                {separator && <div className="mx-3 my-0.5 border-t border-border/20" />}
                <button
                  onClick={() => handleExport(key, opt.action)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-secondary/40 cursor-pointer ${
                    isScenario
                      ? "text-primary/80 hover:text-primary"
                      : "text-foreground/70 hover:text-foreground"
                  }`}
                  role="menuitem"
                >
                  <span
                    className={`shrink-0 ${isScenario ? "text-primary/70" : "text-muted-foreground/50"}`}
                  >
                    {opt.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground/40">{opt.description}</div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
