# NexQ Public Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build NexQ's public presence — an Astro microsite on GitHub Pages, a professional README, and expanded user guides.

**Architecture:** Astro 5 static site in `/website` with React islands (Hero, FeatureScroller, UseCases, FeatureGrid) hydrated via `client:visible`. Everything else is zero-JS Astro. Data-driven via JSON files. GitHub Actions auto-deploys on push.

**Tech Stack:** Astro 5, React 18, Tailwind CSS 3.4, Framer Motion 11, Lenis (smooth scroll), GitHub Actions, shields.io badges

**Spec:** `docs/superpowers/specs/2026-03-27-public-presence-design.md`

**GitHub Repo:** `VahidAlizadeh/NexQ`

---

## File Map

### New Files (website/)

| File | Responsibility |
|------|---------------|
| `website/package.json` | Astro project deps (separate from app) |
| `website/astro.config.mjs` | Astro config: base path, React integration, Tailwind |
| `website/tsconfig.json` | TypeScript config for Astro |
| `website/tailwind.config.mjs` | Tailwind config: dark theme, custom colors, fonts |
| `website/src/layouts/Layout.astro` | Base HTML shell: meta tags, fonts, Lenis init, global CSS |
| `website/src/pages/index.astro` | One-page site: imports and assembles all 12 sections |
| `website/src/styles/global.css` | Tailwind directives + custom properties + scroll animations |
| `website/src/data/features.json` | Feature inventory (20 items with name, category, version, isNew, icon, description) |
| `website/src/data/comparison.json` | Competitor matrix (8 competitors × 11 dimensions) |
| `website/src/components/Navbar.astro` | Static navbar with anchor links + GitHub stars badge |
| `website/src/components/Hero.tsx` | React island: split hero with animated interview demo |
| `website/src/components/PainPoint.astro` | Static: 3 problem cards with CSS scroll-triggered reveal |
| `website/src/components/FeatureScroller.tsx` | React island: sticky scroll navigator |
| `website/src/components/UseCases.tsx` | React island: tabbed scenarios (Interview/Lecture/Team) |
| `website/src/components/FeatureGrid.tsx` | React island: filterable bento grid with badges |
| `website/src/components/Comparison.astro` | Static: pain point cards + comparison matrix table |
| `website/src/components/HowItWorks.astro` | Static: 3-step animated timeline |
| `website/src/components/TechStack.astro` | Static: logo grid with hover animations |
| `website/src/components/OpenSource.astro` | Static: GitHub stats + contribution CTA |
| `website/src/components/FinalCTA.astro` | Static: closing headline + download/star buttons |
| `website/src/components/Footer.astro` | Static: links, license, credits |
| `website/public/nexq-logo.png` | Brand logo (copied from src-tauri/icons/) |
| `website/public/screenshots/` | Directory for all 11 screenshots (placeholder images initially) |
| `website/public/icons/` | Tech stack SVG logos |

### New Files (repo root)

| File | Responsibility |
|------|---------------|
| `.github/workflows/deploy-website.yml` | GitHub Actions: build Astro → deploy to Pages |

### Modified Files

| File | Changes |
|------|---------|
| `README.md` | Complete overhaul per spec section 3 |
| `docs/user-guide/getting-started.md` | Polish + add screenshot references |
| `docs/user-guide/configuration.md` | Polish + expand provider setup |
| `docs/user-guide/troubleshooting.md` | Expand common issues |

### New User Guides

| File | Content |
|------|---------|
| `docs/user-guide/interview-copilot.md` | Interview-specific setup and best practices |
| `docs/user-guide/lecture-assistant.md` | Lecture-specific setup and workflows |
| `docs/user-guide/audio-setup.md` | WASAPI, dual-party, recording |
| `docs/user-guide/ai-providers.md` | STT + LLM provider selection and setup |
| `docs/user-guide/rag-context.md` | Document loading, indexing, RAG usage |

---

## Task 1: Scaffold Astro Project

**Files:**
- Create: `website/package.json`
- Create: `website/astro.config.mjs`
- Create: `website/tsconfig.json`
- Create: `website/tailwind.config.mjs`

- [ ] **Step 1: Create website directory and package.json**

```bash
cd C:/Users/vahid/Desktop/VahidVibeProject/NexQ
mkdir -p website/src/{layouts,pages,components,styles,data} website/public/{screenshots,icons}
```

Create `website/package.json`:

```json
{
  "name": "nexq-website",
  "type": "module",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  }
}
```

- [ ] **Step 2: Install Astro and dependencies**

```bash
cd website
npm install astro @astrojs/react @astrojs/tailwind react react-dom framer-motion lenis
npm install -D @types/react @types/react-dom tailwindcss typescript
```

- [ ] **Step 3: Create astro.config.mjs**

