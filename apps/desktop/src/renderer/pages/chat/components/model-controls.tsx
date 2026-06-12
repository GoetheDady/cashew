import { Brain } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { cn } from '../../../lib/utils';
import {
  getEffectiveLevels,
  MODELS,
  THINKING_LABELS,
  type ThinkingLevel,
} from '../lib/model-options';

type ModelControlsProps = {
  selectedModel: string;
  thinkingLevel: ThinkingLevel;
  onModelChange: (modelId: string) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
};

export function ModelControls({
  selectedModel,
  thinkingLevel,
  onModelChange,
  onThinkingChange,
}: ModelControlsProps) {
  const effectiveLevels = getEffectiveLevels(selectedModel);
  const selectedLevelIndex = effectiveLevels.indexOf(thinkingLevel);

  return (
    <div className="flex items-center gap-3">
      <Select value={selectedModel} onValueChange={onModelChange}>
        <SelectTrigger className="h-[2.375rem] w-auto gap-1.5 border-border bg-card/90 px-3 text-xs font-semibold">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODELS.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Brain
          size={16}
          className={cn(
            'shrink-0 transition-colors',
            thinkingLevel !== 'off' ? 'text-primary' : 'text-muted-foreground',
          )}
        />
        <input
          type="range"
          min={0}
          max={effectiveLevels.length - 1}
          value={selectedLevelIndex >= 0 ? selectedLevelIndex : 0}
          onChange={(event) => onThinkingChange(effectiveLevels[Number(event.target.value)])}
          className="h-1.5 w-20 cursor-pointer appearance-none rounded-full border border-border/50 bg-muted accent-primary [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.15)] [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary"
          title={THINKING_LABELS[thinkingLevel]}
        />
        <span className="w-10 text-[10px] font-semibold text-muted-foreground">
          {THINKING_LABELS[thinkingLevel]}
        </span>
      </div>
    </div>
  );
}
