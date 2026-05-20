"use client";
/**
 * TaskQueueButton — toolbar icon with in-flight count badge. Sits in
 * Storyboard's top toolbar; clicking opens the TaskQueuePanel.
 */
import { ListChecks } from "lucide-react";

interface TaskQueueButtonProps {
    inFlightCount: number;
    open: boolean;
    onToggle: () => void;
}

export default function TaskQueueButton({ inFlightCount, open, onToggle }: TaskQueueButtonProps) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={open}
            title={`${inFlightCount} task${inFlightCount === 1 ? "" : "s"} in flight`}
            className={`relative inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.22em] transition-colors ${
                open
                    ? "border-primary/45 bg-primary/15 text-primary"
                    : "border-white/10 bg-black/20 text-text-secondary hover:border-white/20 hover:text-foreground"
            }`}
        >
            <ListChecks size={13} aria-hidden="true" />
            Queue
            {inFlightCount > 0 ? (
                <span className="ml-1 rounded-full bg-amber-300/85 px-1.5 font-display text-[10px] tabular-nums text-[#141416]">
                    {inFlightCount}
                </span>
            ) : null}
        </button>
    );
}
