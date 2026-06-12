import { describe, expect, it, vi } from 'vitest';
import { ConversationSendCoordinator } from './conversation-send';

describe('ConversationSendCoordinator', () => {
  it('creates, activates, and sends the first Empty Chat message exactly once', async () => {
    const createConversation = vi.fn(async () => ({ id: 'conversation-1' }));
    const navigate = vi.fn();
    const sendPrompt = vi.fn();
    const coordinator = new ConversationSendCoordinator({
      createConversation,
      navigate,
      sendPrompt,
    });

    await coordinator.send(null, 'hello');

    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/chat/conversation-1');
    expect(sendPrompt).not.toHaveBeenCalled();

    await coordinator.activate('conversation-1');
    await coordinator.activate('conversation-1');

    expect(sendPrompt).toHaveBeenCalledTimes(1);
    expect(sendPrompt).toHaveBeenCalledWith('hello', 'conversation-1');
  });
});
