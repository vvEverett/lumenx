"use client";
/**
 * CastWorkbenchModal — generate / iterate / pick the reference image for a
 * single Cast entity (character | scene | prop).
 *
 * Design intent (per design grill 2026-05-26):
 *   · One prompt — the legacy headshot/full_body/three_view triplet is fused
 *     into a single 'character reference sheet' composition for characters.
 *     Scenes and props each have their own template too.
 *   · Prompt template is pre-filled (entity name + entity description +
 *     composition guidance) but fully editable. The art-direction style is
 *     shown read-only above the textarea since it gets concatenated by
 *     the backend (apply_style=true).
 *   · Generated variants land in a side gallery; clicking one selects it
 *     as the entity's reference image (calls selectAssetVariant). Multiple
 *     re-rolls accumulate so the user can compare.
 *   · Per-project toast surfaces success/error across the long round-trip
 *     (asset generation can take 20-60s).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Loader2, Check, RefreshCw, Wand2, Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useProjectStore } from "@/store/projectStore";
import { toast } from "@/store/toastStore";
import { getAssetUrl } from "@/lib/utils";
import PreviewImage from "@/components/shared/preview/PreviewImage";
import WorkflowActionButton from "@/components/shared/WorkflowActionButton";

export type CastKind = "character" | "scene" | "prop";

interface CastWorkbenchModalProps {
    isOpen: boolean;
    kind: CastKind | null;
    entityId: string | null;
    onClose: () => void;
}

interface ImageVariant {
    id: string;
    url: string;
    is_favorited?: boolean;
}

/** Build the kind-specific prompt template. Combines entity-derived facts
 *  with composition guidance. Replaces legacy multi-shot generation with
 *  a single 'reference sheet' frame per character (headshot + three views
 *  fused), per design grill. */
function buildTemplate(kind: CastKind, entity: any, t: (key: string) => string): string {
    const name = entity?.name || "";
    const desc = entity?.description || "";
    if (kind === "character") {
        // Reference sheet for character: one image with multiple angles.
        return `${name}${desc ? "，" + desc : ""}\n\n${t("templateCharacterComposition")}`;
    }
    if (kind === "scene") {
        return `${name}${desc ? "：" + desc : ""}\n\n${t("templateSceneComposition")}`;
    }
    return `${name}${desc ? "：" + desc : ""}\n\n${t("templatePropComposition")}`;
}

/** Variants live in different slots depending on kind + legacy schema:
 *  · character → reference_sheet.image_variants (new) or full_body_asset.variants (legacy)
 *  · scene → image_asset.variants
 *  · prop → image_asset.variants
 *  Returns a normalized [{id, url, is_favorited?}] list. */
function readVariants(entity: any, kind: CastKind): ImageVariant[] {
    if (!entity) return [];
    if (kind === "character") {
        const sheet = entity?.reference_sheet?.image_variants ?? [];
        if (sheet.length > 0) {
            return sheet.map((v: any) => ({ id: v.id, url: v.url, is_favorited: v.is_favorited }));
        }
        const legacy = entity?.full_body_asset?.variants ?? [];
        return legacy.map((v: any) => ({ id: v.id, url: v.url, is_favorited: v.is_favorited }));
    }
    const arr = entity?.image_asset?.variants ?? [];
    return arr.map((v: any) => ({ id: v.id, url: v.url, is_favorited: v.is_favorited }));
}

function readSelectedId(entity: any, kind: CastKind): string | null {
    if (!entity) return null;
    if (kind === "character") {
        return entity?.reference_sheet?.selected_image_id
            ?? entity?.full_body_asset?.selected_id
            ?? null;
    }
    return entity?.image_asset?.selected_id ?? null;
}

