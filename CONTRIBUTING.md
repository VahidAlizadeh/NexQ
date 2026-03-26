# Contributing to NexQ

Thanks for your interest in contributing to NexQ! This guide will help you get started.

## Prerequisites

- **Node.js** 20+ ([download](https://nodejs.org/))
- **Rust** latest stable ([install via rustup](https://rustup.rs/))
- **Tauri CLI**: `npm install -g @tauri-apps/cli`
- **Windows 10/11** with WebView2 runtime (ships with Windows 11)

## Dev Setup

```bash
git clone https://github.com/VahidAlizadeh/NexQ.git
cd NexQ
npm install
npx tauri dev
```

This starts both the Vite dev server (port 5173) and the Rust backend. Hot-reload is enabled for the frontend; Rust changes trigger a rebuild.

## Commit Format

We use [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must follow this format:

```
<type>(<scope>): <description>
```

### Examples

```
feat(stt): add Deepgram Nova-3 provider
fix(overlay): window position not persisting
docs: update README
refactor(audio): simplify WASAPI capture loop
test(rag): add indexing benchmark
feat!: breaking change description
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `chore` | Build process, tooling, or dependency updates |
| `perf` | Performance improvement |

### Scopes

Common scopes: `stt`, `llm`, `audio`, `overlay`, `launcher`, `rag`, `calllog`, `context`, `settings`, `db`, `ui`, `translation`.

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/my-feature main
   ```
3. **Make your changes** with atomic, conventional commits
4. **Verify** your changes:
   ```bash
   npx tsc --noEmit       # TypeScript type check
   cargo check             # Rust compilation check
   npx tauri dev           # Manual smoke test
   ```
5. **Push** your branch and open a **Pull Request** to `main`
6. Fill out the PR template and wait for review

## Code Style

- Follow the conventions documented in [`CLAUDE.md`](./CLAUDE.md)
- **TypeScript**: camelCase, Zustand stores in `src/stores/`, hooks in `src/hooks/`
- **Rust**: snake_case, commands in `src-tauri/src/commands/`
- **Types**: All TypeScript types live in `src/lib/types.ts` — keep them in sync with Rust structs
- **Styling**: Tailwind CSS + shadcn/ui components

## Reporting Issues

- Use the [bug report template](https://github.com/VahidAlizadeh/NexQ/issues/new?template=bug_report.yml) for bugs
- Use the [feature request template](https://github.com/VahidAlizadeh/NexQ/issues/new?template=feature_request.yml) for ideas
- **Security issues**: See [SECURITY.md](./SECURITY.md) — do NOT open public issues

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
