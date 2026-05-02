"use client";

import { useState } from "react";
import { Download, Film, CheckCircle, FileVideo, Monitor, Captions } from "lucide-react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { useProjectStore } from "@/store/projectStore";
import { api } from "@/lib/api";
import { getAssetUrl } from "@/lib/utils";

export default function ExportStudio() {
    const tv = useTranslations("video");
    const currentProject = useProjectStore((state) => state.currentProject);

    const [isExporting, setIsExporting] = useState(false);
    const [exportUrl, setExportUrl] = useState<string | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);

    // Config State
    const [resolution, setResolution] = useState("1080p");
    const [format, setFormat] = useState("mp4");
    const [subtitles, setSubtitles] = useState("burn-in");

    // If project already has a merged video, show it immediately
    const effectiveUrl = exportUrl || currentProject?.merged_video_url || null;

    const handleExport = async () => {
        if (!currentProject) return;
        setIsExporting(true);
        setExportUrl(null);
        setExportError(null);

        try {
            const result = await api.exportProject(currentProject.id, { resolution, format, subtitles });
            setExportUrl(result.url);
        } catch (error: any) {
            console.error("Export failed:", error);
            setExportError(error?.message || tv("exportFailed"));
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="flex h-full text-foreground">
            {/* Left: Configuration */}
            <div className="w-96 border-r border-glass-border bg-surface p-8 flex flex-col">
                <h2 className="text-2xl font-display font-bold mb-8 flex items-center gap-3">
                    <Film className="text-primary" /> {tv("exportStudio")}
                </h2>

                <div className="space-y-8 flex-1">
                    {/* Resolution */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-text-secondary flex items-center gap-2">
                            <Monitor size={16} /> {tv("resolution")}
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            {["1080p", "4K"].map(res => (
                                <button
                                    key={res}
                                    onClick={() => setResolution(res)}
                                    className={clsx(
                                        "py-3 px-4 rounded-xl border text-sm font-bold transition-all",
                                        resolution === res
                                            ? "bg-primary text-foreground border-primary shadow-lg shadow-primary/20"
                                            : "bg-surface border-glass-border text-text-secondary hover:bg-hover-bg"
                                    )}
                                >
                                    {res}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Format */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-text-secondary flex items-center gap-2">
                            <FileVideo size={16} /> {tv("format")}
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                            {["mp4", "mov", "gif"].map(fmt => (
                                <button
                                    key={fmt}
                                    onClick={() => setFormat(fmt)}
                                    className={clsx(
                                        "py-3 px-4 rounded-xl border text-sm font-bold uppercase transition-all",
                                        format === fmt
                                            ? "bg-primary text-foreground border-primary shadow-lg shadow-primary/20"
                                            : "bg-glass border-glass-border text-text-secondary hover:bg-hover-bg"
                                    )}
                                >
                                    {fmt}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Subtitles */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-text-secondary flex items-center gap-2">
                            <Captions size={16} /> {tv("subtitles")}
                        </label>
                        <div className="space-y-2">
                            {[
                                { id: "burn-in", label: tv("burnIn") },
                                { id: "srt", label: tv("exportSrt") },
                                { id: "none", label: tv("none") }
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setSubtitles(opt.id)}
                                    className={clsx(
                                        "w-full py-3 px-4 rounded-xl border text-sm font-medium text-left transition-all",
                                        subtitles === opt.id
                                            ? "bg-primary text-foreground border-primary shadow-lg shadow-primary/20"
                                            : "bg-surface border-glass-border text-text-secondary hover:bg-hover-bg"
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-foreground py-4 rounded-xl font-bold text-lg shadow-xl shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-8"
                >
                    {isExporting ? tv("rendering") : tv("startRender")}
                </button>
            </div>

            {/* Right: Preview & Status */}
            <div className="flex-1 flex items-center justify-center relative overflow-hidden">
                {/* Background Glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-purple-600/10 pointer-events-none" />

                <div className="w-full max-w-2xl p-8 text-center space-y-8 relative z-10">
                    {isExporting ? (
                        <div className="bg-surface backdrop-blur-xl border border-glass-border rounded-2xl p-12 shadow-lg">
                            <div className="w-24 h-24 border-4 border-glass-border border-t-primary rounded-full animate-spin mx-auto mb-8" />
                            <h3 className="text-2xl font-bold mb-2 text-foreground">{tv("renderingTitle")}</h3>
                            <p className="text-text-secondary">{tv("renderingDesc")}</p>
                        </div>
                    ) : exportError ? (
                        <div className="bg-overlay backdrop-blur-xl border border-red-500/30 rounded-2xl p-12 shadow-lg shadow-red-900/20">
                            <div className="w-20 h-20 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Film size={40} />
                            </div>
                            <h3 className="text-2xl font-bold mb-2 text-foreground">{tv("exportFailed")}</h3>
                            <p className="text-text-secondary mb-4">{exportError}</p>
                            <button
                                onClick={handleExport}
                                className="inline-flex items-center gap-2 bg-hover-bg hover:bg-hover-bg text-foreground px-6 py-3 rounded-xl font-bold transition-colors"
                            >
                                {tv("retry")}
                            </button>
                        </div>
                    ) : effectiveUrl ? (
                        <div className="bg-surface border border-green-500/30 rounded-2xl p-12 shadow-lg shadow-green-900/20">
                            <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle size={40} />
                            </div>
                            <h3 className="text-2xl font-bold mb-2 text-foreground">{tv("exportComplete")}</h3>
                            <p className="text-text-secondary mb-8">{tv("exportReadyDesc")}</p>

                            <a
                                href={getAssetUrl(effectiveUrl)}
                                target="_blank"
                                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 text-foreground px-8 py-4 rounded-xl font-bold text-lg transition-colors shadow-lg shadow-green-600/20"
                            >
                                <Download size={20} /> {tv("downloadVideo")}
                            </a>
                        </div>
                    ) : (
                        <div className="opacity-50">
                            <Film size={64} className="mx-auto mb-4 text-text-muted" />
                            <p className="text-text-muted">{tv("exportHint")}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