```javascript
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://VahidAlizadeh.github.io',
  base: '/NexQ/',
  output: 'static',
  integrations: [
    react(),
    tailwind(),
  ],
});
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

- [ ] **Step 5: Create tailwind.config.mjs**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0c0c14',
          raised: '#12121c',
          overlay: '#1a1a28',
        },
        accent: {
          purple: '#a78bfa',
          blue: '#60a5fa',
          green: '#34d399',
          red: '#ef4444',
          amber: '#fbbf24',
        },
        text: {
          primary: '#f0f0f5',
          secondary: '#8888a0',
          muted: '#555566',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Cascadia Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 6: Verify scaffold builds**

```bash
cd website && npx astro build
```

Expected: Build succeeds with empty site.

- [ ] **Step 7: Commit**

```bash
git add website/
git commit -m "feat(website): scaffold Astro project with React, Tailwind, Framer Motion"
```

---

## Task 2: Data Files

**Files:**
- Create: `website/src/data/features.json`
- Create: `website/src/data/comparison.json`

- [ ] **Step 1: Create features.json**

```json
[
  { "name": "Dual-Party Audio", "category": "Audio", "version": "v2.18", "isNew": true, "icon": "🎧", "description": "Separate mic + system audio streams with independent STT" },
  { "name": "10 STT Providers", "category": "Audio", "version": "v2.16", "isNew": false, "icon": "🗣️", "description": "Local Whisper to cloud Deepgram, Groq, and more" },
  { "name": "Audio Recording", "category": "Audio", "version": "v2.16", "isNew": false, "icon": "🎙️", "description": "Record meetings as WAV with playback support" },
  { "name": "Speaker Labels", "category": "Audio", "version": "v2.20", "isNew": true, "icon": "🏷️", "description": "Identify and name each speaker in the transcript" },
  { "name": "Web Speech API", "category": "Audio", "version": "v2.18", "isNew": false, "icon": "🌐", "description": "Zero-config browser STT, no API key needed" },
  { "name": "AI Copilot (8 LLM)", "category": "AI", "version": "v2.12", "isNew": false, "icon": "🤖", "description": "Real-time AI assistance from 8 providers including local Ollama" },
  { "name": "Local RAG Pipeline", "category": "AI", "version": "v2.20", "isNew": true, "icon": "📄", "description": "Load PDFs, docs, notes — AI answers grounded in your context" },
  { "name": "Action Items", "category": "AI", "version": "v2.20", "isNew": true, "icon": "✅", "description": "Auto-extract tasks and follow-ups from conversations" },
  { "name": "AI Call Log", "category": "AI", "version": "v2.10", "isNew": false, "icon": "📋", "description": "Complete history of AI interactions per meeting" },
  { "name": "Question Detection", "category": "AI", "version": "v2.14", "isNew": false, "icon": "❓", "description": "Automatically detects questions in conversation flow" },
  { "name": "Bookmarks", "category": "Productivity", "version": "v2.20", "isNew": true, "icon": "🔖", "description": "Pin key moments during meetings for quick review" },
  { "name": "Topic Sections", "category": "Productivity", "version": "v2.17", "isNew": false, "icon": "📊", "description": "Auto-detect and segment conversation topics" },
  { "name": "Translation (5 providers)", "category": "Productivity", "version": "v2.19", "isNew": false, "icon": "🌍", "description": "Real-time translation via Microsoft, Google, DeepL, OPUS-MT, LLM" },
  { "name": "Meeting Scenarios", "category": "Productivity", "version": "v2.15", "isNew": false, "icon": "🎭", "description": "Pre-configured templates for interviews, lectures, team meetings" },
  { "name": "Keyboard Shortcuts", "category": "Productivity", "version": "v2.8", "isNew": false, "icon": "⌨️", "description": "Full keyboard control for hands-free operation" },
  { "name": "100% Local Processing", "category": "Privacy", "version": "v1.0", "isNew": false, "icon": "🔒", "description": "All audio and data stays on your machine" },
  { "name": "Windows CredentialManager", "category": "Privacy", "version": "v2.5", "isNew": false, "icon": "🔑", "description": "API keys stored securely in OS credential vault" },
  { "name": "Local SQLite Database", "category": "Privacy", "version": "v2.0", "isNew": false, "icon": "🗄️", "description": "All data in a local database — no cloud sync" },
  { "name": "No Bot / No Cloud", "category": "Privacy", "version": "v1.0", "isNew": false, "icon": "🚫", "description": "No bots join your calls, no audio uploaded" },
  { "name": "Auto-Updater", "category": "Privacy", "version": "v2.18", "isNew": false, "icon": "🔄", "description": "Ed25519-signed updates from GitHub Releases" }
]
```

- [ ] **Step 2: Create comparison.json**

```json
{
  "dimensions": [
    "Price", "100% Local", "No Bot Joins Call", "Open Source",
    "Multiple STT Providers", "Multiple LLM Providers", "Local LLM Support",
    "Dual-Party Audio", "RAG / Doc Context", "Windows Native", "Real-Time Translation"
  ],
  "competitors": [
    {
      "name": "NexQ", "highlight": true,
      "values": ["Free", "full", "full", "full", "full:10", "full:8", "full", "full", "full", "full", "full"]
    },
    {
      "name": "Otter.ai", "highlight": false,
      "values": ["$8+/mo", "none", "none", "none", "none:1", "none:1", "none", "full", "none", "none:web", "none"]
    },
    {
      "name": "Fireflies", "highlight": false,
      "values": ["$10+/mo", "none", "none", "none", "none:1", "none:1", "none", "full", "none", "none:web", "partial"]
    },
    {
      "name": "Granola", "highlight": false,
      "values": ["$18/mo", "partial", "full", "none", "none:1", "none:1", "none", "full", "none", "none:Mac", "none"]
    },
    {
      "name": "Krisp", "highlight": false,
      "values": ["$16/mo", "partial", "full", "none", "none:1", "none:1", "none", "full", "none", "full", "none"]
    },
    {
      "name": "Tactiq", "highlight": false,
      "values": ["$8+/mo", "partial", "full", "none", "partial:piggyback", "none:1", "none", "partial", "none", "none:Chrome", "none"]
    },
    {
      "name": "MeetGeek", "highlight": false,
      "values": ["$10+/mo", "none", "none", "none", "none:1", "none:1", "none", "full", "none", "none:web", "none"]
    },
    {
      "name": "tl;dv", "highlight": false,
      "values": ["$20+/mo", "none", "none", "none", "none:1", "none:1", "none", "full", "none", "none:web", "none"]
    }
  ]
}
```

- [ ] **Step 3: Verify data imports**

Create a temporary test in `website/src/pages/index.astro`:

```astro
---
import features from '../data/features.json';
import comparison from '../data/comparison.json';
---
<html><body>
  <p>Features: {features.length}</p>
  <p>Competitors: {comparison.competitors.length}</p>
