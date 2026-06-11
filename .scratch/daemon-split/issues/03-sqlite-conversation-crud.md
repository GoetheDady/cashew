Status: ready-for-agent

## What to build

Replace `electron-store` with `better-sqlite3`. Daemon manages a SQLite database at `~/.cashew/db.sqlite` with `conversations` and `messages` tables. On first run, tables are auto-created.

RESTful endpoints for conversation CRUD:

- `POST /sessions` — create a new conversation, returns it
- `GET /sessions` — list all conversations, ordered by `updated_at` desc
- `GET /sessions/:id` — get one conversation
- `DELETE /sessions/:id` — delete conversation and its messages (cascade)
- `PATCH /sessions/:id` — update conversation title
- `GET /sessions/:id/messages` — get messages for a conversation, ordered by `created_at` asc

Schema:

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

## Acceptance criteria

- [ ] Database auto-creates at `~/.cashew/db.sqlite` on first request
- [ ] All CRUD endpoints work correctly
- [ ] Deleting a conversation cascade-deletes its messages
- [ ] Messages are returned in chronological order
- [ ] Tests use `:memory:` SQLite for isolation

## Blocked by

- 01-scaffold-daemon-health
