"use client";
/**
 * CandidatesSection — lower half of the attached ShotPanel. Shows
 * every video task this shot has produced, grouped by batch (a
 * cluster of tasks created from one Generate ×N click).
 *
 * Design per grill Q4/Q5/Q6:
 *   - Batch + accumulate: each Generate adds N candidates; old
 *     batches stay (never overwritten)
 *   - Latest batch expanded by default, older batches collapsed
 *   - Filter chips: All / ★ Starred only / 此模型 (current model)
 *   - Sort: by time desc (default) or by model
 *   - Multi-row wrap inside each batch (no horizontal scroll)
 *   - Per-row "复用此批参数" button on each collapsed batch header
 *
 * Batch detection: VideoTask doesn't have a batch_id field; we
 * approximate by clustering tasks whose created_at differs by ≤ a
 * gap window AND share the same (model, prompt, negative_prompt)
 * fingerprint. Crude but matches the user's mental "I clicked
 * Generate once" model.
 */
import { useMemo, useState } from "react";
import { Star, Film, Clock, ArrowDown, ArrowUp, RotateCw } from "lucide-react";
import type { VideoTask } from "@/lib/api";
import SectionShell from "./SectionShell";
import { usePanelSectionState } from "./usePanelSectionState";
import CandidateThumb from "./CandidateThumb";

interface CandidatesSectionProps {
    shotId: string;
    tasks: VideoTask[];
    /** Tasks pre-filtered to a specific tab (t2i_i2v / direct_r2v) so
     *  candidates from the other tab don't leak in. */
    activeModel?: string;
    compareSelectedIds: Set<string>;
    onClickThumb: (task: VideoTask, modifiers: { shift: boolean; meta: boolean }) => void;
    onToggleStar: (task: VideoTask, next: boolean) => Promise<void> | void;
    onSetLabel: (task: VideoTask, next: string | null) => Promise<void> | void;
    onCancel?: (task: VideoTask) => Promise<void> | void;
    onRetry?: (task: VideoTask) => Promise<void> | void;
    onReuseBatchParams?: (batch: BatchSummary) => void;
    onOpenCompare?: () => void;
    resolveUrl?: (url: string) => string;
}

export interface BatchSummary {
    /** Synthetic id derived from earliest task's id. */
    id: string;
    tasks: VideoTask[];
    createdAt: number;
    model: string;
    summary: string;
}

type FilterMode = "all" | "starred" | "this-model";
type SortMode = "time" | "model";

const BATCH_GAP_MS = 15_000; // Tasks within 15s of each other on the same model/prompt cluster together.

function groupIntoBatches(tasks: VideoTask[]): BatchSummary[] {
    if (tasks.length === 0) return [];
    // Sort by created_at asc first so clustering can walk forward.
    const sorted = [...tasks].sort((a, b) => a.created_at - b.created_at);
    const batches: VideoTask[][] = [];
    let current: VideoTask[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const prev = current[current.length - 1];
        const next = sorted[i];
        const sameCluster =
            (next.created_at - prev.created_at) * 1000 < BATCH_GAP_MS &&
            next.model === prev.model &&
            next.prompt === prev.prompt &&
            (next.negative_prompt ?? "") === (prev.negative_prompt ?? "");
        if (sameCluster) {
            current.push(next);
        } else {
            batches.push(current);
            current = [next];
        }
    }
    batches.push(current);
    return batches.map((bt) => {
        const first = bt[0];
        const parts: string[] = [];
        if (first.negative_prompt) parts.push(`neg="${first.negative_prompt.slice(0, 24)}"`);
        if (first.resolution) parts.push(first.resolution);
        if (first.ratio) parts.push(first.ratio);
        const summary = parts.length ? parts.join(" · ") : "default params";
        return {
            id: `batch-${first.id}`,
            tasks: bt,
            createdAt: first.created_at,
            model: first.model || "unknown",
            summary,
        };
    });
}

function formatBatchAge(ts: number): string {
    const ageS = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (ageS < 60) return `${ageS}s ago`;
    if (ageS < 3600) return `${Math.floor(ageS / 60)}m ago`;
    if (ageS < 86_400) return `${Math.floor(ageS / 3600)}h ago`;
    return `${Math.floor(ageS / 86_400)}d ago`;
}

