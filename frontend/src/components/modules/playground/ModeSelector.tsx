'use client';

import { Image, Film } from 'lucide-react';
import { usePlaygroundStore, type PlaygroundMode } from './usePlaygroundStore';

type Category = 'image' | 'video';

const VIDEO_SUB_MODES: { key: PlaygroundMode; label: string }[] = [
  { key: 't2v', label: '文生' },
  { key: 'i2v', label: '图生' },
  { key: 'r2v', label: '参考生' },
  { key: 'v2v', label: '编辑' },
];

const IMAGE_MODE: PlaygroundMode = 't2i';

function getCategory(mode: PlaygroundMode): Category {
  return mode === 't2i' ? 'image' : 'video';
}

export default function ModeSelector() {
  const mode = usePlaygroundStore((s) => s.mode);
  const setMode = usePlaygroundStore((s) => s.setMode);

  const category = getCategory(mode);

  const handleCategoryChange = (cat: Category) => {
    if (cat === 'image' && category !== 'image') {
      setMode(IMAGE_MODE);
    } else if (cat === 'video' && category !== 'video') {
      setMode('i2v');
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Level 1: Category switch */}
      <div className="flex gap-[2px] p-[3px] bg-white/[0.03] rounded-lg border border-white/[0.04]">
        <button
          type="button"
          onClick={() => handleCategoryChange('image')}
          className={[
            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-semibold cursor-pointer transition-all',
            category === 'image'
              ? 'text-white bg-[#646cff] shadow-[0_2px_8px_rgba(100,108,255,0.3)]'
              : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]',
          ].join(' ')}
        >
          <Image size={14} />
          图像生成
        </button>
        <button
          type="button"
          onClick={() => handleCategoryChange('video')}
          className={[
            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-xs font-semibold cursor-pointer transition-all',
            category === 'video'
              ? 'text-white bg-[#646cff] shadow-[0_2px_8px_rgba(100,108,255,0.3)]'
              : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]',
          ].join(' ')}
        >
          <Film size={14} />
          视频生成
        </button>
      </div>

      {/* Level 2: Video sub-mode pills (only when video category is active) */}
      {category === 'video' && (
        <div className="flex gap-[2px] p-[2px] bg-white/[0.02] rounded-md border border-white/[0.04]">
          {VIDEO_SUB_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={[
                'flex-1 py-[6px] rounded-md text-[11px] font-medium text-center cursor-pointer transition-all',
                mode === m.key
                  ? 'text-white bg-white/[0.1] border border-white/[0.08]'
                  : 'text-white/35 hover:text-white/55 hover:bg-white/[0.03]',
              ].join(' ')}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
