"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

export type BannerState = "idle" | "phase1" | "phase2" | "dialogue" | "summary";

export interface GenerationBannerProps {
    state: BannerState;
    phase1Captions: string[];
    refineProgress?: { current: number; total: number } | null;
    dialogueProgress?: { current: number; total: number } | null;
    summary?: { frameCount: number; dialogueReady: number; dialogueMissing: number } | null;
    onGenerateDialogue?: () => void;
}

const CAPTION_INTERVAL = 3000;

export function GenerationBanner({
    state,
    phase1Captions,
    refineProgress,
    dialogueProgress,
    summary,
    onGenerateDialogue,
}: GenerationBannerProps) {
    const [captionIndex, setCaptionIndex] = useState(0);

    useEffect(() => {
        if (state !== "phase1") {
            setCaptionIndex(0);
            return;
        }
        const timer = setInterval(() => {
            setCaptionIndex((i) => (i + 1) % phase1Captions.length);
        }, CAPTION_INTERVAL);
        return () => clearInterval(timer);
    }, [state, phase1Captions.length]);

    const t = useTranslations("storyboardR2V");

    if (state === "idle") return null;
    if (state === "summary" && !summary) return null;

    return (
        <AnimatePresence mode="wait">
            {state === "phase1" && (
                <BannerShell key="phase1">
                    <Loader2 size={13} className="animate-spin text-primary shrink-0" />
                    <AnimatePresence mode="wait">
                        <motion.span
                            key={captionIndex}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.25 }}
                            className="text-xs text-text-secondary"
                        >
                            {phase1Captions[captionIndex]}
                        </motion.span>
                    </AnimatePresence>
                </BannerShell>
            )}

            {state === "phase2" && (
                <BannerShell key="phase2">
                    <Loader2 size={13} className="animate-spin text-amber-400 shrink-0" />
                    <span className="text-xs text-text-secondary">
                        {t("bannerRefineProgress", {
                            current: refineProgress?.current ?? 0,
                            total: refineProgress?.total ?? 0,
                        })}
                    </span>
                </BannerShell>
            )}

            {state === "dialogue" && (
                <BannerShell key="dialogue">
                    <Loader2 size={13} className="animate-spin text-blue-400 shrink-0" />
                    <span className="text-xs text-text-secondary">
                        {t("bannerDialogueProgress", {
                            current: dialogueProgress?.current ?? 0,
                            total: dialogueProgress?.total ?? 0,
                        })}
                    </span>
                </BannerShell>
            )}

            {state === "summary" && summary && (
                <SummaryBar
                    key="summary"
                    summary={summary}
                    onGenerateDialogue={onGenerateDialogue}
                />
            )}
        </AnimatePresence>
    );
}

function BannerShell({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden shrink-0"
        >
            <div className="flex items-center gap-2.5 h-10 px-6 border-b border-glass-border bg-glass">
                {children}
            </div>
        </motion.div>
    );
}

function SummaryBar({
    summary,
    onGenerateDialogue,
}: {
    summary: { frameCount: number; dialogueReady: number; dialogueMissing: number };
    onGenerateDialogue?: () => void;
}) {
    const t = useTranslations("storyboardR2V");
    const showCTA = summary.dialogueReady > 0;

    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden shrink-0"
        >
            <div className="flex items-center gap-2.5 h-9 px-6 border-b border-border-subtle bg-glass">
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                <span className="text-[0.8125rem] text-text-secondary">
                    {t("bannerFrameCount", { count: summary.frameCount })}
                    {summary.dialogueReady > 0 && (
                        <span className="ml-1.5">{t("bannerDialoguePending", { count: summary.dialogueReady })}</span>
                    )}
                    {summary.dialogueMissing > 0 && (
                        <span className="ml-1.5 text-amber-400/80">{t("bannerDialogueMissingVoice", { count: summary.dialogueMissing })}</span>
                    )}
                </span>
                {showCTA && onGenerateDialogue && (
                    <button
                        type="button"
                        onClick={onGenerateDialogue}
                        title={t("bannerSynthDialogueTooltip")}
                        className="ml-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.75rem] font-medium text-primary bg-primary/10 hover:bg-primary/15 transition-colors"
                    >
                        {t("bannerSynthDialogue")}
                    </button>
                )}
            </div>
        </motion.div>
    );
}
