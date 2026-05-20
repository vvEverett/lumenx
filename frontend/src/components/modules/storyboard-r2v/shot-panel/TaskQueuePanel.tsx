"use client";
/**
 * TaskQueuePanel — slide-out side panel from the right edge that
 * lists every video task across the entire project (跨 shot 总览).
 * Per grill Q10:
 *   - 360px wide, push main area (caller controls layout)
 *   - Tabs: Active | Done | Failed (default Active)
 *   - Single-line cards: `● Shot X · Batch Y · status · jump → · ×`
 *   - 1-click cancel (no 60s wait — that's the candidate-thumb's job)
 *   - jump-to-shot scrolls + opens that shot's panel
 *
 * The panel takes a flat task list + a shot→title map. It's purely
 * presentational; the host wires which tasks to show and what
 * "jump to shot" does.
 */
import { useMemo, useState } from "react";
import { X, ArrowRight, Loader2 } from "lucide-react";
import type { VideoTask } from "@/lib/api";

type TabKey = "active" | "done" | "failed";

interface TaskQueuePanelProps {
    open: boolean;
    onClose: () => void;
    tasks: VideoTask[];
    /** Map shot.id → human label (e.g. "Shot 2"). Tasks not matching
     *  any shot still render with their frame_id as fallback. */
    shotLabelByFrameId?: Record<string, string>;
    onJumpToShot: (frameId: string) => void;
    onCancel?: (task: VideoTask) => Promise<void> | void;
    onRetry?: (task: VideoTask) => Promise<void> | void;
}

