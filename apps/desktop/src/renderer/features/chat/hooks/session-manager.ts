import { useEffect, useReducer, useCallback } from 'react';
import type { Conversation, ConversationMessage, ConversationEvent } from '@cashew/shared';

/**
 * 会话管理状态
 */
interface SessionManagerState {
  sessions: Conversation[]; // 所有会话列表
  activeSessionId: string | null; // 当前激活的会话 ID
  messages: ConversationMessage[]; // 当前会话的消息列表
  isLoading: boolean; // 是否正在加载
  error: string | null; // 错误信息
}

type SessionManagerAction =
  | { type: 'sessions_loaded'; sessions: Conversation[] }
  | { type: 'session_created'; session: Conversation }
  | { type: 'session_deleted'; sessionId: string }
  | { type: 'session_activated'; sessionId: string }
  | { type: 'messages_loaded'; sessionId: string; messages: ConversationMessage[] }
  | { type: 'session_title_updated'; sessionId: string; title: string; updatedAt: number }
  | { type: 'session_touched'; sessionId: string; updatedAt: number }
  | { type: 'set_loading'; isLoading: boolean }
  | { type: 'set_error'; error: string | null };

export function sessionManagerReducer(
  state: SessionManagerState,
  action: SessionManagerAction
): SessionManagerState {
  switch (action.type) {
    case 'sessions_loaded':
      return { ...state, sessions: action.sessions, isLoading: false };

    case 'session_created':
      // 新会话插入到列表开头
      return {
        ...state,
        sessions: [action.session, ...state.sessions],
        activeSessionId: action.session.id,
        messages: [],
      };

    case 'session_deleted':
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.sessionId),
        // 如果删除的是当前激活会话，清空激活状态
        activeSessionId:
          state.activeSessionId === action.sessionId ? null : state.activeSessionId,
        messages: state.activeSessionId === action.sessionId ? [] : state.messages,
      };

    case 'session_activated':
      // 切换会话时清空消息列表，避免短暂显示上一会话的残留数据，
      // 同时防止加载失败时 dbMessages 仍为旧会话的数据。
      return { ...state, activeSessionId: action.sessionId, messages: [], isLoading: true };

    case 'messages_loaded':
      // 竞态守卫：只采纳当前激活会话的消息，丢弃旧会话的过期事件
      if (action.sessionId !== state.activeSessionId) return state;
      return { ...state, messages: action.messages, isLoading: false };

    case 'session_title_updated':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId
            ? { ...s, title: action.title, updated_at: action.updatedAt }
            : s
        ).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
      };

    case 'session_touched':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId ? { ...s, updated_at: action.updatedAt } : s
        ).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
      };

    case 'set_loading':
      return { ...state, isLoading: action.isLoading };

    case 'set_error':
      return { ...state, error: action.error, isLoading: false };

    default:
      return state;
  }
}

/**
 * 会话管理 hook
 *
 * 职责：
 * - 管理会话列表的加载、创建、删除
 * - 管理当前激活的会话和对应的消息列表
 * - 监听数据库事件并更新状态
 */
export function useSessionManager({
  enabled = true,
  activeSessionId,
}: { enabled?: boolean; activeSessionId?: string | null } = {}) {
  const [state, dispatch] = useReducer(sessionManagerReducer, {
    sessions: [],
    activeSessionId: activeSessionId ?? null,
    messages: [],
    isLoading: true,
    error: null,
  });

  // 加载所有会话
  const loadSessions = useCallback(async () => {
    if (!enabled) {
      dispatch({ type: 'set_loading', isLoading: false });
      return;
    }

    dispatch({ type: 'set_loading', isLoading: true });
    await window.cashew.sendConversationCommand({ type: 'get_all_sessions' });
  }, [enabled]);

  // 创建新会话
  const createSession = useCallback(async (title?: string) => {
    if (!enabled) {
      dispatch({ type: 'set_error', error: 'Cashew 本地服务仍在启动中。' });
      return null;
    }

    const event = await window.cashew.sendConversationCommand({ type: 'create_session', title });
    return event?.type === 'session_created' ? event.session : null;
  }, [enabled]);

  // 切换激活会话
  const activateSession = useCallback(async (sessionId: string) => {
    if (!enabled) {
      dispatch({ type: 'set_error', error: 'Cashew 本地服务仍在启动中。' });
      return;
    }

    dispatch({ type: 'session_activated', sessionId });
    await window.cashew.sendConversationCommand({ type: 'get_messages', sessionId });
  }, [enabled]);

  // 删除会话
  const deleteSession = useCallback(async (sessionId: string) => {
    if (!enabled) {
      dispatch({ type: 'set_error', error: 'Cashew 本地服务仍在启动中。' });
      return;
    }

    await window.cashew.sendConversationCommand({ type: 'delete_session', sessionId });
  }, [enabled]);

  // 更新会话标题
  const updateSessionTitle = useCallback(async (sessionId: string, title: string) => {
    if (!enabled) {
      dispatch({ type: 'set_error', error: 'Cashew 本地服务仍在启动中。' });
      return;
    }

    await window.cashew.sendConversationCommand({ type: 'update_session_title', sessionId, title });
  }, [enabled]);

  const applySessionTitle = useCallback((sessionId: string, title: string) => {
    dispatch({ type: 'session_title_updated', sessionId, title, updatedAt: Date.now() });
  }, []);

  const touchSession = useCallback((sessionId: string) => {
    dispatch({ type: 'session_touched', sessionId, updatedAt: Date.now() });
  }, []);

  // 监听数据库事件
  useEffect(() => {
    const unsubscribe = window.cashew.subscribeConversationEvents((event: ConversationEvent) => {
      switch (event.type) {
        case 'sessions_loaded':
          dispatch({ type: 'sessions_loaded', sessions: event.sessions });
          break;

        case 'session_created':
          dispatch({ type: 'session_created', session: event.session });
          // 自动加载新会话的消息（目前为空）
          dispatch({ type: 'messages_loaded', sessionId: event.session.id, messages: [] });
          break;

        case 'session_deleted':
          dispatch({ type: 'session_deleted', sessionId: event.sessionId });
          break;

        case 'messages_loaded':
          dispatch({ type: 'messages_loaded', sessionId: event.sessionId, messages: event.messages });
          break;

        case 'session_title_updated':
          dispatch({
            type: 'session_title_updated',
            sessionId: event.sessionId,
            title: event.title,
            updatedAt: Date.now(),
          });
          break;

        case 'db_error':
          dispatch({ type: 'set_error', error: event.error });
          break;

        case 'session_loaded':
          // 单个会话加载（暂时不需要处理）
          break;
      }
    });

    if (enabled) {
      loadSessions();
    } else {
      dispatch({ type: 'set_loading', isLoading: false });
    }

    return unsubscribe;
  }, [enabled, loadSessions]);

  return {
    sessions: state.sessions,
    activeSessionId: activeSessionId ?? state.activeSessionId,
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    loadSessions,
    createSession,
    activateSession,
    deleteSession,
    updateSessionTitle,
    applySessionTitle,
    touchSession,
  };
}