export default function CandidatesSection({
    shotId,
    tasks,
    activeModel,
    compareSelectedIds,
    onClickThumb,
    onToggleStar,
    onSetLabel,
    onCancel,
    onRetry,
    onReuseBatchParams,
    onOpenCompare,
    resolveUrl,
}: CandidatesSectionProps) {
    const [open, setOpen] = usePanelSectionState(shotId, "candidates", true);
    const [filter, setFilter] = useState<FilterMode>("all");
    const [sort, setSort] = useState<SortMode>("time");

    const filteredTasks = useMemo(() => {
        return tasks.filter((t) => {
            if (filter === "starred" && !t.is_starred) return false;
            if (filter === "this-model" && activeModel && t.model !== activeModel) return false;
            return true;
        });
    }, [tasks, filter, activeModel]);

    const batches = useMemo(() => {
        const out = groupIntoBatches(filteredTasks);
        if (sort === "model") {
            return [...out].sort((a, b) =>
                a.model === b.model
                    ? b.createdAt - a.createdAt
                    : a.model.localeCompare(b.model),
            );
        }
        return [...out].sort((a, b) => b.createdAt - a.createdAt);
    }, [filteredTasks, sort]);

    const totalCount = tasks.length;
    const starredCount = tasks.filter((t) => t.is_starred).length;
    const compareCount = compareSelectedIds.size;

    return (
        <SectionShell
            title={`Candidates (${totalCount})`}
            open={open}
            onToggle={() => setOpen(!open)}
            trailing={
                <>
                    {/* Filter chips */}
                    <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
                        All
                    </FilterChip>
                    <FilterChip
                        active={filter === "starred"}
                        onClick={() => setFilter("starred")}
                    >
                        <Star size={9} aria-hidden="true" fill={filter === "starred" ? "currentColor" : "none"} />
                        {starredCount > 0 ? `${starredCount}` : ""}
                    </FilterChip>
                    {activeModel ? (
                        <FilterChip
                            active={filter === "this-model"}
                            onClick={() => setFilter("this-model")}
                            title={`Show only candidates from ${activeModel}`}
                        >
                            <Film size={9} aria-hidden="true" />
                            this model
                        </FilterChip>
                    ) : null}
                    {/* Sort flipper */}
                    <button
                        type="button"
                        onClick={() => setSort((s) => (s === "time" ? "model" : "time"))}
                        title={`Sort by ${sort === "time" ? "time" : "model"} (click to switch)`}
                        className="btn-tip grid h-6 w-6 place-items-center rounded text-text-muted hover:bg-white/[0.06] hover:text-foreground"
                    >
                        {sort === "time" ? (
                            <Clock size={11} aria-hidden="true" />
                        ) : (
                            <Film size={11} aria-hidden="true" />
                        )}
                    </button>
                </>
            }
        >
            {totalCount === 0 ? (
                <div className="px-2 py-4 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted/85">
                    No candidates yet · click Generate ×N above
                </div>
            ) : batches.length === 0 ? (
                <div className="px-2 py-4 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted/85">
                    No matches under current filter
                </div>
            ) : (
                <div className="space-y-2">
                    {/* Compare button — floats at top when ≥2 selected. */}
                    {compareCount >= 2 ? (
                        <div className="flex items-center justify-between rounded-md border border-amber-300/35 bg-amber-400/[0.08] px-2.5 py-1.5">
                            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-200/95">
                                {compareCount} selected for compare
                            </span>
                            <button
                                type="button"
                                onClick={() => onOpenCompare?.()}
                                disabled={!onOpenCompare}
                                className="inline-flex items-center gap-1 rounded-md bg-amber-300 px-2 py-[3px] font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#141416] transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Compare ×{compareCount} →
                            </button>
                        </div>
                    ) : null}

                    {batches.map((batch, batchIdx) => (
                        <BatchBlock
                            key={batch.id}
                            batch={batch}
                            defaultOpen={batchIdx === 0}
                            compareSelectedIds={compareSelectedIds}
                            resolveUrl={resolveUrl}
                            onClickThumb={onClickThumb}
                            onToggleStar={onToggleStar}
                            onSetLabel={onSetLabel}
                            onCancel={onCancel}
                            onRetry={onRetry}
                            onReuseBatchParams={onReuseBatchParams}
                        />
                    ))}
                </div>
            )}
        </SectionShell>
    );
}