export default function CastWorkbenchModal({ isOpen, kind, entityId, onClose }: CastWorkbenchModalProps) {
    const t = useTranslations("castWorkbench");
    const currentProject = useProjectStore((state) => state.currentProject);
    const updateProject = useProjectStore((state) => state.updateProject);

    // Look up the live entity from the store so it stays in sync after
    // generation calls patch the project.
    const entity = useMemo(() => {
        if (!entityId || !kind || !currentProject) return null;
        const pool: any[] = kind === "character"
            ? currentProject.characters || []
            : kind === "scene"
                ? currentProject.scenes || []
                : currentProject.props || [];
        return pool.find((e: any) => e.id === entityId) ?? null;
    }, [currentProject, entityId, kind]);

    const variants = useMemo(() => readVariants(entity, kind ?? "character"), [entity, kind]);
    const selectedId = useMemo(() => readSelectedId(entity, kind ?? "character"), [entity, kind]);

    const [prompt, setPrompt] = useState("");
    const [batchSize, setBatchSize] = useState(2);
    const [generating, setGenerating] = useState(false);
    const lastSeededEntityId = useRef<string | null>(null);

    // Reset prompt to template ONLY when the entity changes (not on every
    // open) so the user's in-flight edits aren't clobbered if they happen
    // to flip the modal closed and back. Clearing happens via the reset
    // button or kind/entity switch.
    useEffect(() => {
        if (!isOpen || !entity || !kind) return;
        if (lastSeededEntityId.current !== entity.id) {
            setPrompt(buildTemplate(kind, entity, t));
            lastSeededEntityId.current = entity.id;
        }
    }, [isOpen, entity, kind, t]);

    if (!isOpen || !kind || !entity || !currentProject) return null;

    const stylePositive = currentProject.art_direction?.style_config?.positive_prompt || "";
    const styleNegative = currentProject.art_direction?.style_config?.negative_prompt || "";
    const styleName = currentProject.art_direction?.style_config?.name || "";

    const handleResetTemplate = () => {
        setPrompt(buildTemplate(kind, entity, t));
    };

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            toast.warning(t("toastPromptEmpty"), {
                projectId: currentProject.id,
                projectTitle: currentProject.title,
            });
            return;
        }
        setGenerating(true);
        const toastId = toast.progress(t("toastGenStart", { kind: t(`kind.${kind}`) }), {
            projectId: currentProject.id,
            projectTitle: currentProject.title,
            body: t("toastGenStartBody"),
        });
        try {
            const resp = await api.generateAsset(
                currentProject.id,
                entity.id,
                kind,
                currentProject.style_preset || "realistic",
                stylePositive,           // stylePrompt
                "all",                    // generationType
                prompt.trim(),            // prompt override
                true,                     // applyStyle
                styleNegative,            // negativePrompt
                Math.max(1, Math.min(4, batchSize)),
                currentProject.model_settings?.t2i_model,
            );
            // Backend returns either the updated script (sync) or { script, _task_id } for async.
            const taskId = (resp as any)?._task_id;
            if (taskId) {
                // Poll until done.
                let attempts = 0;
                while (attempts < 60) {
                    await new Promise((r) => setTimeout(r, 2000));
                    attempts += 1;
                    try {
                        const status = await api.getTaskStatus(taskId);
                        if (status?.status === "completed") {
                            // Refresh project to pick up new variants.
                            const fresh = await api.getProject(currentProject.id);
                            updateProject(currentProject.id, fresh);
                            const fresheEntity = (kind === "character"
                                ? fresh.characters
                                : kind === "scene"
                                    ? fresh.scenes
                                    : fresh.props)?.find((e: any) => e.id === entity.id);
                            const newCount = readVariants(fresheEntity, kind).length;
                            toast.update(toastId, {
                                kind: "success",
                                title: t("toastGenDone", { kind: t(`kind.${kind}`) }),
                                body: t("toastGenDoneBody", { count: newCount }),
                                autoCloseMs: 6000,
                            });
                            break;
                        }
                        if (status?.status === "failed") {
                            throw new Error(status?.error || t("toastGenErrUnknown"));
                        }
                    } catch (e) {
                        if (attempts >= 60) throw e;
                    }
                }
            } else if (resp) {
                updateProject(currentProject.id, resp);
                const fresheEntity = (kind === "character"
                    ? resp.characters
                    : kind === "scene"
                        ? resp.scenes
                        : resp.props)?.find((e: any) => e.id === entity.id);
                const newCount = readVariants(fresheEntity, kind).length;
                toast.update(toastId, {
                    kind: "success",
                    title: t("toastGenDone", { kind: t(`kind.${kind}`) }),
                    body: t("toastGenDoneBody", { count: newCount }),
                    autoCloseMs: 6000,
                });
            }
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || t("toastGenErrUnknown");
            toast.update(toastId, {
                kind: "error",
                title: t("toastGenErr"),
                body: String(detail).slice(0, 240),
                action: {
                    label: t("retry"),
                    onClick: () => { handleGenerate(); },
                },
            });
        } finally {
            setGenerating(false);
        }
    };

    const handleSelectVariant = async (variantId: string) => {
        try {
            const updated = await api.selectAssetVariant(
                currentProject.id,
                entity.id,
                kind,
                variantId,
            );
            updateProject(currentProject.id, updated);
            toast.success(t("toastSelected"), {
                projectId: currentProject.id,
                projectTitle: currentProject.title,
                autoCloseMs: 3000,
            });
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || "select failed";
            toast.error(t("toastSelectErr"), {
                projectId: currentProject.id,
                projectTitle: currentProject.title,
                body: String(detail).slice(0, 200),
            });
        }
    };

    // Per-kind accent — Tailwind JIT can't resolve dynamic `bg-${name}-500/15`,
    // so we ship full class strings per kind keyed off a static record.
    const accentClasses = {
        character: {
            headerPill: "bg-purple-500/15 text-purple-300 border-purple-500/30",
            batchActive: "border-purple-400/60 bg-purple-500/15 text-purple-200",
            variantSelected: "border-purple-400 ring-2 ring-purple-500/40",
            selectBadge: "bg-purple-500",
        },
        scene: {
            headerPill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
            batchActive: "border-emerald-400/60 bg-emerald-500/15 text-emerald-200",
            variantSelected: "border-emerald-400 ring-2 ring-emerald-500/40",
            selectBadge: "bg-emerald-500",
        },
        prop: {
            headerPill: "bg-amber-500/15 text-amber-300 border-amber-500/30",
            batchActive: "border-amber-400/60 bg-amber-500/15 text-amber-200",
            variantSelected: "border-amber-400 ring-2 ring-amber-500/40",
            selectBadge: "bg-amber-500",
        },
    } as const;
    const accent = accentClasses[kind];

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-overlay backdrop-blur-sm grid place-items-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.96, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.96, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border border-glass-border bg-elevated shadow-[0_24px_64px_-12px_rgba(0,0,0,0.7)] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-glass-border">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md border shrink-0 ${accent.headerPill}`}>
                                <Sparkles size={13} />
                            </span>
                            <div className="min-w-0">
                                <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-text-muted">
                                    {t(`kind.${kind}`)} · {variants.length} {t("variants")}
                                </p>
                                <h2 className="text-display font-medium text-foreground truncate">{entity.name}</h2>
                            </div>
                        </div>
                        <button onClick={onClose} aria-label={t("close")} className="p-1.5 rounded-lg hover:bg-hover-bg text-text-muted hover:text-foreground transition-colors">
                            <X size={15} />
                        </button>
                    </header>

                    {/* Body: prompt editor (left) + variants gallery (right) */}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(0,420px)_1fr] divide-x divide-glass-border min-h-0">
                        {/* LEFT — prompt editor */}
                        <div className="flex flex-col p-5 gap-4 overflow-y-auto custom-scrollbar">
                            {/* Style baseline (read-only context) */}
                            {styleName && (
                                <div className="rounded-md border border-glass-border bg-glass px-3 py-2">
                                    <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-text-muted">
                                        <Palette size={10} /> {t("styleAppliedFrom")} · {styleName}
                                    </p>
                                    {stylePositive && (
                                        <p className="mt-1 text-[11px] text-text-secondary line-clamp-2" title={stylePositive}>
                                            {stylePositive}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Prompt textarea + reset */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                                        {t("promptLabel")}
                                    </label>
                                    <button
                                        onClick={handleResetTemplate}
                                        disabled={generating}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-text-muted hover:text-foreground transition-colors disabled:opacity-30"
                                        title={t("resetTemplateHint")}
                                    >
                                        <RefreshCw size={10} />
                                        {t("resetTemplate")}
                                    </button>
                                </div>
                                <textarea
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    rows={kind === "character" ? 9 : 6}
                                    disabled={generating}
                                    className="w-full rounded-md border border-glass-border bg-black/30 px-3 py-2 text-[13px] text-foreground placeholder:text-text-muted focus:outline-none focus:border-primary/40 disabled:opacity-60 resize-none leading-relaxed"
                                />
                                <p className="mt-1 text-[10px] text-text-muted">
                                    {kind === "character" ? t("promptHintCharacter") : kind === "scene" ? t("promptHintScene") : t("promptHintProp")}
                                </p>
                            </div>

                            {/* Batch size */}
                            <div>
                                <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted mb-1.5">
                                    {t("batchLabel")}
                                </label>
                                <div className="flex items-center gap-1.5">
                                    {[1, 2, 4].map((n) => (
                                        <button
                                            key={n}
                                            onClick={() => setBatchSize(n)}
                                            disabled={generating}
                                            className={`px-3 py-1 rounded-md border font-mono text-[11px] transition-colors ${
                                                batchSize === n
                                                    ? accent.batchActive
                                                    : "border-glass-border bg-glass text-text-muted hover:border-white/20 hover:text-text-secondary"
                                            } disabled:opacity-40`}
                                        >
                                            ×{n}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Generate CTA */}
                            <button
                                onClick={handleGenerate}
                                disabled={generating || !prompt.trim()}
                                className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-white border border-[rgba(100,108,255,0.65)] shadow-[inset_0_1.5px_0_rgba(255,255,255,0.14)] hover:bg-[#7a82ff] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[13px] font-semibold"
                            >
                                {generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                {generating
                                    ? t("generating")
                                    : variants.length === 0
                                        ? t("generateFirst")
                                        : t("generateMore", { count: batchSize })}
                            </button>
                        </div>

                        {/* RIGHT — variants gallery */}
                        <div className="flex flex-col p-5 overflow-y-auto custom-scrollbar bg-surface">
                            <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                                {t("variantsTitle")}
                                <span className="text-text-muted/60"> ({variants.length})</span>
                            </h3>
                            {variants.length === 0 ? (
                                <div className="flex-1 grid place-items-center text-center text-text-muted">
                                    <div className="max-w-xs">
                                        <div className="mx-auto w-12 h-12 grid place-items-center rounded-full border border-glass-border bg-glass mb-3">
                                            <Sparkles size={18} />
                                        </div>
                                        <p className="text-[13px] text-foreground">{t("emptyVariantsTitle")}</p>
                                        <p className="text-[11px] text-text-secondary mt-1">{t("emptyVariantsBody")}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                    {variants.map((v) => {
                                        const isSelected = v.id === selectedId;
                                        return (
                                            <div
                                                key={v.id}
                                                onClick={() => !isSelected && handleSelectVariant(v.id)}
                                                className={`relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                                                    isSelected
                                                        ? accent.variantSelected
                                                        : "border-glass-border hover:border-white/30"
                                                }`}
                                                style={{
                                                    aspectRatio:
                                                        kind === "character"
                                                            ? "3 / 4"
                                                            : kind === "scene"
                                                                ? "16 / 9"
                                                                : "1 / 1",
                                                }}
                                            >
                                                <PreviewImage
                                                    src={getAssetUrl(v.url)}
                                                    alt={`${entity.name} ${v.id}`}
                                                    className="h-full w-full object-cover"
                                                    clickToLightbox
                                                />
                                                {isSelected && (
                                                    <div className={`absolute top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-white shadow-md ${accent.selectBadge}`}>
                                                        <Check size={12} strokeWidth={2.6} />
                                                    </div>
                                                )}
                                                {!isSelected && (
                                                    <div className="absolute inset-0 grid place-items-end bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity">
                                                        <p className="w-full text-center pb-1.5 text-[10px] uppercase tracking-[0.16em] text-white font-mono">
                                                            {t("clickToSelect")}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-glass-border">
                        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                            {selectedId ? t("selectedFooter") : t("noneSelectedFooter")}
                        </span>
                        <WorkflowActionButton variant="primary" size="sm" onClick={onClose}>
                            {t("done")}
                        </WorkflowActionButton>
                    </footer>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
