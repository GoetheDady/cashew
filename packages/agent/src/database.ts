import Store from 'electron-store';
import { randomUUID } from 'node:crypto';

// 会话类型定义
export interface Session {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

// 消息类型定义
export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
}

// Store 数据结构
interface StoreSchema {
  sessions: Session[];
  messages: Message[];
}

/**
 * 数据存储管理类（基于 electron-store）
 *
 * 职责：
 * - 管理会话和消息的持久化存储（JSON 文件）
 * - 提供会话和消息的 CRUD 操作
 * - 自动维护数据一致性（删除会话时级联删除消息）
 */
export class ChatDatabase {
  private store: Store<StoreSchema>;

  constructor() {
    // electron-store 自动保存到 userData 目录
    // 文件路径类似: ~/Library/Application Support/cashew/config.json
    this.store = new Store<StoreSchema>({
      name: 'cashew-data',
      defaults: {
        sessions: [],
        messages: [],
      },
    });
  }

  /**
   * 创建新会话
   *
   * @param title - 会话标题，默认“新对话”
   * @returns 新会话对象
   */
  createSession(title = '新对话'): Session {
    const now = Date.now();
    const session: Session = {
      id: randomUUID(),
      title,
      created_at: now,
      updated_at: now,
    };

    const sessions = this.store.get('sessions');
    sessions.unshift(session); // 新会话插入开头
    this.store.set('sessions', sessions);

    return session;
  }

  /**
   * 获取所有会话，按更新时间倒序
   *
   * 用于左侧会话列表展示
   */
  getAllSessions(): Session[] {
    const sessions = this.store.get('sessions');
    // 按 updated_at 降序排序
    return sessions.sort((a, b) => b.updated_at - a.updated_at);
  }

  /**
   * 获取单个会话
   */
  getSession(sessionId: string): Session | undefined {
    const sessions = this.store.get('sessions');
    return sessions.find((s) => s.id === sessionId);
  }

  /**
   * 更新会话标题
   */
  updateSessionTitle(sessionId: string, title: string): void {
    const sessions = this.store.get('sessions');
    const session = sessions.find((s) => s.id === sessionId);

    if (session) {
      session.title = title;
      session.updated_at = Date.now();
      this.store.set('sessions', sessions);
    }
  }

  /**
   * 更新会话的最后更新时间
   *
   * 每次新增消息时调用，保持会话列表排序正确
   */
  touchSession(sessionId: string): void {
    const sessions = this.store.get('sessions');
    const session = sessions.find((s) => s.id === sessionId);

    if (session) {
      session.updated_at = Date.now();
      this.store.set('sessions', sessions);
    }
  }

  /**
   * 删除会话
   *
   * 同时删除该会话下的所有消息（级联删除）
   */
  deleteSession(sessionId: string): void {
    // 删除会话
    const sessions = this.store.get('sessions').filter((s) => s.id !== sessionId);
    this.store.set('sessions', sessions);

    // 级联删除该会话的所有消息
    const messages = this.store.get('messages').filter((m) => m.session_id !== sessionId);
    this.store.set('messages', messages);
  }

  /**
   * 获取会话的所有消息，按时间正序
   */
  getMessages(sessionId: string): Message[] {
    const messages = this.store.get('messages');
    return messages
      .filter((m) => m.session_id === sessionId)
      .sort((a, b) => a.created_at - b.created_at);
  }

  /**
   * 添加消息到会话
   *
   * 同时更新会话的 updated_at 时间戳
   */
  addMessage(sessionId: string, role: 'user' | 'assistant', content: string): Message {
    const message: Message = {
      id: randomUUID(),
      session_id: sessionId,
      role,
      content,
      created_at: Date.now(),
    };

    const messages = this.store.get('messages');
    messages.push(message);
    this.store.set('messages', messages);

    // 更新会话的最后更新时间
    this.touchSession(sessionId);

    return message;
  }

  /**
   * 更新消息内容
   *
   * 用于流式输出时累积 assistant 消息
   */
  updateMessage(messageId: string, content: string): void {
    const messages = this.store.get('messages');
    const message = messages.find((m) => m.id === messageId);

    if (message) {
      message.content = content;
      this.store.set('messages', messages);
    }
  }

  /**
   * 清空所有数据（仅用于测试或重置）
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * 获取存储文件路径（用于调试）
   */
  getPath(): string {
    return this.store.path;
  }
}
