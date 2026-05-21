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
        <>
            {/* Backdrop — only renders below xl, where the panel is an
                overlay rather than a layout-pushing column. Click to
                dismiss matches the modal idiom for narrower screens. */}
            <div
                aria-hidden="true"
                onClick={onClose}
                className="absolute inset-0 z-20 bg-black/55 backdrop-blur-[1px] motion-safe:animate-[fadeInBackdrop_180ms_cubic-bezier(0.22,1,0.36,1)_both] xl:hidden"
            />
            <aside
                role="region"
                aria-label="Task queue"
                className={[
                    // Always: flex layout, glass surface, slide-in entry.
                    "flex h-full shrink-0 flex-col border-l border-glass-border bg-surface",
                    "motion-safe:animate-[queuePanelIn_280ms_cubic-bezier(0.22,1,0.36,1)_both]",
                    // ≥xl (1280): push column — old behavior. Static
                    // flex sibling, 360px wide, compresses main area.
                    "xl:static xl:w-[360px] xl:shadow-none xl:z-auto",
                    // md–lg (768–1279): overlay panel. Floats over main
                    // content rather than pushing it, since narrow
                    // viewports can't spare 360px of horizontal real
                    // estate without the shot list becoming unusable.
                    "absolute inset-y-0 right-0 z-30 w-[340px] max-w-[min(340px,calc(100vw-48px))]",
                    "shadow-[-12px_0_32px_-12px_rgba(0,0,0,0.55)]",
                    // <md (768): full-width drawer. Smaller phones get
                    // the queue as a modal full-screen takeover; the
                    // close button + backdrop both dismiss.
                    "max-md:w-screen max-md:max-w-none",
                ].join(" ")}
            >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-glass-border px-3.5 py-3">
                <div className="flex items-baseline gap-2">
                    {/* Display tier — primary panel title (P0-2). */}
                    <span className="font-display text-display-sm font-semibold tracking-tight text-foreground">Task queue</span>
                    <span className="font-mono text-chrome-sm font-medium uppercase text-text-muted">
                        {tasks.length} total
                    </span>
                </div>
                <button
                    type="button"
                    aria-label="Close queue"
                    onClick={onClose}
                    className="-m-1 grid h-7 w-7 place-items-center rounded text-text-muted transition-colors duration-fast ease-out-quart hover:bg-hover-bg hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55"
                >
                    <X size={13} aria-hidden="true" />
                </button>
            </header>

            <div role="tablist" className="flex shrink-0 border-b border-glass-border px-3 py-1.5">
                {(
                    [
                        ["active", "Active", buckets.active.length, "text-status-processing-fg"],
                        ["done", "Done", buckets.done.length, "text-status-completed-fg"],
                        ["failed", "Failed", buckets.failed.length, "text-status-failed-fg"],
                    ] as Array<[TabKey, string, number, string]>
                ).map(([key, label, count, colorClass]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}
                        className={`min-h-[32px] flex-1 rounded-md py-1.5 font-mono text-chrome-sm font-medium uppercase transition-colors duration-fast ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 ${
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
                    <div className="grid h-full place-items-center px-3 text-center font-mono text-chrome-sm font-medium uppercase text-text-muted">
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
        </>
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
    // Status dot uses the semantic token palette (Sweep A); a single
    // pulse on processing keeps the eye on what's moving without
    // jittering the whole row.
    const dotClass =
        task.status === "completed"
            ? "bg-status-completed-fg"
            : task.status === "failed"
                ? "bg-status-failed-fg"
                : task.status === "processing"
                    ? "bg-status-processing-fg animate-pulse"
                    : "bg-status-pending-fg";
    const elapsedS = Math.max(0, Math.floor(Date.now() / 1000 - task.created_at));
    const elapsedLabel = elapsedS < 60
        ? `${elapsedS}s`
        : elapsedS < 3600
            ? `${Math.floor(elapsedS / 60)}m`
            : `${Math.floor(elapsedS / 3600)}h`;

    // Row title includes the full task id only via tooltip (P2-3); the
    // visible #idShort was redundant noise next to shotLabel which is
    // already disambiguating.
    return (
        <div
            className="group/row rounded-md border border-glass-border bg-glass px-2.5 py-2 transition-colors duration-fast ease-out-quart hover:border-white/15"
            title={`Task id: ${task.id}`}
        >
            <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
                <span className="truncate font-sans text-body-sm font-medium text-foreground">
                    {shotLabel}
                </span>
                {isInFlight ? (
                    <Loader2 size={10} className="animate-spin text-status-processing-fg" aria-hidden="true" />
                ) : null}
                <span className="ml-auto flex shrink-0 items-center gap-1">
                    {task.frame_id ? (
                        <button
                            type="button"
                            aria-label="Jump to shot"
                            title="Jump to shot"
                            onClick={() => onJumpToShot(task.frame_id!)}
                            className="-m-1 grid h-7 w-7 place-items-center rounded text-text-muted transition-colors duration-fast ease-out-quart hover:bg-hover-bg hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55"
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
                            className="-m-1 grid h-7 w-7 place-items-center rounded text-text-muted transition-colors duration-fast ease-out-quart hover:bg-status-failed-bg hover:text-status-failed-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-failed-border"
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
                            className="min-h-[24px] rounded border border-status-failed-border bg-status-failed-bg px-1.5 py-[2px] font-mono text-chrome-sm font-medium uppercase text-status-failed-fg transition-colors duration-fast ease-out-quart hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-failed-border"
                        >
                            retry
                        </button>
                    ) : null}
                </span>
            </div>
            <div className="mt-1 truncate font-mono text-chrome-sm tracking-tight text-text-muted">
                {task.model || "—"} · {elapsedLabel} ago
                {isFailed && task.error ? (
                    <span className="ml-1 text-status-failed-fg"> · {task.error.slice(0, 60)}</span>
                ) : null}
            </div>
        </div>
    );
}
