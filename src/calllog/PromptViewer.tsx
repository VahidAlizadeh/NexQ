import { useState, useCallback, useMemo } from "react";
import type { LogEntry } from "../lib/types";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  FileText,
  MessageSquare,
  HelpCircle,
  Sparkles,
  BookOpen,
} from "lucide-react";

// -- Types -------------------------------------------------------------------

interface PromptSection {
  title: string;
  content: string;
  type: "context" | "transcript" | "question" | "instruction";
  badge?: { label: string; color: string; icon: typeof FileText };
}

type ViewMode = "structured" | "raw";

// -- Main component ----------------------------------------------------------

interface PromptViewerProps {
  entry: LogEntry;
}

export function PromptViewer({ entry }: PromptViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("structured");

  return (
    <div className="flex flex-col h-full">
      {/* View mode toggle */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/20">
        <button
          onClick={() => setViewMode("structured")}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
            viewMode === "structured"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground/50 hover:bg-accent/50 hover:text-foreground"
          }`}
        >
          Structured
        </button>
        <button
          onClick={() => setViewMode("raw")}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
            viewMode === "raw"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground/50 hover:bg-accent/50 hover:text-foreground"
          }`}
        >
          Raw
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === "structured" ? (
          <StructuredView entry={entry} />
        ) : (
          <RawView entry={entry} />
        )}
      </div>
    </div>
  );
}

// -- Structured View ---------------------------------------------------------

function StructuredView({ entry }: { entry: LogEntry }) {
  const sections = useMemo(
    () => parseUserPromptSections(entry.actualUserPrompt),
    [entry.actualUserPrompt]
  );

  return (
    <div className="flex flex-col gap-0.5">
      {/* System prompt (collapsed by default) */}
      {entry.actualSystemPrompt && (
        <CollapsibleSection
          title="SYSTEM PROMPT"
          content={entry.actualSystemPrompt}
          defaultExpanded={false}
          badge={{ label: "System", color: "gray", icon: Sparkles }}
        />
      )}

      {/* User message sections */}
      {sections.map((section, i) => (
        <CollapsibleSection
          key={i}
          title={section.title || "USER MESSAGE"}
          content={section.content}
          defaultExpanded={true}
          badge={section.badge}
        />
      ))}

      {/* Response */}
      {(entry.responseContentClean || entry.status === "streaming") && (
        <CollapsibleSection
          title={
            entry.status === "streaming" ? "RESPONSE (streaming...)" : "RESPONSE"
          }
          content={entry.responseContentClean}
          defaultExpanded={true}
          badge={{ label: "Response", color: "emerald", icon: MessageSquare }}
          isResponse
        />
      )}
    </div>
  );
}

// -- Collapsible Section -----------------------------------------------------

