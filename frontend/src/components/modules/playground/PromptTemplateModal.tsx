"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X, Plus, Copy, Trash2, Sparkles, BookmarkPlus, Star } from "lucide-react";
import { playgroundApi } from "@/lib/api";
import { usePlaygroundStore, type PlaygroundTemplate } from "./usePlaygroundStore";

const CATEGORIES = [
  { value: "image", labelKey: "template.catImage", color: "text-primary" },
  { value: "video", labelKey: "template.catVideo", color: "text-accent" },
  { value: "general", labelKey: "template.catGeneral", color: "text-text-muted" },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

function categoryMeta(cat: string) {
  return CATEGORIES.find((c) => c.value === cat) ?? CATEGORIES[2];
}

interface FormState {
  name: string;
  category: CategoryValue;
  prompt: string;
}

const EMPTY_FORM: FormState = { name: "", category: "general", prompt: "" };

export default function PromptTemplateModal() {
  const t = useTranslations("playground");
  const {
    templates,
    showTemplateModal,
    setShowTemplateModal,
    applyTemplate,
    removeTemplate,
    addTemplate,
    prompt: currentPrompt,
    mode: currentMode,
    modelId: currentModelId,
    parameters: currentParams,
    negativePrompt: currentNegativePrompt,
    toggleTemplateFavorite,
    isTemplateFavorited,
  } = usePlaygroundStore();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<CategoryValue | "all">("all");

  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showTemplateModal) return;
    const t = window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [showTemplateModal]);

  useEffect(() => {
    if (!showTemplateModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setShowTemplateModal(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showTemplateModal, setShowTemplateModal]);

  // Auto-open form with pre-filled prompt when modal opens with currentPrompt set
  useEffect(() => {
    if (showTemplateModal && currentPrompt.trim() && !formOpen) {
      setForm({
        name: "",
        category: (currentMode === "t2i" || currentMode === "i2i") ? "image"
          : (currentMode === "t2v" || currentMode === "i2v" || currentMode === "r2v" || currentMode === "v2v") ? "video"
          : "general",
        prompt: currentPrompt,
      });
      setFormOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTemplateModal]);

  const handleApply = useCallback((tpl: PlaygroundTemplate) => {
    applyTemplate(tpl);
    setShowTemplateModal(false);
  }, [applyTemplate, setShowTemplateModal]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try { await playgroundApi.deleteTemplate(id); removeTemplate(id); } catch { /* silent */ }
    finally { setDeletingId(null); }
  }, [removeTemplate]);

  const handleCreate = useCallback(async () => {
    if (!form.name.trim() || !form.prompt.trim()) return;
    setBusy(true);
    try {
      const created = await playgroundApi.createTemplate({
        name: form.name.trim(),
        category: form.category,
        prompt: form.prompt.trim(),
        negative_prompt: currentNegativePrompt || undefined,
        default_mode: currentMode,
        default_model_id: currentModelId || undefined,
        default_parameters: Object.keys(currentParams).length > 0 ? currentParams : undefined,
      });
      addTemplate(created as unknown as PlaygroundTemplate);
      setForm(EMPTY_FORM);
      setFormOpen(false);
    } catch { /* silent */ }
    finally { setBusy(false); }
  }, [form, addTemplate, currentMode, currentModelId, currentParams, currentNegativePrompt]);

  const handlePrefill = useCallback(() => {
    setForm({
      name: "",
      category: (currentMode === "t2i" || currentMode === "i2i") ? "image"
        : (currentMode === "t2v" || currentMode === "i2v" || currentMode === "r2v" || currentMode === "v2v") ? "video"
        : "general",
      prompt: currentPrompt,
    });
    setFormOpen(true);
  }, [currentPrompt, currentMode]);

  if (!showTemplateModal || typeof window === "undefined") return null;

  const filtered = (filterCat === "all"
    ? templates
    : templates.filter((x) => x.category === filterCat)
  ).sort((a, b) => {
    const aFav = isTemplateFavorited(a.id) ? 0 : 1;
    const bFav = isTemplateFavorited(b.id) ? 0 : 1;
    return aFav - bFav;
  });

  const modal = (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-50 bg-overlay backdrop-blur-md"
        onClick={() => setShowTemplateModal(false)}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className="pointer-events-auto w-[560px] max-h-[85vh] bg-elevated border border-glass-border rounded-[20px] shadow-2xl flex flex-col overflow-hidden outline-none"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-glass-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <BookmarkPlus size={16} className="text-primary" />
              </div>
              <div>
                <h2 className="font-display atelier-display text-[1.375rem] font-semibold tracking-tight text-foreground">{t("template.title")}</h2>
                <p className="text-[0.625rem] text-text-muted mt-0.5">{t("template.subtitle")}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowTemplateModal(false)}
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted transition-colors hover:bg-hover-bg hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          {/* Filter tabs — Line B segmented pill */}
          <div className="px-6 pt-4 pb-2 shrink-0">
            <div className="flex gap-[2px] p-[3px] bg-surface-inset rounded-full atelier-pill-tabs">
              {[{ value: "all" as const, labelKey: "template.filterAll" as const }, ...CATEGORIES].map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setFilterCat(c.value)}
                  className={[
                    "flex-1 rounded-full px-3 py-1.5 text-[0.6875rem] font-medium text-center cursor-pointer transition-all",
                    filterCat === c.value
                      ? "bg-primary text-on-accent"
                      : "text-text-muted hover:text-foreground hover:bg-hover-bg",
                  ].join(" ")}
                >
                  {t(c.labelKey)}
                  {c.value !== "all" && (
                    <span className="ml-1.5 text-[0.5625rem] opacity-60">
                      {templates.filter((x) => x.category === c.value).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Template list */}
          <div className="flex-1 overflow-y-auto px-6 py-3 min-h-0 space-y-2">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Sparkles size={28} className="text-text-muted/60 mb-3" />
                <p className="font-display italic text-[0.9375rem] text-text-secondary mb-1.5 leading-relaxed">
                  {filterCat === "all"
                    ? t("template.emptyAll")
                    : t("template.emptyFiltered", { category: t(categoryMeta(filterCat).labelKey) })}
                </p>
                <p className="text-[0.6875rem] text-text-muted">{t("template.emptyHint")}</p>
              </div>
            )}

            {filtered.map((tpl) => {
              const meta = categoryMeta(tpl.category);
              return (
                <div
                  key={tpl.id}
                  className="group p-4 rounded-[20px] bg-glass atelier-asset-card border border-glass-border hover:border-foreground/30 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[0.8125rem] font-medium text-foreground truncate">{tpl.name}</span>
                        <span className={`text-[0.5625rem] font-mono uppercase px-1.5 py-[2px] rounded bg-elevated shrink-0 ${meta.color}`}>
                          {t(meta.labelKey)}
                        </span>
                        {tpl.default_mode && (
                          <span className="text-[0.5625rem] font-mono uppercase px-1.5 py-[2px] rounded bg-glass text-text-muted shrink-0">
                            {tpl.default_mode}
                          </span>
                        )}
                      </div>
                      <p className="font-display italic text-[0.8125rem] text-text-secondary line-clamp-2 leading-[1.6]">{tpl.prompt}</p>
                    </div>

                    {/* Actions — visible on hover */}
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => toggleTemplateFavorite(tpl.id)}
                        className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
                          isTemplateFavorited(tpl.id)
                            ? 'text-status-starred-solid'
                            : 'text-text-muted hover:text-status-starred-solid/70'
                        }`}
                        title={isTemplateFavorited(tpl.id) ? t('template.unfavorite') : t('template.favorite')}
                      >
                        <Star size={12} className={isTemplateFavorited(tpl.id) ? 'fill-status-starred-solid' : ''} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApply(tpl)}
                        className="h-7 px-2.5 rounded-md text-[0.6875rem] font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors flex items-center gap-1"
                      >
                        <Copy size={11} />
                        {t('template.apply')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(tpl.id)}
                        disabled={deletingId === tpl.id}
                        className="h-7 w-7 rounded-md flex items-center justify-center text-text-muted hover:text-status-failed-fg hover:bg-status-failed-bg transition-colors disabled:opacity-30"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer: create form */}
          <div className="border-t border-glass-border shrink-0">
            {/* Toggle row */}
            <div className="px-6 py-3 flex items-center">
              {!formOpen ? (
                <>
                  <button
                    type="button"
                    onClick={() => setFormOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-foreground transition-colors"
                  >
                    <Plus size={14} />
                    {t('template.newTemplate')}
                  </button>
                  {currentPrompt.trim() && (
                    <button
                      type="button"
                      onClick={handlePrefill}
                      className="ml-auto inline-flex items-center gap-1.5 text-[0.6875rem] font-medium text-text-muted hover:text-foreground transition-colors"
                    >
                      <Copy size={11} />
                      {t('template.saveFromCurrent')}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="text-xs font-medium text-text-secondary">{t('template.newTemplate')}</span>
                  <button
                    type="button"
                    onClick={() => { setFormOpen(false); setForm(EMPTY_FORM); }}
                    className="ml-auto text-[0.6875rem] text-text-muted hover:text-foreground transition-colors"
                  >
                    {t('template.collapse')}
                  </button>
                </>
              )}
            </div>

            {/* Create form */}
            {formOpen && (
              <div className="px-6 pb-5 space-y-3">
                {/* Name + Category row */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("template.namePlaceholder")}
                    className="flex-1 h-9 px-3 text-[0.8125rem] bg-surface-inset border border-glass-border rounded-[14px] text-foreground placeholder:text-text-muted outline-none focus:border-foreground/30 transition-colors"
                    autoFocus
                  />
                </div>

                {/* Category pills */}
                <div className="flex gap-[2px] p-[3px] bg-surface-inset rounded-full atelier-pill-tabs">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, category: c.value as CategoryValue }))}
                      className={[
                        "flex-1 py-[6px] rounded-full text-[0.6875rem] font-medium text-center cursor-pointer transition-all",
                        form.category === c.value
                          ? "bg-primary text-on-accent"
                          : "text-text-muted hover:text-foreground hover:bg-hover-bg",
                      ].join(" ")}
                    >
                      {t(c.labelKey)}
                    </button>
                  ))}
                </div>

                {/* Prompt */}
                <textarea
                  value={form.prompt}
                  onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                  placeholder={t("template.promptPlaceholder")}
                  rows={5}
                  className="w-full min-h-[120px] px-3 py-2.5 text-[0.8125rem] leading-relaxed bg-surface-inset border border-glass-border rounded-[14px] text-foreground placeholder:text-text-muted outline-none focus:border-foreground/30 transition-colors resize-y"
                />

                {/* Submit */}
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={busy || !form.name.trim() || !form.prompt.trim()}
                  className={[
                    "w-full h-9 rounded-lg text-[0.8125rem] font-medium transition-all",
                    form.name.trim() && form.prompt.trim()
                      ? "bg-primary text-on-accent hover:bg-primary-hover shadow-[var(--glow-primary)]"
                      : "bg-elevated text-text-muted cursor-not-allowed",
                  ].join(" ")}
                >
                  {busy ? t("template.saving") : t("template.save")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
