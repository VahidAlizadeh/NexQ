# Building NexQ

Instructions for setting up a development environment, running the app locally, and producing a production build.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Windows** | 10 or 11 | NexQ is a Windows-only desktop app (WASAPI, Credential Manager) |
| **Node.js** | 20+ | Required for the React frontend and build tooling |
| **Rust** | Stable (latest) | Required for the Tauri backend. Install via [rustup.rs](https://rustup.rs) |
| **Tauri CLI** | 2.x | Installed as a dev dependency (`@tauri-apps/cli`) |
| **Visual Studio Build Tools** | 2022 | Required for Rust compilation on Windows. Install the "Desktop development with C++" workload |
| **WebView2** | Latest | Bundled with Windows 10/11. Required by Tauri for the frontend runtime |

### Optional (for local AI)

| Tool | Purpose |
|------|---------|
| **Ollama** | Local LLM inference (auto-detected by NexQ) |
| **LM Studio** | Alternative local LLM server |

## Clone and Install

```bash
git clone https://github.com/nexq-ai/nexq.git
cd nexq
npm install
```

This installs all frontend dependencies including the Tauri CLI. Rust dependencies (in `src-tauri/Cargo.toml`) are fetched automatically on first build.

## Development

### Run the Dev Server

```bash
npx tauri dev
```

This command:

1. Starts the **Vite dev server** on `http://localhost:5173` (hot module replacement enabled)
2. Compiles the **Rust backend** (first build takes several minutes for dependency compilation)
3. Launches the **NexQ application** with both the launcher and overlay windows

Changes to frontend code (TypeScript, React, CSS) are reflected immediately via HMR. Changes to Rust code trigger a recompilation and app restart.

### Run Frontend Only

```bash
npm run dev
```

Starts only the Vite dev server without the Rust backend. Useful for working on UI components, but IPC calls will fail without the backend.

### TypeScript Check

```bash
npm run build
```

Runs `tsc` (TypeScript compiler) followed by `vite build`. This catches type errors without producing a distributable.

## Production Build

```bash
npx tauri build
```

This produces an NSIS installer at:

```
src-tauri/target/release/bundle/nsis/NexQ_<version>_x64-setup.exe
```

The build process:

1. Runs `tsc && vite build` to produce the optimized frontend bundle in `dist/`
2. Compiles the Rust backend in release mode with optimizations
3. Bundles everything into an NSIS installer (per-user install, no admin required)

### Build Artifacts

| Path | Contents |
|------|----------|
| `dist/` | Production frontend bundle (HTML, JS, CSS) |
| `src-tauri/target/release/nexq.exe` | Standalone executable (requires WebView2) |
| `src-tauri/target/release/bundle/nsis/` | NSIS installer |

## Project Structure

```
NexQ/
├── src/                          # React + TypeScript frontend
│   ├── lib/                      # Core: types.ts, ipc.ts, events.ts, version.ts
│   ├── stores/                   # Zustand state stores (18 stores)
│   ├── hooks/                    # Custom React hooks (29 hooks)
│   ├── components/               # Shared shadcn/ui + custom components
│   ├── calllog/                  # AI Call Log sidebar
│   ├── context/                  # Context Intelligence panel
│   ├── overlay/                  # In-meeting overlay window
│   ├── launcher/                 # Main launcher window
│   └── settings/                 # Settings panel
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── lib.rs                # Module registration + Tauri setup
│   │   ├── state.rs              # AppState (Arc<Mutex<>> managers)
│   │   ├── commands/             # 17 IPC command modules
│   │   ├── audio/                # WASAPI capture (cpal)
│   │   ├── stt/                  # 10 STT providers
│   │   ├── llm/                  # 8 LLM providers
│   │   ├── intelligence/         # Prompt assembly + AI actions
│   │   ├── rag/                  # Local RAG pipeline
│   │   ├── context/              # File loading (PDF/TXT/MD/DOCX)
│   │   ├── db/                   # SQLite (rusqlite)
│   │   ├── credentials/          # Windows Credential Manager
│   │   ├── translation/          # Multi-provider translation
│   │   └── tray/                 # System tray management
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri app configuration
│   └── icons/                    # App icons (PNG, ICO, ICNS)
│
├── package.json                  # Frontend dependencies + scripts
├── vite.config.ts                # Vite build configuration
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.js            # Tailwind CSS configuration
└── CLAUDE.md                     # AI assistant project instructions
```

## Key Development Workflows

### Adding a New IPC Command

1. Create the Rust command in the appropriate `commands/*.rs` module:
   ```rust
   #[command]
   async fn my_command(arg: String, state: State<AppState>, app: AppHandle) -> Result<String, String> {
       Ok("result".to_string())
   }
   ```

2. Register it in `src-tauri/src/lib.rs` inside the `invoke_handler` macro

3. Add a typed TypeScript wrapper in `src/lib/ipc.ts`:
   ```typescript
   export async function myCommand(arg: string): Promise<string> {
     return invoke("my_command", { arg });
   }
   ```

4. If the command uses new types, add them to `src/lib/types.ts` (must mirror the Rust structs)

### Adding a New Event

1. Emit from Rust: `app_handle.emit("my_event", payload)?;`
2. Add a typed listener in `src/lib/events.ts`:
   ```typescript
   export function onMyEvent(handler: (event: MyPayload) => void): Promise<UnlistenFn> {
     return listen<MyPayload>("my_event", (e) => handler(e.payload));
   }
   ```
3. Add the payload type to `src/lib/types.ts` if needed

### Adding a New Zustand Store

1. Create `src/stores/myFeatureStore.ts`
2. Follow the existing pattern: `create<MyFeatureState>()(...)`
3. Keep one store per feature domain

## Tech Stack Reference

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop Framework | Tauri | 2.x |
| Frontend | React | 18.3 |
| Language (Frontend) | TypeScript | 5.5 |
| Build Tool | Vite | 6.x |
| State Management | Zustand | 4.5 |
| Styling | Tailwind CSS | 3.4 |
| UI Components | shadcn/ui | Latest |
| Language (Backend) | Rust | 2021 edition |
| Async Runtime | tokio | 1.x |
| Audio | cpal + WASAPI | 0.15 |
| STT | whisper-rs, ONNX Runtime, Deepgram, Groq | Various |
| Database | rusqlite (SQLite) | 0.31 |
| HTTP | reqwest | 0.12 |
| Credentials | Windows Credential Manager | Via `windows` crate 0.58 |
