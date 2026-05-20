"use client";
/**
 * ShotPanel — the attached "workbench" that hangs under each shot in
 * the storyboard. Visual treatment (per design grill Q11):
 *   - Indented ~20px from the shot card's left edge (suggests "child of")
 *   - Dashed line connecting the panel's top to the shot card's bottom
 *   - Slightly darker background than the shot card
 *
 * The panel itself is a thin chrome; ParamsSection / T2ISubsection /
 * CandidatesSection compose inside as children. ShotPanel is also
 * the boundary where per-shot collapse state lives — but we
 * intentionally do NOT make the WHOLE panel collapsible; each
 * subsection has its own toggle so users can keep params open while
 * collapsing candidates and vice versa (per grill Q11 X).
 *
 * Why no outer toggle: with attached panels under every shot in a
 * long storyboard, having "params + candidates" share one toggle
 * would force users to expand/collapse a chunky bundle every time
 * they wanted to peek at just one half. Independent toggles per
 * subsection keep the affordance precise.
 */
import type { ReactNode } from "react";

interface ShotPanelProps {
    children: ReactNode;
}

export default function ShotPanel({ children }: ShotPanelProps) {
    return (
        <div className="ml-5 mt-1 mr-1 relative">
            {/* Dashed connector from shot card bottom to panel top — sits in
                the indent gutter. ~20px tall stub, dashed for the "supplementary,
                not core" visual register. */}
            <span
                aria-hidden="true"
                className="absolute -top-2 left-3 h-3 border-l border-dashed border-white/15"
            />
            <span
                aria-hidden="true"
                className="absolute top-1 left-3 h-px w-2 border-t border-dashed border-white/15"
            />
            <div className="rounded-lg border border-white/[0.04] bg-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                {children}
            </div>
        </div>
    );
}
