Status: ready-for-agent

## What to build

Daemon reads and writes `~/.cashew/config.json`. Two endpoints:

- `GET /config` — returns the current config object, or `null` if no config exists
- `POST /config` — accepts `{ provider, model, apiKey, thinkingLevel }`, writes to `~/.cashew/config.json`, returns the saved config

On startup, daemon loads config from disk into memory.

## Acceptance criteria

- [ ] `GET /config` returns `null` when `~/.cashew/config.json` does not exist
- [ ] `POST /config` with valid body writes the file and returns it
- [ ] Subsequent `GET /config` returns the previously saved config
- [ ] Invalid body returns `400` with error message
- [ ] Tests verify config read/write cycle

## Blocked by

- 01-scaffold-daemon-health
