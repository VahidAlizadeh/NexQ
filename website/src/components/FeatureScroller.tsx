import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/* ─── Data ─── */

interface HeroFeature {
  id: string;
  name: string;
  description: string;
  version: string;
  isNew: boolean;
  screenshot: string;
}

const heroFeatures: HeroFeature[] = [
  {
    id: 'dual-party',
    name: 'Dual-Party Transcription',
    description:
      'Separate "You" and "Them" audio streams with independent STT providers for each side.',
    version: 'v2.18',
    isNew: true,
    screenshot: 'Dual-Party%20Transcription.png',
  },
  {
    id: 'ai-copilot',
    name: 'Real-Time AI Copilot',
    description:
      'Ask questions mid-meeting and get streaming, context-aware answers from 8 LLM providers.',
    version: 'v2.15',
    isNew: false,
    screenshot: 'Real-Time%20AI%20Copilot.png',
  },
  {
    id: 'rag',
    name: 'Local RAG Pipeline',
    description:
      'Load PDFs, docs, and notes. AI answers grounded in YOUR context with hybrid vector + full-text search.',
    version: 'v2.20',
    isNew: true,
    screenshot: 'Local%20RAG%20Pipeline.png',
  },
  {
    id: 'stt',
    name: '10 STT Providers',
    description:
      'From local Whisper and ONNX Runtime to cloud Deepgram and Groq. Choose accuracy, speed, or privacy.',
    version: 'v2.16',
    isNew: false,
    screenshot: '10%20STT%20Providers.png',
  },
  {
    id: 'llm',
    name: '8 LLM Providers',
    description:
      'OpenAI, Anthropic, Groq, Gemini, Ollama, LM Studio, OpenRouter, or bring your own.',
    version: 'v2.12',
    isNew: false,
    screenshot: '8%20LLM%20Providers.gif',
  },
  {
    id: 'recording',
    name: 'Audio Recording & Playback',
    description:
      'Record full meetings as WAV files. Replay with synced transcript for post-meeting review.',
    version: 'v2.16',
    isNew: false,
    screenshot: 'Audio%20Recording%20and%20Playback.png',
  },
  {
    id: 'translation',
    name: 'Multi-Language Translation',
    description:
      'Real-time translation via Microsoft, Google, DeepL, OPUS-MT, or LLM-based translation.',
    version: 'v2.19',
    isNew: true,
    screenshot: 'Multi-Language%20Translation.png',
  },
  {
    id: 'past-meeting',
    name: 'Past Meeting Review',
    description:
      'Review past meetings with full transcript, AI summary, action items, bookmarks, and audio playback timeline.',
    version: 'v2.0',
    isNew: false,
    screenshot: 'Past-meeting.png',
  },
];

/* ─── Spring config ─── */

const springTransition = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 28,
};

const baseUrl = '/NexQ/';

/* ─── Main Component ─── */

export default function FeatureScroller() {
  const prefersReduced = useReducedMotion();
  const reducedMotion = prefersReduced ?? false;
  const [activeIndex, setActiveIndex] = useState(0);

  const activeFeature = heroFeatures[activeIndex];

  return (
    <div className="section-container">
      {/* Section Header */}
      <div className="mb-16 text-center">
        <h2 className="section-title">Everything you need</h2>
        <p className="section-subtitle mx-auto">
          Powerful features that run entirely on your machine.
        </p>
      </div>

      {/* Desktop: click-based tab layout (lg+) */}
      <div className="hidden lg:flex lg:gap-8">
        {/* Left sidebar — clickable feature list (35%) */}
        <div className="w-[35%] flex-shrink-0">
          <div className="flex flex-col gap-1">
            {heroFeatures.map((feature, i) => {
              const isActive = i === activeIndex;
              return (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  className="cursor-pointer text-left transition-colors duration-200"
                  style={{
                    padding: '14px 20px',
                    borderLeft: `3px solid ${isActive ? '#a78bfa' : 'transparent'}`,
                    backgroundColor: isActive ? 'rgba(18,18,28,0.5)' : 'transparent',
                    borderRadius: '0 8px 8px 0',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: isActive ? '#f0f0f5' : '#8888a0' }}
                    >
                      {feature.name}
                    </span>
                    <span className="badge-version">{feature.version}</span>
                    {feature.isNew && <span className="badge-new">NEW</span>}
                  </div>

                  {/* Description — visible only when active */}
                  <div
                    className="overflow-hidden transition-all duration-300"
                    style={{
                      maxHeight: isActive ? '80px' : '0',
                      opacity: isActive ? 1 : 0,
                    }}
                  >
                    <p className="mt-2 text-sm" style={{ color: '#8888a0' }}>
                      {feature.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right panel — screenshot (65%) */}
        <div className="w-[65%]">
          <div
            className="flex items-center justify-center overflow-hidden rounded-xl"
            style={{
              backgroundColor: '#12121c',
              border: '1px solid rgba(255,255,255,0.06)',
              height: '600px',
            }}
          >
            <AnimatePresence mode="wait">
              <motion.img
                key={activeFeature.id}
                src={`${baseUrl}screenshots/${activeFeature.screenshot}`}
                alt={`${activeFeature.name} screenshot`}
                className="object-contain"
                style={{ maxWidth: '100%', maxHeight: '100%' }}
                initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reducedMotion ? {} : { opacity: 0, scale: 0.97 }}
                transition={reducedMotion ? { duration: 0 } : springTransition}
              />
            </AnimatePresence>
          </div>

          {/* Active feature name below screenshot */}
          <div className="mt-4 text-center">
            <span
              className="text-xs font-medium tracking-wide"
              style={{ color: '#555566', textTransform: 'uppercase', letterSpacing: '0.08em' }}
            >
              {activeFeature.name}
            </span>
          </div>
        </div>
      </div>

      {/* Mobile: vertical card stack (below lg) */}
      <div className="flex flex-col gap-4 lg:hidden">
        {heroFeatures.map((feature) => (
          <div
            key={feature.id}
            className="animate-on-scroll rounded-xl p-5"
            style={{
              backgroundColor: 'rgba(18,18,28,0.5)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: '#f0f0f5' }}>
                {feature.name}
              </span>
              <span className="badge-version">{feature.version}</span>
              {feature.isNew && <span className="badge-new">NEW</span>}
            </div>
            <p className="mt-2 text-sm" style={{ color: '#8888a0' }}>
              {feature.description}
            </p>
            <div
              className="mt-4 overflow-hidden rounded-lg"
              style={{ border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <img
                src={`${baseUrl}screenshots/${feature.screenshot}`}
                alt={`${feature.name} screenshot`}
                className="w-full object-contain"
                loading="lazy"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
