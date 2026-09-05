import { useState, type ReactNode } from 'react';
import { Xmark, ClipboardImport } from 'reicon-react';

interface Props {
  prompt: string;
  negativePrompt: string;
  onPromptChange: (v: string) => void;
  onNegativeChange: (v: string) => void;
  collapsibleNegative?: boolean;
  triggerChips?: ReactNode;
}

export default function PromptCard({
  prompt,
  negativePrompt,
  onPromptChange,
  onNegativeChange,
  collapsibleNegative,
  triggerChips,
}: Props) {
  const [showNegative, setShowNegative] = useState(!collapsibleNegative);

  const handlePastePrompt = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onPromptChange(text);
    } catch {}
  };

  return (
    <div data-el-name="PromptCard" className="space-y-2 p-3">
      <div data-el-name="PromptTextareaWrapper" className="relative">
        <textarea
          data-el-name="PromptTextarea"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Prompt..."
          rows={3}
          className="mobile-prompt-textarea w-full bg-surface rounded-xl p-3 pr-[104px] text-sm resize-y border border-border focus:outline-none focus:border-txt-secondary transition-colors"
        />
        <div data-el-name="PromptQuickActions" className="absolute top-2 right-2 flex gap-1">
          <button
            data-el-name="PromptPasteButton"
            type="button"
            onClick={handlePastePrompt}
            title="Vložit ze schránky"
            aria-label="Vložit prompt ze schránky"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-txt-tertiary bg-surface-el/80 border border-border active:bg-border transition-colors"
          >
            <ClipboardImport size={18} />
          </button>
          <button
            data-el-name="PromptClearButton"
            type="button"
            onClick={() => onPromptChange('')}
            title="Vymazat prompt"
            aria-label="Vymazat prompt"
            disabled={!prompt}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-txt-tertiary bg-surface-el/80 border border-border active:bg-border transition-colors disabled:opacity-30"
          >
            <Xmark size={18} />
          </button>
        </div>
      </div>
      {triggerChips}
      {showNegative ? (
        <div data-el-name="NegativePromptWrapper" className="flex items-start gap-2">
          <textarea
            data-el-name="NegativePromptTextarea"
            value={negativePrompt}
            onChange={(e) => onNegativeChange(e.target.value)}
            placeholder="Negative prompt..."
            rows={1}
            className="flex-1 bg-surface rounded-xl p-2.5 text-xs text-txt-secondary resize-none border border-border focus:outline-none focus:border-txt-secondary transition-colors"
          />
          {collapsibleNegative && (
            <button
              data-el-name="NegativePromptHideButton"
              onClick={() => setShowNegative(false)}
              aria-label="Skrýt negative prompt"
              className="w-11 h-11 rounded-xl flex items-center justify-center text-txt-tertiary active:bg-border transition-colors"
            >
              <Xmark size={16} />
            </button>
          )}
        </div>
      ) : (
        <button
          data-el-name="NegativePromptShowButton"
          onClick={() => setShowNegative(true)}
          className="min-h-[44px] px-2 text-xs text-txt-tertiary hover:text-txt-secondary active:text-txt-secondary transition-colors"
        >
          + negative prompt
        </button>
      )}
    </div>
  );
}
