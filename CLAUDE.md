# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start electron-vite dev server (hot-reload)
pnpm build        # Production build
pnpm package      # Build + electron-builder --dir (unpacked)
pnpm make         # Build + electron-builder (full installer)
pnpm lint         # ESLint across all packages
pnpm typecheck    # tsc --noEmit across all packages
pnpm test         # vitest run
```

## Architecture

Cashew is a desktop AI chat app built on Electron + React + TypeScript. Monorepo managed by pnpm workspaces.

### Workspace layout

- `apps/desktop` — Electron app (main process, preload, renderer)
- `packages/agent` — Agent runtime wrapping `@earendil-works/pi-agent-core` + DeepSeek
- `packages/shared` — Typed IPC protocol (`ChatCommand`, `ChatEvent`), message types, channel constants

### Data flow

```
Renderer (React)
  → sendChatCommand (IPC)
    → Main process: AgentRuntime.handleCommand
      → AgentSession.startTurn
        → pi-agent-core Agent → DeepSeek API
          → streaming text_delta events
            → IPC ChatEvent back to renderer
              → reducer updates UI
```

### Key conventions

- IPC uses context isolation with `contextBridge`. The renderer accesses `window.cashew` (defined in preload).
- `ChatCommand` is a discriminated union: `start_turn | cancel_turn`.
- `ChatEvent` is a discriminated union: `turn_started | assistant_delta | turn_completed | turn_failed | turn_cancelled | error`.
- Agent runtime is singleton per app, sessions are per-window.
- `DEEPSEEK_API_KEY` loaded from env/dotenv (priority: `apps/desktop/.env.local` > `apps/desktop/.env` > root `.env.local` > root `.env`).

### Tech stack

- Electron 42, electron-vite 5 (Vite 5.4), SWC
- React 19, Tailwind CSS 4
- TypeScript strict, ESLint 8 with @typescript-eslint
- Vitest 2.1, pnpm 10.28

## Code style

- 注释使用中文，解释代码的意图和"为什么"，让后续接手的人能理解设计决策。
- 关键逻辑、非显而易见的实现、workaround、业务规则都需要写注释。
- 注释重点说明 WHY（为什么这么做），而不仅是 WHAT（做了什么）。

## Agent skills

### Issue tracker

Issues 以 local markdown 形式管理在 `.scratch/` 目录下。See `docs/agents/issue-tracker.md`.

### Triage labels

五个状态标签（中英对照）。See `docs/agents/triage-labels.md`.

### Domain docs

Single-context：根目录 `CONTEXT.md` + `docs/adr/`。See `docs/agents/domain.md`.