</body></html>
```

Run: `cd website && npx astro build`
Expected: Build succeeds, output shows "Features: 20" and "Competitors: 8"

- [ ] **Step 4: Commit**

```bash
git add website/src/data/
git commit -m "feat(website): add feature inventory and competitor comparison data"
```

---

## Task 3: Global Styles + Layout

**Files:**
- Create: `website/src/styles/global.css`
- Create: `website/src/layouts/Layout.astro`

- [ ] **Step 1: Create global.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --surface: #0c0c14;
    --surface-raised: #12121c;
    --surface-overlay: #1a1a28;
    --accent-purple: #a78bfa;
    --accent-blue: #60a5fa;
    --accent-green: #34d399;
    --accent-red: #ef4444;
    --text-primary: #f0f0f5;
    --text-secondary: #8888a0;
    --text-muted: #555566;
    --border: rgba(255, 255, 255, 0.06);
  }

  html {
    background: var(--surface);
    color: var(--text-primary);
    scroll-behavior: smooth;
  }

  body {
    font-family: 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  ::selection {
    background: rgba(167, 139, 250, 0.3);
    color: var(--text-primary);
  }
}

@layer components {
  .section-container {
    @apply max-w-6xl mx-auto px-6 py-20 md:py-28;
  }

  .section-title {
    @apply text-3xl md:text-4xl font-extrabold tracking-tight text-text-primary;
  }

  .section-subtitle {
    @apply text-base md:text-lg text-text-secondary mt-3 max-w-2xl;
  }

  .badge-new {
    @apply inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded bg-accent-green/15 text-accent-green;
  }

  .badge-version {
    @apply inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-accent-purple/15 text-accent-purple;
  }

  .btn-primary {
    @apply inline-flex items-center gap-2 px-6 py-3 bg-accent-green text-surface font-bold rounded-lg
           hover:bg-accent-green/90 transition-colors duration-200;
  }

  .btn-secondary {
    @apply inline-flex items-center gap-2 px-6 py-3 border border-white/10 text-text-secondary font-medium rounded-lg
           hover:border-white/20 hover:text-text-primary transition-colors duration-200;
  }
}

/* Scroll-triggered animations */
@layer utilities {
  .animate-on-scroll {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.6s ease-out, transform 0.6s ease-out;
  }

  .animate-on-scroll.is-visible {
    opacity: 1;
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    .animate-on-scroll {
      opacity: 1;
      transform: none;
      transition: none;
    }
  }
}
```

- [ ] **Step 2: Create Layout.astro**

```astro
---
interface Props {
  title?: string;
  description?: string;
}

const {
  title = 'NexQ — AI Meeting Assistant & Real-Time Interview Copilot',
  description = 'Free, open-source AI meeting assistant that runs 100% on your machine. Real-time transcription, AI copilot, local RAG — no cloud, no bots, no subscriptions.',
} = Astro.props;

const baseUrl = import.meta.env.BASE_URL;
---

<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content={description} />
    <meta name="theme-color" content="#0c0c14" />

    <!-- Open Graph -->
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:image" content={`${baseUrl}og-image.png`} />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

    <link rel="icon" type="image/png" href={`${baseUrl}nexq-logo.png`} />
    <title>{title}</title>
  </head>
  <body class="bg-surface text-text-primary overflow-x-hidden">
    <slot />

    <!-- Lenis smooth scroll -->
    <script>
      import Lenis from 'lenis';

      const lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });

      function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);

      // Scroll-triggered animations via IntersectionObserver
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
            }
          });
        },
        { threshold: 0.1 }
      );

      document.querySelectorAll('.animate-on-scroll').forEach((el) => {
        observer.observe(el);
      });
    </script>
  </body>
</html>
```

- [ ] **Step 3: Copy logo to website/public**

```bash
cp src-tauri/icons/nexq-clean.png website/public/nexq-logo.png
```

- [ ] **Step 4: Create placeholder screenshot images**

```bash
# Create 1x1 placeholder PNGs (will be replaced with real screenshots)
for i in 1 2 3 4 5 6 7 8 9 10 11; do
  cp src-tauri/icons/32x32.png "website/public/screenshots/placeholder-$i.png"
done
```

- [ ] **Step 5: Verify layout builds**

Update `website/src/pages/index.astro`:

```astro
---
import Layout from '../layouts/Layout.astro';
---
<Layout>
  <main class="section-container">
    <h1 class="section-title">NexQ Website</h1>
    <p class="section-subtitle">Coming together section by section.</p>
  </main>
</Layout>
```

Run: `cd website && npx astro build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add website/src/styles/ website/src/layouts/ website/src/pages/ website/public/
git commit -m "feat(website): add global styles, Layout.astro with Lenis, brand assets"
```

---

## Task 4: Navbar

**Files:**
- Create: `website/src/components/Navbar.astro`

- [ ] **Step 1: Create Navbar.astro**

Static navbar with anchor links, GitHub stars badge, and Download CTA. Sticky with backdrop blur on scroll.

