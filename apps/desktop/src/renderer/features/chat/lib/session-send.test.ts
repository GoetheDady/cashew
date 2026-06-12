import { describe, expect, it, vi } from 'vitest';
import { resolveConversationIdForSend } from './session-send';

describe('resolveConversationIdForSend', () => {
  it('reuses the active conversation id when one is already selected', async () => {
    const createSession = vi.fn(async () => ({ id: 'new-session' }));

    await expect(resolveConversationIdForSend('active-session', createSession)).resolves.toBe(
      'active-session',
    );
    expect(createSession).not.toHaveBeenCalled();
  });

  it('returns the newly created conversation id for the first message', async () => {
    const createSession = vi.fn(async () => ({ id: 'created-session' }));

    await expect(resolveConversationIdForSend(null, createSession)).resolves.toBe(
      'created-session',
    );
  });
});
