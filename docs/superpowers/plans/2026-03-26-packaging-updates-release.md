# Packaging, Auto-Update & Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform NexQ into a professionally packaged, auto-updating open-source project with CI/CD and GitHub presence.

**Architecture:** Tauri plugin-updater with GitHub Releases as update endpoint, Ed25519 signed bundles, conventional commits auto-generating CHANGELOG, `npm run release` triggers version sync + tag + CI build. Frontend uses Zustand store + hook for update state, modal dialog for startup check, toast notifications for background updates.

**Tech Stack:** Tauri 2, tauri-plugin-updater, tauri-plugin-store, tauri-plugin-process, GitHub Actions, conventional-changelog-cli, Node.js release scripts, React + Zustand + Tailwind

**Spec:** `docs/superpowers/specs/2026-03-26-packaging-updates-release-design.md`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `scripts/sync-version.js` | Reads version from `package.json`, writes to `version.ts`, `tauri.conf.json`, `Cargo.toml` |
| `scripts/release.js` | Orchestrates: changelog generation → version sync → commit → tag → push |
| `src-tauri/src/commands/updater_commands.rs` | Rust IPC commands for check/download/restart update |
| `src/stores/updaterStore.ts` | Zustand store: update check state, download progress, available version, skipped version |
| `src/hooks/useUpdater.ts` | Startup check, periodic check, skip logic, event listeners |
| `src/components/UpdateDialog.tsx` | Modal: version comparison, changelog, Update/Later/Skip actions |
| `src/components/UpdateToast.tsx` | Non-blocking toasts: download progress, update ready |
| `.github/workflows/ci.yml` | PR checks: tsc + cargo check |
| `.github/workflows/release.yml` | Build + sign + publish on tag push |
| `README.md` | Professional open-source README |
| `CHANGELOG.md` | Auto-generated changelog (initial stub) |
| `LICENSE` | MIT license |
| `CONTRIBUTING.md` | Dev setup, commit conventions, PR process |
| `CODE_OF_CONDUCT.md` | Contributor Covenant |
| `SECURITY.md` | Vulnerability reporting |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Structured bug report form |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Feature request form |
| `.github/ISSUE_TEMPLATE/config.yml` | Template chooser |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR description template |
| `docs/user-guide/getting-started.md` | Install + first meeting |
| `docs/user-guide/configuration.md` | STT/LLM provider setup |
| `docs/user-guide/keyboard-shortcuts.md` | Shortcuts reference |
| `docs/user-guide/troubleshooting.md` | SmartScreen, common issues |
| `docs/development/architecture.md` | System overview for contributors |
| `docs/development/building.md` | Dev environment setup |

### Modified files
| File | Changes |
|------|---------|
| `package.json` | Version → 2.17.5, add `release`/`release:dry-run` scripts, add `conventional-changelog-cli` devDep |
| `src-tauri/tauri.conf.json` | Version → 2.17.5, updater pubkey + endpoints, NSIS `installMode: "currentUser"` + icon settings |
| `src-tauri/Cargo.toml` | Version → 2.17.5 |
| `src/lib/types.ts` | Add `UpdateInfo`, `UpdateDownloadProgress` types |
| `src/lib/ipc.ts` | Add `checkForUpdate()`, `downloadAndInstallUpdate()`, `restartForUpdate()` wrappers |
| `src/lib/events.ts` | Add `onUpdateDownloadProgress()`, `onUpdateReady()` listeners |
| `src/settings/AboutSettings.tsx` | Complete redesign with dynamic version, update check, links |
| `src-tauri/src/commands/mod.rs` | Add `pub mod updater_commands;` |
| `src-tauri/src/lib.rs` | Register updater_commands in invoke_handler |
| `src-tauri/icons/*` | Replace all with generated icon |
| `CLAUDE.md` | Add Version Management, Commit Conventions, Releasing, Updater sections |
| `.gitignore` | Add `.superpowers/` |

---

### Task 1: Icon Generation & Installer Assets

**Files:**
- Replace: `src-tauri/icons/32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.ico`, `icon.icns`, `icon.png`

- [ ] **Step 1: Generate app icon with nano-banana**

Generate a modern, minimal app icon for NexQ. The icon should work at 16x16 and be recognizable — think meeting/audio/AI assistant visual metaphor. Bold, refined, not generic.

```bash
nano-banana "Modern minimal app icon for NexQ, an AI meeting assistant. Abstract stylized microphone or sound wave combined with AI/brain concept. Dark background, vibrant blue accent (#3b82f6). Clean geometric shapes, works at small sizes. No text. Professional software icon style like Notion or Linear." -s 1K -a 1:1 -o nexq-icon -d src-tauri/icons
```

