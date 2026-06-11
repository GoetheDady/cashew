Status: ready-for-agent

## What to build

Desktop startup flow with daemon connection management:

1. **Auto-launch daemon**: On Electron startup, main process reads `~/.cashew/daemon.port`. If daemon not running, spawn it as a detached child process and poll the port file until connected (timeout 5s).

2. **Connection states in UI**: Preload exposes connection state to renderer. Renderer shows:
   - Top bar with subtle loading indicator while connecting
   - Yellow banner "连接已断开，正在重连..." with exponential backoff (1s → 2s → 4s → 8s, max 8s) when disconnected
   - Red banner "无法连接到 Cashew 服务" with [重试] [重启服务] buttons after 30s of no connection

3. **Settings page for config**: When daemon returns no config (`GET /config` → null), renderer shows a settings page: Provider dropdown, Model input, API Key input (masked), Thinking Level selector, Save button. On save → `POST /config`.

## Acceptance criteria

- [ ] Opening Electron launches daemon if not running
- [ ] Connecting state shows loading indicator
- [ ] Reconnection works with exponential backoff
- [ ] 30s failure shows error banner with action buttons
- [ ] No config → settings page shown automatically
- [ ] Saving config updates daemon and transitions to normal chat UI

## Blocked by

- 06-desktop-preload-http-adapter
