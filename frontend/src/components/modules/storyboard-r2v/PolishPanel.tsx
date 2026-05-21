"use client";
/**
 * PolishPanel — wraps the LLM "polish prompt" capability for the
 * Storyboard R2V workbench. The polish chain (storyboard_polish /
 * video_polish / r2v_polish system prompts, bilingual CN+EN output,
 * feedback iteration) is fully built backend-side (llm.py +
 * SeriesPromptConfigModal) and was already used in the legacy
 * VideoCreator + PropertiesPanel. The new ShotPanel-based workbench
 * shipped without hooking it up — this component is the catch-up.
 *
 * UX: a small ✨ button next to the prompt textarea's Expand button.
 * Click → calls polishVideoPrompt (i2v) or polishR2VPrompt (r2v)
 * via api.ts. Result renders inline below the textarea as a
 * collapsible panel with:
 *   - CN preview (Chinese-fluent, for human reading)
 *   - EN preview (model-native, used for generation)
 *   - Apply (replaces textarea content with EN)
 *   - Discard (collapse + clear)
 *   - Feedback textarea + "Refine again" (iterate)
 *
 * Visual register matches the rest of the workbench (display-sm CTA,
 * status tokens for success, chrome-sm meta). NOT branded purple
 * like the legacy VideoCreator polish — that color was specific to
 * the old aesthetic.
 */
