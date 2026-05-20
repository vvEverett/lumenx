"use client";
/**
 * CandidateThumb — single video take cell in the candidates panel.
 * Always-visible affordances (per grill Q6 "一直可见"):
 *   - ★ icon top-right (multi-select shortlist toggle)
 *   - label inline below the thumb (≤20 chars, click-to-edit)
 *   - status overlay if in-flight / failed
 *   - Shift+Click → toggles compare-select (ring highlight)
 *   - regular click → preview (host decides — usually opens player)
 *
 * Compact size: ~140×80 (16:9-ish) so 4-6 fit per row in the panel.
 * Always shows status; PendingTaskAffordance handles stuck > 60s.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Star, AlertCircle, Check, Pencil } from "lucide-react";
import { PendingTaskAffordance } from "@/components/shared/PendingTaskAffordance";
import type { VideoTask } from "@/lib/api";

interface CandidateThumbProps {
    task: VideoTask;
    isCompareSelected: boolean;
    /** Optional: resolve a URL to display-ready form (asset prefix). */
    resolveUrl?: (url: string) => string;
    onClick: (task: VideoTask, modifiers: { shift: boolean; meta: boolean }) => void;
    onToggleStar: (task: VideoTask, next: boolean) => Promise<void> | void;
    onSetLabel: (task: VideoTask, next: string | null) => Promise<void> | void;
    onCancel?: (task: VideoTask) => Promise<void> | void;
    onRetry?: (task: VideoTask) => Promise<void> | void;
}

const MAX_LABEL_LEN = 20;

export default function CandidateThumb({
    task,
    isCompareSelected,
    resolveUrl,
    onClick,
    onToggleStar,
    onSetLabel,
    onCancel,
    onRetry,
}: CandidateThumbProps) {
    const status = task.status;
    const isProcessing = status === "pending" || status === "processing";
    const isFailed = status === "failed";
    const isCompleted = status === "completed";
    const display = (u?: string | null) => (u && resolveUrl ? resolveUrl(u) : u ?? undefined);

    const videoUrl = isCompleted ? display(task.video_url) : undefined;

    const [editingLabel, setEditingLabel] = useState(false);
    const [labelDraft, setLabelDraft] = useState(task.label ?? "");
    const labelInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editingLabel && labelInputRef.current) {
            labelInputRef.current.focus();
            labelInputRef.current.select();
        }
    }, [editingLabel]);

    useEffect(() => {
        // Sync draft when task.label changes from outside (e.g. annotate
        // round-trip refresh).
        setLabelDraft(task.label ?? "");
    }, [task.label]);

    const commitLabel = async () => {
        setEditingLabel(false);
        const trimmed = labelDraft.trim().slice(0, MAX_LABEL_LEN);
        const current = task.label ?? "";
        if (trimmed === current) return;
        await onSetLabel(task, trimmed.length === 0 ? null : trimmed);
    };

    return (
        <div className="flex w-[140px] shrink-0 flex-col gap-1">
            <div
                role="button"
                tabIndex={0}
                onClick={(e) => onClick(task, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey })}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onClick(task, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey });
                    }
                }}
                className={`group relative h-[80px] overflow-hidden rounded-md border bg-black/40 transition-all ${
                    isCompareSelected
                        ? "border-amber-300/85 ring-2 ring-amber-300/45"
                        : isCompleted
                            ? "border-white/10 hover:border-primary/45"
                            : isFailed
                                ? "border-red-400/45"
                                : "border-blue-400/35"
                }`}
                title="Click to play · Shift+Click to add to Compare"
            >
                {/* Thumbnail / preview */}
                {videoUrl ? (
                    <video
                        src={videoUrl}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                        onMouseEnter={(e) => {
                            const v = e.currentTarget;
                            v.play().catch(() => { /* autoplay may be blocked */ });
                        }}
                        onMouseLeave={(e) => {
                            const v = e.currentTarget;
                            v.pause();
                            try { v.currentTime = 0; } catch { /* ignore */ }
                        }}
                    />
                ) : (
                    <div className="grid h-full w-full place-items-center">
                        {isProcessing ? (
                            <PendingTaskAffordance
                                statusLabel={status === "pending" ? "Queued" : "Generating"}
                                taskId={task.id}
                                compact
                                onCancel={onCancel ? () => onCancel(task) : undefined}
                            />
                        ) : isFailed ? (
                            <div className="flex flex-col items-center gap-1 px-2 text-center">
                                <AlertCircle size={14} className="text-red-300" aria-hidden="true" />
                                <span className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-red-200/95">
                                    Failed
                                </span>
                                {onRetry ? (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            void onRetry(task);
                                        }}
                                        className="rounded border border-red-300/45 bg-red-400/10 px-1.5 py-[1px] font-mono text-[8.5px] font-medium uppercase tracking-[0.18em] text-red-100 hover:bg-red-400/20"
                                    >
                                        Retry
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            <Loader2 size={14} className="animate-spin text-text-muted/65" />
                        )}
                    </div>
                )}

                {/* ★ toggle top-right — always visible per design grill */}
                <button
                    type="button"
                    aria-label={task.is_starred ? "Unstar" : "Star"}
                    onClick={(e) => {
                        e.stopPropagation();
                        void onToggleStar(task, !task.is_starred);
                    }}
                    className={`absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full border transition-colors ${
                        task.is_starred
                            ? "border-amber-200/65 bg-amber-400/20 text-amber-200"
                            : "border-white/15 bg-black/55 text-white/65 hover:text-amber-200"
                    }`}
                >
                    <Star
                        size={11}
                        aria-hidden="true"
                        fill={task.is_starred ? "currentColor" : "none"}
                        strokeWidth={task.is_starred ? 0 : 1.5}
                    />
                </button>

                {/* Compare-select corner badge */}
                {isCompareSelected ? (
                    <span
                        aria-hidden="true"
                        className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-amber-300 text-[#141416]"
                    >
                        <Check size={11} aria-hidden="true" strokeWidth={3} />
                    </span>
                ) : null}
            </div>

            {/* Label row — always visible per design grill ("不覆盖在视频上") */}
            {editingLabel ? (
                <input
                    ref={labelInputRef}
                    value={labelDraft}
                    maxLength={MAX_LABEL_LEN}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onBlur={() => { void commitLabel(); }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            void commitLabel();
                        } else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingLabel(false);
                            setLabelDraft(task.label ?? "");
                        }
                    }}
                    placeholder="short note"
                    className="rounded border border-primary/45 bg-black/30 px-1.5 py-[2px] font-mono text-[10px] text-foreground placeholder:text-text-muted/65 outline-none"
                />
            ) : (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setEditingLabel(true);
                    }}
                    className="group/label flex items-center gap-1 truncate rounded px-1 py-[1px] text-left font-mono text-[10px] tracking-tight text-text-secondary/95 hover:bg-white/[0.04] hover:text-foreground"
                    title="Click to edit label (≤20 chars)"
                >
                    {task.label ? (
                        <span className="truncate">{task.label}</span>
                    ) : (
                        <>
                            <Pencil size={9} className="text-text-muted/65 opacity-0 group-hover/label:opacity-100" aria-hidden="true" />
                            <span className="text-text-muted/60 italic">add label…</span>
                        </>
                    )}
                </button>
            )}
        </div>
    );
}
