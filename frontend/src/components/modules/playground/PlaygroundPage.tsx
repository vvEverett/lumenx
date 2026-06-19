'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import ModeSelector from './ModeSelector';
import ModelSelector from './ModelSelector';
import MediaInput from './MediaInput';
import PromptInput from './PromptInput';
import ParameterBar from './ParameterBar';
import ResultGallery from './ResultGallery';
import { usePlaygroundStore, type PlaygroundMode, type PlaygroundGeneration } from './usePlaygroundStore';
import { playgroundApi, type PlaygroundGenerationResponse } from '@/lib/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<PlaygroundMode, string> = {
  t2i: 'T2I',
  i2i: 'I2I',
  t2v: 'T2V',
  i2v: 'I2V',
  r2v: 'R2V',
  v2v: 'V2V',
};

/** Modes that require media input (image or video source).
 *  t2i also shows optional media input — when provided, it auto-becomes i2i. */
const MODES_WITH_MEDIA: PlaygroundMode[] = ['i2i', 'i2v', 'r2v', 'v2v'];
const MODES_WITH_OPTIONAL_MEDIA: PlaygroundMode[] = ['t2i'];

/** Polling interval for generation status (ms) */
const POLL_INTERVAL = 2000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert API response to store-compatible PlaygroundGeneration */
function toGeneration(resp: PlaygroundGenerationResponse): PlaygroundGeneration {
  return {
    id: resp.id,
    mode: resp.mode as PlaygroundMode,
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
    })),
    status: resp.status as PlaygroundGeneration['status'],
    error: resp.error,
    created_at: resp.created_at,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlaygroundPage() {
  const t = useTranslations('playground');

  const mode = usePlaygroundStore((s) => s.mode);
  const modelId = usePlaygroundStore((s) => s.modelId);
  const prompt = usePlaygroundStore((s) => s.prompt);
  const negativePrompt = usePlaygroundStore((s) => s.negativePrompt);
  const inputMedia = usePlaygroundStore((s) => s.inputMedia);
  const parameters = usePlaygroundStore((s) => s.parameters);
  const batchSize = usePlaygroundStore((s) => s.batchSize);
  const history = usePlaygroundStore((s) => s.history);
  const setHistory = usePlaygroundStore((s) => s.setHistory);
  const setTemplates = usePlaygroundStore((s) => s.setTemplates);
  const startGeneration = usePlaygroundStore((s) => s.startGeneration);
  const updateGeneration = usePlaygroundStore((s) => s.updateGeneration);

  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ─── Fetch initial data on mount ───────────────────────────────────────────

  useEffect(() => {
    playgroundApi.getHistory().then((items) => {
      setHistory(items.map(toGeneration));
    }).catch((err) => {
      console.error('[Playground] Failed to fetch history:', err);
    });

    playgroundApi.getTemplates().then((items) => {
      setTemplates(
        items.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          prompt: t.prompt,
          negative_prompt: t.negative_prompt,
          default_mode: t.default_mode as PlaygroundMode | undefined,
          default_model_id: t.default_model_id,
          default_parameters: t.default_parameters,
          created_at: t.created_at,
          updated_at: t.updated_at,
        }))
      );
    }).catch((err) => {
      console.error('[Playground] Failed to fetch templates:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Cleanup poll timers ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      pollTimers.current.forEach((timer) => clearInterval(timer));
      pollTimers.current.clear();
    };
  }, []);

  // ─── Status poller ─────────────────────────────────────────────────────────

  const startPolling = useCallback((generationId: string) => {
    // Prevent duplicate timers
    if (pollTimers.current.has(generationId)) return;

    const timer = setInterval(async () => {
      try {
        const statusResp = await playgroundApi.getGenerationStatus(generationId);
        const isTerminal = statusResp.status === 'completed' || statusResp.status === 'failed';

        // Fetch full generation data for complete update
        const fullResp = await playgroundApi.getGeneration(generationId);
        updateGeneration(toGeneration(fullResp));

        if (isTerminal) {
          clearInterval(timer);
          pollTimers.current.delete(generationId);
        }
      } catch (err) {
        console.error('[Playground] Poll failed for', generationId, err);
        clearInterval(timer);
        pollTimers.current.delete(generationId);
      }
    }, POLL_INTERVAL);

    pollTimers.current.set(generationId, timer);
  }, [updateGeneration]);

  // ─── Generate handler ──────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    try {
      // Auto-detect i2i: if user is in "图像" tab (t2i) and has uploaded reference images, switch to i2i
      const effectiveMode = (mode === 't2i' && inputMedia.length > 0) ? 'i2i' : mode;
      const resp = await playgroundApi.generate({
        mode: effectiveMode,
        model_id: modelId,
        prompt: prompt.trim(),
        negative_prompt: negativePrompt || undefined,
        input_media: inputMedia.length > 0 ? inputMedia : undefined,
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
        batch_size: batchSize > 1 ? batchSize : undefined,
      });

      const gen = toGeneration(resp);
      startGeneration(gen);

      // Begin polling for status
      if (gen.status !== 'completed' && gen.status !== 'failed') {
        startPolling(gen.id);
      }
    } catch (err) {
      console.error('[Playground] Generation request failed:', err);
    }
  }, [
    mode, modelId, prompt, negativePrompt, inputMedia,
    parameters, batchSize, startGeneration, startPolling,
  ]);

  // ─── Derived values ────────────────────────────────────────────────────────

  const resultCount = history.length;
  const showMediaInput = MODES_WITH_MEDIA.includes(mode) || MODES_WITH_OPTIONAL_MEDIA.includes(mode);
  const canGenerate = prompt.trim().length > 0;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      {/* ═══ PAGE HEADER ═══ */}
      <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-7 py-5">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[0.625rem] font-medium uppercase tracking-[0.2em] text-text-muted">
            {t('compose.eyebrow')}
          </span>
          <div className="flex items-baseline gap-[10px]">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground atelier-display">
              {t('header.title')}
            </h1>
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-text-muted">
              {t('header.resultsCount', { count: resultCount })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="atelier-badge rounded border border-glass-border bg-glass px-2 py-1 text-[0.625rem] uppercase tracking-[0.18em] text-text-muted">
            {MODE_LABELS[mode]}
          </span>
        </div>
      </header>

      {/* ═══ SPLIT LAYOUT ═══ */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ─── LEFT: INPUT PANEL ─── */}
        <aside className="flex w-[420px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-glass-border bg-surface-inset px-4 py-4 scrollbar-thin">
          {/* Mode */}
          <section className="glass-panel atelier-card rounded-[20px] px-5 py-4">
            <div className="mb-3 font-mono text-[0.625rem] font-medium uppercase tracking-[0.18em] text-text-muted">
              {t('compose.modeLabel')}
            </div>
            <ModeSelector />
          </section>

          {/* Model */}
          <section className="glass-panel atelier-card rounded-[20px] px-5 py-4 relative z-30">
            <div className="mb-3 font-mono text-[0.625rem] font-medium uppercase tracking-[0.18em] text-text-muted">
              {t('compose.modelLabel')}
            </div>
            <ModelSelector />
          </section>

          {/* Media Input (conditional) */}
          {showMediaInput && (
            <section className="glass-panel atelier-card rounded-[20px] px-5 py-4">
              <div className="mb-3 font-mono text-[0.625rem] font-medium uppercase tracking-[0.18em] text-text-muted">
                {t(
                  mode === 'v2v'
                    ? 'compose.mediaSourceVideo'
                    : mode === 'r2v'
                      ? 'compose.mediaRefMaterial'
                      : mode === 'i2v'
                        ? 'compose.mediaFirstFrame'
                        : 'compose.mediaReference'
                )}
              </div>
              <MediaInput />
            </section>
          )}

          {/* Prompt */}
          <section className="glass-panel atelier-card rounded-[20px] px-5 py-4">
            <div className="mb-3 font-mono text-[0.625rem] font-medium uppercase tracking-[0.18em] text-text-muted">
              {t('compose.promptLabel')}
            </div>
            <PromptInput />
          </section>

          {/* Parameters */}
          <section className="glass-panel atelier-card rounded-[20px] px-5 py-4">
            <div className="mb-3 font-mono text-[0.625rem] font-medium uppercase tracking-[0.18em] text-text-muted">
              {t('compose.parametersLabel')}
            </div>
            <ParameterBar />
          </section>

          {/* Spacer to push generate button to bottom */}
          <div className="flex-1" />

          {/* Generate CTA (sticky) */}
          <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-glass-border bg-background px-4 pb-4 pt-4">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={[
                'inline-flex w-full items-center justify-center gap-[7px] rounded-full px-6 py-[13px]',
                "font-['Space_Grotesk',sans-serif] text-sm font-semibold",
                'transition-all duration-150',
                canGenerate
                  ? 'bg-primary text-on-accent shadow-[var(--glow-primary)] hover:bg-primary-hover hover:-translate-y-px cursor-pointer'
                  : 'bg-primary/40 text-on-accent/60 shadow-none cursor-not-allowed',
              ].join(' ')}
            >
              <Sparkles size={16} aria-hidden="true" />
              <span>
                {batchSize > 1
                  ? t('compose.generateBatch', { count: batchSize })
                  : t('compose.generate')}
              </span>
            </button>
          </div>
        </aside>

        {/* ─── RIGHT: RESULT GALLERY ─── */}
        <main className="flex flex-1 flex-col overflow-hidden min-w-0">
          <ResultGallery />
        </main>
      </div>
    </div>
  );
}