- [ ] **Step 2: Create all required icon sizes**

From the generated image, create resized versions using ImageMagick:

```bash
cd src-tauri/icons
magick nexq-icon.png -resize 32x32 32x32.png
magick nexq-icon.png -resize 128x128 128x128.png
magick nexq-icon.png -resize 256x256 128x128@2x.png
magick nexq-icon.png -resize 32x32 icon.png
```

- [ ] **Step 3: Create .ico file (multi-size)**

```bash
magick nexq-icon.png -define icon:auto-resize=256,128,48,32,16 icon.ico
```

- [ ] **Step 4: Create .icns placeholder**

```bash
magick nexq-icon.png -resize 256x256 icon.icns
```

- [ ] **Step 5: Verify all icon files exist with reasonable sizes**

```bash
ls -la src-tauri/icons/
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/icons/
git commit -m "feat: add custom NexQ app icon for installer and tray"
```

---

### Task 2: Version Unification

**Files:**
- Modify: `package.json:4`, `src-tauri/tauri.conf.json:4`, `src-tauri/Cargo.toml:3`

- [ ] **Step 1: Update package.json version to 2.17.5**
- [ ] **Step 2: Update tauri.conf.json version to 2.17.5**
- [ ] **Step 3: Update Cargo.toml version to 2.17.5**
- [ ] **Step 4: Verify version.ts already says 2.17.5**
- [ ] **Step 5: Add `.superpowers/` to .gitignore**
- [ ] **Step 6: Commit**

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml .gitignore
git commit -m "chore: unify version to 2.17.5 across all config files"
```

---

### Task 3: Updater Backend (Rust)

**Files:**
- Create: `src-tauri/src/commands/updater_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create updater_commands.rs**

Three commands: `check_for_update` (returns `Option<UpdateInfo>`), `download_and_install_update` (downloads + emits progress events + emits `update_ready`), `restart_for_update` (calls `app.restart()`).

Uses `tauri_plugin_updater::UpdaterExt` for the updater API. Emits `update_download_progress` and `update_ready` events via `app.emit()`.

- [ ] **Step 2: Add `pub mod updater_commands;` to mod.rs**
- [ ] **Step 3: Register commands in lib.rs invoke_handler**

Add import: `use commands::updater_commands;`

Add to `generate_handler!`:
```rust
updater_commands::check_for_update,
updater_commands::download_and_install_update,
updater_commands::restart_for_update,
```

