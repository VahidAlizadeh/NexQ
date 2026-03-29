import {
  motion,
  useReducedMotion,
} from 'framer-motion';

/* ─── Spring configs ─── */

const springEntrance = { type: 'spring' as const, stiffness: 100, damping: 20 };
const springSubtle = { type: 'spring' as const, stiffness: 120, damping: 24 };

const baseUrl = '/NexQ/';

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
        <div className="flex w-full flex-col items-center gap-10">

          {/* ─── Top: Text Content ─── */}
          <div className="flex flex-col items-center gap-6 text-center">
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
              className="max-w-2xl text-base leading-relaxed md:text-lg"
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

          {/* ─── Below: Full-Width Live Demo GIF ─── */}
          <motion.div
            className="w-full"
            style={{ maxWidth: '960px' }}
            initial={reducedMotion ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springSubtle, delay: reducedMotion ? 0 : 0.5 }}
          >
            <div className="relative">
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
              <img
                src={`${baseUrl}screenshots/live-meeting-demo.gif`}
                alt="NexQ in action — live meeting with transcript, translation, and AI assist"
                className="w-full rounded-xl"
                style={{
                  boxShadow: '0 24px 80px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
                }}
                loading="eager"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
