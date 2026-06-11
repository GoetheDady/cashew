Status: ready-for-agent

## What to build

Configure `electron-builder` to bundle the daemon and a portable Node.js binary into the app package.

- `extraResources`: include compiled daemon output (`apps/daemon/out/`) and its `node_modules/`
- Include a portable Node.js binary for each target platform in `extraResources`
- Desktop main process spawns the bundled Node binary instead of relying on system PATH
- Verify the packaged `.app` runs self-contained on macOS (no system Node dependency)

## Acceptance criteria

- [ ] `pnpm package` produces a working `Cashew.app`
- [ ] App bundle contains daemon code and Node binary in `Resources/`
- [ ] Running the packaged app spawns daemon from bundled Node binary
- [ ] `GET /health` returns `{ status: "ok" }` from the packaged daemon
- [ ] No errors about missing `node` command

## Blocked by

- All previous issues (01-07)
