import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 会话行类型（数据库中的原始形状）
 */
interface SessionRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/**
 * 消息行类型
 */
interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

/**
 * 打开（或创建）SQLite 数据库，自动建表。
 * @param dbPath 数据库文件路径
 */
export function openDatabase(dbPath: string): Database.Database {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 建表（幂等：IF NOT EXISTS）
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at);
  `);

  return db;
}

/**
 * 创建会话
 */
function createSession(
  db: Database.Database,
  title: string,
): SessionRow {
  const now = new Date().toISOString();
  const session: SessionRow = {
    id: randomUUID(),
    title: title || 'New Chat',
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (@id, @title, @created_at, @updated_at)',
  ).run(session);

  return session;
}

/**
 * 获取所有会话（按 updated_at 降序）
 */
function listSessions(db: Database.Database): SessionRow[] {
  return db.prepare(
    'SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC',
  ).all() as SessionRow[];
}

/**
 * 获取单个会话
 */
function getSession(db: Database.Database, id: string): SessionRow | undefined {
  return db.prepare(
    'SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?',
  ).get(id) as SessionRow | undefined;
}

/**
 * 更新会话标题
 */
function updateSessionTitle(
  db: Database.Database,
  id: string,
  title: string,
): SessionRow | null {
  const now = new Date().toISOString();
  const result = db.prepare(
    'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
  ).run(title, now, id);

  if (result.changes === 0) return null;

  return getSession(db, id)!;
}

/**
 * 删除会话（消息由外键 CASCADE 自动删除）
 */
function deleteSession(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * 获取会话的所有消息（按时间正序）
 */
function getMessages(db: Database.Database, sessionId: string): MessageRow[] {
  return db.prepare(
    'SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
  ).all(sessionId) as MessageRow[];
}

/**
 * 在 Hono app 上注册会话 CRUD 路由。
 */
export function createSessionRoutes(app: Hono, db: Database.Database): void {
  // 创建会话
  app.post('/sessions', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const title = typeof body.title === 'string' ? body.title : 'New Chat';
    const session = createSession(db, title);
    return c.json(session);
  });

  // 列出所有会话
  app.get('/sessions', (c) => {
    const sessions = listSessions(db);
    return c.json(sessions);
  });

  // 获取单个会话
  app.get('/sessions/:id', (c) => {
    const id = c.req.param('id');
    const session = getSession(db, id);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    return c.json(session);
  });

  // 更新会话
  app.patch('/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const title = body.title;

    if (typeof title !== 'string' || !title.trim()) {
      return c.json({ error: 'title is required' }, 400);
    }

    const session = updateSessionTitle(db, id, title.trim());

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    return c.json(session);
  });

  // 删除会话
  app.delete('/sessions/:id', (c) => {
    const id = c.req.param('id');
    const deleted = deleteSession(db, id);

    if (!deleted) {
      return c.json({ error: 'Session not found' }, 404);
    }

    return c.json({ ok: true });
  });

  // 获取会话消息
  app.get('/sessions/:id/messages', (c) => {
    const id = c.req.param('id');
    const session = getSession(db, id);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const messages = getMessages(db, id);
    return c.json(messages);
  });
}