import { useCallback, useState } from "react";
import { Loader2, Sparkles, Check, X, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { debugLog } from "@/lib/debugLog";

interface PolishedPrompt {
    cn: string;
    en: string;
}

interface PolishPanelProps {
    /** Current prompt text from the parent (ShotCard) — what gets
     *  sent to the polish API as the draft. */
    prompt: string;
    /** Which polish flavor to invoke. i2v uses video_polish (focuses
     *  on motion + camera language); r2v uses r2v_polish (replaces
     *  character names with character1/character2 ID syntax for the
     *  R2V model). */
    tabMode: "t2i_i2v" | "direct_r2v";
    /** Project id — backend looks up project-level prompt_config to
     *  optionally override the system prompt. */
    scriptId: string;
    /** Slot context for R2V polish — describes which characters are
     *  referenced so the system prompt knows what "character1" maps
     *  to. Pass [] for i2v (ignored). */
    slots?: { description: string }[];
    /** Apply the EN polished result back to the parent's prompt
     *  state (typically wired to ShotCard's onUpdatePrompt). */
    onApply: (text: string) => void;
}

export default function PolishPanel({
    prompt,
    tabMode,
    scriptId,
    slots = [],
    onApply,
}: PolishPanelProps) {
    const t = useTranslations("storyboardR2V");
    const [polished, setPolished] = useState<PolishedPrompt | null>(null);
    const [isPolishing, setIsPolishing] = useState(false);
    const [feedback, setFeedback] = useState("");

    const runPolish = useCallback(async (feedbackText: string = "") => {
        // For iteration, the "draft" is the previously-polished EN
        // (we're asking the LLM to refine its own output based on
        // feedback). Otherwise it's the user's raw prompt.
        const draft = feedbackText ? (polished?.en ?? prompt) : prompt;
        if (!draft.trim()) return;
        setIsPolishing(true);
        try {
            const res = tabMode === "direct_r2v"
                ? await api.polishR2VPrompt(draft, slots, feedbackText, scriptId)
                : await api.polishVideoPrompt(draft, feedbackText, scriptId);
            if (res?.prompt_cn && res?.prompt_en) {
                setPolished({ cn: res.prompt_cn, en: res.prompt_en });
                setFeedback("");
            }
        } catch (err) {
            debugLog.error("Studio", "Polish failed:", err);
            // Surface a brief inline failure; the user can retry.
            // No toast infra yet so we just clear loading state.
        } finally {
            setIsPolishing(false);
        }
    }, [tabMode, prompt, slots, scriptId, polished?.en]);

    const handleApply = useCallback(() => {
        if (!polished) return;
        onApply(polished.en);
        setPolished(null);
        setFeedback("");
    }, [polished, onApply]);

    const handleDiscard = useCallback(() => {
        setPolished(null);
        setFeedback("");
    }, []);

    // Disabled when there's nothing to polish.
    const disabled = !prompt.trim() || isPolishing;

    return (
        <div className="space-y-2">
            {/* Polish trigger — small inline button. Hidden once a
                polished result is showing (then the inline panel
                takes over). */}
            {!polished ? (
                <div className="flex items-center justify-end">
                    <button
                        type="button"
                        onClick={() => runPolish("")}
                        disabled={disabled}
                        title={t("polish")}
                        className="btn-tip inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-black/20 px-2.5 py-1.5 font-mono text-chrome font-medium text-text-secondary transition-colors duration-fast ease-out-quart hover:border-primary/45 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isPolishing ? (
                            <>
                                <Loader2 size={11} className="animate-spin" aria-hidden="true" />
                                {t("polishing")}
                            </>
                        ) : (
                            <>
                                <Sparkles size={11} aria-hidden="true" />
                                {t("polish")}
                            </>
                        )}
                    </button>
                </div>
            ) : null}

            {/* Polished result — bilingual preview + actions. */}
            {polished ? (
                <div className="rounded-md border border-primary/30 bg-primary/[0.05] p-3 space-y-2.5 motion-safe:animate-[shotPanelIn_220ms_cubic-bezier(0.22,1,0.36,1)_both]">
                    {/* Header with header label + Apply / Discard. */}
                    <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-mono text-chrome-sm font-medium uppercase text-primary">
                            <Sparkles size={11} aria-hidden="true" />
                            {t("polish")}
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={handleApply}
                                className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 font-display text-display-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_10px_-4px_rgba(100,108,255,0.5)] transition-all duration-fast ease-out-quart hover:bg-primary/92 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55"
                            >
                                <Check size={12} aria-hidden="true" />
                                {t("polishApply")}
                            </button>
                            <button
                                type="button"
                                onClick={handleDiscard}
                                aria-label={t("polishDiscard")}
                                className="-m-1 grid h-7 w-7 place-items-center rounded text-text-muted transition-colors duration-fast ease-out-quart hover:bg-hover-bg hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55"
                            >
                                <X size={12} aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    {/* CN preview */}
                    <div className="space-y-1">
                        <div className="font-mono text-chrome-sm font-medium uppercase text-text-muted">
                            {t("polishCnLabel")}
                        </div>
                        <p className="rounded bg-black/30 px-2.5 py-2 font-sans text-body-sm leading-relaxed text-foreground/95 whitespace-pre-wrap">
                            {polished.cn}
                        </p>
                    </div>

                    {/* EN preview */}
                    <div className="space-y-1">
                        <div className="font-mono text-chrome-sm font-medium uppercase text-text-muted">
                            {t("polishEnLabel")}
                        </div>
                        <p className="rounded bg-black/30 px-2.5 py-2 font-mono text-body-sm leading-relaxed text-foreground/95 whitespace-pre-wrap">
                            {polished.en}
                        </p>
                    </div>

                    {/* Feedback iteration */}
                    <div className="flex items-center gap-2 pt-1">
                        <input
                            type="text"
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && feedback.trim() && !isPolishing) {
                                    e.preventDefault();
                                    void runPolish(feedback);
                                }
                            }}
                            placeholder={t("polishFeedbackPlaceholder")}
                            className="flex-1 rounded border border-glass-border bg-black/30 px-2.5 py-1.5 font-sans text-body-sm text-foreground placeholder:text-text-muted outline-none transition-colors duration-fast ease-out-quart focus:border-primary/55 focus-visible:ring-2 focus-visible:ring-primary/45"
                        />
                        <button
                            type="button"
                            onClick={() => void runPolish(feedback)}
                            disabled={!feedback.trim() || isPolishing}
                            className="inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-black/20 px-2.5 py-1.5 font-mono text-chrome font-medium text-text-secondary transition-colors duration-fast ease-out-quart hover:border-primary/45 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isPolishing ? (
                                <Loader2 size={11} className="animate-spin" aria-hidden="true" />
                            ) : (
                                <RefreshCw size={11} aria-hidden="true" />
                            )}
                            {t("polishRefineAgain")}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
