/**
 * Per-shot per-section collapse state with localStorage persistence.
 * Keys are namespaced "storyboard-shot-panel:{shotId}:{section}" so
 * multiple projects don't collide and each shot keeps its own
 * expanded/collapsed memory across page reloads.
 *
 * Default open is the caller's choice — for params panel we open by
 * default; for individual subsections (Advanced, batch history) we
 * default collapsed.
 */
import { useCallback, useEffect, useState } from "react";

function key(shotId: string, section: string): string {
    return `storyboard-shot-panel:${shotId}:${section}`;
}

function readState(shotId: string, section: string, defaultOpen: boolean): boolean {
    if (typeof window === "undefined") return defaultOpen;
    try {
        const raw = window.localStorage.getItem(key(shotId, section));
        if (raw === "1") return true;
        if (raw === "0") return false;
    } catch {
        /* private mode / quota */
    }
    return defaultOpen;
}

export function usePanelSectionState(
    shotId: string,
    section: string,
    defaultOpen: boolean,
): [boolean, (next: boolean) => void] {
    const [open, setOpen] = useState<boolean>(() => readState(shotId, section, defaultOpen));

    // Re-hydrate when shotId changes (e.g. user duplicates a shot —
    // new shot inherits its own default until they interact).
    useEffect(() => {
        setOpen(readState(shotId, section, defaultOpen));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shotId, section]);

    const set = useCallback((next: boolean) => {
        setOpen(next);
        if (typeof window === "undefined") return;
        try {
            window.localStorage.setItem(key(shotId, section), next ? "1" : "0");
        } catch {
            /* ignore */
        }
    }, [shotId, section]);

    return [open, set];
}
