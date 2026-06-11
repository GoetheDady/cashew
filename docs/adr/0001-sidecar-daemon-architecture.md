# Sidecar Daemon Architecture

Cashew will split into two processes: a **Daemon** (agent runtime + SQLite) and a **Desktop** (Electron UI). They communicate over HTTP + SSE on `localhost`, with WebSocket reserved for future use.

## Why

The current single-process Electron architecture creates two problems:

1. **Native module friction.** `better-sqlite3` is compiled against system Node, but Electron 42 ships a different NODE_MODULE_VERSION. Every Electron upgrade requires recompilation with `@electron/rebuild`.
2. **Process coupling.** Closing the window kills the agent. Conversation state lives in memory per-window-session. Agent crash = full app crash.

Splitting into a plain Node.js daemon sidesteps both: SQLite compiles cleanly against system Node, and the daemon outlives the window.

## Considered Options

**Stay monolithic + `@electron/rebuild`.** Would solve the compile issue but not the process coupling. Same maintenance burden per Electron upgrade.

**Use `sql.js` (SQLite in WASM).** No native compilation, but slower and memory-bound. Doesn't address process coupling.

**Remote server.** Pushes data to the cloud, violates local-first principle.

## Decisions captured

- Daemon runs as plain Node.js, not inside Electron
- HTTP + SSE as the transport; WebSocket adapter slot reserved
- Daemon persists all conversation data to SQLite; Desktop holds no durable state
- Desktop auto-spawns Daemon on first launch; closing window does not kill Daemon
- "Quit Cashew" sends `POST /shutdown` to gracefully exit both processes
- Daemon writes `~/.cashew/daemon.port` for service discovery
- Node.js binary is shipped inside the app bundle so users don't need to install it
