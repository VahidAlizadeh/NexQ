import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import featuresData from '../data/features.json';

/* ─── Types ─── */

interface Feature {
  name: string;
  category: string;
  version: string;
  isNew: boolean;
  icon: string;
  description: string;
}

const features = featuresData as Feature[];

/* ─── Constants ─── */

const categories = ['All', 'Audio', 'AI', 'Productivity', 'Privacy'] as const;

const springTransition = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
};

/* ─── Feature Card ─── */

function FeatureCard({
  feature,
  reducedMotion,
}: {
  feature: Feature;
  reducedMotion: boolean;
}) {
  return (
    <motion.div
      layout={!reducedMotion}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reducedMotion ? {} : { opacity: 0, scale: 0.9 }}
      transition={reducedMotion ? { duration: 0 } : springTransition}
      className="rounded-xl border border-white/[0.06] bg-surface-raised p-4 transition-colors hover:border-white/10"
    >
      {/* Top row: icon + badge */}
      <div className="flex items-start justify-between">
        <span className="text-2xl">{feature.icon}</span>
        {feature.isNew ? (
          <span className="badge-new">NEW</span>
        ) : (
          <span className="badge-version">{feature.version}</span>
        )}
      </div>

      {/* Name */}
      <p className="mt-3 text-sm font-semibold text-text-primary">
        {feature.name}
      </p>

      {/* Description */}
      <p className="mt-1 line-clamp-2 text-xs text-text-muted">
        {feature.description}
      </p>
    </motion.div>
  );
}

/* ─── Main Component ─── */

export default function FeatureGrid() {
  const prefersReduced = useReducedMotion();
  const reducedMotion = prefersReduced ?? false;

  const [activeCategory, setActiveCategory] = useState<string>('All');

  const filtered =
    activeCategory === 'All'
      ? features
      : features.filter((f) => f.category === activeCategory);

  return (
    <div className="section-container">
      {/* Section Header */}
      <div className="mb-12 text-center">
        <h2 className="section-title">Every feature, at a glance</h2>
        <p className="section-subtitle mx-auto">
          20+ features across audio, AI, productivity, and privacy.
        </p>
      </div>

      {/* Filter Pills */}
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {categories.map((cat) => {
          const isActive = cat === activeCategory;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`cursor-pointer rounded-full px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-accent-purple font-semibold text-surface'
                  : 'border border-white/5 bg-surface-raised text-text-secondary hover:text-text-primary'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <AnimatePresence mode="popLayout">
        <motion.div
          layout={!reducedMotion}
          className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
        >
          {filtered.map((feature) => (
            <FeatureCard
              key={feature.name}
              feature={feature}
              reducedMotion={reducedMotion}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
