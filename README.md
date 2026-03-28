<p align="center">
  <img src="src-tauri/icons/nexq-clean.png" alt="NexQ" width="120">
</p>
<p align="center">
  <strong>AI Meeting Assistant & Real-Time Interview Copilot</strong>
</p>

<p align="center">

[![Release](https://img.shields.io/github/v/release/VahidAlizadeh/NexQ?style=flat-square&color=blue)](https://github.com/VahidAlizadeh/NexQ/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/VahidAlizadeh/NexQ/release.yml?style=flat-square&label=build)](https://github.com/VahidAlizadeh/NexQ/actions/workflows/release.yml)
[![Downloads](https://img.shields.io/github/downloads/VahidAlizadeh/NexQ/total?style=flat-square&color=orange)](https://github.com/VahidAlizadeh/NexQ/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6?style=flat-square&logo=windows)](https://github.com/VahidAlizadeh/NexQ/releases/latest)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?style=flat-square&logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-stable-DEA584?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

</p>

<p align="center">
  <img src="website/public/screenshots/live-meeting-demo.gif" alt="NexQ in action — live meeting with transcript, translation, and AI assist" width="700">
</p>
<p align="center"><em>NexQ overlay during a live interview — real-time transcription and AI suggestions</em></p>

### Why NexQ?

🔒 **100% Local** — your audio and data never leave your machine

🆓 **Free & Open Source** — no subscriptions, no limits, ever

⚡ **10 STT + 8 LLM providers** — from local Whisper & Ollama to cloud Deepgram & OpenAI

## Features

- **Dual-party transcription** — captures mic ("You") and system audio ("Them") simultaneously
- **Real-time AI copilot** — get streaming answers, follow-up suggestions, and meeting recaps from 8 LLM providers
- **Local RAG pipeline** — index your own documents (PDF, DOCX, TXT, MD) for context-aware AI responses
- **10 STT providers** — Web Speech API, Deepgram, Groq, Whisper, ONNX Runtime, and more
- **Always-on-top overlay** — compact, transparent floating window visible only to you
- **Bookmarks & action items** — pin key moments and auto-extract tasks
- **Speaker labeling** — identify and name each speaker in the transcript
- **Multi-language translation** — real-time translation via 5 providers (100+ languages)
- **Audio recording & playback** — record meetings as WAV, replay with synced transcript
- **Meeting scenarios** — pre-configured templates for interviews, lectures, and team meetings

## Quick Start

1. **Download** the [latest release](https://github.com/VahidAlizadeh/NexQ/releases/latest)
2. **Configure** your STT and LLM providers (or use free local models)
3. **Start** any meeting — NexQ captures system audio automatically

[Getting Started Guide](docs/user-guide/getting-started.md) | [All User Guides](docs/user-guide/)

## Why NexQ vs. Others?

| | NexQ | Otter.ai | Granola | Krisp |
|---|:---:|:---:|:---:|:---:|
| **Price** | **Free** | $8+/mo | $18/mo | $16/mo |
| **100% Local** | Yes | No | Partial | Partial |
| **Open Source** | Yes | No | No | No |
| **No Bot Joins** | Yes | No | Yes | Yes |
| **STT Providers** | **10** | 1 | 1 | 1 |
| **LLM Providers** | **8** | 1 | 1 | 1 |
| **Local LLM** | Yes | No | No | No |
| **RAG / Doc Context** | Yes | No | No | No |

## Screenshots

| Live Interview | Lecture Mode | Past Meeting Review |
|:---:|:---:|:---:|
| ![Interview](website/public/screenshots/Interview.png) | ![Lecture](website/public/screenshots/Lecture.png) | ![Past Meeting](website/public/screenshots/Past-meeting.png) |

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

## Windows SmartScreen

When you first run NexQ, Windows SmartScreen may display a warning. This is normal for open-source applications that are not code-signed. To proceed:

1. Click **"More info"**
2. Click **"Run anyway"**

Code signing certificates are expensive and not feasible for most open-source projects. The application is safe to run — you can verify by building from source.

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT License](LICENSE) — free forever.

## Acknowledgments

- [Tauri](https://tauri.app/) — desktop application framework
- [React](https://react.dev/) — user interface library
- [whisper-rs](https://github.com/tazz4843/whisper-rs) — Rust bindings for OpenAI Whisper
- [Deepgram](https://deepgram.com/) — speech-to-text API
- [shadcn/ui](https://ui.shadcn.com/) — UI component library
