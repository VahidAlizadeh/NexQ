# NexQ Public Presence — Design Spec

**Date:** 2026-03-27
**Scope:** GitHub Pages website, professional README, user guides
**Approach:** Astro Microsite (`/website` in monorepo)

---

## 1. Overview

Three deliverables shipped together as one cohesive brand package:

1. **One-page marketing website** — deployed to GitHub Pages (`username.github.io/NexQ`), future custom domain support
2. **Professional README** — concise conversion funnel from GitHub → website → download
3. **User guides** — 4 existing guides polished + 5 new scenario/reference guides

### Audience

- **Primary:** Job seekers preparing for interviews, students needing a lecture assistant
- **Secondary:** Developers/engineers who might use NexQ and contribute

### Brand Identity

Inherited from `.impeccable.md`:
- **Personality:** Bold. Refined. Alive.
- **Emotional goal:** Premium & polished — feels like a luxury instrument
- **References:** Notion (clean minimalism) × Arc Browser (bold spatial design, vibrant)
- **Anti-references:** Generic SaaS, AI-slop purple-blue gradients, cluttered IDE density, flat & lifeless
- **Design principles:** Every pixel intentional, motion earns attention, hierarchy > density, color with meaning, restraint is confidence

---

## 2. Website Design

### 2.1 Page Structure — Story Arc

12 sections, narrative flow from problem → solution → proof → action:

| # | Section | Purpose |
|---|---------|---------|
| 1 | **Navbar** | Logo, anchor links (Features, Use Cases, Compare, Docs), GitHub stars badge, Download CTA |
| 2 | **Hero** | Split layout: headline + CTAs left, animated live interview demo mockup right |
| 3 | **Pain Points** | 3 pointed callout cards: bots join calls, audio sent to cloud, $8-20/mo subscriptions |
| 4 | **Hero Features** | Sticky Scroll Navigator — feature list scrolls left, screenshot transitions right (6-8 features) |
| 5 | **Use Cases** | Tabbed Scenarios — Interview Copilot / Lecture Assistant / Team Meeting, each with screenshot |
| 6 | **Feature Grid** | Filterable Bento Grid — category pills (All/Audio/AI/Productivity/Privacy), version + NEW badges |
| 7 | **Comparison** | Pain points → color-coded matrix vs Otter, Fireflies, Granola, Krisp, Tactiq, MeetGeek, tl;dv |
| 8 | **How It Works** | 3-step animated timeline: Download → Configure → Start |
| 9 | **Tech Stack** | Logo grid (Rust, React, Tauri, Tailwind, etc.) with hover animations |
| 10 | **Open Source** | GitHub stats (stars, commits, contributors), contribution CTA |
| 11 | **Final CTA** | Bold headline ("Ready to own your meetings?"), Windows download + GitHub star buttons |
| 12 | **Footer** | Logo, nav links, license, social links, "Made by Vahid Alizadeh" |

### 2.2 Hero Section — Split with Live Demo

**Left side:**
- Eyebrow badge: `🔒 100% Local • Free • Open Source`
- Headline: "The AI meeting assistant that respects your privacy" (privacy-first green accent)
- Subheadline: "Real-time transcription & AI copilot for interviews, lectures, and meetings. Runs on your machine — nothing leaves your device."
- Dual CTA: `[Download]` (primary) + `[GitHub]` (secondary)

**Right side:**
- Animated mockup of the NexQ overlay window showing a live interview
- Transcript flowing in real-time (You + Them streams)
- AI suggestion appearing with typing animation
- Built as a React island with Framer Motion spring physics

**Animation behavior:**
- Transcript lines appear one by one with staggered fade-in
- AI suggestion types in character by character
- Subtle ambient glow/pulse behind the overlay mockup
- All animations use spring physics (never bounce/elastic per design principles)

### 2.3 Pain Points Section

> **Note:** This section is a brief emotional hook early in the scroll narrative. Section 2.7 (Comparison) repeats the same three pain points but expands them with a detailed matrix. This repetition is intentional — 2.3 plants the seed, 2.7 delivers the proof. The implementer may style them differently (e.g., 2.3 as compact animated cards, 2.7 as a wider layout with the matrix below).

Three cards, scroll-triggered reveal:

| Card | Icon | Headline | Subtext |
|------|------|----------|---------|
| 1 | 🤖 | Bots join your calls | Otter, Fireflies, MeetGeek send visible bots |
| 2 | ☁️ | Audio sent to cloud | Even Granola uploads audio for transcription |
| 3 | 💸 | $8–20+/mo per user | Subscriptions add up fast |