export default function TaskQueuePanel({
    open,
    onClose,
    tasks,
    shotLabelByFrameId,
    onJumpToShot,
    onCancel,
    onRetry,
}: TaskQueuePanelProps) {
    const [tab, setTab] = useState<TabKey>("active");

    const buckets = useMemo(() => {
        const active: VideoTask[] = [];
        const done: VideoTask[] = [];
        const failed: VideoTask[] = [];
        for (const t of tasks) {
            if (t.status === "pending" || t.status === "processing") active.push(t);
            else if (t.status === "completed") done.push(t);
            else if (t.status === "failed") failed.push(t);
        }
        // Newest first within each bucket.
        const byTimeDesc = (a: VideoTask, b: VideoTask) => b.created_at - a.created_at;
        active.sort(byTimeDesc);
        done.sort(byTimeDesc);
        failed.sort(byTimeDesc);
        return { active, done, failed };
    }, [tasks]);

    const visibleTasks = buckets[tab];

    if (!open) return null;

    return (
        <aside
            role="region"
            aria-label="Task queue"
            className="flex h-full w-[360px] shrink-0 flex-col border-l border-glass-border bg-surface"
        >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-glass-border px-3.5 py-3">
                <div className="flex items-baseline gap-2">
                    <span className="font-display text-[13px] font-semibold text-foreground">Task queue</span>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-text-muted/85">
                        {tasks.length} total
                    </span>
                </div>
                <button
                    type="button"
                    aria-label="Close queue"
                    onClick={onClose}
                    className="grid h-6 w-6 place-items-center rounded text-text-muted hover:bg-hover-bg hover:text-foreground"
                >
                    <X size={13} aria-hidden="true" />
                </button>
            </header>

            <div role="tablist" className="flex shrink-0 border-b border-glass-border px-3 py-1.5">
                {(
                    [
                        ["active", "Active", buckets.active.length, "text-amber-300"],
                        ["done", "Done", buckets.done.length, "text-emerald-300"],
                        ["failed", "Failed", buckets.failed.length, "text-red-300"],
                    ] as Array<[TabKey, string, number, string]>
                ).map(([key, label, count, colorClass]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}
                        className={`flex-1 rounded-md py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.2em] transition-colors ${
                            tab === key
                                ? "bg-glass text-foreground"
                                : "text-text-muted hover:text-foreground"
                        }`}
                    >
                        {label}
                        {count > 0 ? (
                            <span className={`ml-1.5 ${colorClass}`}>{count}</span>
                        ) : null}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto px-2.5 py-2.5">
                {visibleTasks.length === 0 ? (
                    <div className="grid h-full place-items-center px-3 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted/85">
                        {tab === "active"
                            ? "No tasks running."
                            : tab === "done"
                                ? "No completed tasks yet."
                                : "No failed tasks."}
                    </div>
                ) : (
                    <ul className="space-y-1">
                        {visibleTasks.map((task) => (
                            <li key={task.id}>
                                <TaskRow
                                    task={task}
                                    shotLabel={shotLabelByFrameId?.[task.frame_id ?? ""] ?? task.frame_id ?? "—"}
                                    onJumpToShot={onJumpToShot}
                                    onCancel={onCancel}
                                    onRetry={onRetry}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </aside>
    );
}

function TaskRow({
    task,
    shotLabel,
    onJumpToShot,
    onCancel,
    onRetry,
}: {
    task: VideoTask;
    shotLabel: string;
    onJumpToShot: (frameId: string) => void;
    onCancel?: (task: VideoTask) => Promise<void> | void;
    onRetry?: (task: VideoTask) => Promise<void> | void;
}) {
    const isInFlight = task.status === "pending" || task.status === "processing";
    const isFailed = task.status === "failed";
    const dotClass =
        task.status === "completed"
            ? "bg-emerald-400"
            : task.status === "failed"
                ? "bg-red-400"
                : task.status === "processing"
                    ? "bg-amber-400 animate-pulse"
                    : "bg-blue-400";
    const idShort = task.id.slice(0, 6);
    const elapsedS = Math.max(0, Math.floor(Date.now() / 1000 - task.created_at));
    const elapsedLabel = elapsedS < 60
        ? `${elapsedS}s`
        : elapsedS < 3600
            ? `${Math.floor(elapsedS / 60)}m`
            : `${Math.floor(elapsedS / 3600)}h`;

    return (
        <div className="rounded-md border border-glass-border bg-glass px-2.5 py-1.5">
            <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
                <span className="truncate font-mono text-[10px] font-medium text-foreground/95">
                    {shotLabel}
                </span>
                <span className="font-mono text-[9px] tracking-tight text-text-muted/65">
                    #{idShort}
                </span>
                {isInFlight ? (
                    <Loader2 size={10} className="animate-spin text-amber-300" aria-hidden="true" />
                ) : null}
                <span className="ml-auto flex shrink-0 items-center gap-1">
                    {task.frame_id ? (
                        <button
                            type="button"
                            aria-label="Jump to shot"
                            title="Jump to shot"
                            onClick={() => onJumpToShot(task.frame_id!)}
                            className="grid h-5 w-5 place-items-center rounded text-text-muted hover:bg-hover-bg hover:text-foreground"
                        >
                            <ArrowRight size={11} aria-hidden="true" />
                        </button>
                    ) : null}
                    {isInFlight && onCancel ? (
                        <button
                            type="button"
                            aria-label="Cancel task"
                            title="Cancel"
                            onClick={() => { void onCancel(task); }}
                            className="grid h-5 w-5 place-items-center rounded text-text-muted hover:bg-red-400/15 hover:text-red-200"
                        >
                            <X size={11} aria-hidden="true" />
                        </button>
                    ) : null}
                    {isFailed && onRetry ? (
                        <button
                            type="button"
                            aria-label="Retry task"
                            title="Retry"
                            onClick={() => { void onRetry(task); }}
                            className="rounded border border-red-300/35 bg-red-400/10 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.18em] text-red-100 hover:bg-red-400/20"
                        >
                            retry
                        </button>
                    ) : null}
                </span>
            </div>
            <div className="mt-0.5 truncate font-mono text-[9px] tracking-tight text-text-muted/80">
                {task.model || "—"} · {elapsedLabel} ago
                {isFailed && task.error ? (
                    <span className="ml-1 text-red-300/85"> · {task.error.slice(0, 60)}</span>
                ) : null}
            </div>
        </div>
    );
}
