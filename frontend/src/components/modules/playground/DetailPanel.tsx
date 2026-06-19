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
import { API_URL, playgroundApi } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { usePlaygroundStore, type PlaygroundGeneration } from './usePlaygroundStore';

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

function getMediaUrl(path: string): string {
  const relativePath = path.replace(/^output\//, '');
  return `${API_URL}/files/${relativePath}`;
}

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
  const t = useTranslations('playground');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const updateGeneration = usePlaygroundStore((s) => s.updateGeneration);
  const history = usePlaygroundStore((s) => s.history);

  // Always read the latest generation from store (so saved_to_library stays in sync)
  const generation = history.find((g) => g.id === generationProp.id) ?? generationProp;
  const saved = generation.outputs[0]?.saved_to_library ?? false;

  // Determine media
  const output = generation.outputs[0];
  const isVideo =
    output?.media_type === 'video' ||
    ['t2v', 'i2v', 'r2v', 'v2v'].includes(generation.mode);
  const mediaUrl = output?.media_path ? getMediaUrl(output.media_path) : null;

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
      }
      const updatedOutputs = generation.outputs.map((o) =>
        o.id === output.id ? { ...o, saved_to_library: newSaved } : o
      );
      updateGeneration({ ...generation, outputs: updatedOutputs });
    } catch (err) {
      console.error('[DetailPanel] Save to library failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await playgroundApi.deleteGeneration(generation.id);
      onClose();
    } catch (err) {
      console.error('[DetailPanel] Delete failed:', err);
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
      <div className="fixed inset-4 md:inset-8 z-50 bg-surface border border-glass-border rounded-[20px] shadow-2xl flex overflow-hidden">
        {/* ─── LEFT SIDE (Media) ─────────────────────────────────────────── */}
        <div className="relative w-[60%] h-full bg-surface flex items-center justify-center">
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
            <div className="flex flex-col items-center gap-2 text-text-muted">
              <Video className="w-12 h-12" />
              <span className="font-mono text-xs">No media</span>
            </div>
          )}

          {/* Amber halation overlay — only when saved to library (mirrors ResultCard) */}
          {saved && (
            <div className="atelier-proj-halation pointer-events-none absolute inset-0 z-[1]" />
          )}

          {/* Navigation arrows */}
          {hasPrev && (
            <button
              onClick={navigatePrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-elevated backdrop-blur-sm border border-glass-border flex items-center justify-center hover:bg-hover-bg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-foreground/80" />
            </button>
          )}
          {hasNext && (
            <button
              onClick={navigateNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-elevated backdrop-blur-sm border border-glass-border flex items-center justify-center hover:bg-hover-bg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-foreground/80" />
            </button>
          )}
        </div>

        {/* ─── RIGHT SIDE (Details) ──────────────────────────────────────── */}
        <div className="relative w-[40%] h-full overflow-y-auto p-6 border-l border-glass-border">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-glass border border-glass-border flex items-center justify-center hover:bg-hover-bg transition-colors"
          >
            <X className="w-4 h-4 text-text-secondary" />
          </button>

          {/* Section 1: Title */}
          <div className="mb-6 pr-10">
            <h2 className="text-lg font-semibold text-foreground mb-1">
              {generation.model_id}
            </h2>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[0.625rem] bg-elevated text-text-secondary rounded px-[6px] py-[2px] uppercase">
                {MODE_LABELS[generation.mode] || generation.mode}
              </span>
              <span className="font-mono text-[0.625rem] text-text-muted">
                {generation.id.slice(0, 8)}
              </span>
            </div>
            <p className="font-mono text-[0.6875rem] text-text-muted">
              {formatTimestamp(generation.created_at)}
            </p>
          </div>

          {/* Section 2: Actions */}
          <div className="flex flex-col gap-2 mb-6">
            {mediaUrl && (
              <button
                onClick={handleDownload}
                className="w-full inline-flex items-center justify-center gap-[7px] px-4 py-2.5 rounded-full bg-elevated border border-glass-border text-foreground/80 text-sm font-medium hover:bg-hover-bg transition"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            )}
            {output && (
              <button
                onClick={handleSaveToLibrary}
                disabled={saving}
                className={`w-full inline-flex items-center justify-center gap-[7px] px-4 py-2.5 rounded-full border text-sm font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
                  saved
                    ? 'bg-status-starred-bg border-status-starred-border text-status-starred-fg hover:opacity-80'
                    : 'bg-primary border-transparent text-on-accent shadow-[var(--glow-primary)] hover:bg-primary-hover hover:-translate-y-px'
                }`}
              >
                <Star
                  className={`w-4 h-4 ${saved ? 'fill-status-starred-solid text-status-starred-solid' : ''}`}
                />
                {saving ? t('detail.saving') : saved ? t('detail.savedCancel') : t('detail.saveToLibrary')}
              </button>
            )}
            {!isVideo && output?.media_path && onGenerateVideo && (
              <button
                onClick={() => onGenerateVideo(output.media_path)}
                className="w-full inline-flex items-center justify-center gap-[7px] px-4 py-2.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/20 transition"
              >
                <Video className="w-4 h-4" />
                Generate Video
              </button>
            )}
            {generation.status === 'failed' && onRetry && (
              <button
                onClick={() => onRetry(generation)}
                className="w-full inline-flex items-center justify-center gap-[7px] px-4 py-2.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/20 transition"
              >
                <RotateCcw className="w-4 h-4" />
                Retry
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full inline-flex items-center justify-center gap-[7px] px-4 py-2.5 rounded-full bg-status-failed-bg border border-status-failed-border text-status-failed-fg text-sm font-medium hover:opacity-80 transition"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>

          {/* Section 3: Prompt */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-text-muted">
                PROMPT
              </h3>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1 px-2 py-1 rounded text-[0.625rem] text-text-muted hover:text-foreground hover:bg-hover-bg transition-colors"
              >
                <Copy className="w-3 h-3" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto pr-1">
              <p className="font-display italic text-[0.9375rem] text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
                {generation.prompt ? `“${generation.prompt}”` : '(empty)'}
              </p>
            </div>
          </div>

          {/* Section 4: Parameters */}
          {paramEntries.length > 0 && (
            <div className="mb-6">
              <h3 className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-text-muted mb-2">
                {t('detail.parameters')}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {paramEntries.map(([label, value]) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-inset border border-border-subtle text-[0.6875rem] text-text-secondary"
                  >
                    <span className="font-mono text-[0.5625rem] uppercase tracking-wide text-text-muted">{label}</span>
                    {value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Section 5: Negative prompt */}
          {generation.negative_prompt && (
            <div className="mb-6">
              <h3 className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-text-muted mb-2">
                NEGATIVE PROMPT
              </h3>
              <div className="max-h-28 overflow-y-auto rounded-lg bg-glass border border-glass-border p-3">
                <p className="text-[0.75rem] text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
                  {generation.negative_prompt}
                </p>
              </div>
            </div>
          )}

          {/* Error display for failed generations */}
          {generation.status === 'failed' && generation.error && (
            <div className="mb-6">
              <h3 className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-status-failed-fg mb-2">
                ERROR
              </h3>
              <div className="max-h-28 overflow-y-auto rounded-lg bg-status-failed-bg border border-status-failed-border p-3">
                <p className="text-[0.6875rem] text-status-failed-fg leading-relaxed break-all font-mono">
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
