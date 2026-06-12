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
  → sendChatCommand (IPC → preload)
    → HTTP POST /turns (SSE) → Daemon (Hono)
      → AgentSession.startTurn
        → pi-agent-core Agent → DeepSeek API
          → streaming events (thinking_start/delta/end, text_delta)
            → SSE → preload (incremental parse)
              → ChatEvent dispatch → reducer updates UI
```

### Key conventions

- Renderer 通过 `window.cashew`（preload 暴露）与 daemon HTTP 服务通信。
- Daemon 监听随机端口，端口号通过 IPC (`cashew:daemon-port`) 传递给 renderer。
- `ChatCommand` discriminated union: `start_turn | cancel_turn`。
- `ChatEvent` discriminated union: `session_ready | turn_started | thinking_start/delta/end | assistant_delta | turn_completed | turn_failed | turn_cancelled`。
- Agent 实例由 `DefaultSessionManager` 按 `sessionId` 管理，支持会话级扩展。
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

## Coding principles

From [Andrej Karpathy's LLM coding guidelines](https://github.com/multica-ai/andrej-karpathy-skills). These apply to all changes — trade caution for speed on trivial tasks.

### Think before coding

- State assumptions explicitly. When multiple interpretations exist, present them — don't silently pick one.
- If a simpler approach exists, say so and push back.
- If anything is unclear, stop, name what's confusing, and ask.

### Simplicity first

- Minimum code that solves the problem. Nothing speculative.
- No features beyond what was requested.
- No abstractions for code used only once.
- No error handling for scenarios that *cannot* occur.
- Self-check: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### Surgical changes

- Touch only what you must. Do not "improve" adjacent code, comments, or formatting.
- Do not refactor things that aren't broken.
- Match the existing style even if you'd personally do it differently.
- Remove imports, variables, or functions that *your own edits* made unused. Don't remove pre-existing dead code unless asked.
- Test: every changed line should trace directly to the user's request.

### Goal-driven execution

- Turn tasks into verifiable goals: write the test *first*, then make it pass.
- For multi-step tasks, state a brief plan: `[Step] → verify: [check]`.
- Loop until the success criteria are met.

## Agent skills

### Issue tracker

Issues 以 local markdown 形式管理在 `.scratch/` 目录下。See `docs/agents/issue-tracker.md`.

### Triage labels

五个状态标签（中英对照）。See `docs/agents/triage-labels.md`.

### Domain docs

Single-context：根目录 `CONTEXT.md` + `docs/adr/`。See `docs/agents/domain.md`.
