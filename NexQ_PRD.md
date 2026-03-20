# NexQ — Product Requirements Document

> **AI Meeting Assistant & Real-Time Interview Copilot**
> Built with Tauri 2 (Rust + React) · Windows-First · Lightweight · Real-Time
>
> Version: 1.0.0 | Date: March 18, 2026 | Author: Vahid Alizadeh

---

## 1. Executive Summary

NexQ is a lightweight Windows desktop application that provides real-time meeting transcription, intelligent question detection, and AI-assisted response generation. It captures both microphone input (the user's voice) and system audio (remote participants via Zoom/Teams/Meet), transcribes speech in real time, and uses LLMs to generate contextual assistance on demand.

The user presses **Space** at any moment during a meeting to receive an AI-generated suggested response that considers the full conversation context plus pre-loaded resources like a resume, job description, or technical notes.

### 1.1 Core Value Propositions

- **Sub-second response**: Space → first token in under 500ms with local LLM
- **Tiny footprint**: Under 15MB binary, under 60MB RAM (vs 200MB+ Electron alternatives)
- **Dual audio capture**: Simultaneous mic + system audio via Windows WASAPI
- **Provider agnostic**: Works with Ollama, LM Studio, Anthropic, OpenAI, Groq, or any OpenAI-compatible endpoint
- **Context-aware**: Pre-loaded resume, files, and live conversation history feed into every response
- **Privacy first**: All data stays local; cloud APIs are optional

### 1.2 Target Users

- Job seekers in technical interviews who need real-time coding/system design assistance
- Professionals in meetings who want auto-generated talking points and objection handling
- Sales teams who need real-time objection handling suggestions
- Students in oral exams or thesis defenses

---

## 2. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Desktop framework | **Tauri 2** (v2.x) | 5-10MB binary, native WebView2, Rust backend |
| Frontend | **React 19** + TypeScript 5.x + Vite 6 | Component-driven UI, fast HMR |
| Styling | **Tailwind CSS 4** + shadcn/ui | Utility-first, accessible components |
| State management | **Zustand 5** | Lightweight, no boilerplate, works well with Tauri IPC |
| Rust audio | **cpal** + **wasapi** crates | Cross-platform audio input, WASAPI loopback for system audio |
| Rust STT | **windows-rs** (native) + **reqwest** (cloud APIs) | Windows Speech Recognition (free) or cloud streaming |
| Database | **rusqlite** + SQLite | Embedded, zero-config, meetings + transcripts |
| Credential store | **windows-rs** CredentialManager | OS-level encrypted API key storage |
| Config store | **tauri-plugin-store** | JSON persistence for app settings |
| LLM client | **reqwest** (streaming HTTP) | Ollama, LM Studio, cloud API streaming via SSE/NDJSON |
| Markdown rendering | **react-markdown** + remark-gfm | AI response rendering with code blocks |
| Packaging | **tauri-plugin-updater** + NSIS | Auto-update, Windows installer |

### 2.1 Why Tauri 2 Over Electron

| Metric | Tauri 2 | Electron | Improvement |
|--------|---------|----------|-------------|
| Binary size | ~8 MB | ~180 MB | 22x smaller |
| RAM usage | ~40-60 MB | ~200-400 MB | 5-7x less |
| Startup time | ~200ms | ~1.5s | 7x faster |
| IPC overhead | Minimal (FFI) | Serialization + bridge | Lower latency |
| Windows native APIs | Direct via windows-rs | Node.js child_process | First-class |
| Backend language | Rust (memory safe, fast) | JavaScript (single-threaded) | True parallel audio processing |

---

## 3. Application Architecture

### 3.1 Process Model

Tauri 2 uses a dual-process model:

```
┌─────────────────────────────────────────────────────────────────┐
│                     RUST CORE PROCESS                           │
│  Runs on tokio async runtime with true multithreading           │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ AudioCapture    │  │ STT Router      │  │ Intelligence   │  │
│  │ Manager         │  │                 │  │ Engine         │  │
│  │ ─────────────── │  │ ─────────────── │  │ ────────────── │  │
│  │ • Mic (cpal)    │  │ • Win native    │  │ • Question     │  │
│  │ • System audio  │  │ • Deepgram WS   │  │   detection    │  │
│  │   (wasapi)      │  │ • Whisper API   │  │ • Context      │  │
│  │ • VAD + silence │  │ • Azure Speech  │  │   assembly     │  │
│  │   detection     │  │ • Groq Whisper  │  │ • Prompt build │  │
│  └────────┬────────┘  └────────┬────────┘  └───────┬────────┘  │
│           │ PCM chunks         │ text segments      │ prompt    │
│           └────────►───────────┘                    │           │
│                                                     ▼           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ LLM Router      │  │ Context         │  │ Database       │  │
│  │                 │  │ Manager         │  │ Manager        │  │
│  │ ─────────────── │  │ ─────────────── │  │ ────────────── │  │
│  │ • Ollama        │  │ • Resume PDF    │  │ • rusqlite     │  │
│  │ • LM Studio     │  │ • Text files    │  │ • Meetings     │  │
│  │ • Anthropic     │  │ • Job desc      │  │ • Transcripts  │  │
│  │ • OpenAI / Groq │  │ • Custom notes  │  │ • Migrations   │  │
│  │ • Custom endpt  │  │ • PDF extract   │  │                │  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ Credential Mgr  │  │ Window Manager  │                      │
│  │ (Win Cred API)  │  │ (Overlay, Tray) │                      │
│  └─────────────────┘  └─────────────────┘                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    Tauri IPC Bridge
                 invoke() commands (request/response)
                 listen() events (streaming tokens, transcript)
                 All channels strongly typed via TypeScript bindings
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│                  WEBVIEW2 RENDERER (React)                      │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ TranscriptPanel │  │ QuestionDetector│  │ AIResponse     │  │
│  │ Rolling live    │  │ Auto-highlight  │  │ Panel          │  │
│  │ text w/ speaker │  │ detected Qs     │  │ Streaming MD   │  │
│  │ labels          │  │ w/ pulse        │  │ at 60fps       │  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ ContextPanel    │  │ SettingsOverlay │  │ Keyboard       │  │
│  │ Upload resume,  │  │ Audio, LLM,    │  │ Listener       │  │
│  │ files, notes    │  │ STT, hotkeys   │  │ Space → assist │  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
│                                                                 │
│  State: Zustand stores (meetingStore, transcriptStore,          │
│         configStore, streamStore)                               │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Key Data Flow: Space → AI Response

This is the critical path and must complete in under 500ms to first token (local LLM):

```
1. User presses Space
   └─► KeyboardListener (React) captures global hotkey via Tauri
       └─► IPC invoke("generate_assist")
           └─► IntelligenceEngine::generate_assist()
               ├─► Reads last 2 minutes of transcript from TranscriptBuffer
               ├─► Gets detected question from QuestionDetector
               ├─► Loads context from ContextManager (resume, files, notes)
               ├─► Builds prompt with system instructions + context + transcript + question
               └─► Sends to LLMRouter::stream_completion()
                   └─► Opens streaming HTTP to configured provider
                       └─► Tokens arrive via SSE/NDJSON
                           └─► Each token emitted via IPC event("llm_token")
                               └─► useStreamBuffer batches at 60fps
                                   └─► AIResponsePanel renders markdown
```

### 3.3 Window Types

| Window | Dimensions | Frame | Behavior | Purpose |
|--------|-----------|-------|----------|---------|
| **Launcher** | 900×650 | Standard frame | Resizable, centered | Main interface: recent meetings, settings, context upload |
| **Overlay** | 500px wide, full height | Frameless | Always-on-top, transparent bg, draggable | Live meeting: transcript, questions, AI response |
| **Settings** | Modal overlay | Frameless | Tabbed dialog, dismiss on Escape | Audio, LLM, STT, hotkeys, theme configuration |
| **System tray** | Icon + context menu | N/A | Minimize to tray, quick actions | Background presence, quick start meeting |

---

## 4. Feature Specifications

### 4.1 Audio Capture Pipeline

The app captures two independent audio streams simultaneously, each processed in a dedicated Rust thread on the tokio runtime.

#### 4.1.1 Microphone Capture

- Uses **cpal** crate to enumerate and open the user-selected input device
- Captures at **16kHz, 16-bit mono PCM** (optimal for speech recognition)
- **Voice Activity Detection (VAD)** via energy-threshold algorithm in Rust
- **Silence detection**: 1.5 seconds of silence finalizes a speech segment
- PCM chunks buffered in a **ring buffer** and sent to STT router via `tokio::sync::mpsc` channel
- Speaker label: **"User"**

#### 4.1.2 System Audio Capture (WASAPI Loopback)

- Uses **wasapi** crate to open the default render endpoint in loopback mode
- Captures whatever audio the system is playing (Zoom, Teams, Meet, browser, etc.)
- **Resampled** to 16kHz mono PCM to match STT input requirements
- Same VAD and silence detection pipeline as microphone
- Speaker label: **"Interviewer"** (or "Other")
- Independent thread from mic capture — both run simultaneously

#### 4.1.3 Audio Device Management

- Enumerate all input/output devices via cpal on startup and on device-change events
- User selects preferred mic and speaker in **Settings → Audio**
- **Real-time audio level meter** (0-100 scale) rendered as a visual bar for verification before meetings
- Audio level data sent via IPC events at ~20Hz to React UI
- Graceful handling of device disconnection mid-meeting (fall back to system default, show warning toast)

#### 4.1.4 Implementation: Rust Audio Module

```
src-tauri/src/audio/
├── mod.rs                  // AudioCaptureManager: coordinates mic + system capture
├── mic_capture.rs          // cpal-based microphone capture
├── system_capture.rs       // wasapi loopback capture
├── vad.rs                  // Voice Activity Detection (energy threshold)
├── resampler.rs            // Resample to 16kHz mono PCM
└── device_manager.rs       // Enumerate, select, monitor audio devices
```

**AudioCaptureManager public API (exposed as Tauri commands):**

```rust
#[tauri::command]
async fn list_audio_devices() -> Result<AudioDeviceList, String>;

#[tauri::command]
async fn start_capture(mic_device_id: String, speaker_device_id: String) -> Result<(), String>;

#[tauri::command]
async fn stop_capture() -> Result<(), String>;

#[tauri::command]
async fn get_audio_level(source: AudioSource) -> Result<f32, String>;

#[tauri::command]
async fn test_audio_device(device_id: String) -> Result<AudioTestResult, String>;
```

---

### 4.2 Speech-to-Text (STT)

The STT system uses a pluggable provider architecture. All providers implement a common Rust trait.

#### 4.2.1 Provider Matrix

| Provider | Type | Latency | Cost | Setup | Best For |
|----------|------|---------|------|-------|----------|
| **Windows native** | Local (windows-rs) | ~200ms | Free | Zero config (built into Win 10/11) | Default, no API key needed |
| **Whisper.cpp** | Local binary | ~300ms | Free | Download model on first use (~75MB) | Offline, good accuracy |
| **Deepgram** | WebSocket streaming | ~150ms | API key | Best real-time streaming | Highest accuracy |
| **OpenAI Whisper** | REST streaming | ~500ms | API key | Simple API | Good accuracy, higher latency |
| **Azure Speech** | REST | ~200ms | API key + region | Enterprise option | Corporate environments |
| **Groq Whisper** | REST batch | ~400ms | API key | Fast batch | Quick transcription |

The **default** is Windows native speech recognition — zero cost, zero API key, zero setup. Users can upgrade to cloud providers for better accuracy in Settings.

#### 4.2.2 STT Provider Trait

```rust
#[async_trait]
pub trait STTProvider: Send + Sync {
    async fn start_stream(&mut self) -> Result<(), STTError>;
    async fn send_audio(&mut self, pcm_chunk: &[i16]) -> Result<(), STTError>;
    async fn get_transcript(&mut self) -> Result<Option<TranscriptSegment>, STTError>;
    async fn stop_stream(&mut self) -> Result<Vec<TranscriptSegment>, STTError>;
    fn provider_name(&self) -> &str;
}

pub struct TranscriptSegment {
    pub text: String,
    pub speaker: Speaker,          // User or Interviewer
    pub timestamp_ms: u64,
    pub is_final: bool,            // false = interim result, true = finalized
    pub confidence: f32,           // 0.0 to 1.0
}

pub enum Speaker {
    User,         // from microphone
    Interviewer,  // from system audio
}
```

#### 4.2.3 Implementation: Rust STT Module

```
src-tauri/src/stt/
├── mod.rs                  // STTRouter: routes audio to active provider
├── provider.rs             // STTProvider trait definition
├── windows_native.rs       // Windows.Media.SpeechRecognition via windows-rs
├── deepgram.rs             // Deepgram WebSocket streaming client
├── whisper_api.rs          // OpenAI Whisper REST client
├── azure_speech.rs         // Azure Cognitive Services Speech client
├── groq_whisper.rs         // Groq Whisper REST client
└── whisper_local.rs        // Local whisper.cpp integration (optional)
```

**STTRouter Tauri commands:**

```rust
#[tauri::command]
async fn set_stt_provider(provider: String, config: STTConfig) -> Result<(), String>;

#[tauri::command]
async fn test_stt_connection(provider: String, config: STTConfig) -> Result<bool, String>;

#[tauri::command]
async fn get_available_stt_providers() -> Result<Vec<STTProviderInfo>, String>;
```

**IPC events emitted:**

```typescript
// React listens for these events
listen<TranscriptSegment>("transcript_update", (event) => { ... });
listen<TranscriptSegment>("transcript_final", (event) => { ... });
```

---

### 4.3 Intelligence Engine

The intelligence engine is the core AI subsystem. It builds context, detects questions, and orchestrates LLM calls.

#### 4.3.1 Trigger: Space Key

When the user presses Space, this pipeline executes:

1. **KeyboardListener** captures global hotkey via `tauri-plugin-global-shortcut`
2. **IPC invoke** triggers `IntelligenceEngine::generate_assist()`
3. **ContextManager** assembles the prompt:
   - Last 2 minutes of transcript (configurable window)
   - Most recently detected question (highlighted)
   - All loaded context resources (resume text, files, custom notes)
   - System instructions for the active intelligence mode
4. **LLMRouter** opens a streaming HTTP connection to the configured provider
5. **Tokens stream** back via IPC events to the React frontend
6. **useStreamBuffer** hook batches tokens at 60fps for smooth rendering
7. **AIResponsePanel** renders streaming markdown with code highlighting

**Target latency**: < 500ms to first token (local LLM), < 1000ms (cloud LLM)

#### 4.3.2 Intelligence Modes

| Mode | Hotkey | System Prompt Behavior | Description |
|------|--------|----------------------|-------------|
| **Assist** (default) | Space | "Based on this conversation and the user's background, suggest what to say next. If a question was detected, answer it directly." | General-purpose response suggestion |
| **What to Say** | Ctrl+1 | "Generate a clear, concise suggested response to the most recent question. Use the user's resume and context to personalize." | Focused answer to detected question |
| **Shorten** | Ctrl+2 | "Condense the previous AI response into 2-3 sentences while keeping the key points." | Make last response more concise |
| **Follow-up** | Ctrl+3 | "Generate an intelligent follow-up question or continuation based on the conversation so far." | Keep conversation flowing |
| **Recap** | Ctrl+4 | "Summarize the meeting so far in bullet points: key topics discussed, decisions made, and open items." | Meeting summary on demand |
| **Ask Question** | Ctrl+5 | Opens text input. User types a question. LLM answers using full meeting transcript + context as reference. | Manual query with meeting context |

#### 4.3.3 Question Detection

Runs continuously on the transcript stream. Two detection layers:

**Pattern matching (fast, regex-based):**
- Sentences ending with "?"
- Interrogative words: who, what, when, where, why, how, could, would, can, should, do, does, did, is, are, tell me, explain, describe, walk me through

**Contextual detection (interview-specific phrases):**
- "Tell me about a time when..."
- "Walk me through your approach to..."
- "How would you design..."
- "What's your experience with..."
- "Can you explain..."
- "Describe how you would..."
- "What are the tradeoffs between..."

**Behavior:**
- Detected questions are highlighted in the **QuestionDetector** panel with a pulsing blue indicator
- The most recent question is always included in the LLM prompt context
- **Auto-trigger mode** (optional, off by default): automatically generate an assist response when a question is detected, without requiring Space

#### 4.3.4 Context Resources

Users pre-load resources in the **Context Panel** before a meeting. These are included in every LLM prompt.

| Resource Type | Format | How It's Used |
|--------------|--------|---------------|
| **Resume** | PDF (extracted to text) | Personalizes responses with user's experience, skills, projects |
| **Job Description** | Text or PDF | Tailors responses to specific role requirements |
| **Technical Notes** | Text files (.txt, .md) | Reference material: system design notes, coding patterns, company info |
| **Custom Instructions** | Text input | System prompt additions: "respond in concise bullet points", "focus on Python examples", "use STAR method for behavioral questions" |

**Context assembly for LLM prompt:**

```
[System Instructions for Active Mode]

## User's Background
{resume_text}

## Job Description
{job_description_text}

## Reference Notes
{technical_notes_combined}

## Custom Instructions
{user_custom_instructions}

## Conversation Transcript (Last 2 Minutes)
[timestamp] User: {text}
[timestamp] Interviewer: {text}
[timestamp] User: {text}
...

## Detected Question
> {most_recent_question}

## Task
{mode_specific_instruction}
```

#### 4.3.5 Implementation: Rust Intelligence Module

```
src-tauri/src/intelligence/
├── mod.rs                  // IntelligenceEngine: orchestrates the full pipeline
├── question_detector.rs    // Pattern + contextual question detection
├── context_builder.rs      // Assembles prompt from transcript + context resources
├── prompt_templates.rs     // System prompts for each intelligence mode
└── transcript_buffer.rs    // Ring buffer of recent transcript segments (configurable window)
```

**Tauri commands:**

```rust
#[tauri::command]
async fn generate_assist(mode: IntelligenceMode) -> Result<(), String>;
// Response streams via IPC events, not return value

#[tauri::command]
async fn cancel_generation() -> Result<(), String>;

#[tauri::command]
async fn set_auto_trigger(enabled: bool) -> Result<(), String>;

#[tauri::command]
async fn set_context_window_seconds(seconds: u32) -> Result<(), String>;
```

**IPC events emitted:**

```typescript
listen<string>("llm_token", (event) => { ... });           // each token
listen<void>("llm_stream_start", (event) => { ... });      // stream began
listen<string>("llm_stream_end", (event) => { ... });      // full response
listen<string>("llm_stream_error", (event) => { ... });    // error
listen<DetectedQuestion>("question_detected", (event) => { ... });
```

---

### 4.4 LLM Provider System

All providers implement a common Rust trait with streaming support.

#### 4.4.1 Provider Matrix

| Provider | Connection | Stream Format | Models (examples) | Best For |
|----------|-----------|--------------|-------------------|----------|
| **Ollama** | `http://localhost:11434/api/chat` | NDJSON (line-delimited JSON) | llama3.2, qwen2.5, phi-3, mistral, codellama | Privacy, free, local GPU |
| **LM Studio** | `http://localhost:1234/v1/chat/completions` | SSE (OpenAI-compatible) | Any GGUF model loaded in LM Studio | Easy local model management |
| **Anthropic** | `https://api.anthropic.com/v1/messages` | SSE | claude-sonnet-4-20250514, claude-3.5-haiku | Best reasoning quality |
| **OpenAI** | `https://api.openai.com/v1/chat/completions` | SSE | gpt-4o, gpt-4o-mini, gpt-4-turbo | Widely supported |
| **Groq** | `https://api.groq.com/openai/v1/chat/completions` | SSE (OpenAI-compatible) | llama-3.3-70b, mixtral-8x7b | Fastest cloud inference |
| **Custom** | User-configured URL | SSE or NDJSON (auto-detect) | Any model at the endpoint | Any OpenAI-compatible server |

#### 4.4.2 LLM Provider Trait

```rust
#[async_trait]
pub trait LLMProvider: Send + Sync {
    async fn list_models(&self) -> Result<Vec<ModelInfo>, LLMError>;
    async fn test_connection(&self) -> Result<bool, LLMError>;
    async fn stream_completion(
        &self,
        messages: Vec<ChatMessage>,
        model: &str,
        token_sender: tokio::sync::mpsc::Sender<String>,
    ) -> Result<CompletionStats, LLMError>;
    fn provider_name(&self) -> &str;
}

pub struct ChatMessage {
    pub role: String,       // "system", "user", "assistant"
    pub content: String,
}

pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub context_length: Option<u32>,
    pub provider: String,
}

pub struct CompletionStats {
    pub tokens_generated: u32,
    pub time_to_first_token_ms: u64,
    pub total_time_ms: u64,
}
```

#### 4.4.3 Provider Features

- **Dynamic model discovery**: Each provider's `list_models()` fetches currently available models
- **Default model selection**: Persisted per provider in config store
- **Connection testing**: `test_connection()` verifies API key/endpoint before saving
- **Hot-switching**: Change provider or model mid-meeting without stopping audio/transcription
- **Ollama lifecycle** (optional): Detect if Ollama is running, offer to start it, auto-pull recommended models

#### 4.4.4 Implementation: Rust LLM Module

```
src-tauri/src/llm/
├── mod.rs                  // LLMRouter: routes to active provider, manages hot-switching
├── provider.rs             // LLMProvider trait definition
├── ollama.rs               // Ollama HTTP client with NDJSON stream parser
├── lmstudio.rs             // LM Studio OpenAI-compatible client
├── anthropic.rs            // Anthropic Messages API client with SSE parser
├── openai.rs               // OpenAI Chat Completions client with SSE parser
├── groq.rs                 // Groq (OpenAI-compatible) client
├── custom.rs               // User-configured endpoint client
└── stream_parser.rs        // SSE and NDJSON stream parsing utilities
```

**Tauri commands:**

```rust
#[tauri::command]
async fn set_llm_provider(provider: String, config: LLMConfig) -> Result<(), String>;

#[tauri::command]
async fn list_models(provider: String) -> Result<Vec<ModelInfo>, String>;

#[tauri::command]
async fn set_active_model(provider: String, model_id: String) -> Result<(), String>;

#[tauri::command]
async fn test_llm_connection(provider: String, config: LLMConfig) -> Result<bool, String>;

#[tauri::command]
async fn get_llm_providers() -> Result<Vec<LLMProviderInfo>, String>;
```

---

### 4.5 Meeting Lifecycle

#### 4.5.1 Start Meeting

1. User clicks **"Start Meeting"** button in Launcher or presses `Ctrl+M`
2. Window transitions from Launcher to **Overlay mode** (frameless, always-on-top, compact, semi-transparent)
3. `AudioCaptureManager` starts mic + system audio capture in separate Rust threads
4. `STTRouter` begins processing audio chunks, emitting `transcript_update` and `transcript_final` events
5. `TranscriptPanel` and `QuestionDetector` begin rendering live text
6. Meeting metadata written to SQLite: `{ id, title: "Meeting <timestamp>", start_time, mic_device, speaker_device, llm_provider, stt_provider }`

#### 4.5.2 During Meeting

- Continuous dual-stream transcription displayed in real time
- Question detection runs continuously with visual highlighting
- User presses **Space** (or Ctrl+1-5) for AI assistance at any moment
- AI responses stream into the response panel with full markdown formatting
- User can switch LLM provider/model without stopping the meeting
- Manual question input available via Ctrl+5
- All AI interactions logged with timestamps for meeting history

#### 4.5.3 End Meeting

1. User clicks **"End Meeting"** button or presses `Ctrl+M`
2. Audio capture stops, final STT segments finalized
3. Full transcript saved to SQLite with speaker labels and timestamps
4. Optional: auto-generate meeting summary via LLM (configurable in Settings)
5. Window transitions back to Launcher
6. Meeting appears in **Recent Meetings** list in Launcher

#### 4.5.4 Meeting Data Model

```rust
pub struct Meeting {
    pub id: String,                    // UUID
    pub title: String,                 // User-editable, default "Meeting <datetime>"
    pub start_time: i64,               // Unix timestamp ms
    pub end_time: Option<i64>,         // Unix timestamp ms
    pub transcript: Vec<TranscriptSegment>,  // Full speaker-labeled transcript
    pub summary: Option<String>,       // Auto-generated summary (markdown)
    pub ai_interactions: Vec<AIInteraction>, // Log of all AI assist calls
    pub config_snapshot: MeetingConfig,     // Provider settings at time of meeting
}

pub struct AIInteraction {
    pub timestamp_ms: u64,
    pub mode: IntelligenceMode,
    pub question_context: Option<String>,
    pub response: String,
    pub model_used: String,
    pub latency_ms: u64,
}
```

---

### 4.6 Context Manager

Manages user-provided reference materials. Files are stored in the app data directory and text is extracted/cached for fast prompt assembly.

#### 4.6.1 Supported File Types

| Type | Extensions | Extraction Method |
|------|-----------|-------------------|
| PDF | .pdf | `pdf-extract` crate → plain text |
| Text | .txt, .md | Read directly |
| Word | .docx | Basic XML extraction (stretch goal) |

#### 4.6.2 Context Panel UI

- **Drag-and-drop** file upload area
- **File browser** button as alternative
- List of loaded resources with name, size, preview snippet
- **Remove** button per resource
- **Custom instructions** text area (persisted to config store)
- Total context size indicator (helps user stay within LLM context limits)

#### 4.6.3 Implementation

```
src-tauri/src/context/
├── mod.rs                  // ContextManager: load, cache, serve context text
├── pdf_extractor.rs        // PDF → text via pdf-extract
├── file_loader.rs          // Text/markdown file loading
└── resource_cache.rs       // In-memory cache of extracted text
```

**Tauri commands:**

```rust
#[tauri::command]
async fn load_context_file(file_path: String) -> Result<ContextResource, String>;

#[tauri::command]
async fn remove_context_file(resource_id: String) -> Result<(), String>;

#[tauri::command]
async fn list_context_resources() -> Result<Vec<ContextResource>, String>;

#[tauri::command]
async fn set_custom_instructions(instructions: String) -> Result<(), String>;

#[tauri::command]
async fn get_assembled_context() -> Result<String, String>;
```

---

### 4.7 Data Persistence

| Store | Technology | Data | Location |
|-------|-----------|------|----------|
| **Meetings database** | SQLite (rusqlite) | Meeting ID, title, timestamps, full transcript (JSON), summary, AI usage log | `%APPDATA%/com.nexq.app/nexq.db` |
| **App configuration** | tauri-plugin-store (JSON) | Theme, language, default providers, device selections, feature flags, hotkey mappings | `%APPDATA%/com.nexq.app/config.json` |
| **API credentials** | Windows Credential Manager | API keys for Anthropic, OpenAI, Groq, Deepgram, Azure | Windows Credential Manager (DPAPI encrypted) |
| **Context resources** | File system | Resume PDFs, job descriptions, technical notes, custom instructions | `%APPDATA%/com.nexq.app/context/` |
| **UI state** | Zustand (in-memory) | Current transcript, active meeting, streaming response buffer, panel visibility | RAM only (not persisted) |

#### 4.7.1 SQLite Schema

```sql
CREATE TABLE meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    transcript TEXT NOT NULL,        -- JSON array of TranscriptSegment
    summary TEXT,                    -- Markdown summary
    ai_interactions TEXT,            -- JSON array of AIInteraction
    config_snapshot TEXT,            -- JSON of MeetingConfig
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_meetings_start ON meetings(start_time DESC);

CREATE TABLE context_resources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    resource_type TEXT NOT NULL,     -- "resume", "job_description", "notes", "custom"
    extracted_text TEXT,             -- Cached extracted text
    file_size INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

#### 4.7.2 Database Manager

```
src-tauri/src/db/
├── mod.rs                  // DatabaseManager: connection pool, migration runner
├── migrations.rs           // Schema versioning and migration scripts
├── meetings.rs             // Meeting CRUD operations
└── context.rs              // Context resource CRUD
```

---

### 4.8 Credential Manager

API keys are stored in Windows Credential Manager via the `windows-rs` crate, providing OS-level DPAPI encryption.

```
src-tauri/src/credentials/
├── mod.rs                  // CredentialManager: store, retrieve, delete API keys
└── windows_cred.rs         // Windows Credential Manager bindings via windows-rs
```

**Tauri commands:**

```rust
#[tauri::command]
async fn store_api_key(provider: String, key: String) -> Result<(), String>;

#[tauri::command]
async fn get_api_key(provider: String) -> Result<Option<String>, String>;

#[tauri::command]
async fn delete_api_key(provider: String) -> Result<(), String>;

#[tauri::command]
async fn has_api_key(provider: String) -> Result<bool, String>;
```

Key naming convention in Windows Credential Manager: `NexQ:{provider_name}` (e.g., `NexQ:anthropic`, `NexQ:openai`, `NexQ:deepgram`)

---

## 5. UI/UX Specifications

### 5.1 Overlay Layout (Live Meeting)

The overlay is the primary interface during active meetings. It is a narrow, frameless, always-on-top panel designed to sit alongside Zoom/Teams/Meet/browser windows without obscuring them.

```
┌──────────────────────────────────────────┐ ← Frameless, draggable title bar
│  NexQ ●REC                    ─ □ ✕     │    (drag to reposition)
├──────────────────────────────────────────┤
│                                          │
│  TRANSCRIPT (scrolling, last ~30s)       │ ← Rolling live text
│                                          │
│  [User] I've worked with distributed     │    Color-coded speaker labels
│  systems for about 5 years, mostly...    │    Auto-scrolls, manual scroll pauses it
│                                          │
│  [Interviewer] Can you walk me through   │
│  how you'd design a URL shortener?       │
│                                          │
├──────────────────────────────────────────┤
│  ❓ DETECTED QUESTION                    │ ← Pulsing blue indicator
│  "How would you design a URL shortener?" │    Updates on each new question
├──────────────────────────────────────────┤
│                                          │
│  AI RESPONSE                             │ ← Streaming markdown area
│                                          │
│  Here's a structured approach:           │    Renders: headers, code, lists,
│                                          │    bold, tables, inline code
│  **1. Requirements Clarification**       │
│  - Read-heavy (100:1 read/write ratio)   │    Scrollable independently
│  - ~500M new URLs/month                  │
│                                          │
│  **2. API Design**                       │
│  ```                                     │
│  POST /api/shorten                       │
│  GET  /{shortCode} → 301 redirect       │
│  ```                                     │
│                                          │
│  **3. Data Model**                       │
│  ...                                     │
│                                          │
├──────────────────────────────────────────┤
│  [Assist] [Say] [Short] [F/U] [Recap]   │ ← Mode buttons
│  [Ask...                            🔍]  │ ← Manual question input
├──────────────────────────────────────────┤
│  Ollama · llama3.2:8b · 340ms      ⚙️    │ ← Status bar: provider, model, latency
│  [End Meeting]                           │
└──────────────────────────────────────────┘
```

### 5.2 Launcher Layout

```
┌──────────────────────────────────────────────────────────────┐
│  NexQ                                              ─ □ ✕    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  🔍 Search meetings...                                 │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  CONTEXT RESOURCES                              [+ Add File] │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐  │
│  │ 📄 Resume.pdf   │ │ 📝 JD - SWE    │ │ 📎 Notes.md  │  │
│  │ 2 pages, 1.2KB  │ │ Google L5       │ │ System design │  │
│  │           [✕]   │ │           [✕]   │ │         [✕]  │  │
│  └─────────────────┘ └─────────────────┘ └──────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Custom instructions:                                   │  │
│  │ Use STAR method for behavioral Qs. Respond concisely.  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│               [ ▶ Start Meeting ]                            │
│                                                              │
│  ─────────────────────────────────────────────────────────── │
│  RECENT MEETINGS                                             │
│                                                              │
│  Today                                                       │
│  ├─ System Design Interview (2:30 PM, 45 min)        [📄]  │
│  └─ Team Standup (10:00 AM, 15 min)                  [📄]  │
│                                                              │
│  Yesterday                                                   │
│  └─ Mock Interview: Behavioral (3:00 PM, 30 min)    [📄]  │
│                                                              │
│  This Week                                                   │
│  ├─ 1:1 with Manager (Mon, 11:00 AM)                [📄]  │
│  └─ Product Review (Mon, 2:00 PM)                   [📄]  │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Ollama · llama3.2:8b                    [⚙️ Settings]      │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 Settings Overlay

Tabbed modal dialog accessed via ⚙️ button.

**Tab: Audio**
- Microphone selection dropdown (populated from device enumeration)
- Speaker/output selection dropdown
- Audio level meter (live bar visualization)
- "Test Audio" button (records 3 seconds, plays back)

**Tab: LLM Provider**
- Provider selector: Ollama | LM Studio | Anthropic | OpenAI | Groq | Custom
- API key input (stored via CredentialManager, shown as masked)
- "Test Connection" button with success/failure indicator
- Model selector dropdown (auto-populated via list_models)
- Custom endpoint: URL + API key + model name fields

**Tab: STT Provider**
- Provider selector: Windows Native | Deepgram | OpenAI Whisper | Azure | Groq
- API key input per provider
- "Test Connection" button
- Language selection dropdown (for Windows native STT)

**Tab: Hotkeys**
- Customizable keyboard shortcuts for all actions
- Conflict detection warning
- "Reset to Defaults" button

**Tab: General**
- Theme toggle: Dark / Light / System
- Context window duration (seconds of transcript to include, default: 120)
- Auto-trigger toggle (auto-generate assist when question detected)
- Auto-summary toggle (generate summary when meeting ends)
- Start on login toggle
- Data directory path display

**Tab: About**
- App version, Tauri version
- Links to GitHub repo, documentation
- Update check button

### 5.4 Visual Design

- **Dark mode** default, light mode toggle
- **Tailwind CSS 4** with semantic color tokens via CSS variables
- **shadcn/ui** components for inputs, dialogs, dropdowns, toasts, tabs
- Smooth CSS transitions for panel shows/hides and window transitions
- **Semi-transparent** overlay background (adjustable opacity) for unobtrusive screen-sharing
- **Monospace font** for code blocks in AI responses
- **Color-coded** speaker labels: blue for User, orange for Interviewer

---

## 6. Keyboard Shortcuts

All shortcuts are registered as global hotkeys via `tauri-plugin-global-shortcut` and are user-customizable. Stored in config.json.

| Shortcut | Action | Context | Notes |
|----------|--------|---------|-------|
| **Space** | Trigger AI assist | During meeting | Primary interaction |
| **Ctrl+1** | What to Say mode | During meeting | Focused answer suggestion |
| **Ctrl+2** | Shorten response | During meeting | Condense last response |
| **Ctrl+3** | Follow-up | During meeting | Generate follow-up Q |
| **Ctrl+4** | Recap | During meeting | Meeting summary |
| **Ctrl+5** | Ask question | During meeting | Opens text input |
| **Ctrl+M** | Start/End meeting | Global | Toggle meeting state |
| **Ctrl+B** | Toggle app visibility | Global | Show/hide window |
| **Ctrl+H** | Take screenshot for OCR | Global | Stretch goal |
| **Arrow keys** | Move overlay window | During meeting | Reposition overlay |
| **Escape** | Close settings / cancel | Any | Dismiss dialogs |
| **Ctrl+,** | Open settings | Any | Quick settings access |

**Note**: If Space conflicts with typing in the Ask Question input (Ctrl+5), the hotkey is automatically suspended while the input field is focused.

---

## 7. Performance Requirements

| Metric | Target | How to Measure |
|--------|--------|---------------|
| Binary size (installer) | < 15 MB | NSIS output size |
| RAM usage (idle) | < 40 MB | Task Manager working set |
| RAM usage (active meeting) | < 80 MB | Task Manager during dual-stream transcription + LLM |
| Cold start → interactive | < 500ms | Launch to UI rendered timestamp |
| Audio → transcript text | < 300ms | Speech end to text appearing (local STT) |
| Space → first LLM token | < 500ms | Keypress to first streamed token (local LLM) |
| Space → first LLM token | < 1000ms | Keypress to first streamed token (cloud LLM) |
| Token rendering framerate | 60fps | useStreamBuffer batch interval |
| Audio capture jitter | < 10ms | PCM buffer delivery consistency |
| CPU usage (active meeting) | < 15% avg | Dual audio + STT + LLM on 4-core CPU |
| Database write (save meeting) | < 100ms | SQLite transaction time |
| Device enumeration | < 200ms | Time to list all audio devices |

---

## 8. Security & Privacy

- **Local-first architecture**: All data (transcripts, meetings, context files) stored locally. No cloud sync unless user explicitly configures cloud LLM/STT providers.
- **Encrypted credential storage**: API keys stored via Windows Credential Manager (DPAPI encryption). Never written to plaintext files, logs, or config.
- **Content protection**: `SetWindowDisplayAffinity` (Windows API) prevents the overlay from appearing in screenshots and screen recordings when stealth mode is enabled.
- **Context isolation**: Tauri's security model enforces strict IPC boundaries. The WebView cannot access the file system or native APIs directly — all access goes through explicitly defined Tauri commands with permission scoping.
- **No telemetry by default**: No analytics, tracking, or phone-home behavior unless user opts in.
- **CSP enforcement**: Content Security Policy in the WebView restricts loaded resources to prevent XSS and injection attacks.
- **No remote code execution**: All LLM calls are HTTP requests to configured endpoints. No eval(), no dynamic code loading.

---

## 9. Complete Project Structure

```
nexq/
├── src-tauri/
│   ├── Cargo.toml                     # Rust dependencies
│   ├── tauri.conf.json                # Tauri config (window, permissions, plugins)
│   ├── capabilities/                  # Tauri permission capabilities
│   │   └── default.json
│   ├── icons/                         # App icons (various sizes)
│   └── src/
│       ├── main.rs                    # Entry point: setup app, register commands, plugins
│       ├── lib.rs                     # Module declarations
│       ├── state.rs                   # AppState struct (shared across commands)
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── audio_commands.rs      # IPC: list_devices, start/stop capture, audio levels
│       │   ├── stt_commands.rs        # IPC: set/test STT provider
│       │   ├── llm_commands.rs        # IPC: set provider, list models, test connection
│       │   ├── intelligence_commands.rs # IPC: generate_assist, cancel, set mode
│       │   ├── meeting_commands.rs    # IPC: start/end meeting, list meetings, get meeting
│       │   ├── context_commands.rs    # IPC: load/remove files, set instructions
│       │   ├── credential_commands.rs # IPC: store/get/delete API keys
│       │   └── settings_commands.rs   # IPC: get/set config values
│       ├── audio/
│       │   ├── mod.rs                 # AudioCaptureManager
│       │   ├── mic_capture.rs         # cpal microphone capture
│       │   ├── system_capture.rs      # wasapi loopback capture
│       │   ├── vad.rs                 # Voice Activity Detection
│       │   ├── resampler.rs           # Resample to 16kHz mono
│       │   └── device_manager.rs      # Device enumeration and monitoring
│       ├── stt/
│       │   ├── mod.rs                 # STTRouter
│       │   ├── provider.rs            # STTProvider trait
│       │   ├── windows_native.rs      # Windows.Media.SpeechRecognition
│       │   ├── deepgram.rs            # Deepgram WebSocket client
│       │   ├── whisper_api.rs         # OpenAI Whisper REST
│       │   ├── azure_speech.rs        # Azure Cognitive Services
│       │   └── groq_whisper.rs        # Groq Whisper REST
│       ├── intelligence/
│       │   ├── mod.rs                 # IntelligenceEngine
│       │   ├── question_detector.rs   # Pattern + contextual detection
│       │   ├── context_builder.rs     # Prompt assembly
│       │   ├── prompt_templates.rs    # System prompts per mode
│       │   └── transcript_buffer.rs   # Sliding window of recent transcript
│       ├── llm/
│       │   ├── mod.rs                 # LLMRouter
│       │   ├── provider.rs            # LLMProvider trait
│       │   ├── ollama.rs              # Ollama NDJSON streaming client
│       │   ├── lmstudio.rs            # LM Studio OpenAI-compat client
│       │   ├── anthropic.rs           # Anthropic Messages API client
│       │   ├── openai.rs              # OpenAI Chat Completions client
│       │   ├── groq.rs                # Groq client
│       │   ├── custom.rs              # User-configured endpoint
│       │   └── stream_parser.rs       # SSE + NDJSON parser utilities
│       ├── db/
│       │   ├── mod.rs                 # DatabaseManager
│       │   ├── migrations.rs          # Schema versioning
│       │   ├── meetings.rs            # Meeting CRUD
│       │   └── context.rs             # Context resource CRUD
│       ├── context/
│       │   ├── mod.rs                 # ContextManager
│       │   ├── pdf_extractor.rs       # PDF → text
│       │   ├── file_loader.rs         # txt/md loading
│       │   └── resource_cache.rs      # In-memory text cache
│       └── credentials/
│           ├── mod.rs                 # CredentialManager
│           └── windows_cred.rs        # Windows Credential Manager bindings
│
├── src/                               # React frontend
│   ├── App.tsx                        # Root: routes between Launcher and Overlay
│   ├── main.tsx                       # React entry point
│   ├── index.css                      # Tailwind imports, CSS variables, global styles
│   ├── vite-env.d.ts                  # Vite type declarations
│   ├── components/
│   │   ├── launcher/
│   │   │   ├── LauncherView.tsx       # Main launcher layout
│   │   │   ├── RecentMeetings.tsx     # Grouped meeting list with search
│   │   │   ├── MeetingCard.tsx        # Individual meeting entry
│   │   │   └── MeetingDetails.tsx     # Full meeting view (transcript, summary, AI log)
│   │   ├── overlay/
│   │   │   ├── OverlayView.tsx        # Main overlay layout during meeting
│   │   │   ├── TranscriptPanel.tsx    # Rolling live transcript with speaker labels
│   │   │   ├── TranscriptLine.tsx     # Single transcript segment
│   │   │   ├── QuestionDetector.tsx   # Detected question display with pulse
│   │   │   ├── AIResponsePanel.tsx    # Streaming markdown response renderer
│   │   │   ├── ModeButtons.tsx        # Intelligence mode button bar
│   │   │   ├── AskInput.tsx           # Manual question text input
│   │   │   └── StatusBar.tsx          # Provider, model, latency display
│   │   ├── context/
│   │   │   ├── ContextPanel.tsx       # Context resource management UI
│   │   │   ├── FileUpload.tsx         # Drag-and-drop + file browser upload
│   │   │   ├── ResourceCard.tsx       # Individual resource with preview + remove
│   │   │   └── CustomInstructions.tsx # Editable text area for custom instructions
│   │   ├── settings/
│   │   │   ├── SettingsOverlay.tsx     # Tabbed settings modal
│   │   │   ├── AudioSettings.tsx      # Device selection, level meter, test
│   │   │   ├── LLMSettings.tsx        # Provider config, API key, model select
│   │   │   ├── STTSettings.tsx        # STT provider config
│   │   │   ├── HotkeySettings.tsx     # Customizable keyboard shortcuts
│   │   │   ├── GeneralSettings.tsx    # Theme, context window, toggles
│   │   │   └── AboutSettings.tsx      # Version, links, update check
│   │   └── ui/                        # shadcn/ui components (auto-generated)
│   │       ├── button.tsx
│   │       ├── dialog.tsx
│   │       ├── dropdown-menu.tsx
│   │       ├── input.tsx
│   │       ├── select.tsx
│   │       ├── slider.tsx
│   │       ├── tabs.tsx
│   │       ├── toast.tsx
│   │       └── tooltip.tsx
│   ├── stores/
│   │   ├── meetingStore.ts            # Active meeting state, start/end, recording status
│   │   ├── transcriptStore.ts         # Live transcript segments, scroll position
│   │   ├── streamStore.ts             # LLM streaming buffer, current response
│   │   ├── configStore.ts             # App settings, provider config, theme
│   │   └── contextStore.ts            # Loaded context resources, custom instructions
│   ├── hooks/
│   │   ├── useStreamBuffer.ts         # 60fps token batching for smooth rendering
│   │   ├── useAudioLevel.ts           # Subscribe to audio level IPC events
│   │   ├── useTranscript.ts           # Subscribe to transcript IPC events
│   │   ├── useGlobalShortcut.ts       # Register/handle keyboard shortcuts
│   │   └── useTheme.ts               # Dark/light mode management
│   └── lib/
│       ├── ipc.ts                     # Typed Tauri invoke() wrappers for all commands
│       ├── events.ts                  # Typed Tauri listen() wrappers for all events
│       ├── types.ts                   # Shared TypeScript types mirroring Rust structs
│       └── utils.ts                   # Formatting, time, speaker colors
│
├── package.json                       # React + build dependencies
├── tsconfig.json                      # TypeScript config
├── vite.config.ts                     # Vite config with Tauri plugin
├── tailwind.config.ts                 # Tailwind config
├── components.json                    # shadcn/ui config
└── README.md                          # Project documentation
```

---

## 10. Development Phases

### Phase 1: Foundation (Week 1-2)

**Goal**: Tauri 2 project scaffold with basic UI shell and audio device enumeration.

**Deliverables:**
- [ ] Initialize Tauri 2 project: `npm create tauri-app@latest nexq -- --template react-ts`
- [ ] Configure Vite 6 + Tailwind CSS 4 + shadcn/ui
- [ ] Set up project directory structure (all folders from Section 9)
- [ ] Implement Launcher window with placeholder panels
- [ ] Implement Overlay window (frameless, always-on-top, transparent)
- [ ] System tray icon with context menu (Start Meeting, Settings, Quit)
- [ ] Audio device enumeration via cpal (Tauri command: `list_audio_devices`)
- [ ] Settings overlay scaffold with Audio tab (device dropdowns, level meter placeholder)
- [ ] Zustand store scaffold: meetingStore, configStore
- [ ] tauri-plugin-store integration for persisting settings
- [ ] Window transition: Launcher ↔ Overlay (triggered by Start/End Meeting button)

**Exit criteria**: App launches, shows Launcher, transitions to Overlay, lists audio devices.

### Phase 2: Audio Pipeline (Week 3-4)

**Goal**: Dual-stream audio capture working with live level meters.

**Deliverables:**
- [ ] Microphone capture via cpal with configurable device selection
- [ ] System audio capture via wasapi crate (WASAPI loopback)
- [ ] Audio processing module: resample to 16kHz mono PCM
- [ ] Voice Activity Detection (VAD) with energy-threshold algorithm
- [ ] Silence detection (1.5s threshold for segment finalization)
- [ ] Ring buffer + tokio mpsc channel for audio chunks
- [ ] Real-time audio level meter: IPC events at ~20Hz → React level bar
- [ ] AudioSettings component: device selection + live level visualization
- [ ] Device disconnection handling (fallback + warning toast)
- [ ] "Test Audio" button: record 3s, play back for verification

**Exit criteria**: Both mic and system audio capture simultaneously, level meters work, devices selectable.

### Phase 3: Speech-to-Text (Week 5-6)

**Goal**: Real-time transcription from both audio streams displayed in the overlay.

**Deliverables:**
- [ ] STTProvider trait definition in Rust
- [ ] Windows native STT via windows-rs (`Windows.Media.SpeechRecognition`)
- [ ] STTRouter: routes audio chunks to active provider
- [ ] IPC events: `transcript_update` (interim) and `transcript_final` (finalized)
- [ ] TranscriptPanel component: rolling live text with auto-scroll
- [ ] TranscriptLine component: speaker label (User/Interviewer) + text + timestamp
- [ ] Speaker labeling based on audio source (mic = User, system = Interviewer)
- [ ] useTranscript hook: subscribes to transcript IPC events, updates transcriptStore
- [ ] Deepgram WebSocket streaming client (cloud STT option)
- [ ] STT Settings tab: provider selection, API key input, test connection
- [ ] transcriptStore: manages segment list, scroll position, search

**Exit criteria**: Live transcription from both audio sources displayed in overlay with speaker labels.

### Phase 4: Intelligence Engine (Week 7-8)

**Goal**: AI-assisted responses working end-to-end with Space key trigger.

**Deliverables:**
- [ ] LLMProvider trait definition in Rust
- [ ] Ollama HTTP streaming client (NDJSON parser)
- [ ] LM Studio client (OpenAI-compatible SSE parser)
- [ ] LLMRouter: routes to active provider, streams tokens via IPC events
- [ ] IntelligenceEngine: temporal context builder (configurable transcript window)
- [ ] Question detection: regex patterns + interview-specific contextual phrases
- [ ] QuestionDetector component: highlighted question display with pulse animation
- [ ] Space key global shortcut registration via tauri-plugin-global-shortcut
- [ ] Full assist pipeline: Space → context assembly → LLM stream → IPC events
- [ ] AIResponsePanel: streaming markdown rendering via react-markdown + remark-gfm
- [ ] useStreamBuffer hook: 60fps token batching for smooth rendering
- [ ] ModeButtons component: Assist, Say, Shorten, Follow-up, Recap buttons
- [ ] AskInput component: manual question input (Ctrl+5)
- [ ] StatusBar: provider name, active model, last response latency
- [ ] streamStore: manages streaming buffer, current response, loading state

**Exit criteria**: Press Space during a meeting → AI response streams into overlay panel. Question detection highlights questions. All 6 modes work.

### Phase 5: Context & Storage (Week 9-10)

**Goal**: Context resources, meeting persistence, and credential management.

**Deliverables:**
- [ ] ContextManager: load/cache/serve context text from files
- [ ] PDF text extraction via pdf-extract crate
- [ ] Text/markdown file loading
- [ ] ContextPanel component: drag-and-drop upload, resource list, remove buttons
- [ ] CustomInstructions component: editable text area, persisted to config
- [ ] Context assembly into LLM prompts (resume + JD + notes + instructions + transcript)
- [ ] SQLite database setup with rusqlite (meetings table, context_resources table)
- [ ] Database migrations system (auto-run on startup)
- [ ] Meeting save on end: full transcript, metadata, AI interaction log
- [ ] Meeting load: retrieve from SQLite for meeting details view
- [ ] RecentMeetings component: grouped list (Today, Yesterday, This Week, Earlier)
- [ ] MeetingDetails component: full transcript view, summary, AI usage log
- [ ] Meeting search (fuzzy match on title and transcript text)
- [ ] CredentialManager: Windows Credential Manager integration for API keys
- [ ] contextStore: manages loaded resources, extracted text cache

**Exit criteria**: Upload resume + notes → context appears in AI prompts. Meetings persist to SQLite. Past meetings browsable and searchable.

### Phase 6: Cloud Providers & Polish (Week 11-12)

**Goal**: Cloud LLM/STT providers, polish, packaging, distribution.

**Deliverables:**
- [ ] Anthropic Claude streaming client (Messages API + SSE)
- [ ] OpenAI GPT streaming client (Chat Completions + SSE)
- [ ] Groq streaming client (OpenAI-compatible)
- [ ] Custom endpoint client (user-configured URL, auto-detect stream format)
- [ ] OpenAI Whisper STT client
- [ ] Azure Speech STT client
- [ ] Groq Whisper STT client
- [ ] Hot-switching: change provider/model mid-meeting without restart
- [ ] Connection testing for all LLM and STT providers in Settings
- [ ] LLM Settings: full provider configuration UI with model selection
- [ ] All intelligence modes fully functional with proper system prompts
- [ ] Content protection: SetWindowDisplayAffinity for stealth mode
- [ ] Auto-summary generation on meeting end (optional, via LLM)
- [ ] Dark/light theme toggle with proper CSS variables
- [ ] All hotkeys customizable in Settings
- [ ] tauri-plugin-updater: check GitHub Releases, download + apply updates
- [ ] NSIS installer configuration
- [ ] Build pipeline: `npm run tauri build` → NSIS installer
- [ ] README with setup instructions, development guide, architecture overview
- [ ] Performance testing: verify all targets from Section 7

**Exit criteria**: Full-featured app with local + cloud providers, installable via NSIS, auto-updates working.

---

## 11. Key Dependencies

### 11.1 Rust Crates (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-store = "2"
tauri-plugin-updater = "2"
tauri-plugin-global-shortcut = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["stream", "json"] }
cpal = "0.15"
wasapi = "0.14"
windows = { version = "0.58", features = [
    "Win32_Security_Credentials",
    "Win32_Media_Speech",
    "Win32_UI_WindowsAndMessaging",
] }
rusqlite = { version = "0.32", features = ["bundled"] }
pdf-extract = "0.7"
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
regex = "1"
log = "0.4"
env_logger = "0.11"
futures = "0.3"
async-trait = "0.1"
```

### 11.2 npm Packages (package.json)

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-store": "^2.0.0",
    "@tauri-apps/plugin-dialog": "^2.0.0",
    "@tauri-apps/plugin-fs": "^2.0.0",
    "@tauri-apps/plugin-global-shortcut": "^2.0.0",
    "@tauri-apps/plugin-updater": "^2.0.0",
    "zustand": "^5.0.0",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "react-syntax-highlighter": "^15.0.0",
    "lucide-react": "latest",
    "@radix-ui/react-dialog": "latest",
    "@radix-ui/react-dropdown-menu": "latest",
    "@radix-ui/react-select": "latest",
    "@radix-ui/react-tabs": "latest",
    "@radix-ui/react-toast": "latest",
    "@radix-ui/react-tooltip": "latest",
    "@radix-ui/react-slider": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "tailwind-merge": "latest"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "typescript": "^5.5.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

---

## 12. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| WASAPI loopback fails on some audio drivers | No system audio capture | Medium | Fallback to virtual audio cable (VB-Cable). Detect failure and show setup guide. Document compatible drivers. |
| Windows native STT accuracy too low | Poor transcript quality | Medium | Default to Windows STT but offer Deepgram/Whisper upgrade prominently in Settings. Show accuracy comparison on first use. |
| Local LLM too slow on CPU-only machines | Assist response >2s | High | Detect GPU on startup. Recommend small models (Phi-3, Qwen2.5-3B) for CPU. Show estimated latency before selection. Consider bundling a tiny model. |
| WebView2 not installed (rare Windows 10) | App won't launch | Low | Bundle WebView2 bootstrapper in NSIS installer. Auto-install if missing. Show clear error message. |
| Tauri 2 API breaking changes | Rework needed | Low | Pin exact Tauri version in Cargo.toml. Use stable channel only. Follow Tauri release notes. |
| Global hotkey conflicts with other apps | Space doesn't trigger assist | Medium | All hotkeys customizable. Conflict detection in Settings. Default fallback: Ctrl+Space if Space conflicts. |
| Audio permission denied by Windows | No mic capture | Low | Check permission on startup. Show step-by-step instructions to enable in Windows Settings > Privacy > Microphone. |
| LLM context window exceeded with large context files | Prompt truncated or rejected | Medium | Show total context token count in Context Panel. Warn when approaching limit. Auto-truncate oldest transcript if needed. |

---

## 13. Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| MVP delivery | 12 weeks from start | Phase completion tracking |
| Binary size (NSIS installer) | < 15 MB | CI build output |
| Cold start → interactive | < 500ms | Automated startup benchmark |
| Assist latency (local LLM) | < 500ms to first token | IntelligenceEngine timestamp logging |
| Assist latency (cloud LLM) | < 1000ms to first token | IntelligenceEngine timestamp logging |
| Transcript accuracy (Windows native) | > 85% word accuracy | Manual testing against known scripts |
| Meeting save reliability | 100% (no data loss) | Automated test: start → transcribe → end → verify DB |
| Crash rate | < 1% of sessions | Error logging via log crate |

---

## 14. Future Enhancements (Post-MVP)

These are explicitly **out of scope** for v1.0 but documented for future planning:

- **RAG (Retrieval-Augmented Generation)**: Vector embeddings of past meetings for cross-meeting search and context
- **Calendar integration**: Google/Outlook calendar sync, meeting prep, auto-link meetings to events
- **Follow-up email generation**: Auto-generate follow-up emails from meeting transcripts
- **PDF export**: Export meeting transcript + summary as formatted PDF
- **Meeting summary sharing**: Export and share meeting summaries
- **macOS support**: Tauri 2 supports macOS natively; add CoreAudio capture + ScreenCaptureKit
- **Linux support**: Tauri 2 supports Linux; add PulseAudio/PipeWire capture
- **OCR from screenshots**: Capture screen, extract text via Tesseract, feed to LLM
- **Voice cloning / TTS**: Read AI responses aloud (accessibility feature)
- **Multi-language STT**: Transcribe meetings in non-English languages
- **Plugin system**: Allow community extensions for custom intelligence modes
- **Team features**: Shared meeting notes, collaborative annotation

---

*End of Document — NexQ PRD v1.0.0 — March 18, 2026*
