'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { usePlaygroundStore } from './usePlaygroundStore';
import { getModelsForMode, getModelDisplayInfo, type PlaygroundModelOption } from './playgroundModels';

export default function ModelSelector() {
  const mode = usePlaygroundStore((s) => s.mode);
  const modelId = usePlaygroundStore((s) => s.modelId);
  const setModelId = usePlaygroundStore((s) => s.setModelId);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const availableModels = useMemo(() => getModelsForMode(mode), [mode]);

  const selected = useMemo(() => {
    const info = getModelDisplayInfo(modelId);
    if (info) return info;
    if (availableModels.length > 0) return { displayName: availableModels[0].displayName, family: availableModels[0].family };
    return null;
  }, [modelId, availableModels]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (availableModels.length > 0 && !availableModels.some((m) => m.id === modelId)) {
      setModelId(availableModels[0].id);
    }
  }, [availableModels, modelId, setModelId]);

  function handleSelect(id: string) {
    setModelId(id);
    setOpen(false);
  }

  // Group models by family for visual grouping
  const groupedModels = useMemo(() => {
    const groups: { family: string; models: PlaygroundModelOption[] }[] = [];
    let currentFamily = '';
    for (const m of availableModels) {
      if (m.family !== currentFamily) {
        currentFamily = m.family;
        groups.push({ family: currentFamily, models: [m] });
      } else {
        groups[groups.length - 1].models.push(m);
      }
    }
    return groups;
  }, [availableModels]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-[10px] px-[14px] py-[10px] border border-white/[0.08] rounded-lg bg-black/30 cursor-pointer w-full text-left transition-colors hover:border-white/[0.15]"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        <span className="flex-1 text-[13px] font-medium text-white truncate">
          {selected?.displayName ?? 'Select model'}
        </span>
        <span className="font-mono text-[10px] text-white/40 uppercase tracking-wider shrink-0">
          {selected?.family ?? ''}
        </span>
        <span className="text-white/40 text-xs shrink-0">&#9662;</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 w-full bg-[#141416] border border-white/[0.08] rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto">
          {availableModels.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-white/40">当前模式无可用模型</div>
          )}
          {groupedModels.map((group, gi) => (
            <div key={group.family}>
              {gi > 0 && <div className="border-t border-white/[0.04] mx-2" />}
              {groupedModels.length > 1 && (
                <div className="px-3 pt-2 pb-1">
                  <span className="font-mono text-[9px] text-white/30 uppercase tracking-[0.15em]">
                    {group.family}
                  </span>
                </div>
              )}
              {group.models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelect(m.id)}
                  className={`flex items-center gap-[10px] w-full px-3 py-2 text-left transition-colors hover:bg-white/[0.06] ${
                    m.id === modelId ? 'bg-white/[0.08] text-white' : 'text-white/80'
                  }`}
                >
                  <span className="flex-1 text-[13px] font-medium truncate">
                    {m.displayName}
                  </span>
                  {m.recommended && (
                    <span className="text-[8px] font-mono text-[#646cff] bg-[#646cff]/10 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                      推荐
                    </span>
                  )}
                  {m.id === modelId && (
                    <span className="text-[#646cff] shrink-0">✓</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
