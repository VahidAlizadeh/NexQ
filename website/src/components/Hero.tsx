import { useEffect, useState, useCallback } from 'react';
import {
  motion,
  useReducedMotion,
  AnimatePresence,
} from 'framer-motion';

/* ─── Data ─── */

interface TranscriptMessage {
  speaker: 'you' | 'them' | 'ai';
  label: string;
  text: string;
}

const messages: TranscriptMessage[] = [
  {
    speaker: 'you',
    label: 'You',
    text: 'Tell me about a challenging project you\'ve led.',
  },
  {
    speaker: 'them',
    label: 'Them',
    text: 'At my previous company, I led the migration of our monolith to microservices...',
  },
  {
    speaker: 'you',
    label: 'You',
    text: 'What was the biggest obstacle?',
  },
  {
    speaker: 'them',
    label: 'Them',
    text: 'Coordinating across 4 teams while maintaining uptime was the hardest part...',
  },
  {
    speaker: 'ai',
    label: 'AI Suggestion',
    text: 'Ask about the team size and how they handled the rollback strategy',
  },
];

const speakerStyles = {
  you: {
    bg: 'rgba(52,211,153,0.08)',
    border: 'rgba(52,211,153,0.12)',
    labelColor: '#34d399',
    dotColor: '#34d399',
  },
  them: {
    bg: 'rgba(96,165,250,0.08)',
    border: 'rgba(96,165,250,0.12)',
    labelColor: '#60a5fa',
    dotColor: '#60a5fa',
  },
  ai: {
    bg: 'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.12)',
    labelColor: '#a78bfa',
    dotColor: '#a78bfa',
  },
};

/* ─── Spring configs ─── */

const springEntrance = { type: 'spring' as const, stiffness: 100, damping: 20 };
const springSubtle = { type: 'spring' as const, stiffness: 120, damping: 24 };

/* ─── Typing Effect Hook ─── */

function useTypingEffect(text: string, isActive: boolean, speed = 25) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    if (!isActive) {
      setDisplayedText('');
      return;
    }

    let index = 0;
    setDisplayedText('');

    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, isActive, speed]);

  return displayedText;
}

/* ─── Transcript Message Component ─── */

function TranscriptBubble({
  message,
  isAI,
  reducedMotion,
}: {
  message: TranscriptMessage;
  isAI: boolean;
  reducedMotion: boolean;
}) {
  const style = speakerStyles[message.speaker];
  const typedText = useTypingEffect(message.text, isAI && !reducedMotion, 22);
  const displayText = isAI && !reducedMotion ? typedText : message.text;

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springEntrance}
      style={{
        backgroundColor: style.bg,
        borderLeft: `2px solid ${style.border}`,
      }}
      className="rounded-lg px-3.5 py-2.5"
    >
      <div className="mb-1 flex items-center gap-1.5">
        {message.speaker === 'ai' && (
          <svg
            className="h-3 w-3 flex-shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            style={{ color: style.labelColor }}
          >
            <path
              d="M8 1.5L9.854 5.646L14.5 6.281L11.25 9.354L12.09 14L8 11.846L3.91 14L4.75 9.354L1.5 6.281L6.146 5.646L8 1.5Z"
              fill="currentColor"
              opacity="0.8"
            />
          </svg>
        )}
        <span
          className="text-xs font-semibold"
          style={{ color: style.labelColor }}
        >
          {message.label}
        </span>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: '#8888a0' }}>
        {displayText}
        {isAI && !reducedMotion && typedText.length < message.text.length && (
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
            className="ml-0.5 inline-block h-3.5 w-[2px] align-middle"
            style={{ backgroundColor: style.labelColor }}
          />
        )}
      </p>
    </motion.div>
  );
}

/* ─── Animated Demo Mockup ─── */