Each card uses `rgba(239,68,68,0.06)` background (red-tinted) to signal "problem."

### 2.4 Hero Features — Sticky Scroll Navigator

**Layout:** Left sidebar (40%) lists features, right panel (60%) shows a large screenshot that transitions as the user scrolls.

**Scroll behavior:** The screenshot panel stays `position: sticky` while the feature list scrolls. Each feature has a scroll-triggered highlight — when it enters the viewport center, its corresponding screenshot fades/slides in.

**Features to showcase (6-8):**

| Feature | Version | Badge | Screenshot |
|---------|---------|-------|------------|
| Dual-Party Transcription | v2.18 | NEW | Overlay showing You + Them streams |
| Real-Time AI Copilot | v2.15 | — | Call log with AI Q&A history |
| Local RAG Pipeline | v2.20 | NEW | Context panel with loaded PDFs |
| 10 STT Providers | v2.16 | — | Settings showing provider dropdown |
| Always-On-Top Overlay | v1.0 | — | Overlay floating over a Zoom call |
| 8 LLM Providers | v2.12 | — | Settings showing LLM selection |
| Audio Recording & Playback | v2.16 | — | Meeting with recording indicator |
| Multi-Language Translation | v2.19 | NEW | Transcript with live translation |

**Each feature item includes:**
- Feature name (bold)
- One-line description
- Version badge (colored pill)
- Optional NEW tag (green pill)
- Active state: left border highlight, expanded description

### 2.5 Use Cases — Tabbed Scenarios

Three horizontal tabs, each with:
- Tab label + icon (🎯 Interview Copilot / 📚 Lecture Assistant / 👥 Team Meeting)
- Scenario description (2-3 sentences)
- Feature tags (pills showing which NexQ features are relevant)
- Scenario-specific screenshot

**Tab content:**

**Interview Copilot:**
- "Ace every interview. Get real-time AI-suggested follow-up questions, key talking points, and context from your resume. NexQ listens to both sides and helps you shine."
- Tags: AI Suggestions, Resume RAG, Dual Transcription
- Screenshot: Overlay during an interview with AI suggestion visible

**Lecture Assistant:**
- "Never miss a key concept. Auto-transcribe lectures, bookmark important moments, extract action items, and get AI summaries of each topic section."
- Tags: Bookmarks, Action Items, Topic Detection, Long-Session STT
- Screenshot: Overlay during a lecture with bookmarks pinned

**Team Meeting:**
- "Stay focused, let NexQ handle the notes. Dual-party transcription captures everyone, AI extracts action items, and speaker labels keep track of who said what."
- Tags: Speaker Labels, Action Items, Dual Transcription
- Screenshot: Overlay during a team standup

**Animation:** Tab switch uses horizontal slide transition with Framer Motion `AnimatePresence`.

### 2.6 Feature Grid — Filterable Bento Grid

**Filter pills:** All (default) / Audio / AI / Productivity / Privacy

**Card structure:**
- Icon (emoji or custom)
- Feature name (bold, 11-12px)
- One-line description (9-10px, muted)
- Version badge (top-right, colored pill: purple for older, blue for recent, green for NEW)
- Optional NEW tag (replaces version badge)

**Filter animation:** Cards use Framer Motion `layout` prop for smooth reflow when filtering. Cards that don't match fade out and collapse; matching cards spring into place.

**Feature inventory:**

| Feature | Category | Version | NEW? |
|---------|----------|---------|------|
| Dual-Party Audio | Audio | v2.18 | ✓ |
| 10 STT Providers | Audio | v2.16 | |
| Audio Recording | Audio | v2.16 | |
| Speaker Labels | Audio | v2.20 | ✓ |
| Web Speech API | Audio | v2.18 | |
| AI Copilot (8 LLM) | AI | v2.12 | |
| Local RAG Pipeline | AI | v2.20 | ✓ |
| Action Items | AI | v2.20 | ✓ |
| AI Call Log | AI | v2.10 | |
| Question Detection | AI | v2.14 | |
| Bookmarks | Productivity | v2.20 | ✓ |
| Topic Sections | Productivity | v2.17 | |
| Translation (5 providers) | Productivity | v2.19 | |
| Meeting Scenarios | Productivity | v2.15 | |
| Keyboard Shortcuts | Productivity | v2.8 | |
| 100% Local Processing | Privacy | v1.0 | |
| Windows CredentialManager | Privacy | v2.5 | |
| Local SQLite Database | Privacy | v2.0 | |
| No Bot / No Cloud | Privacy | v1.0 | |
| Auto-Updater | Privacy | v2.18 | |