```astro
---
const baseUrl = import.meta.env.BASE_URL;
const repoUrl = 'https://github.com/VahidAlizadeh/NexQ';
const downloadUrl = `${repoUrl}/releases/latest`;
---

<nav id="navbar" class="fixed top-0 left-0 right-0 z-50 transition-all duration-300">
  <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
    <!-- Logo -->
    <a href="#" class="flex items-center gap-2.5">
      <img src={`${baseUrl}nexq-logo.png`} alt="NexQ" class="h-8 w-8 rounded-lg" />
      <span class="text-lg font-bold text-text-primary">NexQ</span>
    </a>

    <!-- Nav links (hidden on mobile) -->
    <div class="hidden md:flex items-center gap-8">
      <a href="#features" class="text-sm text-text-secondary hover:text-text-primary transition-colors">Features</a>
      <a href="#use-cases" class="text-sm text-text-secondary hover:text-text-primary transition-colors">Use Cases</a>
      <a href="#compare" class="text-sm text-text-secondary hover:text-text-primary transition-colors">Compare</a>
      <a href="#docs" class="text-sm text-text-secondary hover:text-text-primary transition-colors">Docs</a>
    </div>

    <!-- Right side -->
    <div class="flex items-center gap-3">
      <a href={repoUrl} target="_blank" rel="noopener" class="hidden sm:inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        <img src={`https://img.shields.io/github/stars/VahidAlizadeh/NexQ?style=flat&label=&color=333&labelColor=333`} alt="stars" class="h-5" />
      </a>
      <a href={downloadUrl} class="btn-primary text-sm !py-2 !px-4">
        Download
      </a>
    </div>
  </div>
</nav>

<script>
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      navbar?.classList.add('bg-surface/80', 'backdrop-blur-xl', 'border-b', 'border-white/5');
    } else {
      navbar?.classList.remove('bg-surface/80', 'backdrop-blur-xl', 'border-b', 'border-white/5');
    }
  });
</script>
```

- [ ] **Step 2: Add Navbar to index.astro**

```astro
---
import Layout from '../layouts/Layout.astro';
import Navbar from '../components/Navbar.astro';
---
<Layout>
  <Navbar />
  <main class="pt-16">
    <div class="section-container">
      <p class="section-subtitle">Sections loading below...</p>
    </div>
  </main>
</Layout>
```

- [ ] **Step 3: Verify and commit**

Run: `cd website && npx astro dev` — visually confirm navbar renders with logo, links, badge, download button.

```bash
git add website/src/components/Navbar.astro website/src/pages/index.astro
git commit -m "feat(website): add sticky Navbar with anchor links and GitHub stars"
```

---

## Task 5: Hero Section (React Island)

**Files:**
- Create: `website/src/components/Hero.tsx`

- [ ] **Step 1: Create Hero.tsx**

Split layout: headline + CTAs left, animated interview demo mockup right. Uses Framer Motion for staggered transcript animation and AI suggestion typing effect.

The component contains:
- Left: Eyebrow badge, headline with green gradient accent, subheadline, dual CTA buttons
- Right: Animated NexQ overlay mockup with flowing transcript lines and AI suggestion

Key animations:
- Transcript lines fade in with staggered delay (spring physics)
- AI suggestion types character-by-character
- Ambient glow pulses behind the mockup
- `prefers-reduced-motion` disables all animations

The hero should be approximately 200-250 lines of React+TSX. The animated demo mockup simulates a live interview with hardcoded transcript data:
- You: "Tell me about a challenging project you've led."
- Them: "At my previous company, I led the migration of our monolith to microservices..."
- You: "What was the biggest obstacle?"
- Them: "Coordinating across 4 teams while maintaining uptime..."
- AI Suggestion: "Ask about the team size and how they handled the rollback strategy"

Use `framer-motion`'s `useInView`, `motion.div`, `AnimatePresence`, and spring transitions (`type: "spring", stiffness: 100, damping: 20`).

- [ ] **Step 2: Add Hero to index.astro**

```astro
---
import Layout from '../layouts/Layout.astro';
import Navbar from '../components/Navbar.astro';
import Hero from '../components/Hero.tsx';
---
<Layout>
  <Navbar />
  <main class="pt-16">
    <Hero client:load />
  </main>
