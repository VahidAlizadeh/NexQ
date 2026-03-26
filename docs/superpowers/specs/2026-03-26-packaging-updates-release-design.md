# NexQ Packaging, Auto-Update & Release Pipeline Design

**Date**: 2026-03-26
**Status**: Approved
**Scope**: Installer branding, silent auto-updater, About page redesign, CI/CD pipeline, GitHub open-source presence, version management, CLAUDE.md documentation

---

## 1. Overview

Transform NexQ from a locally-built app into a professionally packaged, auto-updating open-source project with a complete GitHub presence and automated release pipeline.

**Key decisions:**
- No code signing (free tier) — SmartScreen mitigated via `currentUser` install mode
- Public GitHub repo with professional open-source presence
- Version unified at 2.17.5 across all files
- Conventional commits with auto-generated CHANGELOG.md
- Tauri plugin-updater with GitHub Releases as update endpoint
- Progressive architecture: lean now, extensible to beta channels / staged rollouts later

---

## 2. Version Management

### Single source of truth

Four files must stay in sync. The release script (`npm run release`) handles all of them:

| File | Field | Purpose |
|------|-------|---------|
| `package.json` | `version` | Primary — release script reads/writes this |
| `src/lib/version.ts` | `NEXQ_VERSION`, `NEXQ_BUILD_DATE` | UI display, update comparison |
| `src-tauri/tauri.conf.json` | `version` | NSIS installer version, Tauri updater |
| `src-tauri/Cargo.toml` | `version` | Rust crate metadata |

### Version sync script

`scripts/sync-version.js` — called by the release script:
- Reads version from `package.json`
- Writes to `version.ts` (updates `NEXQ_VERSION` and `NEXQ_BUILD_DATE`)
- Writes to `tauri.conf.json` (updates `version` field)
- Writes to `Cargo.toml` (updates `version` field under `[package]`)

### Conventional commit types → version bumps

| Commit prefix | Bump | Example |
|--------------|------|---------|
| `fix:` | patch (2.17.5 → 2.17.6) | `fix: STT hotswap crash` |
| `feat:` | minor (2.17.5 → 2.18.0) | `feat: add Gemini LLM provider` |
| `feat!:` or `BREAKING CHANGE:` | major (2.17.5 → 3.0.0) | `feat!: new settings schema` |
| `docs:`, `chore:`, `refactor:`, `test:`, `style:` | no bump | included in changelog |

### Initial version unification

All four files will be set to `2.17.5` as the starting point. `AboutSettings.tsx` will import from `version.ts` instead of hardcoding.

---

## 3. Tauri Updater Architecture

### Signing

