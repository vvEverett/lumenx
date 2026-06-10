'use client';

import { useState } from 'react';
import { Copy, Clock } from 'lucide-react';
import { usePlaygroundStore } from './usePlaygroundStore';
import PromptTemplateModal from './PromptTemplateModal';
import PromptHistoryDrawer from './PromptHistoryDrawer';

const MAX_LENGTH = 2000;

export default function PromptInput() {
  const prompt = usePlaygroundStore((s) => s.prompt);
  const negativePrompt = usePlaygroundStore((s) => s.negativePrompt);
  const setPrompt = usePlaygroundStore((s) => s.setPrompt);
  const setNegativePrompt = usePlaygroundStore((s) => s.setNegativePrompt);
  const setShowTemplateModal = usePlaygroundStore((s) => s.setShowTemplateModal);
  const setShowHistoryDrawer = usePlaygroundStore((s) => s.setShowHistoryDrawer);

  const [showNegPrompt, setShowNegPrompt] = useState(false);

  return (
    <div>
      {/* Main prompt textarea */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value.slice(0, MAX_LENGTH))}
        placeholder="描述你想生成的内容..."
        className="w-full min-h-[120px] max-h-[280px] resize-y p-[14px] border border-foreground/[0.08] rounded-xl bg-input-bg text-foreground text-[13px] leading-relaxed placeholder-foreground/40 focus:border-primary focus:ring-[3px] focus:ring-primary/12 outline-none"
      />

      {/* Toolbar — below the textarea, not overlapping */}
      <div className="flex items-center gap-[6px] mt-1.5 px-1">
        <button
          type="button"
          onClick={() => setShowTemplateModal(true)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-foreground/40 hover:text-foreground/60 hover:bg-foreground/[0.06] transition-colors"
        >
          <Copy size={12} />
          模板
        </button>
        <button
          type="button"
          onClick={() => setShowHistoryDrawer(true)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-foreground/40 hover:text-foreground/60 hover:bg-foreground/[0.06] transition-colors"
        >
          <Clock size={12} />
          历史
        </button>
        <span className="ml-auto font-mono text-[10px] text-foreground/30">
          {prompt.length} / {MAX_LENGTH}
        </span>
      </div>

      {/* Negative prompt toggle */}
      <div
        className="flex items-center gap-[6px] py-[6px] text-[11px] text-foreground/40 cursor-pointer hover:text-foreground/60 mt-2"
        onClick={() => setShowNegPrompt((v) => !v)}
      >
        <span
          className="inline-block transition-transform duration-150"
          style={{ transform: showNegPrompt ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          &#9656;
        </span>
        <span>负面提示词</span>
      </div>

      {showNegPrompt && (
        <textarea
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          placeholder="不希望出现的内容..."
          className="w-full min-h-[60px] resize-y p-[10px] border border-foreground/[0.04] rounded-lg bg-input-bg text-foreground/60 text-xs placeholder-foreground/40 focus:border-primary focus:ring-[3px] focus:ring-primary/12 outline-none"
        />
      )}

      <PromptTemplateModal />
      <PromptHistoryDrawer />
    </div>
  );
}