function CollapsibleSection({
  title,
  content,
  defaultExpanded,
  badge,
  isResponse,
}: {
  title: string;
  content: string;
  defaultExpanded: boolean;
  badge?: PromptSection["badge"];
  isResponse?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!content && !isResponse) return null;

  const badgeColors: Record<string, string> = {
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    gray: "bg-secondary/60 text-muted-foreground/70 border-border/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  };

  const badgeClass = badge ? badgeColors[badge.color] || badgeColors.gray : "";
  const Icon = badge?.icon || FileText;

  return (
    <div className="border-b border-border/10">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/20 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        )}

        {badge && (
          <span
            className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${badgeClass}`}
          >
            <Icon className="h-2.5 w-2.5" />
            {badge.label}
          </span>
        )}

        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {title}
        </span>

        <SectionCopyButton text={content} />
      </button>

      {/* Content */}
      {expanded ? (
        <div className="px-3 pb-3">
          <div
            className={`max-h-60 overflow-y-auto rounded-md border border-border/10 bg-secondary/20 p-2.5 ${
              isResponse
                ? "text-[13px] leading-relaxed text-foreground/90"
                : "font-mono text-[12px] leading-relaxed text-foreground/80"
            } whitespace-pre-wrap break-words`}
          >
            {content || (
              <span className="italic text-muted-foreground/60">
                (empty)
              </span>
            )}
          </div>
        </div>
      ) : content ? (
        /* Collapsed preview: 3-line fade */
        <div className="relative px-3 pb-2">
          <p className="line-clamp-3 font-mono text-[11px] text-muted-foreground/50 break-words">
            {content}
          </p>
          <div className="absolute bottom-0 left-3 right-3 h-6 bg-gradient-to-t from-card to-transparent pointer-events-none" />
        </div>
      ) : null}
    </div>
  );
}

// -- Raw View ----------------------------------------------------------------

function RawView({ entry }: { entry: LogEntry }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {/* System message */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            System Message
          </span>
          <SectionCopyButton text={entry.actualSystemPrompt} />
        </div>
        <pre className="max-h-60 overflow-y-auto rounded-md border border-border/10 bg-secondary/20 p-2.5 font-mono text-[12px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
          {entry.actualSystemPrompt || "(empty)"}
        </pre>
      </div>

      {/* User message */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            User Message
          </span>
          <SectionCopyButton text={entry.actualUserPrompt} />
        </div>
        <pre className="max-h-80 overflow-y-auto rounded-md border border-border/10 bg-secondary/20 p-2.5 font-mono text-[12px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
          {entry.actualUserPrompt || "(empty)"}
        </pre>
      </div>

      {/* Response */}
      {entry.responseContentClean && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Response
              {entry.status === "streaming" && (
                <span className="ml-1.5 animate-pulse text-primary/60">
                  streaming...
                </span>
              )}
            </span>
            <SectionCopyButton text={entry.responseContentClean} />
          </div>
          <pre className="max-h-60 overflow-y-auto rounded-md border border-border/10 bg-secondary/20 p-2.5 font-mono text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
            {entry.responseContentClean}
          </pre>
        </div>
      )}
    </div>
  );
}

// -- Prompt section parser ---------------------------------------------------

function parseUserPromptSections(text: string): PromptSection[] {
  if (!text) return [];

  const sections: PromptSection[] = [];
  const lines = text.split("\n");
  let currentHeader: string | null = null;
  let contentLines: string[] = [];

  const flushSection = () => {
    const content = contentLines.join("\n").trim();
    if (currentHeader) {
      sections.push(buildSection(currentHeader, content));
    } else if (content) {
      // Text before any ## header → mode instruction
      sections.push({
        title: "",
        content,
        type: "instruction",
        badge: { label: "Instruction", color: "gray", icon: BookOpen },
      });
    }
    contentLines = [];
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flushSection();
      currentHeader = line.substring(3).trim();
    } else {
      contentLines.push(line);
    }
  }
  flushSection();

  // If last section content has trailing instruction text (plain sentence without markup)
  // separate it as a mode instruction
  if (sections.length > 0) {
    const last = sections[sections.length - 1];
    if (last.type !== "instruction" && last.content) {
      const contentLines2 = last.content.split("\n");
      // Check if last non-empty line is a plain instruction (no leading markdown)
      const trailingInstr: string[] = [];
      while (contentLines2.length > 0) {
        const line = contentLines2[contentLines2.length - 1].trim();
        if (!line) {
          contentLines2.pop();
          continue;
        }
        // A trailing instruction is typically a short sentence, no markdown
        if (
          !line.startsWith("[") &&
          !line.startsWith("-") &&
          !line.startsWith("#") &&
          !line.startsWith("|") &&
          line.length < 200 &&
          /^[A-Z]/.test(line)
        ) {
          trailingInstr.unshift(contentLines2.pop()!);
        } else {
          break;
        }
      }
      if (trailingInstr.length > 0 && contentLines2.length > 0) {
        last.content = contentLines2.join("\n").trim();
        sections.push({
          title: "",
          content: trailingInstr.join("\n").trim(),
          type: "instruction",
          badge: { label: "Mode Instruction", color: "gray", icon: BookOpen },
        });
      }
    }
  }

  return sections;
}

function buildSection(title: string, content: string): PromptSection {
  if (title.includes("Reference") || title.includes("Custom")) {
    return {
      title,
      content,
      type: "context",
      badge: { label: "Context", color: "amber", icon: FileText },
    };
  }
  if (title.includes("Relevant Context") || title.includes("RAG")) {
    const chunkCount = (content.match(/^### /gm) || []).length;
    return {
      title,
      content,
      type: "context",
      badge: {
        label: chunkCount > 0 ? `${chunkCount} chunks` : "RAG",
        color: "blue",
        icon: FileText,
      },
    };
  }
  if (title.includes("Transcript")) {
    const segCount = content
      .split("\n")
      .filter((l) => l.trim().startsWith("[")).length;
    return {
      title,
      content,
      type: "transcript",
      badge: {
        label: segCount > 0 ? `${segCount} segments` : "Transcript",
        color: "green",
        icon: MessageSquare,
      },
    };
  }
  if (title.includes("User's Question")) {
    return {
      title,
      content,
      type: "question",
      badge: { label: "Question", color: "rose", icon: HelpCircle },
    };
  }
  if (title.includes("Detected Question")) {
    const confMatch = title.match(/(\d+)%/);
    return {
      title,
      content,
      type: "question",
      badge: {
        label: confMatch ? `${confMatch[1]}% confidence` : "Detected",
        color: "rose",
        icon: HelpCircle,
      },
    };
  }
  if (title.includes("Shorten")) {
    return {
      title,
      content,
      type: "question",
      badge: { label: "To Shorten", color: "amber", icon: FileText },
    };
  }
  return {
    title,
    content,
    type: "instruction",
    badge: { label: title || "Section", color: "gray", icon: BookOpen },
  };
}

// -- Copy button -------------------------------------------------------------

function SectionCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
    [text]
  );

  if (!text) return null;

  return (
    <button
      onClick={handleCopy}
      className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
      title="Copy"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}