function DemoMockup({ reducedMotion }: { reducedMotion: boolean }) {
  const [visibleCount, setVisibleCount] = useState(reducedMotion ? messages.length : 0);
  const [cycleKey, setCycleKey] = useState(0);

  const resetCycle = useCallback(() => {
    setVisibleCount(0);
    setCycleKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setVisibleCount(messages.length);
      return;
    }

    if (visibleCount >= messages.length) {
      // All messages shown -- wait 3s then reset
      const timeout = setTimeout(resetCycle, 3000);
      return () => clearTimeout(timeout);
    }

    // Stagger: first message after 0.6s, then 1.5s between each
    const delay = visibleCount === 0 ? 600 : 1500;
    const timeout = setTimeout(() => {
      setVisibleCount((c) => c + 1);
    }, delay);

    return () => clearTimeout(timeout);
  }, [visibleCount, reducedMotion, resetCycle]);

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...springSubtle, delay: reducedMotion ? 0 : 0.3 }}
      className="relative"
    >
      {/* Ambient glow */}
      {!reducedMotion && (
        <motion.div
          className="pointer-events-none absolute -inset-8 rounded-3xl"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(167,139,250,0.06) 0%, rgba(96,165,250,0.03) 40%, transparent 70%)',
          }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* Window frame */}
      <div
        className="relative overflow-hidden rounded-xl"
        style={{
          backgroundColor: '#12121c',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 24px 80px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        >
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#ef4444', opacity: 0.7 }} />
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#fbbf24', opacity: 0.7 }} />
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#34d399', opacity: 0.7 }} />
          </div>
          <span className="text-xs font-medium" style={{ color: '#555566' }}>
            NexQ Overlay
          </span>
          {/* Live indicator */}
          <div className="ml-auto flex items-center gap-1.5">
            <motion.div
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: '#34d399' }}
              animate={reducedMotion ? {} : { opacity: [1, 0.4, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
            <span className="text-[10px] font-medium" style={{ color: '#555566' }}>
              LIVE
            </span>
          </div>
        </div>

        {/* Transcript area */}
        <div className="flex flex-col gap-2.5 p-4" style={{ minHeight: '280px' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={cycleKey}
              className="flex flex-col gap-2.5"
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reducedMotion ? {} : { opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {messages.slice(0, visibleCount).map((msg, i) => (
                <TranscriptBubble
                  key={`${cycleKey}-${i}`}
                  message={msg}
                  isAI={msg.speaker === 'ai' && i === visibleCount - 1}
                  reducedMotion={reducedMotion}
                />
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Waiting indicator when no messages yet */}
          {visibleCount === 0 && !reducedMotion && (
            <motion.div
              className="flex items-center gap-2 py-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: '#555566' }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.2,
                      ease: 'linear',
                    }}
                  />
                ))}
              </div>
              <span className="text-xs" style={{ color: '#555566' }}>
                Listening...
              </span>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Hero Section ─── */

export default function Hero() {
  const prefersReduced = useReducedMotion();
  const reducedMotion = prefersReduced ?? false;

  return (
    <section
      className="relative overflow-hidden"
      style={{ minHeight: 'calc(100vh - 4rem)' }}
    >
      {/* Background gradient atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 70% 20%, rgba(167,139,250,0.05) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 30% 80%, rgba(52,211,153,0.03) 0%, transparent 50%)',
        }}
      />

      <div className="section-container relative flex items-center" style={{ minHeight: 'calc(100vh - 4rem)' }}>
        <div className="grid w-full grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">

          {/* ─── Left: Text Content ─── */}
          <div className="flex flex-col gap-6">
            {/* Eyebrow badge */}
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springEntrance, delay: reducedMotion ? 0 : 0.1 }}
            >
              <span
                className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium"
                style={{
                  backgroundColor: 'rgba(52,211,153,0.1)',
                  color: '#34d399',
                  border: '1px solid rgba(52,211,153,0.15)',
                }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: '#34d399' }}
                />
                100% Local &bull; Free &bull; Open Source
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              className="text-4xl font-extrabold tracking-tight md:text-5xl"
              style={{ color: '#f0f0f5', lineHeight: 1.1 }}
              initial={reducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springEntrance, delay: reducedMotion ? 0 : 0.2 }}
            >
              The AI meeting assistant that{' '}
              <br />
              <span style={{ color: '#34d399' }}>
                respects your privacy
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              className="max-w-lg text-base leading-relaxed md:text-lg"
              style={{ color: '#8888a0' }}
              initial={reducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springEntrance, delay: reducedMotion ? 0 : 0.3 }}
            >
              Real-time transcription &amp; AI copilot for interviews, lectures,
              and meetings. Runs on your machine&nbsp;&mdash; nothing leaves your
              device.
            </motion.p>

            {/* CTAs */}
            <motion.div
              className="flex flex-wrap items-center gap-3"
              initial={reducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springEntrance, delay: reducedMotion ? 0 : 0.4 }}
            >
              <a
                href="https://github.com/VahidAlizadeh/NexQ/releases/latest"
                className="btn-primary"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
                </svg>
                Download for Windows
              </a>
              <a
                href="https://github.com/VahidAlizadeh/NexQ"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                View on GitHub
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
              </a>
            </motion.div>
          </div>

          {/* ─── Right: Animated Demo ─── */}
          <div className="lg:pl-4">
            <DemoMockup reducedMotion={reducedMotion} />
          </div>
        </div>
      </div>
    </section>
  );
}
