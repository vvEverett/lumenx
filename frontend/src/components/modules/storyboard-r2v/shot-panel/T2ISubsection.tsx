"use client";
/**
 * T2ISubsection — compact T2I 抽卡 unit inside the I2V tab's
 * ParamsSection. Layout per design grill Q13:
 *
 *   ┌─ T2I 首帧 ─────────────────────────────────────┐
 *   │ ┌────────┐  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐         │
 *   │ │ ACTIVE │  │○ ││○ ││● ││○ ││○ ││+ │         │
 *   │ │ 首帧   │  │  ││  ││  ││  ││  ││gn│         │
 *   │ └────────┘  └──┘└──┘└──┘└──┘└──┘└──┘         │
 *   │  ~120px      ~60px thumbs, hover×, click→active │
 *   └─────────────────────────────────────────────────┘
 *
 * Design rules:
 *   - Active首帧 = the one used as input for I2V下游
 *   - Click any thumb → it becomes active (single-select radio)
 *   - Hover a thumb → small ✕ in corner → click to delete
 *   - Last tile is "+ gen" — triggers Generate T2I, new image
 *     appended + auto-active
 *   - No ★, no label, no batch grouping, no compare (T2I is
 *     supporting role per user)
 *   - Cap at T2I_HISTORY_LIMIT (10) FIFO so localStorage doesn't
 *     accrete forever
 */
import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { PendingTaskAffordance } from "@/components/shared/PendingTaskAffordance";

interface T2ISubsectionProps {
    imageUrls: string[];
    selectedIndex: number;
    /** True while a T2I generation is in flight — disables Generate
     *  to prevent stacking. Spinner shows in the "+gen" tile slot. */
    generating: boolean;
    /** Optional: task id of the most recent in-flight T2I task,
     *  surfaced to the inline PendingTaskAffordance for diagnose UX. */
    inFlightTaskId?: string;
    /** "pending" or "processing" — drives the spinner state. Falsy
     *  means no active task. */
    inFlightStatus?: "pending" | "processing" | "completed" | "failed";
    onSelect: (index: number) => void;
    onRemove: (index: number) => void;
    onGenerate: () => void;
    /** Optional: resolve a URL to display-ready form (some URLs are
     *  relative paths needing asset prefix). Passed in by host so
     *  this component stays free of /lib/utils import. */
    resolveUrl?: (url: string) => string;
}

export default function T2ISubsection({
    imageUrls,
    selectedIndex,
    generating,
    inFlightTaskId,
    inFlightStatus,
    onSelect,
    onRemove,
    onGenerate,
    resolveUrl,
}: T2ISubsectionProps) {
    const safeIndex = imageUrls.length === 0
        ? 0
        : Math.max(0, Math.min(selectedIndex, imageUrls.length - 1));
    const activeUrl = imageUrls[safeIndex];
    const display = (u: string) => (resolveUrl ? resolveUrl(u) : u);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    return (
        <div className="space-y-2">
            <div className="flex items-start gap-3">
                {/* Active首帧 large preview */}
                <div className="relative h-[90px] w-[120px] shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/40">
                    {activeUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={display(activeUrl)}
                            alt="Active T2I首帧"
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        <div className="grid h-full w-full place-items-center font-mono text-[9px] uppercase tracking-[0.22em] text-text-muted/65">
                            no T2I yet
                        </div>
                    )}
                    {/* If inflight + no current active, overlay diagnose
                        affordance on the placeholder */}
                    {generating && !activeUrl ? (
                        <div className="absolute inset-0 grid place-items-center bg-black/65 backdrop-blur-[1px]">
                            <PendingTaskAffordance
                                statusLabel={inFlightStatus === "pending" ? "Queued" : "Generating"}
                                taskId={inFlightTaskId}
                                compact
                            />
                        </div>
                    ) : null}
                </div>

                {/* Thumbnail strip */}
                <div className="flex flex-1 flex-wrap items-start gap-1.5">
                    {imageUrls.map((url, idx) => {
                        const active = idx === safeIndex;
                        return (
                            <button
                                key={`${url}-${idx}`}
                                type="button"
                                onMouseEnter={() => setHoveredIdx(idx)}
                                onMouseLeave={() => setHoveredIdx((cur) => (cur === idx ? null : cur))}
                                onClick={() => onSelect(idx)}
                                className={`group relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded border transition-all ${
                                    active
                                        ? "border-primary/65 ring-1 ring-primary/35"
                                        : "border-white/10 hover:border-white/25"
                                }`}
                                title={active ? "Active首帧" : "Click to make active"}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={display(url)}
                                    alt={`T2I候选 ${idx + 1}`}
                                    className={`h-full w-full object-cover transition-opacity ${
                                        active ? "" : "opacity-65 group-hover:opacity-100"
                                    }`}
                                />
                                {active ? (
                                    <span
                                        aria-hidden="true"
                                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary"
                                    />
                                ) : null}
                                {/* Hover × in corner — clicks delete this candidate. */}
                                {hoveredIdx === idx ? (
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        aria-label="Delete T2I候选"
                                        title="Delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemove(idx);
                                        }}
                                        className="absolute right-0.5 top-0.5 grid h-4 w-4 cursor-pointer place-items-center rounded-full bg-black/75 text-white/95 transition-colors hover:bg-red-500/85"
                                    >
                                        <X size={9} aria-hidden="true" />
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}

                    {/* +gen tile */}
                    <button
                        type="button"
                        onClick={onGenerate}
                        disabled={generating}
                        className="grid h-[60px] w-[60px] shrink-0 place-items-center rounded border border-dashed border-white/15 bg-black/20 text-text-muted transition-colors hover:border-primary/45 hover:text-primary disabled:cursor-wait disabled:opacity-60"
                        title="Generate new T2I候选"
                    >
                        {generating ? (
                            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        ) : (
                            <Plus size={16} aria-hidden="true" />
                        )}
                    </button>
                </div>
            </div>

            {/* Metadata line */}
            {activeUrl ? (
                <div className="px-1 font-mono text-[9px] tracking-tight text-text-muted/80">
                    Active: thumb-{safeIndex + 1} of {imageUrls.length}
                    {imageUrls.length >= 10 ? (
                        <span className="ml-2 text-amber-200/80">· history at cap (10), oldest dropped on next gen</span>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
