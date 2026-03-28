import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/* ─── Data ─── */

interface Scenario {
  id: string;
  icon: string;
  label: string;
  description: string;
  tags: string[];
  screenshot: string;
}

const scenarios: Scenario[] = [
  {
    id: 'interview',
    icon: '\u{1F3AF}',
    label: 'Interview Copilot',
    description:
      'Ace every interview. Get real-time AI-suggested follow-up questions, key talking points, and context from your resume. NexQ listens to both sides and helps you shine.',
    tags: ['AI Suggestions', 'Resume RAG', 'Dual Transcription'],
    screenshot: 'Interview.png',
  },
  {
    id: 'lecture',
    icon: '\u{1F4DA}',
    label: 'Lecture Assistant',
    description:
      'Never miss a key concept. Auto-transcribe lectures, bookmark important moments, extract action items, and get AI summaries of each topic section.',
    tags: ['Bookmarks', 'Action Items', 'Topic Detection', 'Long-Session STT'],
    screenshot: 'Lecture.png',
  },
  {
    id: 'team',
    icon: '\u{1F465}',
    label: 'Team Meeting',
    description:
      'Stay focused, let NexQ handle the notes. Dual-party transcription captures everyone, AI extracts action items, and speaker labels keep track of who said what.',
    tags: ['Speaker Labels', 'Action Items', 'Dual Transcription'],
    screenshot: 'Past-meeting.png',
  },
];

/* ─── Spring config ─── */

const springTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};

/* ─── Component ─── */

export default function UseCases() {
  const prefersReduced = useReducedMotion();
  const reducedMotion = prefersReduced ?? false;

  const baseUrl = '/NexQ/';
  const [activeId, setActiveId] = useState(scenarios[0].id);

  const activeScenario = scenarios.find((s) => s.id === activeId)!;

  return (
    <div className="section-container">
      {/* Section Header */}
      <div className="mb-12 text-center">
        <h2 className="section-title">Built for how you actually work</h2>
        <p className="section-subtitle mx-auto">
          Whether you're interviewing, studying, or collaborating — NexQ adapts.
        </p>
      </div>

      {/* Tab Bar */}
      <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
        {scenarios.map((scenario) => {
          const isActive = scenario.id === activeId;
          return (
            <button
              key={scenario.id}
              onClick={() => setActiveId(scenario.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-3 min-h-[44px] transition-colors ${
                isActive
                  ? 'border border-white/10 bg-surface-raised font-semibold text-text-primary'
                  : 'border border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              <span>{scenario.icon}</span>
              <span>{scenario.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeScenario.id}
          initial={reducedMotion ? false : { opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reducedMotion ? {} : { opacity: 0, x: -20 }}
          transition={reducedMotion ? { duration: 0 } : springTransition}
          className="grid grid-cols-1 gap-8 lg:grid-cols-2"
        >
          {/* Left: Description + Tags */}
          <div className="flex flex-col justify-center">
            <p className="text-base leading-relaxed text-text-secondary">
              {activeScenario.description}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {activeScenario.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex rounded-full bg-accent-purple/10 px-2.5 py-1 text-xs text-accent-purple"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Right: Screenshot */}
          <div
            className="overflow-hidden rounded-xl border border-white/[0.06] bg-surface-raised"
            style={{ aspectRatio: '16 / 10' }}
          >
            <img
              src={`${baseUrl}screenshots/${activeScenario.screenshot}`}
              alt={`${activeScenario.label} screenshot`}
              className="h-full w-full object-cover"
            />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
