interface ConversationSendDependencies {
  createConversation: () => Promise<{ id: string } | null>;
  navigate: (path: string) => void;
  sendPrompt: (prompt: string, conversationId: string) => Promise<void> | void;
}

/**
 * 集中 Empty Chat 首次发送的顺序约束：先创建并激活 Conversation，
 * 再发送一次暂存消息。
 */
export class ConversationSendCoordinator {
  private pending: { content: string; conversationId: string } | null = null;

  constructor(private dependencies: ConversationSendDependencies) {}

  updateDependencies(dependencies: ConversationSendDependencies): void {
    this.dependencies = dependencies;
  }

  async send(activeConversationId: string | null, content: string): Promise<boolean> {
    if (activeConversationId) {
      await this.dependencies.sendPrompt(content, activeConversationId);
      return true;
    }

    const conversation = await this.dependencies.createConversation();
    if (!conversation) return false;

    this.pending = { content, conversationId: conversation.id };
    this.dependencies.navigate(`/chat/${conversation.id}`);
    return true;
  }

  async activate(conversationId: string): Promise<void> {
    if (!this.pending || this.pending.conversationId !== conversationId) return;
    const pending = this.pending;
    this.pending = null;
    await this.dependencies.sendPrompt(pending.content, pending.conversationId);
  }
}
