import { Brain, ChevronDown, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import assistantAvatar from '../../../assets/cashew-assistant-avatar.png';
import logoLockup from '../../../assets/cashew-logo-lockup.png';
import {
  type DisplayMessage,
  formatTime,
  getMessageTimestamp,
} from '../lib/chat-formatters';

const promptSuggestions = [
  '帮我梳理一个想法',
  '制定一份清晰的行动计划',
  '总结一个复杂的话题',
];

type MessageListProps = {
  messages: DisplayMessage[];
  activeSessionId: string | null;
  isLoading: boolean;
  isSending: boolean;
  isThinking: boolean;
  thinkingContent: string;
  onPromptSuggestion: (prompt: string) => void;
};

export function MessageList({
  messages,
  activeSessionId,
  isLoading,
  isSending,
  isThinking,
  thinkingContent,
  onPromptSuggestion,
}: MessageListProps) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);

  if (isLoading && activeSessionId) {
    return (
      <div className="grid h-full w-full place-items-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <span
            className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"
            aria-hidden="true"
          />
          <span className="text-sm font-semibold">正在加载对话...</span>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="mx-auto grid h-full w-full max-w-3xl place-items-center text-center text-muted-foreground">
        <div className="w-full pb-[4%]">
          <div className="mx-auto mb-5 grid h-[5.25rem] w-[10.625rem] place-items-center overflow-hidden rounded-lg border border-border bg-card/80 shadow-[0_18px_42px_rgba(94,58,27,0.08)]">
            <img
              className="h-[5.75rem] w-[13.125rem] object-contain mix-blend-multiply"
              src={logoLockup}
              alt=""
            />
          </div>
          <h3 className="m-0 text-[1.875rem] font-bold text-foreground">
            有什么可以帮你？
          </h3>
          <p className="mx-auto mb-0 mt-2.5 max-w-[28.75rem] text-sm leading-relaxed text-muted-foreground">
            从一个问题、一份计划，或一项想要完成的任务开始。
          </p>
          <div className="mt-7 grid w-full grid-cols-3 gap-2.5" aria-label="提示建议">
            {promptSuggestions.map((suggestion) => (
              <Button
                className="h-auto min-h-[4.375rem] justify-start whitespace-normal bg-card/80 p-3.5 text-left hover:border-[#d8cabb] hover:bg-card hover:shadow-[0_12px_24px_rgba(94,58,27,0.07)]"
                key={suggestion}
                type="button"
                variant="secondary"
                onClick={() => onPromptSuggestion(suggestion)}
              >
                <MessageCircle className="shrink-0 text-primary" size={17} />
                <span>{suggestion}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {messages.map((message) => {
        const isUser = message.role === 'user';
        const timestamp = formatTime(getMessageTimestamp(message));
        const isLatestAssistantMessage = !isUser && message === messages[messages.length - 1];

        return (
          <article
            key={message.id}
            className={cn(
              'mx-auto mb-[1.625rem] flex w-full max-w-5xl gap-[0.8125rem]',
              isUser && 'justify-end',
            )}
          >
            {!isUser ? (
              <div className="grid h-[2.125rem] w-[2.125rem] shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-primary shadow-[0_8px_18px_rgba(94,58,27,0.12)]">
                <img className="h-full w-full object-cover" src={assistantAvatar} alt="" />
              </div>
            ) : null}
            <div
              className={cn(
                'max-w-[82%] rounded-lg border border-border bg-card/95 px-[1.1875rem] py-[1.0625rem] shadow-[0_10px_28px_rgba(94,58,27,0.05)]',
                isUser && 'bg-[linear-gradient(180deg,#f7efe5,#f2e7db)] px-3.5 py-3',
              )}
            >
              <div
                className={cn(
                  'mb-1.5 flex items-center gap-3 text-[11px] font-bold text-muted-foreground',
                  isUser && 'justify-end',
                )}
              >
                <span>{isUser ? '你' : 'Cashew'}</span>
                {timestamp ? <time>{timestamp}</time> : null}
              </div>
              {!isUser && thinkingContent && isLatestAssistantMessage ? (
                <div className="mb-2 overflow-hidden rounded-md border border-[#e8d5b0] bg-[#fdfaf3]">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-[#8b723c] transition-colors hover:bg-[#f8f1e3]"
                    onClick={() => setThinkingExpanded(!thinkingExpanded)}
                  >
                    <Brain size={14} className={cn(isThinking && 'animate-pulse')} />
                    <span>{isThinking ? '思考中...' : '已深度思考'}</span>
                    <ChevronDown
                      size={12}
                      className={cn('ml-auto transition-transform', thinkingExpanded && 'rotate-180')}
                    />
                  </button>
                  {thinkingExpanded || isThinking ? (
                    <div className="border-t border-[#e8d5b0] px-3 py-2">
                      <p className="m-0 whitespace-pre-wrap text-[13px] leading-relaxed text-[#8b723c]/70">
                        {thinkingContent}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <p className="m-0 whitespace-pre-wrap text-[15px] leading-[1.72] text-[#20293a]">
                {message.content || (isSending && !thinkingContent ? '思考中...' : '')}
              </p>
            </div>
          </article>
        );
      })}
    </>
  );
}
