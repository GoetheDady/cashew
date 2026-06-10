# Cashew

Cashew is a Pi-based personal agent desktop app.

## Stack

- pnpm workspace
- Node.js
- Electron
- electron-vite
- React
- Tailwind CSS
- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`

## Layout

```text
apps/desktop        Electron + React app
packages/agent      Pi-based agent runtime
packages/shared     Shared app types
```

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm typecheck
pnpm lint
pnpm test
pnpm package
pnpm make
```

## Current Scope

The project is initialized as an Electron-first app. The agent runtime runs in
the Electron main process and communicates with the React UI through a typed IPC
event protocol.

The first chat path is wired to DeepSeek through `@earendil-works/pi-agent-core`
and `@earendil-works/pi-ai`. It keeps an in-memory agent session per renderer
window, streams assistant text deltas to the UI, and supports cancelling the
active turn.

Model configuration is loaded through the agent settings module. It reads
`DEEPSEEK_API_KEY` from the process environment first. In local development, it
then checks:

```text
apps/desktop/.env.local
apps/desktop/.env
.env.local
.env
```

For local development, put the key in:

```text
apps/desktop/.env.local
```