### 2.7 Comparison Section

**Phase 1: Pain point callouts** (emotional hook)

Three cards in a row, red-tinted, naming competitors directly:
- 🤖 "Bots join your calls" — Otter, Fireflies, MeetGeek
- ☁️ "Audio sent to cloud" — Even Granola uploads audio
- 💸 "$8–20+/mo per user" — Subscriptions add up

**Phase 2: Detailed comparison matrix** (rational proof)

Color-coded table: 🟢 full support, 🟡 partial, 🔴 none

| Dimension | NexQ | Otter.ai | Fireflies | Granola | Krisp | Tactiq | MeetGeek | tl;dv |
|-----------|------|----------|-----------|---------|-------|--------|----------|-------|
| Price | **Free** | $8+/mo | $10+/mo | $18/mo | $16/mo | $8+/mo | $10+/mo | $20+/mo |
| 100% Local | 🟢 | 🔴 | 🔴 | 🟡 | 🟡 | 🟡 | 🔴 | 🔴 |
| No Bot Joins Call | 🟢 | 🔴 | 🔴 | 🟢 | 🟢 | 🟢 | 🔴 | 🔴 |
| Open Source | 🟢 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| Multiple STT Providers | 🟢 (10) | 🔴 (1) | 🔴 (1) | 🔴 (1) | 🔴 (1) | 🟡 (piggyback) | 🔴 (1) | 🔴 (1) |
| Multiple LLM Providers | 🟢 (8) | 🔴 (1) | 🔴 (1) | 🔴 (1) | 🔴 (1) | 🔴 (1) | 🔴 (1) | 🔴 (1) |
| Local LLM Support | 🟢 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| Dual-Party Audio | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 |
| RAG / Doc Context | 🟢 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| Windows Native | 🟢 | 🔴 (web) | 🔴 (web) | 🔴 (Mac) | 🟢 | 🔴 (Chrome) | 🔴 (web) | 🔴 (web) |
| Real-Time Translation | 🟢 | 🔴 | 🟡 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |

NexQ column highlighted with a subtle background tint to draw the eye.

### 2.8 Standard Sections

**How It Works:**
- Step 1: "Download" — NSIS installer, one-click setup, Windows SmartScreen note
- Step 2: "Configure" — Add API keys or use local models (Whisper, Ollama)
- Step 3: "Start" — Join any meeting platform, NexQ captures system audio automatically
- Animated: numbers/icons fade in sequentially on scroll

**Tech Stack:**
- Headline: "Built with Rust for speed and safety"
- Logo grid: Tauri 2, Rust, React 18, TypeScript, Tailwind CSS, SQLite, WASAPI
- Each logo has subtle hover scale + tooltip with role description

**Open Source:**
- Live GitHub stats (fetched at build time via GitHub API): stars, total commits, contributors
- "Built in the open" messaging
- Contribution CTA linking to CONTRIBUTING.md
- "Star on GitHub" button with animated star icon

**Final CTA:**
- Headline: "Ready to own your meetings?"
- Subtext: "Free. Private. Open source. Download NexQ and take control."
- `[Download for Windows]` primary button
- `[Star on GitHub]` secondary button

**Footer:**
- Logo + tagline
- Column links: Product (Features, Use Cases, Compare) / Docs (Getting Started, User Guide, Troubleshooting) / Community (GitHub, Contributing, License)
- "Made by Vahid Alizadeh" + MIT License
- Social links

---

## 3. README Design

### Structure