</Layout>
```

Note: Hero uses `client:load` (not `client:visible`) because it's above the fold.

- [ ] **Step 3: Verify and commit**

Run: `cd website && npx astro dev` — verify hero renders with split layout, animated transcript, and CTA buttons.

```bash
git add website/src/components/Hero.tsx website/src/pages/index.astro
git commit -m "feat(website): add Hero section with animated interview demo mockup"
```

---

## Task 6: Pain Points Section

**Files:**
- Create: `website/src/components/PainPoint.astro`

- [ ] **Step 1: Create PainPoint.astro**

Three problem cards with scroll-triggered CSS reveal. Red-tinted backgrounds. Each card names competitors directly.

Cards data:
1. Icon: 🤖, Headline: "Bots join your calls", Subtext: "Otter, Fireflies, and MeetGeek send visible bots that announce themselves to everyone"
2. Icon: ☁️, Headline: "Audio sent to cloud", Subtext: "Even Granola — marketed as 'local' — uploads your audio to cloud servers for transcription"
3. Icon: 💸, Headline: "$8–20+/mo per user", Subtext: "Basic features are free, but anything useful requires a monthly subscription"

Each card uses `animate-on-scroll` class with staggered `transition-delay` (0ms, 150ms, 300ms).

- [ ] **Step 2: Add to index.astro after Hero**

```astro
import PainPoint from '../components/PainPoint.astro';
<!-- after Hero -->
<PainPoint />
```

- [ ] **Step 3: Verify and commit**

Run dev server, scroll past hero — cards should fade up one by one.

```bash
git add website/src/components/PainPoint.astro website/src/pages/index.astro
git commit -m "feat(website): add Pain Points section with scroll-triggered reveal"
```

---

## Task 7: Feature Scroller (React Island)

**Files:**
- Create: `website/src/components/FeatureScroller.tsx`

- [ ] **Step 1: Create FeatureScroller.tsx**

Sticky scroll navigator: left sidebar (40%) lists 8 hero features, right panel (60%) shows screenshot that transitions on scroll.

Implementation approach:
- Left side: list of features, each wrapped in a `div` with `ref` tracked by `IntersectionObserver`
- Right side: `position: sticky; top: 50%` container showing the active feature's screenshot
- When a feature enters the viewport center, it becomes "active" — left border highlights, description expands, right screenshot crossfades
- Screenshot transition uses Framer Motion `AnimatePresence` with `mode="wait"` and fade+scale spring
- Each feature item shows: name (bold), one-line description, version badge, optional NEW tag

Screenshot mapping: Each feature references a placeholder image from `public/screenshots/` for now. These will be replaced with real screenshots later.

Use `useScroll` + `useTransform` from Framer Motion for scroll progress, `IntersectionObserver` for active feature detection.

- [ ] **Step 2: Add to index.astro**

```astro
import FeatureScroller from '../components/FeatureScroller.tsx';
<!-- after PainPoint -->
<section id="features">
  <FeatureScroller client:visible />
</section>
```

- [ ] **Step 3: Verify and commit**

Run dev server, scroll through features — screenshot should transition as each feature enters viewport.

```bash
git add website/src/components/FeatureScroller.tsx website/src/pages/index.astro
git commit -m "feat(website): add sticky scroll Feature Navigator with screenshot transitions"
```

---

## Task 8: Use Cases (React Island)

**Files:**
- Create: `website/src/components/UseCases.tsx`

- [ ] **Step 1: Create UseCases.tsx**

Tabbed scenarios with 3 tabs: Interview Copilot, Lecture Assistant, Team Meeting.

Each tab contains:
- Tab label + icon emoji
- Description paragraph
- Feature tag pills
- Screenshot placeholder

Tab switch animation: `AnimatePresence` with horizontal slide (`x: -20` exit, `x: 20` enter) and opacity fade.

Tab data hardcoded in the component:

```typescript
const scenarios = [
  {
    id: 'interview',
    icon: '🎯',
    label: 'Interview Copilot',
    description: 'Ace every interview. Get real-time AI-suggested follow-up questions, key talking points, and context from your resume. NexQ listens to both sides and helps you shine.',
    tags: ['AI Suggestions', 'Resume RAG', 'Dual Transcription'],
    screenshot: 'placeholder-1.png',
  },
  {
    id: 'lecture',
    icon: '📚',
    label: 'Lecture Assistant',
    description: 'Never miss a key concept. Auto-transcribe lectures, bookmark important moments, extract action items, and get AI summaries of each topic section.',
    tags: ['Bookmarks', 'Action Items', 'Topic Detection', 'Long-Session STT'],
    screenshot: 'placeholder-2.png',
  },
  {
    id: 'team',
    icon: '👥',
    label: 'Team Meeting',
    description: 'Stay focused, let NexQ handle the notes. Dual-party transcription captures everyone, AI extracts action items, and speaker labels keep track of who said what.',
    tags: ['Speaker Labels', 'Action Items', 'Dual Transcription'],
    screenshot: 'placeholder-3.png',
  },
];
```

- [ ] **Step 2: Add to index.astro**

```astro
import UseCases from '../components/UseCases.tsx';
<!-- after FeatureScroller -->
<section id="use-cases">
  <UseCases client:visible />
</section>
```

- [ ] **Step 3: Verify and commit**

Run dev server, click tabs — content should slide-transition between scenarios.

```bash
git add website/src/components/UseCases.tsx website/src/pages/index.astro
git commit -m "feat(website): add tabbed Use Cases section (Interview/Lecture/Team)"
```

---

## Task 9: Feature Grid (React Island)

**Files:**
- Create: `website/src/components/FeatureGrid.tsx`

- [ ] **Step 1: Create FeatureGrid.tsx**

Filterable bento grid importing from `features.json`.

Implementation:
- Category filter pills at top: All (default), Audio, AI, Productivity, Privacy
- Active pill uses `accent-purple` background, others use `surface-raised`
- Grid: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` responsive
- Each card: icon, name, description, version/NEW badge
- Filter uses Framer Motion `layout` prop on each card for smooth reflow
- Cards that don't match current filter animate out (`opacity: 0, scale: 0.8`) then are removed from DOM
- Matching cards spring into position

Import features data:

```typescript
import featuresData from '../data/features.json';
```

- [ ] **Step 2: Add to index.astro**

```astro
import FeatureGrid from '../components/FeatureGrid.tsx';
<!-- after UseCases -->
<FeatureGrid client:visible />
```

- [ ] **Step 3: Verify and commit**

Run dev server, click filter pills — cards should animate in/out with smooth reflow.

```bash
git add website/src/components/FeatureGrid.tsx website/src/pages/index.astro
git commit -m "feat(website): add filterable Feature Grid with animated layout transitions"
```

---

## Task 10: Comparison Section

**Files:**
- Create: `website/src/components/Comparison.astro`

- [ ] **Step 1: Create Comparison.astro**

