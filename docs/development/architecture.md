# Architecture Overview

NexQ is a Tauri 2 desktop application with a dual-process architecture: a Rust backend running on tokio and a React 18 frontend rendered in WebView2.

## Process Model

```
┌──────────────────────────┐     IPC (invoke / events)     ┌──────────────────────────┐
│     Rust Backend         │ <─────────────────────────────>│    React Frontend        │
│     (Tauri + tokio)      │                                │    (WebView2)            │
│                          │                                │                          │
│  - Audio capture (WASAPI)│                                │  - Zustand stores        │
│  - STT routing           │   invoke("command", {args})    │  - React hooks           │
│  - LLM streaming         │ ──────────────────────────────>│  - shadcn/ui components  │
│  - RAG indexing           │                                │  - Tailwind CSS          │
│  - SQLite database        │   emit("event", payload)      │                          │
│  - Credential storage     │ <──────────────────────────── │                          │
└──────────────────────────┘                                └──────────────────────────┘
```

## Backend Modules (Rust)

The Rust backend is organized into focused modules under `src-tauri/src/`:

| Module | Directory | Purpose |
|--------|-----------|---------|
| **audio** | `audio/` | WASAPI microphone and system audio capture via cpal, per-party audio routing, recording to WAV, device monitoring |
| **stt** | `stt/` | Speech-to-text routing with trait-based provider dispatch. 10 providers: whisper.cpp, Deepgram, Groq Whisper, Azure Speech, Whisper API, Web Speech, Sherpa-ONNX, ORT Streaming, Windows Native, Parakeet TDT |
| **llm** | `llm/` | LLM provider routing with streaming support. Providers: Ollama, OpenAI, Anthropic, Groq, Gemini, LM Studio, OpenRouter, Custom |
| **intelligence** | `intelligence/` | Prompt assembly, question detection, AI action configuration, context window management |
| **rag** | `rag/` | Local RAG pipeline: document chunking, embedding (via Ollama), vector similarity search, FTS, hybrid retrieval |
| **context** | `context/` | File loading and parsing for PDF, TXT, MD, and DOCX documents |
| **db** | `db/` | SQLite database via rusqlite for meetings, transcripts, AI interactions, context resources, RAG chunks |
| **credentials** | `credentials/` | Windows Credential Manager integration for secure API key storage |
| **translation** | `translation/` | Multi-provider translation (Microsoft, Google, DeepL, OPUS-MT, LLM-based) with batch support |
| **tray** | `tray/` | System tray icon management, dynamic menus, click handling, state-driven icon updates |
| **commands** | `commands/` | 17 IPC command modules exposing backend functionality to the frontend |
| **state** | `state.rs` | Central `AppState` struct holding all manager instances as `Arc<Mutex<>>` slots |

### Command Modules

Each command module in `commands/` maps to a feature domain:

```
audio_commands.rs           context_commands.rs         credential_commands.rs
intelligence_commands.rs    llm_commands.rs             meeting_commands.rs
model_commands.rs           rag_commands.rs             recording_commands.rs
settings_commands.rs        stealth_commands.rs         stt_commands.rs
translation_commands.rs     translation_model_commands.rs
tray_commands.rs            updater_commands.rs
```

All commands follow the pattern:
```rust
#[command]
async fn command_name(args, state: State<AppState>, app: AppHandle) -> Result<T, String>
```

## Frontend Architecture (React + TypeScript)

### Directory Structure

```
src/
  lib/
    types.ts          # ALL TypeScript types (single source of truth, mirrors Rust structs)
    ipc.ts            # Typed invoke() wrappers for every Tauri command
    events.ts         # Typed listen() wrappers for all backend events
    version.ts        # Version constant
  stores/             # Zustand state stores (18 stores, one per feature domain)
  hooks/              # Custom React hooks (29 hooks, side effects + event listeners)
  components/         # Shared UI components (shadcn/ui + custom)
  calllog/            # AI Call Log sidebar
  context/            # Context Intelligence panel
  overlay/            # In-meeting overlay window
  launcher/           # Main launcher window
  settings/           # Settings panel
```

### Zustand Stores

