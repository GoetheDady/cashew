import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSessionRoutes } from './database.js';
import { openDatabase } from './database.js';

/**
 * Issue 03: SQLite Conversation CRUD
 *
 * 验证 conversations 和 messages 的 RESTful CRUD 端点。
 * 使用临时 SQLite 文件隔离测试。
 */

function createTestApp(dbPath: string): Hono {
  const db = openDatabase(dbPath);
  const app = new Hono();
  createSessionRoutes(app, db);
  return app;
}

describe('session CRUD', () => {
  let server: ReturnType<typeof serve>;
  let port: number;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cashew-db-test-'));
    const dbPath = join(tmpDir, 'test.db');
    const app = createTestApp(dbPath);
    server = serve({ fetch: app.fetch, port: 0 });
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => {
    server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('POST /sessions', () => {
    it('creates a session with default title', async () => {
      const response = await fetch(`http://localhost:${port}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(200);
      const session = await response.json();
      expect(session.id).toBeDefined();
      expect(session.title).toBe('新对话');
      expect(session.created_at).toBeDefined();
      expect(session.updated_at).toBeDefined();
    });

    it('creates a session with custom title', async () => {
      const response = await fetch(`http://localhost:${port}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Debug Session' }),
      });
      expect(response.status).toBe(200);
      const session = await response.json();
      expect(session.title).toBe('Debug Session');
    });
  });

  describe('GET /sessions', () => {
    it('lists all sessions ordered by updated_at desc', async () => {
      // 先创建两个会话
      await fetch(`http://localhost:${port}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'First' }),
      });
      await fetch(`http://localhost:${port}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Second' }),
      });

      const response = await fetch(`http://localhost:${port}/sessions`);
      expect(response.status).toBe(200);
      const sessions = await response.json();
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      // 最新创建的应该排在前面
      expect(sessions[0].title).toBe('Second');
      expect(sessions[1].title).toBe('First');
    });
  });

  describe('GET /sessions/:id', () => {
    it('returns a session by id', async () => {
      const createRes = await fetch(`http://localhost:${port}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Find Me' }),
      });
      const created = await createRes.json();

      const response = await fetch(`http://localhost:${port}/sessions/${created.id}`);
      expect(response.status).toBe(200);
      const session = await response.json();
      expect(session.title).toBe('Find Me');
    });

    it('returns 404 for non-existent session', async () => {
      const response = await fetch(`http://localhost:${port}/sessions/non-existent-id`);
      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /sessions/:id', () => {
    it('updates session title', async () => {
      const createRes = await fetch(`http://localhost:${port}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Old Title' }),
      });
      const created = await createRes.json();

      const response = await fetch(`http://localhost:${port}/sessions/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' }),
      });
      expect(response.status).toBe(200);
      const updated = await response.json();
      expect(updated.title).toBe('New Title');
      // updated_at 应该变了
      expect(updated.updated_at).not.toBe(created.updated_at);
    });
  });

  describe('DELETE /sessions/:id', () => {
    it('deletes a session', async () => {
      const createRes = await fetch(`http://localhost:${port}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'To Delete' }),
      });
      const created = await createRes.json();

      const response = await fetch(`http://localhost:${port}/sessions/${created.id}`, {
        method: 'DELETE',
      });
      expect(response.status).toBe(200);

      // 确认已删除
      const getRes = await fetch(`http://localhost:${port}/sessions/${created.id}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('GET /sessions/:id/messages', () => {
    it('returns empty array for session with no messages', async () => {
      const createRes = await fetch(`http://localhost:${port}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'No Messages' }),
      });
      const created = await createRes.json();

      const response = await fetch(`http://localhost:${port}/sessions/${created.id}/messages`);
      expect(response.status).toBe(200);
      const messages = await response.json();
      expect(messages).toEqual([]);
    });
  });
});