Two parts:
1. Pain point callout cards (wider format than section 2.3, same content but styled as a prelude to the table)
2. Full comparison matrix table from `comparison.json`

Table implementation:
- Import and iterate `comparison.json`
- Map values: `"full"` → 🟢, `"partial"` → 🟡, `"none"` → 🔴
- Values with suffix (e.g., `"full:10"`) show the number in parentheses
- Values like `"none:web"` show the platform in parentheses after the indicator
- NexQ column (`highlight: true`) gets `bg-accent-purple/5` background tint
- Price row shows actual prices in bold
- Horizontal scroll on mobile (`overflow-x-auto`)

Section heading: "Stop paying for what should be yours"
Subheading: "Your conversations. Your data. Your device. No exceptions."

All cards and table rows use `animate-on-scroll`.

- [ ] **Step 2: Add to index.astro**

```astro
import Comparison from '../components/Comparison.astro';
<!-- after FeatureGrid -->
<section id="compare">
  <Comparison />
</section>
```

- [ ] **Step 3: Verify and commit**

Run dev server — pain point cards + full matrix table should render with scroll animations.

```bash
git add website/src/components/Comparison.astro website/src/pages/index.astro
git commit -m "feat(website): add Comparison section with pain points and competitor matrix"
```

---

## Task 11: How It Works + Tech Stack + Open Source

**Files:**
- Create: `website/src/components/HowItWorks.astro`
- Create: `website/src/components/TechStack.astro`
- Create: `website/src/components/OpenSource.astro`

- [ ] **Step 1: Create HowItWorks.astro**

3-step horizontal timeline with numbered circles and connecting lines.

Steps:
1. "Download" — "One-click Windows installer. No admin rights needed." + download icon
2. "Configure" — "Add API keys or use free local models (Whisper, Ollama)." + settings icon
3. "Start" — "Join any meeting platform. NexQ captures system audio automatically." + play icon

Each step fades in on scroll with staggered delay. Numbers use `accent-green` background circles.

- [ ] **Step 2: Create TechStack.astro**

Heading: "Built with Rust for speed and safety"

Logo grid of 7 technologies. Each card: technology SVG logo (inline SVG or emoji fallback), name, role description. Hover: `scale-105` transition + glow effect.

Technologies:
1. Tauri 2 — "Desktop framework"
2. Rust — "Backend & audio"
3. React 18 — "User interface"
4. TypeScript — "Type safety"
5. Tailwind CSS — "Styling"
6. SQLite — "Local database"
7. WASAPI — "Audio capture"

Use inline SVGs or emoji fallbacks for the logos. Real SVG logos can be added to `website/public/icons/` later.

- [ ] **Step 3: Create OpenSource.astro**

Heading: "Built in the open"
Subheading: "NexQ is MIT-licensed and always will be. Star us, fork us, contribute."

Three stat cards:
1. GitHub stars (using shields.io badge image)
2. "400+ commits" (hardcoded, update periodically)
3. "MIT Licensed" (static)

CTA buttons: "Star on GitHub" (primary) + "Read Contributing Guide" (secondary)

- [ ] **Step 4: Add all three to index.astro**

```astro
import HowItWorks from '../components/HowItWorks.astro';
import TechStack from '../components/TechStack.astro';
import OpenSource from '../components/OpenSource.astro';
<!-- after Comparison -->
<section id="docs">
  <HowItWorks />
</section>
<TechStack />
<OpenSource />
```

- [ ] **Step 5: Verify and commit**

Run dev server — all three sections should render with scroll animations and hover effects.

```bash
git add website/src/components/HowItWorks.astro website/src/components/TechStack.astro website/src/components/OpenSource.astro website/src/pages/index.astro
git commit -m "feat(website): add How It Works, Tech Stack, and Open Source sections"
```

---

## Task 12: Final CTA + Footer

**Files:**
- Create: `website/src/components/FinalCTA.astro`
- Create: `website/src/components/Footer.astro`

- [ ] **Step 1: Create FinalCTA.astro**

Full-width dark section with gradient top border.

Heading: "Ready to own your meetings?"
Subtext: "Free. Private. Open source. Download NexQ and take control."
Buttons: `[Download for Windows]` (btn-primary, large) + `[Star on GitHub]` (btn-secondary, large)

- [ ] **Step 2: Create Footer.astro**

Three-column footer:
- Col 1: Product — Features, Use Cases, Compare
- Col 2: Docs — Getting Started, User Guide, Troubleshooting
- Col 3: Community — GitHub, Contributing, License

Bottom row: NexQ logo + "Made by Vahid Alizadeh" + MIT License + copyright 2026

- [ ] **Step 3: Add to index.astro, verify, commit**

```astro
import FinalCTA from '../components/FinalCTA.astro';
import Footer from '../components/Footer.astro';
<!-- after OpenSource -->
<FinalCTA />
<Footer />
```

```bash
git add website/src/components/FinalCTA.astro website/src/components/Footer.astro website/src/pages/index.astro
git commit -m "feat(website): add Final CTA and Footer sections"
```

---

## Task 13: Page Assembly + Polish

**Files:**
- Modify: `website/src/pages/index.astro`

- [ ] **Step 1: Assemble final index.astro**

Ensure all 12 sections are imported and ordered correctly with proper `id` attributes for navbar anchor links:

1. `<Navbar />`
2. `<Hero client:load />`
3. `<PainPoint />`
4. `<section id="features"><FeatureScroller client:visible /></section>`
5. `<section id="use-cases"><UseCases client:visible /></section>`
6. `<FeatureGrid client:visible />`
7. `<section id="compare"><Comparison /></section>`
8. `<section id="docs"><HowItWorks /></section>`
9. `<TechStack />`
10. `<OpenSource />`
11. `<FinalCTA />`
12. `<Footer />`