Each store manages a single feature domain:

| Store | Domain |
|-------|--------|
| `meetingStore` | Meeting lifecycle, active meeting, view routing |
| `transcriptStore` | Live transcript segments from both audio parties |
| `streamStore` | LLM streaming state (current content, mode, errors) |
| `callLogStore` | AI Call Log entries with full prompt/response data |
| `configStore` | App configuration (theme, providers, devices) |
| `contextStore` | Loaded context documents and token budget |
| `ragStore` | RAG index status, search results, configuration |
| `audioPlayerStore` | Audio playback for recorded meetings |
| `aiActionsStore` | AI action configurations (per-mode prompts, toggles) |
| `scenarioStore` | Meeting scenario templates (team, lecture, interview) |
| `speakerStore` | Speaker identities and statistics |
| `bookmarkStore` | Meeting bookmarks |
| `topicSectionStore` | Auto-detected topic sections |
| `actionItemStore` | Extracted action items |
| `translationStore` | Translation state and cache |
| `toastStore` | UI toast notifications |
| `devLogStore` | Developer debug log |
| `updaterStore` | App update state |

### IPC Pattern

Frontend-to-backend communication uses typed wrappers:

1. **Commands** (`ipc.ts`): The frontend calls `invoke<T>("command_name", {args})` through typed wrapper functions. Every Tauri command has a corresponding TypeScript function.

2. **Events** (`events.ts`): The backend emits events via `app_handle.emit("event_name", payload)`. The frontend listens through typed `onEventName()` wrappers that return an unlisten function.

3. **Types** (`types.ts`): All TypeScript interfaces mirror their Rust struct counterparts exactly. Breaking this sync breaks IPC serialization silently.

## Dual Window Architecture

NexQ runs two windows simultaneously:

| Window | Label | Size | Properties |
|--------|-------|------|------------|
| **Launcher** | `launcher` | 900x650 (min 700x500) | Main dashboard, resizable, decorated, centered |
| **Overlay** | `overlay` | 500x700 (min 400x480) | Meeting view, resizable, no decorations, always-on-top, transparent, starts hidden |

- The launcher is the main interface for settings, meeting history, and configuration
- The overlay appears during meetings as a compact, always-on-top panel
- Closing the launcher hides it to the system tray instead of quitting
- State syncs between windows via Zustand stores and IPC events
- `Ctrl+B` toggles between launcher and overlay views

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | Single source of truth for all TypeScript types |
| `src/lib/ipc.ts` | Typed Tauri invoke() wrappers |
| `src/lib/events.ts` | Typed Tauri event listeners |
| `src/lib/version.ts` | App version constant |
| `src-tauri/src/lib.rs` | Module registration, Tauri setup, command handler registration |
| `src-tauri/src/state.rs` | Central AppState struct with all manager slots |
| `src-tauri/tauri.conf.json` | Tauri configuration (windows, tray, bundle, plugins) |

## Data Flow: Meeting Lifecycle

```
1. User starts meeting (Ctrl+M or UI button)
   └─> Frontend: meetingStore.startMeetingFlow()
       └─> IPC: start_meeting, start_capture_per_party
           └─> Backend: creates meeting in SQLite, starts WASAPI audio capture

2. Audio flows through STT
   └─> Backend: AudioCaptureManager routes PCM to STTRouter
       └─> STTRouter dispatches to configured provider (per party)
           └─> Provider returns transcript segments
               └─> Backend emits "transcript_update" / "transcript_final" events
                   └─> Frontend: transcriptStore receives segments

3. User triggers AI assist (Space key)
   └─> Frontend: generateAssist("Assist", transcriptSegments)
       └─> Backend: IntelligenceEngine assembles prompt (transcript + context + RAG)
           └─> LLMRouter streams response tokens
               └─> Backend emits "llm_stream_start", "llm_stream_token", "llm_stream_end"
                   └─> Frontend: streamStore displays streaming response

4. User ends meeting (Ctrl+M)
   └─> Frontend: meetingStore.endMeetingFlow()
       └─> IPC: stop_capture, end_meeting
           └─> Backend: stops audio, saves transcript + AI interactions to SQLite
```
