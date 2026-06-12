import type { DBSession } from '@cashew/shared';
import { formatDay, type DisplayMessage } from '../lib/chat-formatters';
import type { ThinkingLevel } from '../lib/model-options';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';
import type { FormEvent } from 'react';

type ChatWorkspaceProps = {
  activeSession: DBSession | undefined;
  activeSessionId: string | null;
  messages: DisplayMessage[];
  prompt: string;
  selectedModel: string;
  thinkingLevel: ThinkingLevel;
  isLoading: boolean;
  isSending: boolean;
  isThinking: boolean;
  thinkingContent: string;
  error: string | null;
  onPromptChange: (prompt: string) => void;
  onModelChange: (modelId: string) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onCancelTurn: () => void;
};

export function ChatWorkspace({
  activeSession,
  activeSessionId,
  messages,
  prompt,
  selectedModel,
  thinkingLevel,
  isLoading,
  isSending,
  isThinking,
  thinkingContent,
  error,
  onPromptChange,
  onModelChange,
  onThinkingChange,
  onSendMessage,
  onCancelTurn,
}: ChatWorkspaceProps) {
  return (
    <section
      className="flex min-h-0 min-w-0 flex-col bg-[radial-gradient(circle_at_50%_-20%,rgba(242,233,221,0.72),transparent_38%),linear-gradient(180deg,#fffdf9_0%,#fbf8f2_100%)]"
      aria-label="Chat workspace"
    >
      <header className="flex min-h-[4.375rem] items-center justify-between gap-5 border-b border-border/70 px-[1.875rem]">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-base font-bold text-foreground">
            {activeSession?.title || 'Cashew Agent'}
          </h2>
          <p className="mb-0 mt-0.5 text-xs text-muted-foreground">
            {activeSession ? formatDay(activeSession.updated_at) : 'New conversation'}
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 w-full overflow-y-auto px-[clamp(2.125rem,5vw,5.375rem)] pb-[1.875rem] pt-[2.375rem] [scrollbar-gutter:stable]">
          <MessageList
            messages={messages}
            activeSessionId={activeSessionId}
            isLoading={isLoading}
            isSending={isSending}
            isThinking={isThinking}
            thinkingContent={thinkingContent}
            onPromptSuggestion={onPromptChange}
          />
        </div>
      </div>

      {error ? (
        <div
          className="mx-auto mb-3 w-[calc(100%-clamp(4.25rem,10vw,10.75rem))] max-w-5xl rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-3 text-[13px] font-semibold text-[#9f2c2c]"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <MessageComposer
        prompt={prompt}
        selectedModel={selectedModel}
        thinkingLevel={thinkingLevel}
        isSending={isSending}
        onPromptChange={onPromptChange}
        onModelChange={onModelChange}
        onThinkingChange={onThinkingChange}
        onSubmit={onSendMessage}
        onCancel={onCancelTurn}
      />
    </section>
  );
}
