"use client";
/**
 * CompareModal — side-by-side video comparison for 2-4 candidates.
 * Per grill Q9:
 *   - Portal to document.body (escape transformed ancestors)
 *   - Up to 4 videos (1×2 / 1×3 / 2×2 grid auto)
 *   - Default sync playback: one master timeline drives all videos
 *   - Default muted; "Solo (S)" cycles which video is unmuted
 *   - "Independent" toggle: each video plays on its own timeline
 *   - ESC closes
 *
 * The point of compare is精筛: spot the difference between two takes
 * the user can't quite distinguish at thumbnail size. Sync playback
 * is the core value-add — letting them see "action vs camera vs
 * lighting" at identical frame numbers.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, Pause, X, Volume2, VolumeX, Lock, Unlock } from "lucide-react";
import type { VideoTask } from "@/lib/api";

interface CompareModalProps {
    tasks: VideoTask[];
    onClose: () => void;
    resolveUrl?: (url: string) => string;
}

export default function CompareModal({ tasks, onClose, resolveUrl }: CompareModalProps) {
    const display = (u?: string | null) => (u && resolveUrl ? resolveUrl(u) : u ?? undefined);
    const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [sync, setSync] = useState(true);
    const [soloIndex, setSoloIndex] = useState<number | null>(null);
    const [progress, setProgress] = useState(0); // 0-1, master clock

    // Cap at 4. Anything more got truncated before opening.
    const slots = tasks.slice(0, 4);
    const gridClass =
        slots.length === 1
            ? "grid-cols-1"
            : slots.length === 2
                ? "grid-cols-2"
                : "grid-cols-2 grid-rows-2";

    // Master clock — in sync mode we read the first video's currentTime
    // and push it to the others. Cheap loop with rAF.
    useEffect(() => {
        if (!sync) return;
        let raf = 0;
        const tick = () => {
            const master = videoRefs.current[0];
            if (master && master.duration) {
                setProgress(master.currentTime / master.duration);
                // Push to followers within 50ms tolerance to avoid micro-stutter.
                for (let i = 1; i < videoRefs.current.length; i++) {
                    const v = videoRefs.current[i];
                    if (!v) continue;
                    if (Math.abs(v.currentTime - master.currentTime) > 0.05) {
                        try { v.currentTime = master.currentTime; } catch { /* seek may fail until metadata loads */ }
                    }
                }
            }
            raf = window.requestAnimationFrame(tick);
        };
        raf = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(raf);
    }, [sync]);

    // Esc to close, Space to play/pause, S to cycle solo.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            } else if (e.key === " ") {
                e.preventDefault();
                togglePlay();
            } else if (e.key.toLowerCase() === "s") {
                e.preventDefault();
                cycleSolo();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slots.length, soloIndex]);

    const togglePlay = () => {
        const next = !isPlaying;
        setIsPlaying(next);
        for (const v of videoRefs.current) {
            if (!v) continue;
            if (next) {
                v.play().catch(() => { /* autoplay may be blocked */ });
            } else {
                v.pause();
            }
        }
    };

    const cycleSolo = () => {
        if (slots.length === 0) return;
        setSoloIndex((cur) => {
            if (cur === null) return 0;
            if (cur + 1 >= slots.length) return null;
            return cur + 1;
        });
    };

    const seekTo = (frac: number) => {
        for (const v of videoRefs.current) {
            if (!v?.duration) continue;
            try { v.currentTime = frac * v.duration; } catch { /* ignore */ }
        }
        setProgress(frac);
    };

    if (typeof window === "undefined") return null;

    const modal = (
        <>
            <div
                aria-hidden="true"
                className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm"
                onClick={onClose}
            />
            <div
                role="dialog"
                aria-label="Compare candidates"
                className="fixed left-1/2 top-1/2 z-[61] flex h-[88vh] w-[min(1200px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[12px] border border-white/10 bg-[#0a0a10] shadow-[0_24px_60px_-22px_rgba(0,0,0,0.9)]"
            >
                {/* Header */}
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <div className="font-display text-[14px] font-medium tracking-[-0.005em] text-foreground">
                            Compare {slots.length} candidates
                        </div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted/85">
                            {sync ? "synced" : "independent"} · {soloIndex === null ? "all muted" : `solo #${soloIndex + 1}`}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setSync(!sync)}
                            title={sync ? "Switch to independent timelines" : "Sync timelines"}
                            className="btn-tip inline-flex h-7 items-center gap-1 rounded px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary hover:bg-white/[0.06] hover:text-foreground"
                        >
                            {sync ? <Lock size={11} aria-hidden="true" /> : <Unlock size={11} aria-hidden="true" />}
                            {sync ? "Synced" : "Indep."}
                        </button>
                        <button
                            type="button"
                            onClick={cycleSolo}
                            title="Cycle solo audio (S)"
                            className="btn-tip inline-flex h-7 items-center gap-1 rounded px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary hover:bg-white/[0.06] hover:text-foreground"
                        >
                            {soloIndex === null ? (
                                <VolumeX size={11} aria-hidden="true" />
                            ) : (
                                <Volume2 size={11} aria-hidden="true" />
                            )}
                            {soloIndex === null ? "Mute" : `Solo ${soloIndex + 1}`}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="grid h-7 w-7 place-items-center rounded text-text-muted hover:bg-white/[0.06] hover:text-foreground"
                        >
                            <X size={14} aria-hidden="true" />
                        </button>
                    </div>
                </header>

                {/* Grid */}
                <div className={`grid flex-1 gap-2 overflow-hidden p-3 ${gridClass}`}>
                    {slots.map((task, i) => {
                        const url = display(task.video_url);
                        return (
                            <div
                                key={task.id}
                                className="relative overflow-hidden rounded-md border border-white/8 bg-black"
                            >
                                {url ? (
                                    <video
                                        ref={(el) => { videoRefs.current[i] = el; }}
                                        src={url}
                                        muted={soloIndex !== i}
                                        loop
                                        playsInline
                                        className="h-full w-full object-contain"
                                    />
                                ) : (
                                    <div className="grid h-full w-full place-items-center font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted/65">
                                        no video url
                                    </div>
                                )}
                                <div className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded bg-black/65 px-1.5 py-[2px] font-mono text-[9px] uppercase tracking-[0.22em] text-white/95">
                                    #{i + 1}
                                    <span className="text-white/55">·</span>
                                    <span className="text-white/85">{task.model || "?"}</span>
                                    {task.is_starred ? (
                                        <span className="text-amber-200">★</span>
                                    ) : null}
                                </div>
                                {task.label ? (
                                    <div className="absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-[2px] font-mono text-[10px] text-white/95">
                                        {task.label}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>

                {/* Footer controls */}
                <footer className="flex shrink-0 items-center gap-3 border-t border-white/8 px-4 py-3">
                    <button
                        type="button"
                        onClick={togglePlay}
                        aria-label={isPlaying ? "Pause" : "Play"}
                        className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-foreground hover:bg-white/15"
                    >
                        {isPlaying ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                    </button>
                    {sync ? (
                        <input
                            type="range"
                            min={0}
                            max={1000}
                            value={Math.round(progress * 1000)}
                            onChange={(e) => seekTo(parseInt(e.target.value, 10) / 1000)}
                            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-primary"
                        />
                    ) : (
                        <div className="flex-1 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted/85">
                            Independent timelines · each video controls itself
                        </div>
                    )}
                    <div className="font-mono text-[10px] tracking-tight text-text-muted/85">
                        Space play/pause · S solo · Esc close
                    </div>
                </footer>
            </div>
        </>
    );

    return createPortal(modal, document.body);
}