- [ ] **Step 2: Add section dividers**

Between sections, add subtle dividers where the design calls for visual separation:

```html
<div class="max-w-6xl mx-auto px-6">
  <div class="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
</div>
```

- [ ] **Step 3: Full build verification**

```bash
cd website && npx astro build
```

Expected: Clean build, no errors, output in `dist/`.

- [ ] **Step 4: Visual review**

```bash
cd website && npx astro preview
```

Open in browser. Walk through all 12 sections. Verify:
- Navbar sticky + blur on scroll
- Hero animation plays
- Pain points fade in on scroll
- Feature scroller sticky behavior works
- Use case tabs switch with animation
- Feature grid filters work
- Comparison table renders correctly
- How It Works timeline animates
- All links point to correct anchors
- Responsive: check at 375px, 768px, 1280px widths

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/index.astro
git commit -m "feat(website): assemble all 12 sections into final one-page layout"
```

---

## Task 14: Responsive Design + Reduced Motion

**Files:**
- Modify: All website components as needed

- [ ] **Step 1: Mobile responsive audit**

Review each component at 375px width:
- Navbar: hamburger menu or simplified layout on mobile
- Hero: stack vertically (headline above, demo below)
- Feature Scroller: stack vertically (no sticky, linear scroll)
- Use Cases: tabs wrap or become a vertical accordion
- Feature Grid: `grid-cols-2` on mobile
- Comparison table: horizontal scroll with sticky first column
- Footer: single column stack

- [ ] **Step 2: Reduced motion audit**

Verify every Framer Motion animation respects `prefers-reduced-motion`:

```typescript
import { useReducedMotion } from 'framer-motion';
const shouldReduceMotion = useReducedMotion();
```

When `shouldReduceMotion` is true:
- Disable all spring/tween animations
- Show content immediately (no staggered reveals)
- Tab switches snap instead of slide

CSS `animate-on-scroll` elements already have the media query from `global.css`.

- [ ] **Step 3: Lighthouse audit**

Run Lighthouse against the built site to verify performance targets from the spec:

```bash
cd website && npx astro build && npx astro preview &
# In another terminal:
npx lighthouse http://localhost:4321/NexQ/ --output=json --output-path=./lighthouse.json --chrome-flags="--headless"
```

Check results against targets:
- Performance: 95+
- Accessibility: 100
- Total JS < 50KB gzipped

If any target is missed, investigate and fix before proceeding. Common fixes: lazy-load images, reduce Framer Motion bundle, add missing alt text.

- [ ] **Step 4: Test and commit**

```bash
git add website/
git commit -m "feat(website): responsive design and prefers-reduced-motion support"
```

---

## Task 15: GitHub Actions Deployment

**Files:**
- Create: `.github/workflows/deploy-website.yml`

- [ ] **Step 1: Create deploy-website.yml**

```yaml
name: Deploy Website

on:
  push:
    branches: [main]
    paths: ['website/**']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci
        working-directory: website

      - name: Build Astro
        run: npx astro build
        working-directory: website

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: website/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Verify workflow syntax**

```bash
# Check YAML is valid
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-website.yml'))" 2>/dev/null || echo "Install PyYAML or verify manually"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-website.yml
git commit -m "ci: add GitHub Actions workflow for website deployment to Pages"
```

---

## Task 16: README Overhaul

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite README.md**

Complete overhaul following the spec's Section 3 structure. Key changes from current README:

1. **Logo section**: Center-aligned logo image from `src-tauri/icons/nexq-clean.png` (using relative path)
2. **Tagline**: Keep existing
3. **Badges**: Keep existing row (already well-done), add GitHub stars badge
4. **NEW — Hero screenshot**: `<!-- TODO: Replace with real screenshot -->` placeholder with instruction
5. **NEW — 3 value props**: Bold one-liners (🔒 100% Local, 🆓 Free & Open Source, ⚡ 10 STT + 8 LLM)
6. **Features**: Expand from 6 to 9 items (add bookmarks, action items, speaker labels, translation, audio recording, scenarios)
7. **Quick Start**: Simplify from 4 to 3 steps, add links to getting-started guide and website
8. **NEW — Why NexQ?**: Compact 4-competitor comparison table
9. **Screenshots**: Replace TODO with 4 placeholder references
10. **Tech Stack**: Keep existing table
11. **Development**: Keep existing section
12. **Windows SmartScreen**: Keep
13. **Contributing + License + Acknowledgments**: Keep, add link to website

Preserve all existing badge URLs (they work). Don't break any existing links.

- [ ] **Step 2: Verify README renders on GitHub**

```bash
# Check markdown renders (basic syntax check)
cd C:/Users/vahid/Desktop/VahidVibeProject/NexQ
head -50 README.md
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: overhaul README with value props, comparison table, and website link"
```

---

## Task 17: New User Guides

**Files:**
- Create: `docs/user-guide/interview-copilot.md`
- Create: `docs/user-guide/lecture-assistant.md`
- Create: `docs/user-guide/audio-setup.md`
- Create: `docs/user-guide/ai-providers.md`
- Create: `docs/user-guide/rag-context.md`

All guides follow the template from the spec:
```
# [Guide Title]
Brief intro (1-2 sentences)
## Prerequisites
## [Main content sections with step-by-step instructions]
## Tips
## Next Steps (links to related guides)
```

- [ ] **Step 1: Create interview-copilot.md**