```markdown
<!-- Logo + badges -->
<p align="center">
  <img src="..." alt="NexQ" width="120">
</p>
<p align="center">
  <strong>AI Meeting Assistant & Real-Time Interview Copilot</strong>
</p>
<p align="center">
  [version] [license] [build] [downloads] [platform] [stars]
</p>

<!-- Hero screenshot -->
<p align="center">
  <img src="..." alt="NexQ in action" width="700">
</p>

<!-- Value props -->
🔒 **100% Local** — nothing leaves your machine
🆓 **Free & Open Source** — no subscriptions, ever
⚡ **10 STT + 8 LLM providers** — local or cloud, your choice

<!-- Features -->
## Features
- Dual-party transcription (mic + system audio)
- Real-time AI copilot with streaming answers
- Local RAG pipeline — load PDFs, docs, notes for context
- Always-on-top transparent overlay
- Bookmarks, action items, topic detection
- Multi-language translation (5 providers)
- Audio recording & playback
- Speaker labeling
- 3 meeting scenarios (interview, lecture, team)

## Quick Start
1. **Download** — [Latest release](link)
2. **Configure** — Add API keys or use local models
3. **Start** — Join any meeting, NexQ captures automatically

📖 [Full Getting Started Guide](link) | 🌐 [Website](link)

<!-- Comparison table (compact) -->
## Why NexQ?
| | NexQ | Otter.ai | Granola | Krisp |
|--|------|----------|---------|-------|
| Price | **Free** | $8+/mo | $18/mo | $16/mo |
| 100% Local | ✅ | ❌ | Partial | Partial |
| Open Source | ✅ | ❌ | ❌ | ❌ |
| No Bot | ✅ | ❌ | ✅ | ✅ |
| STT Providers | 10 | 1 | 1 | 1 |
| LLM Providers | 8 | 1 | 1 | 1 |

🔍 [Full comparison on our website](link)

<!-- Screenshots -->
## Screenshots
[4 screenshots: launcher, overlay, settings, call log]

<!-- Tech Stack (existing, polished) -->
## Tech Stack
[table — already in README, keep and polish]

<!-- Development (existing, keep) -->
## Development
[build commands, architecture — already exists]

## Contributing
See [CONTRIBUTING.md](link)

## License
MIT — see [LICENSE](link)
```

### Badge Row

Using shields.io:
- `img.shields.io/github/v/release/...` (version)
- `img.shields.io/github/license/...` (MIT)
- `img.shields.io/github/actions/workflow/status/...` (build)
- `img.shields.io/github/downloads/...` (total downloads)
- `img.shields.io/badge/platform-Windows-blue` (platform)
- `img.shields.io/github/stars/...` (stars)

---

## 4. User Guides

### Existing (polish + screenshots)

| Guide | Changes |
|-------|---------|
| `getting-started.md` | Add screenshots (launcher, first-run), improve flow |
| `configuration.md` | Add screenshots (settings panels), expand provider setup |
| `keyboard-shortcuts.md` | Keep as-is |
| `troubleshooting.md` | Expand with common issues from support experience |

### New Guides

All new guides live in `docs/user-guide/` alongside the existing ones.

| Guide | Content |
|-------|---------|
| `interview-copilot.md` | Interview-specific setup: loading resume via RAG, configuring AI prompts for interview scenarios, overlay positioning tips, best practices for discrete use |
| `lecture-assistant.md` | Lecture-specific setup: long-session STT provider recommendations, bookmarking workflow, action item extraction, topic detection, post-lecture review |
| `audio-setup.md` | WASAPI mic vs system audio explained, dual-party configuration, recording setup, troubleshooting audio issues, device selection |
| `ai-providers.md` | Choosing STT providers (local Whisper vs cloud Deepgram/Groq), choosing LLM providers (local Ollama vs cloud OpenAI/Anthropic), API key setup walkthroughs, cost comparison |
| `rag-context.md` | Loading documents (PDF/TXT/MD/DOCX), indexing process, how RAG improves AI answers, token budget management, best practices for context loading |

### Guide Structure Template

Each guide follows:
```
# [Guide Title]

Brief intro (1-2 sentences)

## Prerequisites
What you need before starting

## [Main content sections]
Step-by-step with screenshots

## Tips
Best practices and pro tips

## Next Steps
Links to related guides
```

---

## 5. Screenshot Matrix

11 screenshots needed from the running app:

| # | View | Mock Data | Used In |
|---|------|-----------|---------|
| 1 | Overlay (interview) | "Tell me about a challenging project..." — AI suggesting follow-ups | Hero, README, interview guide |
| 2 | Overlay (lecture) | Professor explaining algorithms, bookmarks, action items | Use cases, lecture guide |
| 3 | Overlay (team meeting) | Team standup, speaker labels, topics | Use cases |
| 4 | Launcher — main | 3-4 recent meetings listed | README, getting-started |
| 5 | Launcher — call log | AI Q&A sidebar from past interview | Hero features (AI Copilot) |
| 6 | Launcher — context panel | PDFs loaded, indexing complete, token budget | Hero features (RAG), rag guide |
| 7 | Settings — STT | Provider dropdown showing 10 options | Hero features (STT), config guide |
| 8 | Settings — LLM | Provider dropdown showing 8 options | Hero features (LLM), ai-providers guide |
| 9 | Settings — general | Clean settings overview | README, config guide |
| 10 | Overlay — bookmarks | Meeting with bookmarks pinned | Feature grid |
| 11 | Overlay — translation | Transcript with live translation | Feature grid |

Screenshots 1-3 require mock conversation data (to be scripted).
Screenshots 4-9 can be captured from the live app.
Screenshots 10-11 are optional (nice-to-have for feature grid).

