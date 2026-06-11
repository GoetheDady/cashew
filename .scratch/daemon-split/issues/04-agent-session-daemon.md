Status: ready-for-agent

## What to build

Migrate `AgentRuntime` and `AgentSession` from `packages/agent` into the daemon. Remove the dependency on Electron IPC — instead, daemon exposes two endpoints:

- `POST /turns` — accepts `{ prompt: string }`, starts an agent turn, returns an SSE stream. Events map to `ChatEvent.type` as the SSE `event:` field. On `turn_completed`, persists both user and assistant messages to SQLite automatically.

- `POST /turns/:id/cancel` — cancels the in-progress turn identified by `:id`.

Daemon maintains agent sessions keyed by a session identifier (not window ID anymore — use a generated session key or conversation ID). Model config is read from `~/.cashew/config.json`.

## Acceptance criteria

- [ ] `POST /turns` with valid prompt starts SSE stream
- [ ] SSE events follow the format `event: <ChatEvent.type>\ndata: <JSON payload>\n\n`
- [ ] Stream includes `turn_started` → `assistant_delta` (per token) → `turn_completed`
- [ ] On `turn_completed`, user + assistant messages are persisted to SQLite
- [ ] `POST /turns/:id/cancel` interrupts the turn and emits `turn_cancelled`
- [ ] Empty prompt returns non-stream `turn_failed` with code `prompt_empty`
- [ ] Tests verify SSE stream content and message persistence

## Blocked by

- 02-daemon-config-loading
- 03-sqlite-conversation-crud
