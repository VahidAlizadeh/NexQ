import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── Data ─── */

interface SettingPanel {
  name: string;
  screenshot: string;
}

const settings: SettingPanel[] = [
  { name: 'STT Providers', screenshot: 'Setting-STT%20Providers.png' },
  { name: 'LLM Providers', screenshot: 'Setting-LLM%20Providers.png' },
  { name: 'AI Actions', screenshot: 'Setting-AI%20Actions.png' },
  { name: 'Audio & Devices', screenshot: 'Setting-Audio%20and%20Devices.png' },
  { name: 'Translation', screenshot: 'Setting-Translation.png' },
  { name: 'General', screenshot: 'Setting-General.png' },
];

const baseUrl = '/NexQ/';

/* ─── Lightbox Modal ─── */

function Lightbox({
  setting,
  onClose,
  onPrev,
  onNext,
}: {
  setting: SettingPanel;
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
        style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      />

      {/* Content */}
      <motion.div
        className="relative z-10 flex max-h-[90vh] w-[90vw] max-w-5xl flex-col items-center"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#8888a0' }}
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Nav: Prev */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-0 top-1/2 -translate-x-12 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full transition-colors"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: '#8888a0' }}
          aria-label="Previous"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Nav: Next */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 flex h-10 w-10 items-center justify-center rounded-full transition-colors"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: '#8888a0' }}
          aria-label="Next"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Image */}
        <AnimatePresence mode="wait">
          <motion.img
            key={setting.screenshot}
            src={`${baseUrl}screenshots/Setting/${setting.screenshot}`}
            alt={`${setting.name} settings panel`}
            className="max-h-[80vh] w-auto rounded-lg object-contain"
            style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />
        </AnimatePresence>

        {/* Caption */}
        <p className="mt-4 text-sm font-medium" style={{ color: '#8888a0' }}>
          {setting.name}
        </p>
      </motion.div>
    </motion.div>
  );
}

/* ─── Main Component ─── */

export default function SettingsShowcase() {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openLightbox = (i: number) => setLightboxIndex(i);
  const closeLightbox = () => setLightboxIndex(null);

  const goNext = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null ? (prev + 1) % settings.length : null));
  }, []);

  const goPrev = useCallback(() => {
    setLightboxIndex((prev) => (prev !== null ? (prev - 1 + settings.length) % settings.length : null));
  }, []);

  return (
    <section className="section-container">
      <div className="mb-12 text-center">
        <h2 className="section-title">Highly customizable</h2>
        <p className="section-subtitle mx-auto">
          11 settings panels. Every provider, shortcut, and behavior tuned to your workflow.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {settings.map((setting, i) => (
          <button
            key={setting.name}
            type="button"
            onClick={() => openLightbox(i)}
            className="group cursor-pointer overflow-hidden rounded-xl text-left transition-colors"
            style={{
              border: '1px solid rgba(255,255,255,0.06)',
              backgroundColor: 'rgba(18,18,28,0.5)',
            }}
          >
            <div className="overflow-hidden" style={{ aspectRatio: '16 / 10' }}>
              <img
                src={`${baseUrl}screenshots/Setting/${setting.screenshot}`}
                alt={`${setting.name} settings panel`}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                loading="lazy"
              />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium" style={{ color: '#8888a0' }}>
                {setting.name}
              </span>
              {/* Expand icon hint */}
              <svg
                className="h-4 w-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{ color: '#555566' }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            setting={settings[lightboxIndex]}
            onClose={closeLightbox}
            onPrev={goPrev}
            onNext={goNext}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
