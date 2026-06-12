import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface StoredConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface StoredMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface TurnMessage {
  id: string;
  content: string;
  createdAt: string;
}

export interface ConversationPersistence {
  createConversation(title?: string): StoredConversation;
  listConversations(): StoredConversation[];
  getConversation(id: string): StoredConversation | undefined;
  renameConversation(id: string, title: string): StoredConversation | null;
  deleteConversation(id: string): boolean;
  getMessages(conversationId: string): StoredMessage[];
  shouldGenerateTitle(conversationId: string): boolean;
  saveCompletedTurn(conversationId: string, userMessage: TurnMessage, assistantMessage: TurnMessage): void;
  saveTitle(conversationId: string, title: string): void;
  close(): void;
}

class SQLiteConversationPersistence implements ConversationPersistence {
  constructor(private readonly db: Database.Database) {}

  createConversation(title = '新对话'): StoredConversation {
    const now = new Date().toISOString();
    const conversation: StoredConversation = {
      id: randomUUID(),
      title: title || '新对话',
      created_at: now,
      updated_at: now,
    };
    this.db.prepare(
      'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (@id, @title, @created_at, @updated_at)',
    ).run(conversation);
    return conversation;
  }

  listConversations(): StoredConversation[] {
    return this.db.prepare(
      'SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC',
    ).all() as StoredConversation[];
  }

  getConversation(id: string): StoredConversation | undefined {
    return this.db.prepare(
      'SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?',
    ).get(id) as StoredConversation | undefined;
  }

  renameConversation(id: string, title: string): StoredConversation | null {
    const result = this.db.prepare(
      'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
    ).run(title, new Date().toISOString(), id);
    return result.changes === 0 ? null : this.getConversation(id)!;
  }

  deleteConversation(id: string): boolean {
    return this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id).changes > 0;
  }

  getMessages(conversationId: string): StoredMessage[] {
    return this.db.prepare(
      'SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    ).all(conversationId) as StoredMessage[];
  }

  shouldGenerateTitle(conversationId: string): boolean {
    const conversation = this.getConversation(conversationId);
    if (!conversation) return true;
    return this.getMessages(conversationId).length === 0 &&
      (!conversation.title.trim() || conversation.title === 'New Chat' || conversation.title === '新对话');
  }

  saveCompletedTurn(
    conversationId: string,
    userMessage: TurnMessage,
    assistantMessage: TurnMessage,
  ): void {
    const persist = this.db.transaction(() => {
      if (!this.getConversation(conversationId)) {
        const now = new Date().toISOString();
        this.db.prepare(
          'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?,?,?,?)',
        ).run(conversationId, '新对话', now, now);
      }

      this.db.prepare(
        'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?,?,?,?,?)',
      ).run(userMessage.id, conversationId, 'user', userMessage.content, userMessage.createdAt);
      this.db.prepare(
        'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?,?,?,?,?)',
      ).run(assistantMessage.id, conversationId, 'assistant', assistantMessage.content, assistantMessage.createdAt);
      this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), conversationId);
    });
    persist();
  }

  saveTitle(conversationId: string, title: string): void {
    this.db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, new Date().toISOString(), conversationId);
  }

  close(): void {
    this.db.close();
  }
}

export function openConversationPersistence(dbPath: string): ConversationPersistence {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '新对话',
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
  db.prepare("UPDATE conversations SET title = '新对话' WHERE title = 'New Chat'").run();
  return new SQLiteConversationPersistence(db);
}

export function createSessionRoutes(app: Hono, persistence: ConversationPersistence): void {
  app.post('/sessions', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const title = typeof body.title === 'string' ? body.title : '新对话';
    return c.json(persistence.createConversation(title));
  });

  app.get('/sessions', (c) => c.json(persistence.listConversations()));

  app.get('/sessions/:id', (c) => {
    const conversation = persistence.getConversation(c.req.param('id'));
    return conversation ? c.json(conversation) : c.json({ error: '未找到该对话' }, 404);
  });

  app.patch('/sessions/:id', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return c.json({ error: '标题不能为空' }, 400);
    }
    const conversation = persistence.renameConversation(c.req.param('id'), body.title.trim());
    return conversation ? c.json(conversation) : c.json({ error: '未找到该对话' }, 404);
  });

  app.delete('/sessions/:id', (c) => (
    persistence.deleteConversation(c.req.param('id'))
      ? c.json({ ok: true })
      : c.json({ error: '未找到该对话' }, 404)
  ));

  app.get('/sessions/:id/messages', (c) => {
    const id = c.req.param('id');
    return persistence.getConversation(id)
      ? c.json(persistence.getMessages(id))
      : c.json({ error: '未找到该对话' }, 404);
  });
}
