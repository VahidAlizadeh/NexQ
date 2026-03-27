import { useEffect, useRef, useState, useCallback } from 'react';
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
    screenshot: 'placeholder-1.png',
  },
  {
    id: 'ai-copilot',
    name: 'Real-Time AI Copilot',
    description:
      'Ask questions mid-meeting and get streaming, context-aware answers from 8 LLM providers.',
    version: 'v2.15',
    isNew: false,
    screenshot: 'placeholder-5.png',
  },
  {
    id: 'rag',
    name: 'Local RAG Pipeline',
    description:
      'Load PDFs, docs, and notes. AI answers grounded in YOUR context with hybrid vector + full-text search.',
    version: 'v2.20',
    isNew: true,
    screenshot: 'placeholder-6.png',
  },
  {
    id: 'stt',
    name: '10 STT Providers',
    description:
      'From local Whisper and ONNX Runtime to cloud Deepgram and Groq. Choose accuracy, speed, or privacy.',
    version: 'v2.16',
    isNew: false,
    screenshot: 'placeholder-7.png',
  },
  {
    id: 'overlay',
    name: 'Always-On-Top Overlay',
    description:
      'Compact, transparent floating window sits above your meeting app. Visible only to you.',
    version: 'v1.0',
    isNew: false,
    screenshot: 'placeholder-1.png',
  },
  {
    id: 'llm',
    name: '8 LLM Providers',
    description:
      'OpenAI, Anthropic, Groq, Gemini, Ollama, LM Studio, OpenRouter, or bring your own.',
    version: 'v2.12',
    isNew: false,
    screenshot: 'placeholder-8.png',
  },
  {
    id: 'recording',
    name: 'Audio Recording & Playback',
    description:
      'Record full meetings as WAV files. Replay with synced transcript for post-meeting review.',
    version: 'v2.16',
    isNew: false,
    screenshot: 'placeholder-1.png',
  },
  {
    id: 'translation',
    name: 'Multi-Language Translation',
    description:
      'Real-time translation via Microsoft, Google, DeepL, OPUS-MT, or LLM-based translation.',
    version: 'v2.19',
    isNew: true,
    screenshot: 'placeholder-11.png',
  },
];

/* ─── Spring config ─── */

const springTransition = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 28,
};

/* ─── Screenshot Panel (right side) ─── */

function ScreenshotPanel({
  feature,
  reducedMotion,
  baseUrl,
}: {
  feature: HeroFeature;
  reducedMotion: boolean;
  baseUrl: string;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        backgroundColor: '#12121c',
        border: '1px solid rgba(255,255,255,0.06)',
        aspectRatio: '16 / 10',
      }}
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={feature.id}
          src={`${baseUrl}screenshots/${feature.screenshot}`}
          alt={`${feature.name} screenshot`}
          className="h-full w-full object-cover"
          initial={
            reducedMotion
              ? false
              : { opacity: 0, scale: 0.97 }
          }
          animate={{ opacity: 1, scale: 1 }}
          exit={
            reducedMotion
              ? {}
              : { opacity: 0, scale: 0.97 }
          }
          transition={
            reducedMotion
              ? { duration: 0 }
              : springTransition
          }
        />
      </AnimatePresence>
    </div>
  );
}

/* ─── Feature Item (left side) ─── */

function FeatureItem({
  feature,
  isActive,
  onClick,
  itemRef,
}: {
  feature: HeroFeature;
  isActive: boolean;
  onClick: () => void;
  itemRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={itemRef}
      data-feature-id={feature.id}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer transition-colors duration-200"
      style={{
        padding: '16px 20px',
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
    </div>
  );
}

/* ─── Mobile Feature Card (inline screenshot) ─── */

function MobileFeatureCard({
  feature,
  baseUrl,
}: {
  feature: HeroFeature;
  baseUrl: string;
}) {
  return (
    <div
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
        style={{
          border: '1px solid rgba(255,255,255,0.06)',
          aspectRatio: '16 / 10',
        }}
      >
        <img
          src={`${baseUrl}screenshots/${feature.screenshot}`}
          alt={`${feature.name} screenshot`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    </div>
  );
}

/* ─── Main Component ─── */

export default function FeatureScroller() {
  const prefersReduced = useReducedMotion();
  const reducedMotion = prefersReduced ?? false;

  const baseUrl = '/NexQ/';
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store ref setter callbacks to avoid creating new functions each render
  const setItemRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      itemRefs.current[index] = el;
    },
    [],
  );

  // IntersectionObserver: track which feature's center is closest to viewport center
  useEffect(() => {
    // Only run on desktop (lg+)
    const mq = window.matchMedia('(min-width: 1024px)');
    if (!mq.matches) return;

    const items = itemRefs.current.filter(Boolean) as HTMLDivElement[];
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry closest to the vertical center of the viewport
        const viewportCenter = window.innerHeight / 2;

        let bestIndex = -1;
        let bestDistance = Infinity;

        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const rect = entry.boundingClientRect;
          const elementCenter = rect.top + rect.height / 2;
          const distance = Math.abs(elementCenter - viewportCenter);

          if (distance < bestDistance) {
            bestDistance = distance;
            const id = (entry.target as HTMLDivElement).dataset.featureId;
            bestIndex = heroFeatures.findIndex((f) => f.id === id);
          }
        }

        if (bestIndex !== -1) {
          setActiveIndex(bestIndex);
        }
      },
      {
        // Observe when items are within 40% of the viewport center
        rootMargin: '-30% 0px -30% 0px',
        threshold: [0, 0.5, 1],
      },
    );

    items.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

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

      {/* Desktop: sticky scroll layout (lg+) */}
      <div className="hidden lg:flex lg:gap-12">
        {/* Left sidebar — feature list (40%) */}
        <div ref={containerRef} className="w-[40%] flex-shrink-0">
          <div className="flex flex-col gap-1 py-[20vh]">
            {heroFeatures.map((feature, i) => (
              <FeatureItem
                key={feature.id}
                feature={feature}
                isActive={i === activeIndex}
                onClick={() => setActiveIndex(i)}
                itemRef={setItemRef(i)}
              />
            ))}
          </div>
        </div>

        {/* Right panel — sticky screenshot (60%) */}
        <div className="w-[60%]">
          <div
            className="sticky"
            style={{ top: '30vh' }}
          >
            <ScreenshotPanel
              feature={activeFeature}
              reducedMotion={reducedMotion}
              baseUrl={baseUrl}
            />

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
      </div>

      {/* Mobile: vertical card stack (below lg) */}
      <div className="flex flex-col gap-4 lg:hidden">
        {heroFeatures.map((feature) => (
          <MobileFeatureCard
            key={feature.id}
            feature={feature}
            baseUrl={baseUrl}
          />
        ))}
      </div>
    </div>
  );
}
