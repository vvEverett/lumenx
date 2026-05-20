"use client";
/**
 * SectionShell — collapsible container used by every subsection
 * inside the attached ShotPanel (Params / Candidates / Advanced).
 * Standardizes the header ▼/▶ toggle, title typography, optional
 * trailing slot (filter chips, summary count), and collapsed-state
 * spacing so the whole panel reads as a coherent unit instead of
 * a pile of bespoke headers.
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface SectionShellProps {
    title: ReactNode;
    open: boolean;
    onToggle: () => void;
    /** Right side of the header — chips, counts, action buttons.
     *  Clicks bubble independently of the toggle. */
    trailing?: ReactNode;
    /** Body is rendered only when open; allows expensive children to
     *  skip mounting until needed. */
    children: ReactNode;
    /** Optional muted one-liner under the title (e.g. metadata). */
    subtitle?: ReactNode;
    /** Override the chevron-only header with a custom layout when
     *  needed (e.g. for the Active-T2I row which has a thumb strip
     *  always visible alongside the toggle). */
    headerOverride?: ReactNode;
}

export default function SectionShell({
    title,
    open,
    onToggle,
    trailing,
    children,
    subtitle,
    headerOverride,
}: SectionShellProps) {
    return (
        <div className="border-b border-white/[0.04] last:border-b-0">
            {headerOverride ?? (
                <div className="flex items-center gap-2 px-3 py-2">
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-expanded={open}
                        className="grid h-5 w-5 place-items-center rounded text-text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground"
                    >
                        {open ? (
                            <ChevronDown size={13} aria-hidden="true" />
                        ) : (
                            <ChevronRight size={13} aria-hidden="true" />
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onToggle}
                        className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
                    >
                        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-text-secondary/95">
                            {title}
                        </span>
                        {subtitle ? (
                            <span className="truncate font-mono text-[9px] tracking-tight text-text-muted/80">
                                {subtitle}
                            </span>
                        ) : null}
                    </button>
                    {trailing ? (
                        <div className="flex shrink-0 items-center gap-1">{trailing}</div>
                    ) : null}
                </div>
            )}
            {open ? <div className="px-3 pb-3">{children}</div> : null}
        </div>
    );
}