- [ ] **Step 4: Verify: `cargo check` in src-tauri/**
- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/
git commit -m "feat(updater): add Rust backend commands for check, download, install, restart"
```

---

### Task 4: Updater Frontend Types, IPC & Events

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/ipc.ts`, `src/lib/events.ts`

- [ ] **Step 1: Add to types.ts** — `UpdateInfo { version, body, date }`, `UpdateDownloadProgress { chunk_length, content_length }`, `UpdateReadyEvent { version }`
- [ ] **Step 2: Add to ipc.ts** — `checkForUpdate()`, `downloadAndInstallUpdate()`, `restartForUpdate()` wrappers
- [ ] **Step 3: Add to events.ts** — `onUpdateDownloadProgress()`, `onUpdateReady()` listeners
- [ ] **Step 4: Verify: `npx tsc --noEmit`**
- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/ipc.ts src/lib/events.ts
git commit -m "feat(updater): add TypeScript types, IPC wrappers, and event listeners"
```

---

### Task 5: Updater Zustand Store

**Files:**
- Create: `src/stores/updaterStore.ts`

- [ ] **Step 1: Create updaterStore.ts**

State: `checkStatus` (idle|checking|up-to-date|available|error), `lastChecked`, `availableUpdate`, `checkError`, `downloadStatus` (idle|downloading|ready|error), `downloadedBytes`, `totalBytes`, `skippedVersion`.

Actions: `setCheckStatus`, `setAvailableUpdate`, `setCheckError`, `setDownloadStatus`, `setDownloadProgress`, `setSkippedVersion`, `reset`.

Follow existing Zustand pattern from `toastStore.ts`.

- [ ] **Step 2: Verify: `npx tsc --noEmit`**
- [ ] **Step 3: Commit**

```bash
git add src/stores/updaterStore.ts
git commit -m "feat(updater): add Zustand store for update check and download state"
```

---

### Task 6: Updater Hook

**Files:**
- Create: `src/hooks/useUpdater.ts`

- [ ] **Step 1: Create useUpdater.ts**

Responsibilities:
- Load skipped version from `tauri-plugin-store` on mount
- Listen for `update_download_progress` and `update_ready` events
- `performCheck(opts?)` — calls `checkForUpdate()`, respects skip logic
- `startDownload()` — calls `downloadAndInstallUpdate()`
- `restart()` — calls `restartForUpdate()`
- `skipVersion(version)` — persists to store, clears available update
- Startup check: 3 second delay after mount, runs once
- Periodic check: every 4 hours

Store key: `nexq-settings.json`, field: `skipped_version`.

- [ ] **Step 2: Verify: `npx tsc --noEmit`**
- [ ] **Step 3: Commit**

```bash
git add src/hooks/useUpdater.ts
git commit -m "feat(updater): add useUpdater hook with startup check, periodic check, skip version"
```

---

### Task 7: Update Dialog & Toast Components

**Files:**
- Create: `src/components/UpdateDialog.tsx`
- Create: `src/components/UpdateToast.tsx`

- [ ] **Step 1: Create UpdateDialog.tsx**

Modal with: hero (icon, title, version badge current→new), scrollable changelog (parsed into feat/fix groups with colored tags), three actions (Skip this version, Later, Update & Restart). Uses Tailwind classes matching NexQ design system.

- [ ] **Step 2: Create UpdateToast.tsx**

Two components: `UpdateDownloadToast` (amber download icon, version, size + percentage, progress bar) and `UpdateReadyToast` (green check, "update ready", restart button).

- [ ] **Step 3: Verify: `npx tsc --noEmit`**
- [ ] **Step 4: Commit**

```bash
git add src/components/UpdateDialog.tsx src/components/UpdateToast.tsx
git commit -m "feat(updater): add UpdateDialog modal and UpdateToast components"
```

---

### Task 8: Redesign About Page

**Files:**
- Modify: `src/settings/AboutSettings.tsx` (complete rewrite)

- [ ] **Step 1: Rewrite AboutSettings.tsx**

New sections:
1. App identity: icon, name, version from `NEXQ_VERSION`, description, tech badges
2. Meta grid: build date, developer, architecture, license
3. Update check: three-state row (up-to-date/checking/available) with Check/Update button
4. Quick links: GitHub, Changelog, Report Issue, Documentation (uses `@tauri-apps/plugin-shell` `open()`)
5. Keyboard shortcuts table (preserved from current)
6. Footer disclaimer

Uses `useUpdater` hook. Imports from `version.ts`. Replace hardcoded "1.0.0".

Note: `GITHUB_URL` constant at top — update after repo creation.

- [ ] **Step 2: Verify: `npx tsc --noEmit`**
- [ ] **Step 3: Commit**

```bash
git add src/settings/AboutSettings.tsx
git commit -m "feat(settings): redesign About page with dynamic version, update check, and links"
```

---

### Task 9: Installer & Updater Configuration

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `.gitignore`

- [ ] **Step 1: Update NSIS config** — add `"installMode": "currentUser"` to `bundle.windows.nsis`
- [ ] **Step 2: Generate signing keypair** — `npx tauri signer generate -w src-tauri/.tauri-private-key`
- [ ] **Step 3: Update updater config** — paste public key into `plugins.updater.pubkey`, add endpoint URL
- [ ] **Step 4: Add `src-tauri/.tauri-private-key` to .gitignore**
- [ ] **Step 5: Commit**

```bash
git add src-tauri/tauri.conf.json .gitignore
git commit -m "feat(installer): configure currentUser install mode and updater signing"
```

---

### Task 10: Release Scripts

**Files:**
- Create: `scripts/sync-version.js`
- Create: `scripts/release.js`
- Modify: `package.json`

- [ ] **Step 1: Install conventional-changelog-cli** — `npm install --save-dev conventional-changelog-cli`

- [ ] **Step 2: Create scripts/sync-version.js**

Reads version from `package.json`, writes to `version.ts` (`NEXQ_VERSION` + `NEXQ_BUILD_DATE`), `tauri.conf.json` (`version`), `Cargo.toml` (`version`). Uses `readFileSync`/`writeFileSync` with regex replacements.

- [ ] **Step 3: Create scripts/release.js**

Steps: detect last tag → determine bump from conventional commits → bump `package.json` → run `conventional-changelog` → run `sync-version.js` → git add + commit + tag + push. Supports `--dry-run` flag.

Uses `execFileSync` for shell commands (safer than `execSync`). All commands are hardcoded strings — no user input in command construction.

- [ ] **Step 4: Add scripts to package.json**

```json
"release": "node scripts/release.js",
"release:dry-run": "node scripts/release.js --dry-run",
"sync-version": "node scripts/sync-version.js"
```

- [ ] **Step 5: Test dry run** — `npm run release:dry-run`
- [ ] **Step 6: Commit**

```bash
git add scripts/ package.json package-lock.json
git commit -m "feat(release): add version sync and release scripts with conventional changelog"
```

---

### Task 11: CI/CD Workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create ci.yml** — runs on PR to main: checkout, setup Node 20, setup Rust stable, cargo cache, npm ci, `npx tsc --noEmit`, `cargo check`

- [ ] **Step 2: Create release.yml** — runs on tag push `v*`: checkout, setup Node + Rust, npm ci, `tauri-apps/tauri-action@v0` with `TAURI_SIGNING_PRIVATE_KEY` secret, `includeUpdaterJson: true`, creates GitHub Release with all artifacts

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/
git commit -m "ci: add PR check and release build workflows"
```

---

### Task 12: GitHub Presence — Core Files

**Files:**
- Create: `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, `.github/ISSUE_TEMPLATE/*`, `.github/PULL_REQUEST_TEMPLATE.md`

- [ ] **Step 1: Create LICENSE** — MIT, copyright 2026 Vahid Alizadeh
- [ ] **Step 2: Create CONTRIBUTING.md** — prerequisites, dev setup, conventional commits, PR process
- [ ] **Step 3: Create CODE_OF_CONDUCT.md** — Contributor Covenant v2.1
- [ ] **Step 4: Create SECURITY.md** — responsible disclosure process
- [ ] **Step 5: Create CHANGELOG.md** — initial stub with header
- [ ] **Step 6: Create issue templates** — `bug_report.yml` (YAML form), `feature_request.yml`, `config.yml`
- [ ] **Step 7: Create PR template** — summary, changes, testing checklist, related issues
- [ ] **Step 8: Commit**

```bash
git add LICENSE CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md CHANGELOG.md .github/
git commit -m "docs: add LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates"
```

---

### Task 13: GitHub Presence — README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create professional README.md**

Sections: Hero + tagline, shields.io badges (version, license, build, platform, downloads), Features (5-6 bullets), Quick Start, Tech Stack table, Development setup, Contributing link, Windows SmartScreen section, License, Acknowledgments.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add professional README with badges, features, quick start, and tech stack"
```

---

### Task 14: GitHub Presence — User & Developer Docs

**Files:**
- Create: `docs/user-guide/*.md`, `docs/development/*.md`

- [ ] **Step 1: Create user guide** — `getting-started.md`, `configuration.md`, `keyboard-shortcuts.md`, `troubleshooting.md`
- [ ] **Step 2: Create developer docs** — `architecture.md`, `building.md`
- [ ] **Step 3: Commit**

```bash
git add docs/user-guide/ docs/development/
git commit -m "docs: add user guide and developer documentation"
```

---

### Task 15: CLAUDE.md Updates

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add sections** — Version Management (4-file table, never edit manually), Commit Conventions (type→bump table), Releasing (`npm run release`), Updater (signing, endpoint, commands, events, store, hook)
- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add version management, commit conventions, releasing, and updater to CLAUDE.md"
```

---

### Task 16: Wire Update Dialog into App

**Files:**
- Modify: Root launcher component (e.g., `src/launcher/LauncherView.tsx` or `src/App.tsx`)

- [ ] **Step 1: Find root launcher component**
- [ ] **Step 2: Mount UpdateDialog** — show when `checkStatus === "available"` after startup, with dismiss state
- [ ] **Step 3: Mount UpdateToast components** — fixed bottom-right, show download progress and ready toasts
- [ ] **Step 4: Verify: `npx tsc --noEmit`**
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(updater): wire UpdateDialog and UpdateToast into launcher window"
```

---

### Task 17: Final Verification

- [ ] **Step 1: `npx tsc --noEmit`** — no TypeScript errors
- [ ] **Step 2: `cargo check` in src-tauri/** — no Rust errors
- [ ] **Step 3: Verify all 4 files show version 2.17.5**
- [ ] **Step 4: `npm run release:dry-run`** — release script works
- [ ] **Step 5: Update version.ts build date comment**
- [ ] **Step 6: Final commit**

```bash
git commit -m "feat: complete packaging, auto-update & release pipeline implementation"
```