All screenshots will be placed in `website/public/screenshots/` and referenced from both the website and README.

---

## 6. Tech Architecture

### Directory Structure

```
website/
  astro.config.mjs          # base: '/NexQ/', output: 'static'
  package.json               # Separate from app deps
  tsconfig.json
  public/
    screenshots/             # All 11 screenshots
    icons/                   # Tech stack logos
    nexq-logo.png            # Brand logo
    og-image.png             # Open Graph preview (1200x630)
    CNAME                    # Empty — custom domain later
  src/
    layouts/
      Layout.astro           # Base HTML, meta, fonts, global CSS
    pages/
      index.astro            # One-page site, imports all sections
    components/
      Navbar.astro           # Static
      Hero.tsx               # React island — animated live demo
      PainPoint.astro        # CSS scroll animations
      FeatureScroller.tsx    # React island — sticky scroll
      UseCases.tsx           # React island — tabbed scenarios
      FeatureGrid.tsx        # React island — filterable bento
      Comparison.astro       # Static table + CSS animations
      HowItWorks.astro       # Static timeline
      TechStack.astro        # Static logo grid
      OpenSource.astro       # Static GitHub stats
      FinalCTA.astro         # Static
      Footer.astro           # Static
    styles/
      global.css             # Tailwind + custom properties
    data/
      features.json          # Feature inventory
      comparison.json        # Competitor matrix

# At repo root (NOT inside website/):
# .github/workflows/deploy-website.yml   # Build Astro → GitHub Pages
```

### Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Generator | Astro 5 | Zero-JS default, React islands where needed, native GitHub Pages support |
| UI Framework | React 18 (islands) | Already in NexQ stack, only hydrated for interactive sections |
| Styling | Tailwind CSS 3.4 | Already in NexQ stack, utility-first for landing page |
| Animation | Framer Motion 11 | Spring physics (matches design principles), React-native, scroll animations |
| Smooth Scroll | Lenis | Lightweight, buttery smooth, pairs with Framer Motion |
| Data | JSON files | features.json + comparison.json for easy updates |
| Deployment | GitHub Actions → Pages | Auto-deploy on push to main when website/ changes |
| Domain | github.io/NexQ (now), custom domain (later, one-line CNAME change) |

### React Islands (hydrated)

Only 4 components ship JavaScript:
1. `Hero.tsx` — animated live demo mockup
2. `FeatureScroller.tsx` — sticky scroll + screenshot transitions
3. `UseCases.tsx` — tabbed scenarios with AnimatePresence
4. `FeatureGrid.tsx` — filterable bento grid with layout animations

Everything else is pure Astro (zero JS).

### Animation Guidelines

Per `.impeccable.md` design principles:
- Spring physics only — never bounce/elastic
- GPU-only transforms (`transform`, `opacity`) — never animate layout properties
- `prefers-reduced-motion` respected — all animations have reduced-motion fallbacks
- 60fps mandatory — no animation should cause frame drops
- Motion communicates state, never decorates

### GitHub Actions Deployment

```yaml
# Triggers on push to main when website/ files change
on:
  push:
    branches: [main]
    paths: ['website/**']

# Builds Astro, uploads artifact, deploys to GitHub Pages
```

### Performance Targets

| Metric | Target |
|--------|--------|
| Lighthouse Performance | 95+ |
| Lighthouse Accessibility | 100 |
| First Contentful Paint | < 1.5s |
| Largest Contentful Paint | < 2.5s |
| Total JS shipped | < 50KB gzipped |
| Time to Interactive | < 3s |

---

## 7. Deployment & Domain

### Phase 1 (now): GitHub Pages
- URL: `https://<username>.github.io/NexQ/`
- Astro `base: '/NexQ/'` for correct asset paths
- GitHub Actions auto-deploy on push

### Phase 2 (future): Custom Domain
- Add domain to `CNAME` file in `website/public/`
- Update Astro `site` and `base` config
- Configure DNS (CNAME record pointing to GitHub Pages)
- One-line change, no structural modifications needed

---

## 8. Open Questions

1. **GitHub username/org** — Need the exact GitHub URL for badges, download links, and Actions config
2. **Mock transcript data** — I'll write the exact lines for screenshots 1-3; you stage and capture
3. **Tech stack logos** — Source from official brand assets or use SVG icon libraries (Simple Icons)
4. **Open Graph image** — Design a 1200x630 social preview image for link sharing
5. **Analytics** — Want to add Plausible/Umami (privacy-friendly) analytics to the site?
