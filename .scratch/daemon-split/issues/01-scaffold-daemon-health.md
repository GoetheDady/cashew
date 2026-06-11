Status: ready-for-agent

## What to build

Create the `apps/daemon` workspace package with a minimal Hono HTTP server. It exposes a single `GET /health` endpoint that returns `{ status: "ok" }`. This proves the monorepo structure works and the daemon can run as an independent Node process.

The server runs on `localhost` with port configured via `CASHEW_PORT` env var or defaults to 11434.

## Acceptance criteria

- [ ] `apps/daemon/` exists as a pnpm workspace package with `package.json`, `tsconfig.json`
- [ ] `pnpm --filter @cashew/daemon dev` starts a Hono server
- [ ] `GET http://localhost:11434/health` returns `{ status: "ok" }`
- [ ] TypeScript compiles without errors
- [ ] Tests pass: `pnpm --filter @cashew/daemon test`

## Blocked by

None - can start immediately.
