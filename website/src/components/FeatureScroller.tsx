import { useState, useEffect, useCallback } from 'react';
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

/* ─── Lightbox Modal ─── */

function Lightbox({
  feature,
  onClose,
  onPrev,
  onNext,
}: {
  feature: HeroFeature;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    },
    [onClose, onPrev, onNext],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      />

      {/* Content */}
      <motion.div
        className="relative z-10 flex max-h-[92vh] w-[92vw] max-w-6xl flex-col items-center"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/20"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#aaa' }}
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Prev */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-0 top-1/2 -translate-x-14 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/20"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: '#aaa' }}
          aria-label="Previous"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Next */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-14 flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/20"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: '#aaa' }}
          aria-label="Next"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Image */}
        <AnimatePresence mode="wait">
          <motion.img
            key={feature.id}
            src={`${baseUrl}screenshots/${feature.screenshot}`}
            alt={`${feature.name} screenshot`}
            className="max-h-[82vh] w-auto rounded-lg object-contain"
            style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />
        </AnimatePresence>

        {/* Caption + badges */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: '#ccc' }}>
            {feature.name}
          </span>
          <span className="badge-version">{feature.version}</span>
          {feature.isNew && <span className="badge-new">NEW</span>}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Main Component ─── */

export default function FeatureScroller() {
  const prefersReduced = useReducedMotion();
  const reducedMotion = prefersReduced ?? false;
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const activeFeature = heroFeatures[activeIndex];

  const openLightbox = () => setLightboxOpen(true);
  const closeLightbox = () => setLightboxOpen(false);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % heroFeatures.length);
  }, []);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + heroFeatures.length) % heroFeatures.length);
  }, []);

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

        {/* Right panel — clickable screenshot (65%) */}
        <div className="w-[65%]">
          <button
            type="button"
            onClick={openLightbox}
            className="group relative w-full cursor-pointer"
          >
            <div
              className="flex items-center justify-center overflow-hidden rounded-xl transition-colors group-hover:border-white/10"
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
                  className="object-contain transition-transform duration-300 group-hover:scale-[1.01]"
                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reducedMotion ? {} : { opacity: 0, scale: 0.97 }}
                  transition={reducedMotion ? { duration: 0 } : springTransition}
                />
              </AnimatePresence>

              {/* Expand hint on hover */}
              <div
                className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
              >
                <svg className="h-4 w-4" style={{ color: '#ccc' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </div>
            </div>
          </button>

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
        {heroFeatures.map((feature, i) => (
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
            <button
              type="button"
              onClick={() => { setActiveIndex(i); setLightboxOpen(true); }}
              className="group mt-4 w-full cursor-pointer overflow-hidden rounded-lg"
              style={{ border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <img
                src={`${baseUrl}screenshots/${feature.screenshot}`}
                alt={`${feature.name} screenshot`}
                className="w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                loading="lazy"
              />
            </button>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxOpen && (
          <Lightbox
            feature={activeFeature}
            onClose={closeLightbox}
            onPrev={goPrev}
            onNext={goNext}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