- Generate Ed25519 keypair with `tauri signer generate`
- **Private key**: GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`
- **Public key**: stored in `tauri.conf.json` → `plugins.updater.pubkey`

### Update endpoint

```json
// tauri.conf.json
"plugins": {
  "updater": {
    "pubkey": "<generated-ed25519-public-key>",
    "endpoints": [
      "https://github.com/{owner}/NexQ/releases/latest/download/latest.json"
    ]
  }
}
```

CI publishes `latest.json` alongside each release:
```json
{
  "version": "2.18.0",
  "notes": "## What's New\n- Feature X\n- Fix Y",
  "pub_date": "2026-03-26T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<ed25519-signature>",
      "url": "https://github.com/{owner}/NexQ/releases/download/v2.18.0/NexQ_2.18.0_x64-setup.nsis.zip"
    }
  }
}
```

### Update flow — three triggers

| Trigger | Behavior |
|---------|----------|
| **App startup** | Check silently. If update found → show modal dialog with version + changelog. User clicks "Update & Restart", "Later", or "Skip this version". |
| **About page button** | "Check for Updates" → spinner → shows result (up-to-date or new version available with "Update Now" button) |
| **Background periodic** | Every 4 hours while app is running, silent check. If update found → subtle toast notification, no interruption. |

### Silent update process

1. Download `.nsis.zip` in background (progress shown as toast if visible, or in About page)
2. Verify Ed25519 signature
3. When ready: "Update ready — restart to apply" toast with Restart button
4. User clicks restart → NSIS runs silently (`/S` flag) → app relaunches
5. If user doesn't restart, update applies on next natural app close/reopen

### "Skip this version" behavior

- Stores skipped version in Tauri store (`tauri-plugin-store`)
- Startup check skips that version — won't prompt again
- About page "Check for Updates" always shows all versions (ignores skip)
- User can reset skipped versions in settings

### Rust implementation

New command module: `src-tauri/src/commands/updater_commands.rs`

Commands:
- `check_for_update() → Result<Option<UpdateInfo>, String>` — returns version, notes, date if available
- `download_and_install_update() → Result<(), String>` — downloads, verifies, prepares for restart
- `restart_for_update() → Result<(), String>` — triggers app restart with pending update

Events:
- `update_available { version, notes, pub_date }` — emitted when check finds update
- `update_download_progress { downloaded, total, percentage }` — emitted during download
- `update_ready { version }` — emitted when download complete + verified

Frontend wiring:
- Typed wrappers in `src/lib/ipc.ts`
- Event listeners in `src/lib/events.ts`
- Zustand store: `src/stores/updaterStore.ts` — tracks check state, download progress, available version
- Hook: `src/hooks/useUpdater.ts` — startup check logic, periodic check, skip version logic

---

## 4. About Page & Update UI

### Redesigned AboutSettings.tsx

Replaces current hardcoded version with dynamic data:

**App identity section:**
- App icon (generated), name "NexQ", version from `NEXQ_VERSION`
- Description: "AI Meeting Assistant & Real-Time Interview Copilot"
- Tech badges: Tauri 2, React + Rust, Windows x64

**Meta grid (2×2):**
- Build Date (from `NEXQ_BUILD_DATE`)
- Developer (from `NEXQ_DEVELOPER`)
- Architecture: x86_64
- License: MIT

**Update check section:**
Three states:
1. **Up to date** — green dot, "You're up to date", "Last checked X ago", "Check for Updates" button
2. **Checking** — pulsing amber dot, "Checking for updates...", "Connecting to GitHub"
3. **Update available** — blue dot, "v2.18.0 available", "Released X ago", "Update Now" button

**Quick links row:**
- GitHub (opens repo)
- Changelog (opens CHANGELOG.md or GitHub releases page)
- Report Issue (opens GitHub new issue)
- Documentation (opens docs)

### Startup update dialog

Modal dialog shown on app launch when update is available (and not skipped):

- **Hero**: icon, "A new version is available", version badge (v2.17.5 → v2.18.0)
- **Changelog**: scrollable, grouped by type (feat/fix), with colored tags
- **Actions**: "Skip this version" (left), "Later" + "Update & Restart" (right)

### Toast notifications

Non-blocking toasts for background update activity:

- **Downloading**: amber download icon, "Downloading v2.18.0", size + percentage, progress bar
- **Ready**: green checkmark, "Update ready", "v2.18.0 will apply on restart", Restart button

---

## 5. Installer & Icon

### Icon generation

Using nano-banana to generate a distinctive NexQ app icon:
- Modern, minimal, recognizable at 16x16
- Output sizes: 32x32, 128x128, 256x256 (PNG)
- Convert to `.ico` (multi-size: 16, 32, 48, 256) and `.icns` (macOS)
- Same icon for: app window, tray, installer, GitHub repo, README
- Consider simplified/monochrome tray variant if full icon is too detailed at 16x16

### NSIS installer customization

| Setting | Value | Purpose |
|---------|-------|---------|
| `installerIcon` | Custom `.ico` | Add/Remove Programs icon |
| `headerImage` | 150×57 BMP | Top-right banner on installer pages |
| `sidebarImage` | 164×314 BMP | Left sidebar on welcome/finish pages |
| `displayLanguageSelector` | `false` | Already set |
| `installMode` | `"currentUser"` | No admin prompt, installs to %LOCALAPPDATA% |

### SmartScreen mitigation (no code signing)

1. `installMode: "currentUser"` — avoids UAC elevation entirely
2. Professional installer filename: `NexQ-Setup-{version}-x64.exe`
3. README includes "Windows SmartScreen" troubleshooting section
4. SmartReputation builds trust automatically over time as users install

### Tray icon

- Replace current 224-byte placeholder `icon.png` with generated icon
- Ensure visibility at 16x16 and 32x32 on light and dark taskbars

---

## 6. CI/CD Pipeline

### Workflow 1: `ci.yml` — PR Checks

**Trigger**: `pull_request → main`

Steps:
1. Checkout
2. Setup Node + Rust (with cargo cache)
3. `npm install`
4. `npx tsc --noEmit` (TypeScript check)
5. `cargo check` (Rust check)

Fast (~2-3 min), catches broken code before merge.

### Workflow 2: `release.yml` — Build & Publish

**Trigger**: Tag push matching `v*`

Steps:
1. Checkout code at tag
2. Setup Node + Rust (with cargo cache)
3. `npm install`
4. `npx tauri build --bundles nsis`
5. Sign `.nsis.zip` with `TAURI_SIGNING_PRIVATE_KEY`
6. Generate `latest.json` (version, notes from CHANGELOG.md, platform URLs, signature)
7. Upload to GitHub Release:
   - `NexQ-Setup-{version}-x64.exe` (installer for new users)
   - `NexQ_{version}_x64-setup.nsis.zip` (updater bundle)
   - `NexQ_{version}_x64-setup.nsis.zip.sig` (signature)
   - `latest.json` (updater endpoint file)

### GitHub Actions secrets

| Secret | Purpose |
|--------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | Ed25519 signing key for update bundles |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for signing key (if set) |

### Release script (`npm run release`)

Local command that triggers the pipeline:

1. Reads conventional commits since last tag
2. Determines version bump (patch/minor/major)
3. Updates `CHANGELOG.md` via `conventional-changelog-cli`
4. Runs `scripts/sync-version.js` to update all 4 version files
5. Commits: `chore: release v{version}`
6. Creates git tag: `v{version}`
7. Pushes commit + tag to GitHub
8. CI takes over from here

Supports `--dry-run` to preview without committing.

---

## 7. GitHub Repository Presence

### File structure

```
/
├── README.md                    # Hero — badges, screenshot, features, quick start
├── CHANGELOG.md                 # Auto-generated from conventional commits
├── LICENSE                      # MIT
├── CONTRIBUTING.md              # Dev setup, commit conventions, PR process
├── CODE_OF_CONDUCT.md           # Contributor Covenant
├── SECURITY.md                  # Vulnerability reporting
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── release.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml       # Structured form: OS, version, STT provider, repro steps
│   │   ├── feature_request.yml  # Use case, proposed solution, alternatives
│   │   └── config.yml           # Template chooser
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── FUNDING.yml              # Optional sponsor links
├── docs/
│   ├── user-guide/
│   │   ├── getting-started.md   # Install + first meeting
│   │   ├── configuration.md     # STT/LLM provider setup
│   │   ├── keyboard-shortcuts.md
│   │   └── troubleshooting.md   # SmartScreen, common issues
│   └── development/
│       ├── architecture.md      # System overview for contributors
│       └── building.md          # Dev environment setup
```

### README.md structure

1. **Hero** — app name, one-line description, hero screenshot/GIF
2. **Badges** — version, license, build status, downloads, platform
3. **Features** — 4-6 bullet points, what makes NexQ special
4. **Quick Start** — download → install → configure → start meeting
5. **Screenshots** — 2-3 annotated screenshots (launcher, overlay, call log)
6. **Tech Stack** — table from CLAUDE.md
7. **Development** — clone, install, `npx tauri dev`
8. **Contributing** — link to CONTRIBUTING.md
9. **License** — MIT
10. **Acknowledgments** — key dependencies

### Issue templates (YAML forms)

**Bug report fields:**
- OS version, NexQ version (dropdown), STT provider, LLM provider
- Steps to reproduce, expected behavior, actual behavior
- Logs/screenshots

**Feature request fields:**
- Use case description, proposed solution, alternatives considered

---

## 8. CLAUDE.md Updates

Add the following sections to CLAUDE.md:

### Version Management section
- Table of 4 version files and their purposes
- "Never edit versions manually" rule
- Reference to `npm run release`

### Commit Conventions section
- Conventional commit format with examples
- Type → bump mapping table

### Releasing section
- `npm run release` command
- `--dry-run` flag
- What the script does (6 steps)
- "Do NOT" list (manual edits, manual tags, manual uploads)

### Updater section
- Signing keypair info
- Endpoint URL
- Frontend commands and events
- Store and hook locations

---

## 9. Files to Create or Modify

### New files
- `scripts/sync-version.js` — version sync across 4 files
- `scripts/release.js` — release orchestration script
- `src-tauri/src/commands/updater_commands.rs` — Rust updater IPC commands
- `src/stores/updaterStore.ts` — Zustand store for update state
- `src/hooks/useUpdater.ts` — update check logic + startup check
- `src/components/UpdateDialog.tsx` — startup update modal
- `src/components/UpdateToast.tsx` — download/ready toast notifications
- `.github/workflows/ci.yml` — PR check workflow
- `.github/workflows/release.yml` — build + publish workflow
- `README.md` — professional open-source README
- `CHANGELOG.md` — auto-generated changelog
- `LICENSE` — MIT license
- `CONTRIBUTING.md` — contributor guide
- `CODE_OF_CONDUCT.md` — Contributor Covenant
- `SECURITY.md` — vulnerability reporting
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `docs/user-guide/getting-started.md`
- `docs/user-guide/configuration.md`
- `docs/user-guide/keyboard-shortcuts.md`
- `docs/user-guide/troubleshooting.md`
- `docs/development/architecture.md`
- `docs/development/building.md`

### Modified files
- `src-tauri/tauri.conf.json` — updater config (pubkey, endpoints), NSIS settings (installMode, icons), version → 2.17.5
- `src-tauri/Cargo.toml` — version → 2.17.5
- `package.json` — version → 2.17.5, add release scripts + devDependencies
- `src/lib/version.ts` — remains at 2.17.5 (already correct)
- `src/lib/ipc.ts` — add updater command wrappers
- `src/lib/events.ts` — add updater event listeners
- `src/settings/AboutSettings.tsx` — complete redesign
- `src-tauri/src/lib.rs` — register updater_commands module
- `src-tauri/src/commands/mod.rs` — add updater_commands module
- `src-tauri/icons/*` — replace all with generated icon
- `CLAUDE.md` — add version management, commit conventions, releasing, updater sections
- `.gitignore` — add `.superpowers/` if not already present

---

## 10. Implementation Order

1. **Icon generation** — nano-banana, convert to all formats
2. **Version unification** — sync all 4 files to 2.17.5
3. **Updater backend** — Rust commands, signing keypair, tauri.conf.json config
4. **Updater frontend** — store, hook, About page redesign, dialog, toasts
5. **Installer customization** — NSIS settings, icons, installMode
6. **Release scripts** — sync-version.js, release.js, package.json scripts
7. **CI/CD workflows** — ci.yml, release.yml
8. **GitHub presence** — README, CONTRIBUTING, LICENSE, templates, docs
9. **CLAUDE.md updates** — version management, commit conventions, releasing, updater sections
10. **First release** — `npm run release` to create v2.17.5 as initial GitHub release