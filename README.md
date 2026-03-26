# NexQ

**AI Meeting Assistant & Real-Time Interview Copilot**

NexQ is a desktop AI copilot that captures both sides of any conversation in real time and provides intelligent assistance during meetings and interviews. Built with Tauri 2, it runs natively on Windows with a Rust backend and React frontend.

![Version](https://img.shields.io/github/v/release/VahidAlizadeh/NexQ?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![Build](https://img.shields.io/github/actions/workflow/status/VahidAlizadeh/NexQ/ci.yml?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6?style=flat-square&logo=windows)
![Downloads](https://img.shields.io/github/downloads/VahidAlizadeh/NexQ/total?style=flat-square)

## Features

- **Real-time dual-party transcription** — captures mic and system audio simultaneously for complete conversation coverage
- **AI-powered meeting assistance** — get real-time suggestions for what to say, follow-up questions, and meeting recaps
- **Multiple STT providers** — Web Speech API, Deepgram, Groq, and local Whisper (via whisper-rs / ONNX Runtime)
- **Multiple LLM providers** — Ollama, OpenAI, Anthropic, Groq, Gemini, LM Studio, and OpenRouter
- **Local RAG pipeline** — index your own documents (PDF, DOCX, TXT, MD) for context-aware AI responses
- **Always-on-top overlay** — a compact, transparent overlay window for use during live meetings

## Quick Start

1. **Download** the latest release from the [Releases](https://github.com/VahidAlizadeh/NexQ/releases) page
2. **Run the installer** (NSIS-based `.exe`)
3. **Configure your providers** — choose an STT provider for transcription and an LLM provider for AI assistance
4. **Start a meeting** — NexQ captures both sides of the conversation and provides real-time AI support

## Screenshots

<!-- TODO: Add screenshots -->

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

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/) (`npm install -g @tauri-apps/cli`)

### Setup

```bash
# Clone the repository
git clone https://github.com/VahidAlizadeh/NexQ.git
cd NexQ

# Install frontend dependencies
npm install

# Run in development mode (launches Rust backend + React frontend)
npx tauri dev

# Build production installer
npx tauri build
```

### Other Commands

```bash
npm run dev       # Vite dev server only (port 5173)
npm run build     # TypeScript check + Vite production build
```

## Contributing

Contributions are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started.

## Windows SmartScreen

When you first run NexQ, Windows SmartScreen may display a warning. This is normal for open-source applications that are not code-signed. To proceed:

1. Click **"More info"**
2. Click **"Run anyway"**

Code signing certificates are expensive and not feasible for most open-source projects. The application is safe to run — you can verify by building from source.

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgments

- [Tauri](https://tauri.app/) — desktop application framework
- [React](https://react.dev/) — user interface library
- [whisper-rs](https://github.com/tazz4843/whisper-rs) — Rust bindings for OpenAI Whisper
- [Deepgram](https://deepgram.com/) — speech-to-text API
- [shadcn/ui](https://ui.shadcn.com/) — UI component library