Content covers:
- What NexQ does during interviews (dual transcription, AI suggestions)
- Setting up for an interview: choosing STT provider, configuring AI prompt for interview mode
- Loading your resume via RAG for context-aware help
- Overlay positioning tips (always-on-top, resize, transparency)
- Best practices: test before the real interview, mute notifications, use local STT for privacy
- Post-interview review: reviewing transcript, AI call log

- [ ] **Step 2: Create lecture-assistant.md**

Content covers:
- How NexQ helps during lectures (transcription, bookmarking, topics)
- Long-session STT recommendations (Web Speech API for free, Deepgram for accuracy)
- Bookmarking key moments during lectures
- Action item extraction from lecture content
- Topic detection for auto-segmenting lecture sections
- Post-lecture review workflow

- [ ] **Step 3: Create audio-setup.md**

Content covers:
- How dual-party audio works (WASAPI mic + system loopback)
- Selecting the right microphone
- System audio capture explained (Windows audio loopback)
- Common audio issues and fixes (no system audio, wrong mic, audio too quiet)
- Recording setup and file locations
- Audio device selection in NexQ settings

- [ ] **Step 4: Create ai-providers.md**

Content covers:
- STT provider comparison table (10 providers: name, type local/cloud, accuracy, speed, cost)
- LLM provider comparison table (8 providers: name, type, models, cost)
- Local vs cloud tradeoffs (privacy, speed, accuracy, cost)
- Setting up Ollama for free local LLM
- Setting up Whisper for free local STT
- API key setup walkthrough for cloud providers (Deepgram, Groq, OpenAI, Anthropic)

- [ ] **Step 5: Create rag-context.md**

Content covers:
- What RAG does and why it helps (grounds AI in your documents)
- Supported file formats (PDF, DOCX, TXT, MD)
- Loading documents into NexQ
- Indexing process and progress events
- Token budget management
- Best practices (what to load for interviews vs lectures vs meetings)
- Clearing and refreshing context

- [ ] **Step 6: Commit all guides**

```bash
git add docs/user-guide/interview-copilot.md docs/user-guide/lecture-assistant.md docs/user-guide/audio-setup.md docs/user-guide/ai-providers.md docs/user-guide/rag-context.md
git commit -m "docs: add 5 new user guides (interview, lecture, audio, providers, RAG)"
```

---

## Task 18: Polish Existing User Guides

**Files:**
- Modify: `docs/user-guide/getting-started.md`
- Modify: `docs/user-guide/configuration.md`
- Modify: `docs/user-guide/troubleshooting.md`

- [ ] **Step 1: Polish getting-started.md**

Changes:
- Fix GitHub URL (currently points to `nexq-ai/nexq`, should be `VahidAlizadeh/NexQ`)
- Add screenshot reference placeholders where they'll help
- Add "Next Steps" section linking to the new scenario guides (interview-copilot.md, lecture-assistant.md)
- Verify all keyboard shortcuts match current implementation

- [ ] **Step 2: Polish configuration.md**

Read the current file first. Changes:
- Add references to the new ai-providers.md guide for detailed provider setup
- Add references to audio-setup.md for audio configuration details
- Add screenshot reference placeholders for settings panels

- [ ] **Step 3: Expand troubleshooting.md**

Read the current file first. Add sections for common issues:
- "No system audio captured" — WASAPI setup, default audio device
- "STT not working" — provider-specific troubleshooting
- "AI responses are slow" — LLM provider selection, local vs cloud
- "Overlay not showing" — window management, always-on-top conflicts
- "Update failed" — manual update process, SmartScreen
- Cross-reference to audio-setup.md and ai-providers.md

- [ ] **Step 4: Commit**

```bash
git add docs/user-guide/getting-started.md docs/user-guide/configuration.md docs/user-guide/troubleshooting.md
git commit -m "docs: polish existing user guides with cross-references and expanded troubleshooting"
```

---

## Summary

| Task | Component | Type | Estimated Steps |
|------|-----------|------|-----------------|
| 1 | Scaffold Astro project | Foundation | 7 |
| 2 | Data files | Data | 4 |
| 3 | Global styles + Layout | Foundation | 6 |
| 4 | Navbar | Static Astro | 3 |
| 5 | Hero | React island | 3 |
| 6 | Pain Points | Static Astro | 3 |
| 7 | Feature Scroller | React island | 3 |
| 8 | Use Cases | React island | 3 |
| 9 | Feature Grid | React island | 3 |
| 10 | Comparison | Static Astro | 3 |
| 11 | HowItWorks + TechStack + OpenSource | Static Astro | 5 |
| 12 | FinalCTA + Footer | Static Astro | 3 |
| 13 | Page assembly + polish | Assembly | 5 |
| 14 | Responsive + reduced motion | Polish | 3 |
| 15 | GitHub Actions deployment | CI/CD | 3 |
| 16 | README overhaul | Docs | 3 |
| 17 | New user guides (5) | Docs | 6 |
| 18 | Polish existing guides | Docs | 4 |

**Total: 18 tasks, ~70 steps**

### Parallelization Opportunities

Tasks that can run in parallel (no dependencies):
- Tasks 4-12 (all components) can be developed in parallel after Tasks 1-3 complete
- Tasks 16-18 (README + user guides) can run in parallel with Tasks 4-15 (website)
- Task 15 (deployment) can run after any website task

### Screenshot Handoff

After Task 13 (assembly), the website will be functional with placeholder screenshots. At that point, provide the user with the screenshot matrix (spec section 5) and ask them to capture and place real screenshots in `website/public/screenshots/`. The website and README both reference these paths.
