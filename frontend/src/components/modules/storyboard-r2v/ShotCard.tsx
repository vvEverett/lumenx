"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
    Play,
    Trash2,
    ChevronUp,
    ChevronDown,
    Copy,
    Video,
    ImageIcon,
    AtSign,
    Maximize2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import AssetChipBar from "./AssetChipBar";
import PromptExpandModal from "./PromptExpandModal";
import { PendingTaskAffordance } from "@/components/shared/PendingTaskAffordance";

export interface ShotNode {
    id: string;
    prompt: string;
    tabMode: "t2i_i2v" | "direct_r2v";

    // T2I stage (only for t2i_i2v mode). Single-task fields stay here
    // for backward compat with existing shot drafts and the legacy
    // single-image preview. New: a history of generated T2I images per
    // shot + an index for the currently-active one (the one used as
    // first-frame for I2V). Persisted in localStorage with the rest of
    // the shot state. See Storyboard R2V redesign discussion.
    t2iImageUrl?: string;
    t2iTaskId?: string;
    t2iStatus?: "pending" | "processing" | "completed" | "failed";
    /** Ordered list of every T2I image URL this shot has produced.
     *  Newest at the end. Active one is at t2iSelectedIndex (defaults
     *  to last). Bounded to T2I_HISTORY_LIMIT FIFO to keep
     *  localStorage from growing without bound. */
    t2iImageUrls?: string[];
    t2iSelectedIndex?: number;

    // Video stage (shared). The single-task fields stay for "the most
    // recent attempt" but the candidates panel reads from the shot's
    // full videoTaskIds history (cross-referenced against the script's
    // video_tasks list which is persisted server-side).
    videoUrl?: string;
    videoTaskId?: string;
    videoStatus?: "pending" | "processing" | "completed" | "failed";
    /** Every video task this shot has spawned, oldest first. Each tab
     *  (t2i_i2v / direct_r2v) gets its own list — see videoTaskIdsByTab.
     *  Empty / missing → no history (e.g. legacy shots). */
    videoTaskIdsByTab?: {
        t2i_i2v?: string[];
        direct_r2v?: string[];
    };
    imageUrl?: string;
}

/** Cap on T2I image history per shot. Older drops off FIFO when adding. */
export const T2I_HISTORY_LIMIT = 10;

interface ShotCardProps {
    shot: ShotNode;
    index: number;
    totalShots: number;
    characters: any[];
    scenes: any[];
    props: any[];
    onUpdatePrompt: (prompt: string) => void;
    onGenerateT2I: () => void;
    onGenerateVideo: () => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDuplicate: () => void;
    onSetTabMode: (mode: "t2i_i2v" | "direct_r2v") => void;
    onOpenDrawer: () => void;
    onInsertAsset: (type: string, name: string) => void;
    /** Optional: Cancel CTA shown inside the pending-state affordance
     *  after the soft-stuck threshold (60 s by default). Caller should
     *  hit the backend cancel endpoint and refresh local state. */
    onCancelVideo?: () => Promise<void> | void;
}

