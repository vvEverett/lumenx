"use client";

import { useState, useEffect } from "react";
import { Play, Pause, Volume2, Music, Mic, Video, Sliders } from "lucide-react";
import { useTranslations } from "next-intl";
import { useProjectStore } from "@/store/projectStore";
import { getAssetUrl } from "@/lib/utils";

export default function FinalMixStudio() {
    const currentProject = useProjectStore((state) => state.currentProject);
    const ta = useTranslations("artDirection");
    const tp = useTranslations("pipeline");

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [zoom, setZoom] = useState(1);

    // Track Volumes
    const [volumes, setVolumes] = useState({
        video: 1.0,
        voice: 1.0,
        sfx: 0.8,
        bgm: 0.5
    });

    // Mock Timeline Data based on project frames
    const frames = currentProject?.frames || [];
    const totalDuration = frames.length * 5; // Assume 5s per frame for now

    useEffect(() => {
        setDuration(totalDuration);
    }, [frames]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying) {
            interval = setInterval(() => {
                setCurrentTime(prev => {
                    if (prev >= duration) {
                        setIsPlaying(false);
                        return 0;
                    }
                    return prev + 0.1;
                });
            }, 100);
        }
        return () => clearInterval(interval);
    }, [isPlaying, duration]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex flex-col h-full text-foreground">
            {/* Top Bar: Preview & Mixer */}
            <div className="flex-1 flex border-b border-glass-border min-h-0">
                {/* Preview Window */}
                <div className="flex-1 bg-surface flex items-center justify-center relative p-8">
                    <div className="aspect-video bg-surface border border-glass-border rounded-lg w-full max-w-4xl flex items-center justify-center relative overflow-hidden shadow-lg">
                        {/* Mock Video Player */}
                        <div className="text-text-muted flex flex-col items-center gap-4">
                            <Video size={48} className="opacity-20" />
                            <div className="font-mono text-xl text-foreground/50">{formatTime(currentTime)}</div>
                        </div>

                        {/* Overlay Current Frame Info */}
                        <div className="absolute bottom-4 left-4 bg-surface/50 px-3 py-1 rounded text-xs backdrop-blur-sm">
                            Frame {Math.floor(currentTime / 5) + 1}
                        </div>
                    </div>
                </div>

                {/* Mixer Panel */}
                <div className="w-80 bg-surface border-l border-glass-border flex flex-col">
                    <div className="p-4 border-b border-glass-border">
                        <h3 className="font-display font-bold text-sm flex items-center gap-2">
                            <Sliders size={16} className="text-primary" /> Audio Mixer
                            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-medium ml-2">{tp("beta")}</span>
                        </h3>
                    </div>
                    <div className="p-6 space-y-8">
                        {/* Track Controls */}
                        {[
                            { id: 'video', label: 'Video Audio', icon: <Video size={16} /> },
                            { id: 'voice', label: 'Dialogue', icon: <Mic size={16} /> },
                            { id: 'sfx', label: 'SFX', icon: <Volume2 size={16} /> },
                            { id: 'bgm', label: 'Music', icon: <Music size={16} /> },
                        ].map(track => (
                            <div key={track.id} className="space-y-2">
                                <div className="flex justify-between text-xs text-text-secondary">
                                    <span className="flex items-center gap-2">{track.icon} {track.label}</span>
                                    <span>{Math.round(volumes[track.id as keyof typeof volumes] * 100)}%</span>
                                </div>
                                <input
                                    type="range" min="0" max="1" step="0.01"
                                    value={volumes[track.id as keyof typeof volumes]}
                                    onChange={(e) => setVolumes(prev => ({ ...prev, [track.id]: parseFloat(e.target.value) }))}
                                    className="w-full h-1 bg-hover-bg rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                                />
                                {/* Pan Control Mock */}
                                <div className="flex items-center gap-2 text-[10px] text-text-muted">
                                    <span>L</span>
                                    <div className="flex-1 h-0.5 bg-glass relative">
                                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-gray-500 rounded-full" />
                                    </div>
                                    <span>R</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-auto p-4 border-t border-glass-border">
                        <p className="text-[11px] text-text-muted text-center leading-relaxed">
                            {ta("audioMixerFuture")}
                        </p>
                    </div>
                </div>
            </div>

            {/* Bottom: Multi-track Timeline */}
            <div className="h-72 bg-surface border-t border-glass-border flex flex-col">
                {/* Timeline Toolbar */}
                <div className="h-10 border-b border-border-subtle flex items-center px-4 justify-between bg-surface">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="w-8 h-8 rounded-full bg-hover-bg hover:bg-hover-bg flex items-center justify-center text-foreground transition-colors"
                        >
                            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <span className="font-mono text-xs text-text-secondary ml-2">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} className="text-text-muted hover:text-foreground">-</button>
                        <span className="text-xs text-text-muted">Zoom</span>
                        <button onClick={() => setZoom(Math.min(2, zoom + 0.1))} className="text-text-muted hover:text-foreground">+</button>
                    </div>
                </div>

                {/* Tracks Container */}
                <div
                    className="flex-1 overflow-x-auto overflow-y-hidden relative custom-scrollbar cursor-pointer"
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const percent = x / rect.width; // This is rough because of scroll
                        // Better: use scrollLeft
                        const scrollLeft = e.currentTarget.scrollLeft;
                        const totalWidth = e.currentTarget.scrollWidth;
                        const clickX = x + scrollLeft;
                        const newTime = (clickX / totalWidth) * duration;
                        setCurrentTime(Math.max(0, Math.min(newTime, duration)));
                    }}
                >
                    <div className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none" style={{ left: `${(currentTime / duration) * 100}%` }} />

                    <div className="min-w-full h-full flex flex-col" style={{ width: `${100 * zoom}%` }}>
                        {/* Video Track */}
                        <div className="h-16 border-b border-border-subtle bg-glass relative flex items-center px-2 group">
                            <div className="absolute left-0 top-0 bottom-0 w-24 bg-glass z-10 flex items-center justify-center border-r border-border-subtle text-xs font-bold text-text-muted">
                                Video
                            </div>
                            <div className="ml-24 flex-1 flex gap-1 h-12">
                                {frames.map((frame, i) => (
                                    <div key={frame.id} className="flex-1 bg-blue-900/30 border border-blue-500/30 rounded overflow-hidden relative group-hover:brightness-110 transition-all">
                                        {frame.image_url && <img src={getAssetUrl(frame.image_url)} className="w-full h-full object-cover opacity-50" />}
                                        <div className="absolute bottom-1 left-1 text-[10px] text-blue-200">Shot {i + 1}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Dialogue Track */}
                        <div className="h-12 border-b border-border-subtle bg-glass relative flex items-center px-2">
                            <div className="absolute left-0 top-0 bottom-0 w-24 bg-glass z-10 flex items-center justify-center border-r border-border-subtle text-xs font-bold text-text-muted">
                                Dialogue
                            </div>
                            <div className="ml-24 flex-1 flex gap-1 h-8">
                                {frames.map((frame) => (
                                    <div key={frame.id} className="flex-1 relative">
                                        {frame.audio_url && (
                                            <div className="absolute left-2 right-2 top-1 bottom-1 bg-green-900/40 border border-green-500/40 rounded flex items-center justify-center">
                                                <div className="w-full h-full flex items-center gap-0.5 px-2 overflow-hidden">
                                                    {[...Array(10)].map((_, i) => (
                                                        <div key={i} className="w-1 bg-green-500/50 rounded-full" style={{ height: `${Math.random() * 100}%` }} />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* SFX Track */}
                        <div className="h-12 border-b border-border-subtle bg-glass relative flex items-center px-2">
                            <div className="absolute left-0 top-0 bottom-0 w-24 bg-glass z-10 flex items-center justify-center border-r border-border-subtle text-xs font-bold text-text-muted">
                                SFX
                            </div>
                            <div className="ml-24 flex-1 flex gap-1 h-8">
                                {frames.map((frame) => (
                                    <div key={frame.id} className="flex-1 relative">
                                        {frame.sfx_url && (
                                            <div className="absolute left-4 right-8 top-1 bottom-1 bg-yellow-900/40 border border-yellow-500/40 rounded flex items-center justify-center">
                                                <span className="text-[9px] text-yellow-500 truncate px-1">SFX: {frame.action_description?.slice(0, 10)}...</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* BGM Track */}
                        <div className="h-12 border-b border-border-subtle bg-glass relative flex items-center px-2">
                            <div className="absolute left-0 top-0 bottom-0 w-24 bg-glass z-10 flex items-center justify-center border-r border-border-subtle text-xs font-bold text-text-muted">
                                BGM
                            </div>
                            <div className="ml-24 flex-1 h-8 relative">
                                {frames.length > 0 && (
                                    <div className="absolute left-0 right-0 top-1 bottom-1 bg-purple-900/40 border border-purple-500/40 rounded mx-1 flex items-center px-4">
                                        <Music size={12} className="text-purple-400 mr-2" />
                                        <span className="text-[10px] text-purple-300">Cinematic Tension BGM</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
