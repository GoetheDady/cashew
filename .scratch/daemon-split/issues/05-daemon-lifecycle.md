Status: ready-for-agent

## What to build

Daemon lifecycle management:

1. **Port file**: On startup, write the actual port to `~/.cashew/daemon.port`. Strategy: try `CASHEW_PORT` env → try `11434` → fallback to OS-assigned random port. On graceful exit, remove the port file.

2. **Graceful shutdown**: `POST /shutdown` endpoint. Closes the HTTP server, waits for in-flight requests to complete, removes the port file, then exits with code 0.

3. **Signal handling**: Daemon handles `SIGTERM` and `SIGINT` by performing the same graceful shutdown.

## Acceptance criteria

- [ ] Port file written on startup with correct port number
- [ ] Fixed port (11434) used when available
- [ ] Random port assigned when 11434 is occupied
- [ ] `POST /shutdown` triggers graceful exit
- [ ] Port file removed on exit
- [ ] `SIGTERM` / `SIGINT` trigger same graceful shutdown

## Blocked by

- 01-scaffold-daemon-health