function FilterChip({
    children,
    active,
    onClick,
    title,
}: {
    children: React.ReactNode;
    active: boolean;
    onClick: () => void;
    title?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-[2px] font-mono text-[9px] font-medium uppercase tracking-[0.18em] transition-colors ${
                active
                    ? "border-primary/55 bg-primary/15 text-primary"
                    : "border-white/10 bg-black/20 text-text-muted hover:border-white/20 hover:text-foreground"
            }`}
        >
            {children}
        </button>
    );
}

function BatchBlock({
    batch,
    defaultOpen,
    compareSelectedIds,
    resolveUrl,
    onClickThumb,
    onToggleStar,
    onSetLabel,
    onCancel,
    onRetry,
    onReuseBatchParams,
}: {
    batch: BatchSummary;
    defaultOpen: boolean;
    compareSelectedIds: Set<string>;
    resolveUrl?: (url: string) => string;
    onClickThumb: CandidatesSectionProps["onClickThumb"];
    onToggleStar: CandidatesSectionProps["onToggleStar"];
    onSetLabel: CandidatesSectionProps["onSetLabel"];
    onCancel?: CandidatesSectionProps["onCancel"];
    onRetry?: CandidatesSectionProps["onRetry"];
    onReuseBatchParams?: CandidatesSectionProps["onReuseBatchParams"];
}) {
    const [open, setOpen] = useState(defaultOpen);
    const failedCount = batch.tasks.filter((t) => t.status === "failed").length;
    const runningCount = batch.tasks.filter((t) => t.status === "pending" || t.status === "processing").length;
    const completedCount = batch.tasks.filter((t) => t.status === "completed").length;
    return (
        <div className="rounded-md border border-white/6 bg-black/15">
            <div className="flex items-center gap-2 px-2 py-1.5">
                <button
                    type="button"
                    onClick={() => setOpen(!open)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                    <span className="font-mono text-[9px] tracking-tight text-text-muted/85">
                        {open ? (
                            <ArrowDown size={10} aria-hidden="true" />
                        ) : (
                            <ArrowUp size={10} aria-hidden="true" className="rotate-180" />
                        )}
                    </span>
                    <span className="truncate font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-text-secondary">
                        {batch.tasks.length} take{batch.tasks.length === 1 ? "" : "s"} · {batch.model}
                    </span>
                    <span className="truncate font-mono text-[9px] tracking-tight text-text-muted/85">
                        · {formatBatchAge(batch.createdAt)} · {batch.summary}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                        {runningCount > 0 ? (
                            <span className="font-mono text-[9px] text-blue-200/95">●{runningCount}</span>
                        ) : null}
                        {completedCount > 0 ? (
                            <span className="font-mono text-[9px] text-emerald-300/95">✓{completedCount}</span>
                        ) : null}
                        {failedCount > 0 ? (
                            <span className="font-mono text-[9px] text-red-300/95">✗{failedCount}</span>
                        ) : null}
                    </span>
                </button>
                {onReuseBatchParams ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onReuseBatchParams(batch);
                        }}
                        title="Copy this batch's params to the panel above"
                        className="btn-tip grid h-5 w-5 place-items-center rounded text-text-muted hover:bg-white/[0.06] hover:text-foreground"
                    >
                        <RotateCw size={10} aria-hidden="true" />
                    </button>
                ) : null}
            </div>
            {open ? (
                <div className="flex flex-wrap gap-2 border-t border-white/6 px-2 py-2">
                    {batch.tasks.map((task) => (
                        <CandidateThumb
                            key={task.id}
                            task={task}
                            isCompareSelected={compareSelectedIds.has(task.id)}
                            resolveUrl={resolveUrl}
                            onClick={onClickThumb}
                            onToggleStar={onToggleStar}
                            onSetLabel={onSetLabel}
                            onCancel={onCancel}
                            onRetry={onRetry}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}
