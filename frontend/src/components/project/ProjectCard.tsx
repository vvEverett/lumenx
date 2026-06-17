"use client";

import { motion } from "framer-motion";
import { Play, Trash2, Film, Clock, FileText, MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { Project } from "@/store/projectStore";
import { useSettingsStore } from "@/store/settingsStore";
import { getAssetUrl } from "@/lib/utils";

interface ProjectCardProps {
    project: Project;
    onDelete: (id: string) => void;
}

export type DerivedStatus = "completed" | "processing" | "pending";

// Derive a cover image from the project's frames / scenes. The backend has no
// dedicated cover field, so we fall back through the richest available source.
function deriveCover(project: Project): string | undefined {
    const frames = (project.frames || []) as Array<Record<string, any>>;
    for (const f of frames) {
        const direct = f?.rendered_image_url || f?.image_url;
        if (direct) return getAssetUrl(direct);
        const variants = f?.rendered_image_asset?.variants || f?.image_asset?.variants;
        if (variants?.length) {
            const sel = variants.find((v: any) => v.id === (f?.rendered_image_asset?.selected_id || f?.image_asset?.selected_id));
            const url = sel?.url || variants[0]?.url;
            if (url) return getAssetUrl(url);
        }
    }
    for (const s of (project.scenes || []) as Array<Record<string, any>>) {
        if (s?.image_url) return getAssetUrl(s.image_url);
        const variants = s?.image_asset?.variants;
        if (variants?.length) {
            const url = variants[0]?.url;
            if (url) return getAssetUrl(url);
        }
    }
    return undefined;
}

// Status is absent on the data model, so derive a coarse lifecycle state:
// a merged video => completed; rendered frames present => processing; else draft.
export function deriveStatus(project: Project): DerivedStatus {
    if (project.merged_video_url) return "completed";
    const frames = (project.frames || []) as Array<Record<string, any>>;
    const rendered = frames.some((f) => f?.rendered_image_url || f?.image_url);
    if (rendered) return "processing";
    return "pending";
}

export default function ProjectCard({ project, onDelete }: ProjectCardProps) {
    const t = useTranslations("project");
    const locale = useSettingsStore((s) => s.locale);

    const cover = deriveCover(project);
    const status = deriveStatus(project);
    const frameCount = project.frames?.length || 0;
    const isFeatured = status === "completed";

    const handleOpen = () => {
        window.location.hash = `#/project/${project.id}`;
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm(t("confirmDelete", { title: project.title }))) {
            onDelete(project.id);
        }
    };

    const badge = {
        completed: { label: t("statusCompleted"), cls: "text-status-completed-fg bg-status-completed-bg border-status-completed-border" },
        processing: { label: t("statusProcessing"), cls: "text-status-processing-fg bg-status-processing-bg border-status-processing-border" },
        pending: { label: t("statusDraft"), cls: "text-status-pending-fg bg-status-pending-bg border-status-pending-border" },
    }[status];

    const rawCreated = (project as any).created_at;
    const dateMs = project.createdAt
        ? new Date(project.createdAt).getTime()
        : typeof rawCreated === "number"
            ? rawCreated * 1000
            : NaN;
    const dateStr = Number.isFinite(dateMs)
        ? new Date(dateMs).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US")
        : "";

    return (
        <motion.article
            whileHover={{ scale: 1.005 }}
            className={`glass-panel atelier-proj-card ${isFeatured ? "atelier-proj-featured" : ""} group relative rounded-2xl overflow-hidden cursor-pointer border border-glass-border`}
            onClick={handleOpen}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                // Only activate when the keydown originates on the card itself,
                // not on a nested control (delete/more), whose Enter/Space would
                // otherwise bubble here and trigger navigation.
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                    if (e.key === " ") e.preventDefault(); // avoid page scroll on Space
                    handleOpen();
                }
            }}
        >
            {/* Thumbnail */}
            <div className="relative aspect-[16/10] overflow-hidden bg-surface-inset">
                {cover ? (
                    <img
                        src={cover}
                        alt={project.title}
                        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-muted">
                        <FileText size={32} />
                    </div>
                )}
                {/* Gradient legibility scrim */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: "linear-gradient(180deg, transparent 40%, rgba(8,7,10,0.62))" }}
                />

                {/* Status badge — top-left */}
                <div className="absolute top-3 left-3 z-[2]">
                    <span className={`atelier-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9.5px] font-mono font-semibold uppercase tracking-wider ${badge.cls}`}>
                        <span className="w-[5px] h-[5px] rounded-full bg-current" />
                        {badge.label}
                    </span>
                </div>

                {/* Hover-reveal play */}
                <div className="absolute inset-0 z-[2] grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span
                        className="w-12 h-12 rounded-full grid place-items-center shadow-lg"
                        style={{ background: "rgba(242,237,228,0.92)" }}
                    >
                        <Play size={18} className="text-on-accent ml-0.5" fill="currentColor" />
                    </span>
                </div>

                {/* Title + meta overlay — bottom-left */}
                <div className="absolute bottom-3 left-4 right-4 z-[2]">
                    <h3 className="font-display atelier-display text-[22px] font-semibold leading-[1.05] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] truncate">
                        {project.title}
                    </h3>
                    <div
                        className="font-mono text-[9px] uppercase tracking-wider mt-1 truncate"
                        style={{ color: "rgba(242,237,228,0.75)" }}
                    >
                        {project.episode_number ? `EP.${String(project.episode_number).padStart(2, "0")} · ` : ""}
                        {t("shotCount", { count: frameCount })}
                    </div>
                </div>
            </div>

            {/* Meta footer */}
            <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex flex-col gap-1.5 min-w-0">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted truncate">
                        {badge.label}{dateStr ? ` · ${dateStr}` : ""}
                    </span>
                    <div className="flex items-center gap-2.5 font-mono text-[10px] text-text-secondary">
                        <span className="inline-flex items-center gap-1">
                            <Film size={11} className="text-text-muted" />
                            {t("shotCount", { count: frameCount })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Clock size={11} className="text-text-muted" />
                            {project.scenes?.length || 0}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleDelete}
                        className="w-8 h-8 rounded-lg grid place-items-center text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                        aria-label={t("confirmDelete", { title: project.title })}
                    >
                        <Trash2 size={15} />
                    </button>
                    <button
                        onClick={(e) => e.stopPropagation()}
                        className="w-8 h-8 rounded-lg grid place-items-center text-text-muted hover:text-foreground hover:bg-hover-bg transition-colors"
                        aria-label={t("moreActions")}
                    >
                        <MoreVertical size={15} />
                    </button>
                </div>
            </div>
        </motion.article>
    );
}
