import type { ConversationMessage } from '@cashew/shared';

export type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string | number;
};

export function formatTime(value?: string | number) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('zh-CN', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatDay(value?: string | number) {
  if (!value) return '今天';

  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return '今天';
  if (date.toDateString() === yesterday.toDateString()) return '昨天';

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function getMessageTimestamp(message: DisplayMessage) {
  return 'created_at' in message
    ? (message as DisplayMessage & Pick<ConversationMessage, 'created_at'>).created_at
    : message.createdAt;
}
