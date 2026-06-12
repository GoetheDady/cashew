import { ArrowUp, X } from 'lucide-react';
import type { FormEvent } from 'react';
import { Button } from '../../../components/ui/button';
import type { ThinkingLevel } from '../lib/model-options';
import { ModelControls } from './model-controls';

type MessageComposerProps = {
  prompt: string;
  selectedModel: string;
  thinkingLevel: ThinkingLevel;
  isSending: boolean;
  onPromptChange: (prompt: string) => void;
  onModelChange: (modelId: string) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
};

export function MessageComposer({
  prompt,
  selectedModel,
  thinkingLevel,
  isSending,
  onPromptChange,
  onModelChange,
  onThinkingChange,
  onSubmit,
  onCancel,
}: MessageComposerProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto mb-6 grid w-[calc(100%-clamp(4.25rem,10vw,10.75rem))] max-w-5xl gap-3 rounded-lg border border-border bg-card/95 px-4 py-[0.9375rem] shadow-[0_20px_55px_rgba(94,58,27,0.11)]"
    >
      <label className="sr-only" htmlFor="prompt-input">
        Message Cashew
      </label>
      <textarea
        className="min-h-[1.5lh] max-h-[8lh] w-full resize-none overflow-y-auto border-0 bg-transparent text-[15px] leading-6 text-foreground outline-none placeholder:text-[#9a9086] [field-sizing:content]"
        id="prompt-input"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder="Ask Cashew to think, plan, or act..."
        rows={1}
      />
      <div className="flex items-center justify-between gap-3">
        <ModelControls
          selectedModel={selectedModel}
          thinkingLevel={thinkingLevel}
          onModelChange={onModelChange}
          onThinkingChange={onThinkingChange}
        />

        <Button
          disabled={!isSending && !prompt.trim()}
          onClick={isSending ? onCancel : undefined}
          className="h-[2.375rem] w-[2.375rem] bg-[linear-gradient(145deg,#9b6a3d,#6b421f)] p-0 hover:bg-[linear-gradient(145deg,#8d5f34,#5d371a)] disabled:bg-[#c9baaa]"
          type={isSending ? 'button' : 'submit'}
        >
          {isSending ? <X size={22} /> : <ArrowUp size={21} strokeWidth={2.5} />}
          <span className="sr-only">{isSending ? 'Cancel' : 'Send'}</span>
        </Button>
      </div>
    </form>
  );
}
