import { useEffect, useState, useRef, useCallback } from "react";
import { HelpCircle, Sparkles, Check, Clock } from "lucide-react";
import { onQuestionDetected } from "../lib/events";
import { generateAssist } from "../lib/ipc";
import { useTranscriptStore } from "../stores/transcriptStore";
import type { DetectedQuestion } from "../lib/types";

function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.endsWith("?")) return true;
  const lower = trimmed.toLowerCase();
  const qWords = [
    "what ", "how ", "why ", "when ", "where ", "who ", "which ",
    "can you", "could you", "would you", "do you", "are you",
    "is there", "have you", "tell me", "explain",
  ];
  return qWords.some((w) => lower.startsWith(w));
}

interface TrackedQuestion extends DetectedQuestion {
  assisted: boolean;
}

export function QuestionDetector() {
  const [questions, setQuestions] = useState<TrackedQuestion[]>([]);
  const processedIdsRef = useRef<Set<string>>(new Set());
  const segments = useTranscriptStore((s) => s.segments);

  const addQuestion = useCallback((q: DetectedQuestion) => {
    setQuestions((prev) => {
      if (prev.length > 0 && prev[0].text === q.text) return prev;
      return [{ ...q, assisted: false }, ...prev].slice(0, 10);
    });
  }, []);

  useEffect(() => {
    const p = onQuestionDetected((event) => addQuestion(event));
    return () => { p.then((u) => u()); };
  }, [addQuestion]);

  useEffect(() => {
    for (const seg of segments) {
      if (seg.is_final && !processedIdsRef.current.has(seg.id) && (seg.speaker === "Them" || seg.speaker === "Interviewer") && looksLikeQuestion(seg.text)) {
        processedIdsRef.current.add(seg.id);
        addQuestion({ text: seg.text, confidence: 0.8, timestamp_ms: seg.timestamp_ms, source: seg.speaker });
      }
      if (seg.is_final) processedIdsRef.current.add(seg.id);
    }
  }, [segments, addQuestion]);

  const handleAssist = useCallback((index: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => i === index ? { ...q, assisted: true } : q)
    );
    generateAssist("Assist").catch(() => {});
  }, []);

  const latest = questions.length > 0 ? questions[0] : null;
  // Show current + last 5 previous (6 total max visible)
  const previousQuestions = questions.slice(1, 6);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Latest question — prominent card */}
      <div
        className={`group flex items-start gap-3 rounded-lg transition-all duration-200 ${
          latest
            ? "cursor-pointer hover:bg-blue-500/[0.06]"
            : ""
        }`}
        onClick={() => latest && handleAssist(0)}
      >
        <div className="relative mt-0.5 shrink-0">
          <HelpCircle className={`h-5 w-5 transition-colors ${latest ? "text-blue-400" : "text-muted-foreground/50"}`} />
          {latest && !latest.assisted && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          )}
          {latest?.assisted && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500">
              <Check className="h-2 w-2 text-white" />
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {latest ? (
            <p className="text-[13px] leading-relaxed font-medium text-foreground/90">
              &ldquo;{latest.text}&rdquo;
            </p>
          ) : (
            <p className="text-[12px] text-muted-foreground/60 italic">
              Detected questions from &ldquo;Them&rdquo; will appear here
            </p>
          )}
        </div>

        {latest && (
          <button
            onClick={(e) => { e.stopPropagation(); handleAssist(0); }}
            className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all duration-150 cursor-pointer ${
              latest.assisted
                ? "bg-emerald-500/10 border border-emerald-500/15 text-emerald-400"
                : "bg-blue-500/10 border border-blue-500/15 text-blue-400 hover:bg-blue-500/20"
            }`}
          >
            {latest.assisted ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Answered
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Assist
              </>
            )}
          </button>
        )}
      </div>

      {/* Previous questions — vertical compact list, last 5 only, no scroll */}
      {previousQuestions.length > 0 && (
        <div className="flex flex-col gap-1">
          {previousQuestions.map((q, idx) => {
            const realIdx = idx + 1; // offset for handleAssist since index 0 is latest
            return (
              <button
                key={`q-${realIdx}-${q.timestamp_ms}`}
                onClick={() => handleAssist(realIdx)}
                className={`group/q flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-all duration-150 cursor-pointer ${
                  q.assisted
                    ? "bg-emerald-500/[0.05] border border-emerald-500/10"
                    : "bg-card/20 border border-border/10 hover:bg-card/40 hover:border-border/20"
                }`}
                title={q.text}
              >
                {/* Status indicator */}
                <div className="shrink-0">
                  {q.assisted ? (
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15">
                      <Check className="h-2.5 w-2.5 text-emerald-400" />
                    </div>
                  ) : (
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-muted/30">
                      <Clock className="h-2.5 w-2.5 text-muted-foreground/60" />
                    </div>
                  )}
                </div>

                {/* Question text */}
                <span className={`flex-1 truncate text-[11px] leading-snug transition-colors ${
                  q.assisted
                    ? "text-emerald-300/70 font-medium"
                    : "text-muted-foreground/60 group-hover/q:text-foreground/80"
                }`}>
                  {q.text}
                </span>

                {/* Assist action for unanswered */}
                {!q.assisted && (
                  <Sparkles className="h-3 w-3 shrink-0 text-blue-400/0 group-hover/q:text-blue-400/60 transition-colors" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
