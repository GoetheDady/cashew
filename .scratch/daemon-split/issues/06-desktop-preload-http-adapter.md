Status: ready-for-agent

## What to build

Replace Electron IPC in `apps/desktop` preload with HTTP + SSE communication to the daemon.

The `window.cashew` API signature stays identical to the renderer, but internally:

- `sendChatCommand` → `fetch('POST /turns')` or `fetch('POST /turns/:id/cancel')`
- `subscribeChatEvents` → `EventSource('POST /turns')` — returns SSE stream
- `sendDBCommand` → `fetch('POST|GET|PATCH|DELETE /sessions/...')`
- `subscribeDBEvents` → replaced by direct response from the fetch calls (DB events are request-response, not streaming)

Preload discovers daemon by reading `~/.cashew/daemon.port` (via Electron main process exposed API).

The `packages/shared` types are used on both sides unchanged.

## Acceptance criteria

- [ ] `window.cashew.sendChatCommand({ type: 'start_turn', prompt })` sends `POST /turns`
- [ ] `window.cashew.subscribeChatEvents(listener)` opens SSE and forwards events
- [ ] DB commands map to correct REST calls
- [ ] Renderer code receives events in the same shape as before
- [ ] Daemon port is read from port file
- [ ] Tests verify IPC → HTTP mapping (integration or component tests)

## Blocked by

- 04-agent-session-daemon
- 05-daemon-lifecycle
