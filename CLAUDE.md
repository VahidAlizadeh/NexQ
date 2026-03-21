# NexQ

AI Meeting Assistant & Real-Time Interview Copilot — Tauri 2 desktop app (Windows).

## Commands

```bash
npm run dev          # Vite dev server (port 5173)
npm run build        # TypeScript check + Vite production build
npx tauri dev        # Launch full app (Rust backend + React frontend)
npx tauri build      # Build NSIS installer
```

## Architecture

Tauri 2 dual-process app: Rust backend (tokio) + React 18 frontend (WebView2).

```
src/                    # React + TypeScript frontend
  stores/               # Zustand state (10 stores)
  hooks/                # Custom React hooks (18+)
  components/           # shadcn/ui + custom components
  calllog/              # AI Call Log sidebar
  context/              # Context Intelligence panel
  overlay/              # In-meeting overlay window
  launcher/             # Main launcher window
  settings/             # Settings panel
  lib/
    types.ts            # ALL TypeScript types — single source of truth
    ipc.ts              # Typed Tauri invoke() wrappers
    events.ts           # Typed Tauri event listeners
    version.ts          # Version constant — bump on every change

src-tauri/src/          # Rust backend
  lib.rs                # Module registration + Tauri setup
  state.rs              # AppState (Arc<Mutex<>> managers)
  commands/             # 12 IPC command modules
  audio/                # WASAPI mic + system audio capture
  stt/                  # 10 STT providers (trait-based routing)
  llm/                  # 7 LLM providers (streaming)
  intelligence/         # Prompt assembly + question detection
  rag/                  # Local RAG pipeline (embeddings + FTS)
  context/              # File loading (PDF/TXT/MD/DOCX)
  db/                   # SQLite via rusqlite
  credentials/          # Windows CredentialManager
```

## Key Files

- `src/lib/types.ts` — Single source of truth for all TypeScript types. Must stay in sync with Rust structs.
- `src/lib/ipc.ts` — Every Tauri command has a typed wrapper here. Add new commands here.
- `src-tauri/src/lib.rs` — Registers all command modules. New command groups must be added here.
- `src-tauri/src/state.rs` — AppState struct with all manager slots (Arc<Mutex<>>).
- `src/lib/version.ts` — NEXQ_VERSION and NEXQ_BUILD_DATE.

## Code Conventions

- **State**: Zustand stores in `src/stores/` — one per feature domain
- **Hooks**: `useXxx` in `src/hooks/` — side effects + Tauri event listeners
- **IPC**: Frontend calls `invoke<T>("command_name", {args})` via typed wrappers in `ipc.ts`
- **Events**: Backend emits via `app_handle.emit("event_name", payload)`, frontend listens via `events.ts`
- **Commands**: Rust `#[command] async fn(args, state: State<AppState>, app: AppHandle) -> Result<T, String>`
- **Styling**: Tailwind CSS + shadcn/ui + CSS custom properties for theming
- **Naming**: camelCase (TypeScript), snake_case (Rust)

## Gotchas

- **types.ts ↔ Rust sync**: TypeScript types in `types.ts` must mirror Rust structs exactly. Breaking this breaks IPC serialization silently.
- **Two-party audio**: "You" (mic) and "Them" (system audio) are independent streams with separate STT providers, mute controls, and audio levels.
- **Dual windows**: `launcher` (main, 900×650) and `overlay` (meeting, 500×700, always-on-top, transparent). State syncs via Zustand + IPC events.
- **No CSP**: `tauri.conf.json` has `"csp": null` — intentional for local-only app.
- **RAG is async**: Indexing fires `rag_index_progress` events — never blocks the UI thread.
- **Web Speech hot-swap**: Recreating SpeechRecognition mid-session breaks the browser API. Must stop cleanly before switching.
- **Version bump required**: Update `src/lib/version.ts` (NEXQ_VERSION + NEXQ_BUILD_DATE) on every fix/feature.
- **Commit after every change**: Make atomic git commits with descriptive messages after each code change.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri 2 (Rust + WebView2) |
| Frontend | React 18, TypeScript 5.5, Vite 6 |
| State | Zustand 4.5 |
| Styling | Tailwind CSS 3.4, shadcn/ui |
| Audio | cpal, WASAPI (Windows loopback) |
| STT | whisper-rs, ONNX Runtime, Deepgram, Groq, Web Speech API |
| LLM | OpenAI, Anthropic, Groq, Ollama, LM Studio, Gemini |
| Database | SQLite (rusqlite) |
| Credentials | Windows CredentialManager |

## Design Context

**Brand personality**: Bold. Refined. Alive.
**Emotional goal**: Premium & polished — feels like a luxury instrument, not a generic tool.
**References**: Notion (clean minimalism, great typography) × Arc Browser (bold spatial design, vibrant, alive).

### Anti-references (ALL rejected)
- Generic SaaS dashboards (card-grid-metric-chart templates)
- AI-slop aesthetic (purple-blue gradients, cyan-on-dark neon)
- Cluttered IDE density (VS Code-style overwhelming info)
- Flat & lifeless (plain white cards on gray, "safe and boring")

### Design Principles
1. **Every pixel is intentional** — no defaults, everything serves a purpose
2. **Motion earns attention** — animation communicates state, never decorates. Spring physics, never bounce/elastic
3. **Information through hierarchy, not density** — size, weight, color, space create layers
4. **Color with meaning** — every color communicates something, decorative color is banned
5. **Restraint is confidence** — bold choices with precision beat safe choices done generically

Full design context with technical constraints: `.impeccable.md`
