'use client';

import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  Star,
  Video,
  RotateCcw,
  Trash2,
  Copy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { playgroundApi, type PlaygroundGenerationResponse } from '@/lib/api';
import { usePlaygroundStore, type PlaygroundGeneration } from './usePlaygroundStore';
import { getPlaygroundMediaUrl } from './mediaUrls';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DetailPanelProps {
  generation: PlaygroundGeneration;
  allGenerations: PlaygroundGeneration[];
  onClose: () => void;
  onNavigate: (generation: PlaygroundGeneration) => void;
  onRetry?: (generation: PlaygroundGeneration) => void;
  onGenerateVideo?: (imagePath: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<string, string> = {
  t2v: 'T2V',
  i2v: 'I2V',
  r2v: 'R2V',
  v2v: 'V2V',
  t2i: 'T2I',
  i2i: 'I2I',
};

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}`;
}

function toGeneration(resp: PlaygroundGenerationResponse): PlaygroundGeneration {
  return {
    id: resp.id,
    mode: resp.mode as PlaygroundGeneration['mode'],
    model_id: resp.model_id,
    prompt: resp.prompt,
    negative_prompt: resp.negative_prompt,
    input_media: resp.input_media,
    parameters: resp.parameters,
    batch_size: resp.batch_size,
    outputs: resp.outputs.map((o) => ({
      id: o.id,
      media_path: o.media_path,
      media_type: o.media_type as 'image' | 'video',
      thumbnail_path: o.thumbnail_path,
      saved_to_library: o.saved_to_library,
      library_path: o.library_path,
    })),
    status: resp.status as PlaygroundGeneration['status'],
    error: resp.error,
    created_at: resp.created_at,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DetailPanel({
  generation: generationProp,
  allGenerations,
  onClose,
  onNavigate,
  onRetry,
  onGenerateVideo,
}: DetailPanelProps) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedOutputIndex, setSelectedOutputIndex] = useState(0);
  const updateGeneration = usePlaygroundStore((s) => s.updateGeneration);
  const removeGeneration = usePlaygroundStore((s) => s.removeGeneration);
  const history = usePlaygroundStore((s) => s.history);

  // Always read the latest generation from store (so saved_to_library stays in sync)
  const generation = history.find((g) => g.id === generationProp.id) ?? generationProp;

  // Determine media
  const safeOutputIndex = Math.min(
    selectedOutputIndex,
    Math.max(generation.outputs.length - 1, 0),
  );
  const output = generation.outputs[safeOutputIndex];
  const saved = output?.saved_to_library ?? false;
  const isVideo =
    output?.media_type === 'video' ||
    ['t2v', 'i2v', 'r2v', 'v2v'].includes(generation.mode);
  const mediaUrl = getPlaygroundMediaUrl(output?.media_path);

  // Navigation
  const currentIndex = allGenerations.findIndex((g) => g.id === generation.id);
  const hasPrev = currentIndex < allGenerations.length - 1;
  const hasNext = currentIndex > 0;

  const navigatePrev = useCallback(() => {
    if (hasPrev) onNavigate(allGenerations[currentIndex + 1]);
  }, [hasPrev, currentIndex, allGenerations, onNavigate]);

  const navigateNext = useCallback(() => {
    if (hasNext) onNavigate(allGenerations[currentIndex - 1]);
  }, [hasNext, currentIndex, allGenerations, onNavigate]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') navigatePrev();
      if (e.key === 'ArrowRight') navigateNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, navigatePrev, navigateNext]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    setSelectedOutputIndex(0);
  }, [generationProp.id]);

  // Actions
  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(generation.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    if (!mediaUrl) return;
    const a = document.createElement('a');
    a.href = mediaUrl;
    a.download = output?.media_path?.split('/').pop() || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleSaveToLibrary = async () => {
    if (!output || saving) return;
    setSaving(true);
    try {
      const newSaved = !saved;
      if (newSaved) {
        await playgroundApi.saveToLibrary(generation.id, output.id);
      } else {
        await playgroundApi.unsaveFromLibrary(generation.id, output.id);
      }
      const updatedOutputs = generation.outputs.map((o) =>
        o.id === output.id
          ? { ...o, saved_to_library: newSaved, library_path: newSaved ? o.library_path : undefined }
          : o
      );
      updateGeneration({ ...generation, outputs: updatedOutputs });
    } catch (err) {
      console.error('[DetailPanel] Save to library failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOutput = async () => {
    if (!output || deleting) return;
    const mediaLabel = isVideo ? '视频' : '图片';
    const message = generation.outputs.length > 1
      ? `删除当前查看的这张${mediaLabel}？已收藏到资产库的副本会保留。`
      : `删除这个生成结果？已收藏到资产库的副本会保留。`;
    if (!window.confirm(message)) return;

    setDeleting(true);
    try {
      const resp = await playgroundApi.deleteOutput(generation.id, output.id);
      if (resp.generation) {
        const updated = toGeneration(resp.generation);
        updateGeneration(updated);
        setSelectedOutputIndex((index) =>
          Math.min(index, Math.max(updated.outputs.length - 1, 0))
        );
      } else {
        removeGeneration(generation.id);
        onClose();
      }
    } catch (err) {
      console.error('[DetailPanel] Delete output failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteGeneration = async () => {
    if (deleting) return;
    const count = generation.outputs.length;
    if (!window.confirm(`删除本次生成的 ${count} 个结果？已收藏到资产库的副本会保留。`)) return;

    setDeleting(true);
    try {
      await playgroundApi.deleteGeneration(generation.id);
      removeGeneration(generation.id);
      onClose();
    } catch (err) {
      console.error('[DetailPanel] Delete generation failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  // Build parameter entries
  const paramEntries: [string, string][] = [];
  const params = generation.parameters || {};
  if (params.size) paramEntries.push(['Size', params.size]);
  if (params.resolution) paramEntries.push(['Resolution', params.resolution]);
  if (params.aspect_ratio) paramEntries.push(['Aspect Ratio', params.aspect_ratio]);
  if (params.duration) paramEntries.push(['Duration', `${params.duration}s`]);
  if (generation.batch_size > 1)
    paramEntries.push(['Batch Size', String(generation.batch_size)]);
  if (params.seed !== undefined && params.seed !== null)
    paramEntries.push(['Seed', String(params.seed)]);
  // Add remaining params
  const skipKeys = new Set([
    'size',
    'resolution',
    'aspect_ratio',
    'duration',
    'seed',
  ]);
  Object.entries(params).forEach(([key, value]) => {
    if (!skipKeys.has(key) && value !== undefined && value !== null && value !== '') {
      paramEntries.push([key, String(value)]);
    }
  });

  const modal = (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Container */}
      <div className="fixed inset-4 md:inset-8 z-50 bg-[#0e0e11] border border-white/[0.06] rounded-2xl shadow-2xl flex overflow-hidden">
        {/* ─── LEFT SIDE (Media) ─────────────────────────────────────────── */}
        <div className="relative w-[60%] h-full bg-[#080809] flex items-center justify-center">
          {mediaUrl ? (
            isVideo ? (
              <video
                src={mediaUrl}
                controls
                className="max-w-full max-h-full object-contain rounded"
              />
            ) : (
              <img
                src={mediaUrl}
                alt={generation.prompt}
                className="max-w-full max-h-full object-contain"
              />
            )
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/20">
              <Video className="w-12 h-12" />
              <span className="font-mono text-xs">No media</span>
            </div>
          )}

          {generation.outputs.length > 1 && (
            <div className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 gap-2 overflow-x-auto rounded-xl border border-white/[0.08] bg-black/55 p-2 backdrop-blur-md">
              {generation.outputs.map((item, index) => {
                const itemUrl = getPlaygroundMediaUrl(item.media_path);
                const itemIsVideo = item.media_type === 'video';
                const isSelected = index === safeOutputIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedOutputIndex(index);
                    }}
                    className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-[#646cff]'
                        : 'border-white/[0.08] hover:border-white/25'
                    }`}
                    title={`Output ${index + 1}`}
                  >
                    {itemUrl && !itemIsVideo ? (
                      <img src={itemUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
                        <Video className="h-4 w-4 text-white/35" />
                      </div>
                    )}
                    <span className="absolute bottom-0.5 left-0.5 rounded bg-black/65 px-1 font-mono text-[9px] text-white/70">
                      {index + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Navigation arrows */}
          {hasPrev && (
            <button
              onClick={navigatePrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.12] transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-white/70" />
            </button>
          )}
          {hasNext && (
            <button
              onClick={navigateNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/[0.06] backdrop-blur-sm border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.12] transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-white/70" />
            </button>
          )}
        </div>

        {/* ─── RIGHT SIDE (Details) ──────────────────────────────────────── */}
        <div className="relative w-[40%] h-full overflow-y-auto p-6 border-l border-white/[0.06]">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.10] transition-colors"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>

          {/* Section 1: Title */}
          <div className="mb-6 pr-10">
            <h2 className="text-lg font-semibold text-white mb-1">
              {generation.model_id}
            </h2>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[10px] bg-white/[0.06] text-white/60 rounded px-[6px] py-[2px] uppercase">
                {MODE_LABELS[generation.mode] || generation.mode}
              </span>
              <span className="font-mono text-[10px] text-white/30">
                {generation.id.slice(0, 8)}
              </span>
            </div>
            <p className="font-mono text-[11px] text-white/30">
              {formatTimestamp(generation.created_at)}
            </p>
          </div>

          {/* Section 2: Actions */}
          <div className="flex flex-col gap-2 mb-6">
            {mediaUrl && (
              <button
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/80 text-sm font-medium hover:bg-white/[0.10] transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            )}
            {output && (
              <button
                onClick={handleSaveToLibrary}
                disabled={saving}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
                  saved
                    ? 'bg-white/[0.04] border-green-500/20 text-green-400 hover:border-white/[0.12] hover:text-white/60'
                    : 'bg-white/[0.06] border-white/[0.08] text-white/80 hover:bg-white/[0.10]'
                }`}
              >
                <Star
                  className={`w-4 h-4 ${saved ? 'fill-green-400 text-green-400' : ''}`}
                />
                {saving ? '处理中...' : saved ? '已收藏（点击取消）' : '收藏到资产库'}
              </button>
            )}
            {!isVideo && output?.media_path && onGenerateVideo && (
              <button
                onClick={() => onGenerateVideo(output.media_path)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#646cff]/10 border border-[#646cff]/20 text-[#646cff] text-sm font-medium hover:bg-[#646cff]/20 transition-colors"
              >
                <Video className="w-4 h-4" />
                Generate Video
              </button>
            )}
            {generation.status === 'failed' && onRetry && (
              <button
                onClick={() => onRetry(generation)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Retry
              </button>
            )}
            <button
              onClick={handleDeleteOutput}
              disabled={deleting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/[0.06] border border-red-500/[0.12] text-red-400/80 text-sm font-medium hover:bg-red-500/[0.12] transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              {deleting
                ? '删除中...'
                : generation.outputs.length > 1
                  ? `删除当前${isVideo ? '视频' : '图片'}`
                  : '删除'}
            </button>
            {generation.outputs.length > 1 && (
              <button
                onClick={handleDeleteGeneration}
                disabled={deleting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/[0.03] border border-red-500/[0.08] text-red-300/65 text-sm font-medium hover:bg-red-500/[0.10] hover:text-red-300 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                删除本次生成（{generation.outputs.length}个）
              </button>
            )}
          </div>

          {/* Section 3: Prompt */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-500/80">
                PROMPT
              </h3>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
              >
                <Copy className="w-3 h-3" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
              <p className="text-[12px] text-white/70 leading-relaxed whitespace-pre-wrap break-words">
                {generation.prompt || '(empty)'}
              </p>
            </div>
          </div>

          {/* Section 4: Parameters */}
          {paramEntries.length > 0 && (
            <div className="mb-6">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-500/80 mb-2">
                参数
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {paramEntries.map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] text-white/40 mb-0.5">{label}</p>
                    <p className="text-[12px] text-white font-mono truncate">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 5: Negative prompt */}
          {generation.negative_prompt && (
            <div className="mb-6">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-500/80 mb-2">
                NEGATIVE PROMPT
              </h3>
              <div className="max-h-28 overflow-y-auto rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                <p className="text-[12px] text-white/50 leading-relaxed whitespace-pre-wrap break-words">
                  {generation.negative_prompt}
                </p>
              </div>
            </div>
          )}

          {/* Error display for failed generations */}
          {generation.status === 'failed' && generation.error && (
            <div className="mb-6">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-red-400/80 mb-2">
                ERROR
              </h3>
              <div className="max-h-28 overflow-y-auto rounded-lg bg-red-500/[0.04] border border-red-500/[0.12] p-3">
                <p className="text-[11px] text-red-300/80 leading-relaxed break-all font-mono">
                  {generation.error}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