export default function ShotCard({
    shot,
    index,
    totalShots,
    characters,
    scenes,
    props,
    onUpdatePrompt,
    onGenerateT2I,
    onGenerateVideo,
    onDelete,
    onMoveUp,
    onMoveDown,
    onDuplicate,
    onSetTabMode,
    onOpenDrawer,
    onInsertAsset,
    onCancelVideo,
}: ShotCardProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const t = useTranslations("storyboardR2V");
    // Expand modal state (B5). Cmd/Ctrl+E in the small textarea
    // opens it; saving syncs back via onUpdatePrompt; cancel
    // discards the modal's draft without touching parent state.
    const [expandOpen, setExpandOpen] = useState(false);

    // Auto-grow the textarea up to a cap (B2: ~10 rows). Re-runs
    // when prompt changes or the textarea mounts. The cap is
    // enforced by CSS (max-h-[260px] ≈ 10 lines @ leading-relaxed
    // 14px) so anything beyond scrolls in-place instead of pushing
    // the whole shot card off the viewport.
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        // Reset before measuring so shrinking also works (delete text).
        ta.style.height = "auto";
        const next = Math.min(ta.scrollHeight, 260);
        ta.style.height = `${next}px`;
    }, [shot.prompt]);

    const statusColor: Record<string, string> = {
        pending: "text-amber-400",
        processing: "text-sky-400",
        completed: "text-emerald-400",
        failed: "text-rose-400",
    };

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const el = cardRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--spotlight-x", `${e.clientX - rect.left}px`);
        el.style.setProperty("--spotlight-y", `${e.clientY - rect.top}px`);
    }, []);

    const renderPreview = () => {
        if (shot.tabMode === "t2i_i2v") {
            if (shot.videoUrl) {
                return (
                    <div className="w-full aspect-video relative group/preview">
                        <video
                            src={shot.videoUrl}
                            className="w-full h-full object-cover"
                            muted
                            loop
                            onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                            onMouseLeave={(e) => {
                                (e.target as HTMLVideoElement).pause();
                                (e.target as HTMLVideoElement).currentTime = 0;
                            }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity duration-300">
                            <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                                <Play size={18} className="text-white ml-0.5" />
                            </div>
                        </div>
                    </div>
                );
            }
            if (shot.videoStatus === "processing" || shot.videoStatus === "pending") {
                return (
                    <div className="w-full aspect-video flex items-center justify-center">
                        <PendingTaskAffordance
                            statusLabel={shot.videoStatus === "pending" ? t("queued") : t("generatingVideo")}
                            taskId={shot.videoTaskId}
                            onCancel={onCancelVideo}
                        />
                    </div>
                );
            }
            if (shot.videoStatus === "failed") {
                return (
                    <div className="w-full aspect-video flex flex-col items-center justify-center gap-2">
                        <span className="text-[11px] text-rose-400 font-medium">{t("generationFailed")}</span>
                        <button
                            onClick={onGenerateVideo}
                            className="text-[11px] text-primary hover:text-primary/80 transition-colors font-medium"
                        >
                            {t("retry")}
                        </button>
                    </div>
                );
            }
            if (shot.t2iImageUrl) {
                return (
                    <div className="w-full aspect-video relative group/preview">
                        <img src={shot.t2iImageUrl} alt="Generated frame" className="w-full h-full object-cover" />
                        <div className="absolute bottom-2 left-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/90 text-white font-medium backdrop-blur-sm">
                            {t("t2iCompleted")}
                        </div>
                    </div>
                );
            }
            if (shot.t2iStatus === "processing" || shot.t2iStatus === "pending") {
                return (
                    <div className="w-full aspect-video flex items-center justify-center">
                        <PendingTaskAffordance
                            statusLabel={shot.t2iStatus === "pending" ? t("queued") : t("t2iGenerating")}
                            taskId={shot.t2iTaskId}
                        />
                    </div>
                );
            }
            if (shot.t2iStatus === "failed") {
                return (
                    <div className="w-full aspect-video flex flex-col items-center justify-center gap-2">
                        <span className="text-[11px] text-rose-400 font-medium">{t("generationFailed")}</span>
                        <button
                            onClick={onGenerateT2I}
                            className="text-[11px] text-primary hover:text-primary/80 transition-colors font-medium"
                        >
                            {t("retry")}
                        </button>
                    </div>
                );
            }
            return (
                <div className="w-full aspect-video flex flex-col items-center justify-center gap-2 text-text-secondary/60">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                        <ImageIcon size={18} strokeWidth={1.5} />
                    </div>
                    <span className="text-[11px] font-medium">{t("generateImage")}</span>
                </div>
            );
        }

        // Direct R2V mode
        if (shot.videoUrl) {
            return (
                <div className="w-full aspect-video relative group/preview">
                    <video
                        src={shot.videoUrl}
                        className="w-full h-full object-cover"
                        muted
                        loop
                        onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                        onMouseLeave={(e) => {
                            (e.target as HTMLVideoElement).pause();
                            (e.target as HTMLVideoElement).currentTime = 0;
                        }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity duration-300">
                        <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                            <Play size={18} className="text-white ml-0.5" />
                        </div>
                    </div>
                </div>
            );
        }
        if (shot.videoStatus === "processing" || shot.videoStatus === "pending") {
            return (
                <div className="w-full aspect-video flex items-center justify-center">
                    <PendingTaskAffordance
                        statusLabel={shot.videoStatus === "pending" ? t("queued") : t("generatingVideo")}
                        taskId={shot.videoTaskId}
                        onCancel={onCancelVideo}
                    />
                </div>
            );
        }
        if (shot.videoStatus === "failed") {
            return (
                <div className="w-full aspect-video flex flex-col items-center justify-center gap-2">
                    <span className="text-[11px] text-rose-400 font-medium">{t("generationFailed")}</span>
                    <button
                        onClick={onGenerateVideo}
                        className="text-[11px] text-primary hover:text-primary/80 transition-colors font-medium"
                    >
                        {t("retry")}
                    </button>
                </div>
            );
        }
        return (
            <div className="w-full aspect-video flex flex-col items-center justify-center gap-2 text-text-secondary/60">
                <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                    <Video size={18} strokeWidth={1.5} />
                </div>
                <span className="text-[11px] font-medium">{t("noVideoYet")}</span>
            </div>
        );
    };

    // Legacy renderGenerateButton was removed in the workbench
    // redesign (Sweep G, 2026-05-21): generation moved to the
    // ParamsSection's "Generate ×N" CTA inside the attached
    // ShotPanel, and T2I首帧 generation lives in T2ISubsection's
    // "+gen" tile. Keeping it on the ShotCard duplicated the action
    // with a different label (i18n vs English) and a different
    // batch-size semantics (×1 vs ×N) — confusing and the source of
    // the "two Generate buttons" bug report.
    // onGenerateVideo / onGenerateT2I are still wired for the inline
    // retry buttons inside renderPreview when a take fails.

    const handleInsertAssetFromChip = (type: string, name: string) => {
        const tag = `[${type}:${name}]`;
        const textarea = textareaRef.current;
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const currentPrompt = shot.prompt;
            const newPrompt = currentPrompt.slice(0, start) + tag + currentPrompt.slice(end);
            onUpdatePrompt(newPrompt);
            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = start + tag.length;
                textarea.focus();
            }, 0);
        } else {
            onUpdatePrompt(shot.prompt + " " + tag);
        }
    };

    const isActiveT2I = shot.tabMode === "t2i_i2v";

    return (
        <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            className="relative group"
        >
            {/* Spotlight border glow */}
            <div
                className="absolute -inset-[1px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-0"
                style={{
                    background:
                        "radial-gradient(600px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), rgba(255,255,255,0.07), transparent 40%)",
                }}
            />

            {/* Liquid Glass card body */}
            <div className="relative backdrop-blur-xl bg-white/[0.02] border border-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-xl overflow-hidden z-10">
                {/* Header row: Tab switcher + Shot number */}
                <div className="flex items-center justify-between px-3 pt-3 pb-2">
                    {/* Pill Tab Switcher */}
                    <div className="relative inline-flex items-center p-[3px] bg-black/40 rounded-lg backdrop-blur-sm">
                        <motion.div
                            className="absolute top-[3px] bottom-[3px] rounded-md bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                            initial={false}
                            animate={{
                                left: isActiveT2I ? 3 : "calc(50% + 1.5px)",
                                width: "calc(50% - 3px)",
                            }}
                            transition={{ type: "spring", stiffness: 350, damping: 32 }}
                        />
                        <button
                            onClick={() => onSetTabMode("t2i_i2v")}
                            className={`relative z-10 flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-md transition-colors duration-200 ${
                                isActiveT2I ? "text-foreground" : "text-text-secondary hover:text-text-secondary/80"
                            }`}
                        >
                            <ImageIcon size={12} strokeWidth={1.5} />
                            {t("tabT2iI2v")}
                        </button>
                        <button
                            onClick={() => onSetTabMode("direct_r2v")}
                            className={`relative z-10 flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-md transition-colors duration-200 ${
                                !isActiveT2I ? "text-foreground" : "text-text-secondary hover:text-text-secondary/80"
                            }`}
                        >
                            <Video size={12} strokeWidth={1.5} />
                            {t("tabDirectR2v")}
                        </button>
                    </div>

                    {/* Shot number badge */}
                    <div className="flex items-center gap-2">
                        <div className="text-[10px] font-mono text-text-muted tabular-nums">
                            #{String(index + 1).padStart(2, "0")}
                        </div>
                        <div className="w-5 h-5 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
                            <span className="text-[9px] font-bold text-foreground">{index + 1}</span>
                        </div>
                    </div>
                </div>

                {/* Main content: Preview + Editor */}
                <div className="flex">
                    {/* Left: Preview */}
                    <div className="w-44 shrink-0 bg-black/20 flex flex-col items-center justify-center relative border-r border-white/[0.04]">
                        {renderPreview()}
                    </div>

                    {/* Right: Prompt + Controls */}
                    <div className="flex-1 p-3 flex flex-col gap-2">
                        {/* Prompt Editor wrapper — relative so the
                            expand icon can sit absolute top-right
                            without taking layout space. */}
                        <div className="relative">
                            <textarea
                                ref={textareaRef}
                                value={shot.prompt}
                                onChange={(e) => onUpdatePrompt(e.target.value)}
                                onKeyDown={(e) => {
                                    // Cmd/Ctrl + E from inside the
                                    // textarea opens the focus editor
                                    // (B5). Cmd is mac, Ctrl is
                                    // win/linux — handle both.
                                    if (e.key.toLowerCase() === "e" && (e.metaKey || e.ctrlKey)) {
                                        e.preventDefault();
                                        setExpandOpen(true);
                                    }
                                }}
                                placeholder={t("promptPlaceholder")}
                                // rows=5 baseline (B3); auto-grow up
                                // to max-h-[260px] (≈10 lines, B2).
                                // pr-8 reserves space for the expand
                                // icon so it never overlays text.
                                className="w-full text-sm resize-none leading-relaxed bg-transparent border border-white/[0.06] rounded-lg pl-3 pr-8 py-2.5 text-foreground placeholder:text-text-muted focus:outline-none focus:border-primary/30 focus:bg-white/[0.02] transition-all duration-200 min-h-[110px] max-h-[260px] overflow-y-auto"
                                rows={5}
                            />
                            {/* Expand-to-modal icon — top-right,
                                always visible. 24×24 hit area on
                                a 14×14 visual via padding. */}
                            <button
                                type="button"
                                onClick={() => setExpandOpen(true)}
                                aria-label={t("promptExpand")}
                                title={`${t("promptExpand")} (⌘/Ctrl + E)`}
                                className="btn-tip absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded text-text-muted/70 transition-colors duration-fast ease-out-quart hover:bg-hover-bg hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55"
                            >
                                <Maximize2 size={12} aria-hidden="true" />
                            </button>
                        </div>

                        {/* Asset Chip Bar */}
                        <AssetChipBar
                            characters={characters}
                            scenes={scenes}
                            props={props}
                            onInsertAsset={handleInsertAssetFromChip}
                        />

                        {/* Action Bar */}
                        <div className="flex items-center justify-between mt-0.5">
                            <div className="flex items-center gap-0.5">
                                <motion.button
                                    whileHover={{ scale: 1.08 }}
                                    whileTap={{ scale: 0.92 }}
                                    onClick={onOpenDrawer}
                                    className="p-1.5 rounded-lg hover:bg-white/[0.06] text-text-secondary hover:text-foreground transition-colors"
                                    title={t("browseAssets")}
                                >
                                    <AtSign size={14} strokeWidth={2} />
                                </motion.button>
                                <div className="w-px h-3.5 bg-white/[0.06] mx-0.5" />
                                <motion.button
                                    whileHover={{ scale: 1.08 }}
                                    whileTap={{ scale: 0.92 }}
                                    onClick={onMoveUp}
                                    disabled={index === 0}
                                    className="p-1.5 rounded-lg hover:bg-white/[0.06] text-text-secondary hover:text-foreground transition-colors disabled:opacity-20 disabled:hover:bg-transparent"
                                >
                                    <ChevronUp size={14} strokeWidth={1.5} />
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.08 }}
                                    whileTap={{ scale: 0.92 }}
                                    onClick={onMoveDown}
                                    disabled={index === totalShots - 1}
                                    className="p-1.5 rounded-lg hover:bg-white/[0.06] text-text-secondary hover:text-foreground transition-colors disabled:opacity-20 disabled:hover:bg-transparent"
                                >
                                    <ChevronDown size={14} strokeWidth={1.5} />
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.08 }}
                                    whileTap={{ scale: 0.92 }}
                                    onClick={onDuplicate}
                                    className="p-1.5 rounded-lg hover:bg-white/[0.06] text-text-secondary hover:text-foreground transition-colors"
                                    title={t("duplicateShot")}
                                >
                                    <Copy size={13} strokeWidth={1.5} />
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.08 }}
                                    whileTap={{ scale: 0.92 }}
                                    onClick={onDelete}
                                    disabled={totalShots <= 1}
                                    className="p-1.5 rounded-lg hover:bg-white/[0.06] text-text-secondary hover:text-rose-400 transition-colors disabled:opacity-20 disabled:hover:bg-transparent"
                                    title={t("deleteShot")}
                                >
                                    <Trash2 size={13} strokeWidth={1.5} />
                                </motion.button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* Focus-editor modal (B5 escape hatch) — opens via the
                expand icon or Cmd/Ctrl+E. Cancel discards; Save
                propagates back through the same onUpdatePrompt
                path the inline textarea uses. */}
            {expandOpen ? (
                <PromptExpandModal
                    initialValue={shot.prompt}
                    shotLabel={`Shot ${index + 1}`}
                    placeholder={t("promptPlaceholder")}
                    onSave={(next) => {
                        onUpdatePrompt(next);
                        setExpandOpen(false);
                    }}
                    onClose={() => setExpandOpen(false)}
                />
            ) : null}
        </div>
    );
}
