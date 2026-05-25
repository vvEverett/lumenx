"use client";
/**
 * Cast — R2V workflow Step 3「本集素材」（per-episode asset view）。
 *
 * Design v2 决策（docs/design/r2v-workflow-v2.md Q8 / Q9）:
 *   · Cast = per-episode lens (read-only) of frame-referenced assets
 *   · Series-level CRUD lives in SeriesDetailPage (Characters/Scenes/Props tabs)
 *   · ConsistencyVault is preserved for i2v_legacy workflow only
 *   · Three sections stacked: characters / scenes / props
 *   · Each card: thumb + name + appearance count + status badge
 *     (✓ ready / ⚠ pending / 🆕 new-this-episode)
 *
 * Phase 1 scope (this file):
 *   · Read-only aggregation of frames[].character_ids / scene_id / prop_ids
 *   · Three section grid render
 *   · Status badges based on reference image presence
 *   · NO reconcile flow yet (Phase 4)
 *   · NO `+ new asset` / generation modal yet (Phase 5)
 *   · NO inspector right rail yet (Q9 decision: 3-section flat, no inspector)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Users, MapPin, Box, ImageIcon, AlertTriangle, Sparkles, Plus, Upload, X, Loader2, Play, Pause, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useProjectStore } from "@/store/projectStore";
import { api } from "@/lib/api";
import { getAssetUrl } from "@/lib/utils";
import StepHeader from "@/components/shared/StepHeader";
import PreviewImage from "@/components/shared/preview/PreviewImage";
import WorkflowActionButton from "@/components/shared/WorkflowActionButton";
import VoicePickerModal from "./cast/VoicePickerModal";

type AssetKind = "character" | "scene" | "prop";

interface CastItem {
    id: string;
    name: string;
    kind: AssetKind;
    appearances: number;            // 出场次数（在多少 frame 中被引用）
    referenceImageUrl?: string;     // 参考图（优先 reference_sheet → full_body fallback）
    status: "ready" | "pending" | "new";
    persona?: string;               // R2V v2 P1-a — characters only; groups visual variants of same person
}

/**
 * Resolve a character's primary reference image URL with legacy fallback.
 * Per design v2 (Q12-补充 A): new schema is `reference_sheet`; old
 * schema is `full_body / three_views / head_shot`. Read with fallback
 * so existing data keeps rendering during migration.
 */
function resolveCharacterImage(c: any): string | undefined {
    // New unified field (v2, not yet populated)
    const sheet = c?.reference_sheet?.image_variants?.find(
        (v: any) => v.id === c.reference_sheet.selected_image_id,
    )?.url;
    if (sheet) return sheet;
    // Legacy AssetUnit v2: full_body selected variant
    const fullBody = c?.full_body?.image_variants?.find(
        (v: any) => v.id === c.full_body.selected_image_id,
    )?.url;
    if (fullBody) return fullBody;
    // Legacy v1 url fields
    return c?.full_body_image_url || c?.three_view_image_url || c?.headshot_image_url || c?.image_url;
}

function resolveSceneImage(s: any): string | undefined {
    return s?.image_url || s?.reference_image_url;
}

function resolvePropImage(p: any): string | undefined {
    return p?.image_url || p?.reference_image_url;
}

export default function Cast() {
    const tStep = useTranslations("stepHeader");
    const t = useTranslations("cast");
    const currentProject = useProjectStore((state) => state.currentProject);

    // R2V v2 Phase 5 — add new asset modal (placeholder for full
    // generation flow which lands in a follow-up patch). For now this
    // opens a TODO dialog showing the planned two-tab interface.
    const [addModalOpen, setAddModalOpen] = useState<null | "character" | "scene" | "prop">(null);

    /**
     * Aggregate frame references into per-asset appearance counts.
     * Single pass over frames so the cost is O(frames × refs) per render —
     * for the 5-100 frame range typical of an episode that's a no-op.
     */
    const { characters, scenes, props } = useMemo(() => {
        const characterCounts = new Map<string, number>();
        const sceneCounts = new Map<string, number>();
        const propCounts = new Map<string, number>();
        const frames: any[] = currentProject?.frames ?? [];
        for (const f of frames) {
            if (f?.scene_id) sceneCounts.set(f.scene_id, (sceneCounts.get(f.scene_id) ?? 0) + 1);
            for (const cid of f?.character_ids ?? []) {
                characterCounts.set(cid, (characterCounts.get(cid) ?? 0) + 1);
            }
            for (const pid of f?.prop_ids ?? []) {
                propCounts.set(pid, (propCounts.get(pid) ?? 0) + 1);
            }
        }
        const characterPool: any[] = currentProject?.characters ?? [];
        const scenePool: any[] = currentProject?.scenes ?? [];
        const propPool: any[] = currentProject?.props ?? [];

        const characters: CastItem[] = Array.from(characterCounts.entries()).map(([id, n]) => {
            const c = characterPool.find(x => x.id === id);
            const imageUrl = c ? resolveCharacterImage(c) : undefined;
            return {
                id,
                name: c?.name ?? id,
                kind: "character" as const,
                appearances: n,
                referenceImageUrl: imageUrl,
                status: (imageUrl ? "ready" : "pending") as "ready" | "pending",
                persona: c?.persona ?? "",
            };
        }).sort((a, b) => b.appearances - a.appearances);

        const scenes: CastItem[] = Array.from(sceneCounts.entries()).map(([id, n]) => {
            const s = scenePool.find(x => x.id === id);
            const imageUrl = s ? resolveSceneImage(s) : undefined;
            return {
                id,
                name: s?.name ?? id,
                kind: "scene" as const,
                appearances: n,
                referenceImageUrl: imageUrl,
                status: (imageUrl ? "ready" : "pending") as "ready" | "pending",
            };
        }).sort((a, b) => b.appearances - a.appearances);

        const props: CastItem[] = Array.from(propCounts.entries()).map(([id, n]) => {
            const p = propPool.find(x => x.id === id);
            const imageUrl = p ? resolvePropImage(p) : undefined;
            return {
                id,
                name: p?.name ?? id,
                kind: "prop" as const,
                appearances: n,
                referenceImageUrl: imageUrl,
                status: (imageUrl ? "ready" : "pending") as "ready" | "pending",
            };
        }).sort((a, b) => b.appearances - a.appearances);

        return { characters, scenes, props };
    }, [currentProject?.frames, currentProject?.characters, currentProject?.scenes, currentProject?.props]);

    const totalCast = characters.length + scenes.length + props.length;

    return (
        <div className="flex h-full w-full flex-col overflow-hidden">
            <StepHeader
                stepNumber={3}
                icon={<Users />}
                englishName="Cast"
                title={tStep("castTitle")}
                subtitle={tStep("castSubtitle")}
                trailing={(
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                        <span className="text-foreground font-medium">{totalCast}</span>
                        <span className="ml-1.5">{t("totalCast")}</span>
                    </span>
                )}
            />

            {/* Empty state — no frames yet (script not extracted) */}
            {totalCast === 0 ? (
                <div className="flex flex-1 items-center justify-center bg-surface">
                    <div className="max-w-md text-center">
                        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full border border-glass-border bg-glass">
                            <Sparkles size={24} className="text-text-muted" />
                        </div>
                        <h3 className="font-display text-display font-medium text-foreground">
                            {t("emptyTitle")}
                        </h3>
                        <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                            {t("emptyBody")}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto bg-surface px-8 py-6 space-y-8 custom-scrollbar">
                    <CastSection
                        icon={<Users size={14} />}
                        title={t("sectionCharacters")}
                        items={characters}
                        emptyLabel={t("sectionEmptyCharacters")}
                        onAddNew={() => setAddModalOpen("character")}
                        addLabel={t("addCharacter")}
                        groupByPersona
                    />
                    <CastSection
                        icon={<MapPin size={14} />}
                        title={t("sectionScenes")}
                        items={scenes}
                        emptyLabel={t("sectionEmptyScenes")}
                        onAddNew={() => setAddModalOpen("scene")}
                        addLabel={t("addScene")}
                    />
                    <CastSection
                        icon={<Box size={14} />}
                        title={t("sectionProps")}
                        items={props}
                        emptyLabel={t("sectionEmptyProps")}
                        onAddNew={() => setAddModalOpen("prop")}
                        addLabel={t("addProp")}
                    />
                </div>
            )}

            {/* R2V v2 Phase 5 — real Add new cast modal (AI / upload tabs). */}
            <AddCastPlaceholderModal
                kind={addModalOpen}
                seriesId={currentProject?.series_id ?? null}
                onClose={() => setAddModalOpen(null)}
                onCreated={() => {
                    // Trigger a project refresh by re-selecting; simplest
                    // way to surface the new series asset in this episode.
                    if (currentProject?.id) {
                        useProjectStore.getState().selectProject(currentProject.id);
                    }
                }}
            />
        </div>
    );
}

// R2V v2 Phase 5 — real "+ 新素材" modal.
// Two-tab UX: AI generate vs upload image. Both paths POST to
// /series/{id}/{kind} with a name/persona/description payload + optional
// image_url for upload. AI generation is a placeholder hand-off (creates
// the asset blank, then user can trigger generation from the card detail
// view) — full async generation queue ships when generation pipeline
// supports series-scope without project context.
function AddCastPlaceholderModal({
    kind,
    seriesId,
    onClose,
    onCreated,
}: {
    kind: null | "character" | "scene" | "prop";
    seriesId: string | null;
    onClose: () => void;
    onCreated: () => void;
}) {
    const t = useTranslations("cast");
    const [tab, setTab] = useState<"ai" | "upload">("ai");
    const [name, setName] = useState("");
    const [persona, setPersona] = useState("");
    const [description, setDescription] = useState("");
    const [voiceId, setVoiceId] = useState("");  // P2-c — character voice binding
    const [uploading, setUploading] = useState(false);
    const [imageUrl, setImageUrl] = useState<string>("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset state when modal closes / kind changes
    const reset = () => {
        setName(""); setPersona(""); setDescription(""); setVoiceId("");
        setImageUrl(""); setError(null); setTab("ai");
    };

    if (!kind) return null;
    const label = kind === "character" ? t("sectionCharacters")
        : kind === "scene" ? t("sectionScenes")
        : t("sectionProps");

    const handleUpload = async (file: File) => {
        if (!file) return;
        setUploading(true);
        setError(null);
        try {
            const result = await api.uploadFile(file);
            setImageUrl(result.url || "");
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async () => {
        if (!seriesId) {
            setError(t("seriesRequired"));
            return;
        }
        if (!name.trim()) {
            setError(t("nameRequired"));
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const kindMap = { character: "characters", scene: "scenes", prop: "props" } as const;
            await api.createSeriesAsset(seriesId, kindMap[kind], {
                name: name.trim(),
                description: description.trim() || undefined,
                persona: kind === "character" ? (persona.trim() || undefined) : undefined,
                voice_id: kind === "character" ? (voiceId.trim() || undefined) : undefined,
                image_url: imageUrl || undefined,
            });
            onCreated();
            reset();
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || "Create failed");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-overlay backdrop-blur-sm" onClick={() => { reset(); onClose(); }}>
            <div
                className="w-full max-w-md rounded-2xl border border-glass-border bg-elevated p-6 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.7)]"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-3 mb-4">
                    <div className="grid h-9 w-9 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary">
                        <Plus size={16} />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-display text-display font-medium text-foreground">
                            {t("addModalTitle", { kind: label })}
                        </h3>
                        <p className="text-xs text-text-secondary mt-1">{t("addModalSubtitle")}</p>
                    </div>
                    <button onClick={() => { reset(); onClose(); }} className="p-2 hover:bg-hover-bg rounded-lg text-text-muted hover:text-foreground transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Tab switcher */}
                <div className="flex gap-1 mb-4 p-1 rounded-lg border border-glass-border bg-glass">
                    <button
                        onClick={() => setTab("ai")}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                            tab === "ai" ? "bg-primary/15 text-primary" : "text-text-secondary hover:text-foreground"
                        }`}
                    >
                        <Sparkles size={14} />
                        {t("addTabAi")}
                    </button>
                    <button
                        onClick={() => setTab("upload")}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                            tab === "upload" ? "bg-primary/15 text-primary" : "text-text-secondary hover:text-foreground"
                        }`}
                    >
                        <Upload size={14} />
                        {t("addTabUpload")}
                    </button>
                </div>

                {/* Common fields */}
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5">{t("fieldName")} *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t("fieldNamePlaceholder")}
                            className="w-full bg-input-bg border border-glass-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-text-muted focus:outline-none focus:border-primary"
                            autoFocus
                        />
                    </div>
                    {kind === "character" && (
                        <>
                            <div>
                                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                                    {t("fieldPersona")} <span className="text-text-muted">({t("fieldPersonaHint")})</span>
                                </label>
                                <input
                                    type="text"
                                    value={persona}
                                    onChange={(e) => setPersona(e.target.value)}
                                    placeholder={t("fieldPersonaPlaceholder")}
                                    className="w-full bg-input-bg border border-glass-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-text-muted focus:outline-none focus:border-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                                    {t("fieldVoice")} <span className="text-text-muted">({t("fieldVoiceHint")})</span>
                                </label>
                                <select
                                    value={voiceId}
                                    onChange={(e) => setVoiceId(e.target.value)}
                                    className="w-full bg-input-bg border border-glass-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                                >
                                    <option value="">{t("fieldVoiceNone")}</option>
                                    <option value="longanyang">{t("voiceLonganyang")}</option>
                                    <option value="longshu">{t("voiceLongshu")}</option>
                                    <option value="longtong">{t("voiceLongtong")}</option>
                                    <option value="longfei_v2">{t("voiceLongfei")}</option>
                                    <option value="longxiaobai_v2">{t("voiceLongxiaobai")}</option>
                                </select>
                            </div>
                        </>
                    )}
                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5">{t("fieldDescription")}</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={tab === "ai" ? t("fieldDescriptionAiPlaceholder") : t("fieldDescriptionPlaceholder")}
                            rows={3}
                            className="w-full bg-input-bg border border-glass-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-text-muted focus:outline-none focus:border-primary resize-none"
                        />
                    </div>

                    {/* Upload tab — file dropzone + preview */}
                    {tab === "upload" && (
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5">{t("fieldImageUpload")}</label>
                            {imageUrl ? (
                                <div className="relative">
                                    <PreviewImage src={imageUrl} className="w-full aspect-video rounded-lg" />
                                    <button
                                        onClick={() => setImageUrl("")}
                                        className="absolute top-2 right-2 p-1.5 bg-overlay rounded-md text-text-secondary hover:text-foreground transition-colors"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ) : (
                                <label className="block w-full aspect-video rounded-lg border-2 border-dashed border-glass-border hover:border-primary/40 cursor-pointer transition-colors">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                                        className="hidden"
                                        disabled={uploading}
                                    />
                                    <div className="h-full flex flex-col items-center justify-center text-text-muted">
                                        {uploading ? (
                                            <Loader2 size={20} className="animate-spin" />
                                        ) : (
                                            <>
                                                <Upload size={20} />
                                                <span className="mt-2 text-xs">{t("clickToUpload")}</span>
                                            </>
                                        )}
                                    </div>
                                </label>
                            )}
                        </div>
                    )}

                    {/* AI tab hint */}
                    {tab === "ai" && (
                        <div className="rounded-lg bg-primary/[0.06] border border-primary/20 px-3 py-2.5">
                            <p className="text-[11.5px] text-text-secondary leading-relaxed">
                                {t("aiTabHint")}
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-lg border border-status-failed-border/40 bg-status-failed-bg/50 px-3 py-2 text-status-failed-fg text-xs">
                            {error}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-5">
                    <WorkflowActionButton variant="ghost" size="sm" onClick={() => { reset(); onClose(); }} className="flex-1">
                        {t("cancel")}
                    </WorkflowActionButton>
                    <WorkflowActionButton
                        variant="primary"
                        size="sm"
                        loading={submitting}
                        onClick={handleSubmit}
                        disabled={!name.trim() || !seriesId}
                        className="flex-1"
                    >
                        {tab === "ai" ? t("createAndGenerate") : t("create")}
                    </WorkflowActionButton>
                </div>
            </div>
        </div>
    );
}

interface CastSectionProps {
    icon: React.ReactNode;
    title: string;
    items: CastItem[];
    emptyLabel: string;
    onAddNew?: () => void;
    addLabel?: string;
    /** P1-a: when true, characters with shared `persona` cluster under
     *  a sub-header showing the persona label (only applies when at
     *  least one item has a non-empty persona). */
    groupByPersona?: boolean;
}

function CastSection({ icon, title, items, emptyLabel, onAddNew, addLabel, groupByPersona }: CastSectionProps) {
    const t = useTranslations("cast");
    // R2V v2 P1-a — persona grouping (characters only)
    const groups = useMemo(() => {
        if (!groupByPersona) return null;
        // Items with persona cluster under that key; persona-less stay solo
        const buckets = new Map<string, CastItem[]>();
        const ungrouped: CastItem[] = [];
        for (const item of items) {
            const p = (item.persona ?? "").trim();
            if (p) {
                const arr = buckets.get(p) ?? [];
                arr.push(item);
                buckets.set(p, arr);
            } else {
                ungrouped.push(item);
            }
        }
        // Multi-member groups only — single-member personas inline back
        const out: Array<{ persona: string | null; items: CastItem[] }> = [];
        const single: CastItem[] = [...ungrouped];
        for (const [p, arr] of Array.from(buckets.entries())) {
            if (arr.length >= 2) out.push({ persona: p, items: arr });
            else single.push(...arr);
        }
        // Sort: groups (by persona name), then ungrouped
        out.sort((a, b) => (a.persona ?? "").localeCompare(b.persona ?? ""));
        if (single.length) out.push({ persona: null, items: single });
        return out;
    }, [items, groupByPersona]);

    return (
        <section>
            <header className="mb-3 flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded text-text-muted">{icon}</span>
                <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-text-secondary">
                    {title}
                </h3>
                <span className="font-mono text-[10px] text-text-muted">({items.length})</span>
                <div aria-hidden="true" className="ml-3 h-px flex-1 bg-glass-border" />
                {onAddNew && (
                    <WorkflowActionButton
                        variant="ghost"
                        size="sm"
                        leftIcon={<Plus />}
                        onClick={onAddNew}
                    >
                        {addLabel}
                    </WorkflowActionButton>
                )}
            </header>
            {items.length === 0 ? (
                <p className="font-sans text-[12.5px] text-text-muted italic px-1">{emptyLabel}</p>
            ) : groups && groups.some(g => g.persona) ? (
                <div className="space-y-4">
                    {groups.map((group) => (
                        <div key={group.persona ?? "_solo"}>
                            {group.persona && (
                                <div className="flex items-center gap-2 mb-2 px-1">
                                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-pink-300/90 bg-pink-300/10 px-2 py-0.5 rounded">
                                        <Users size={10} /> {t("personaGroup", { persona: group.persona })}
                                    </span>
                                    <span className="font-mono text-[10px] text-text-muted">
                                        {t("personaGroupCount", { count: group.items.length })}
                                    </span>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                                {group.items.map(item => <CastCard key={item.id} item={item} />)}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {items.map(item => <CastCard key={item.id} item={item} />)}
                </div>
            )}
        </section>
    );
}

function CastCard({ item }: { item: CastItem }) {
    const t = useTranslations("cast");
    const updateProject = useProjectStore((state) => state.updateProject);
    const currentProject = useProjectStore((state) => state.currentProject);
    const [historyOpen, setHistoryOpen] = useState(false);
    // PR-3g Stage B — voice picker + inline preview state
    const [pickerOpen, setPickerOpen] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    const [playing, setPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Look up full character to read voice_id / voice_name (CastItem is a
    // read-only aggregation, doesn't carry voice fields).
    const character = item.kind === "character"
        ? currentProject?.characters?.find((c: any) => c.id === item.id)
        : null;
    const voiceId: string | undefined = character?.voice_id;
    const voiceName: string | undefined = character?.voice_name;

    // PR-3g · Voice bind handler: persist via existing bindVoice API
    const handleApplyVoice = async (newVoiceId: string, newVoiceName: string) => {
        if (!currentProject || !character) return;
        try {
            const updated = await api.bindVoice(currentProject.id, character.id, newVoiceId, newVoiceName);
            // Backend returns the updated script - sync to store
            updateProject(currentProject.id, updated);
        } catch (e) {
            console.error("Failed to bind voice:", e);
        }
    };

    // PR-3g · inline preview from CastCard (uses currently-bound voice)
    const handleInlinePreview = async () => {
        if (!voiceId) return;
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
            if (playing) {
                setPlaying(false);
                return;
            }
        }
        setPreviewing(true);
        try {
            const sampleText = item.name
                ? `你好，我是${item.name}。今天遇到件有趣的事，让我慢慢说给你听。`
                : "你好，这是音色试听。今天遇到件有趣的事，让我慢慢说给你听。";
            const { url } = await api.previewVoice({ voice_id: voiceId, text: sampleText });
            const audio = new Audio(getAssetUrl(url));
            audio.onended = () => { setPlaying(false); audioRef.current = null; };
            audio.onerror = () => { setPlaying(false); audioRef.current = null; };
            audioRef.current = audio;
            setPlaying(true);
            await audio.play();
        } catch (e) {
            console.error("Voice preview failed:", e);
        } finally {
            setPreviewing(false);
        }
    };

    // Cleanup on unmount
    useEffect(() => () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
    }, []);

    return (
        <>
            <div className="group/cast-card relative flex flex-col gap-2 rounded-lg border border-glass-border bg-glass p-2 transition-colors duration-fast ease-out-quart hover:border-white/15">
                <div className="aspect-square overflow-hidden rounded-md bg-black/40">
                    {item.referenceImageUrl ? (
                        <PreviewImage src={item.referenceImageUrl} alt={item.name} className="h-full w-full" clickToLightbox />
                    ) : (
                        <div className="grid h-full w-full place-items-center text-text-muted">
                            <ImageIcon size={20} aria-hidden="true" />
                        </div>
                    )}
                </div>
                <div className="space-y-1 px-0.5">
                    <p className="truncate font-sans text-[13px] font-medium text-foreground" title={item.name}>
                        {item.name}
                    </p>
                    <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                            {t("appearancesCount", { count: item.appearances })}
                        </span>
                        <StatusBadge status={item.status} />
                    </div>
                </div>
                {/* PR-3g Stage B · Voice binding hover bar (Q2 A · characters only).
                    Bound state: 🔊 voice_name + ▶ inline preview + ▼ open picker.
                    Unbound state: 🔊 + 添加音色 (clickable, opens picker). */}
                {item.kind === "character" && (
                    <div className="flex items-center gap-1 px-0.5 opacity-0 group-hover/cast-card:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }}
                            className="flex-1 inline-flex items-center gap-1.5 rounded-md border border-glass-border bg-black/30 px-2 py-1 text-[10px] text-text-secondary hover:border-white/20 hover:text-foreground transition-colors min-w-0"
                            title={voiceId ? t("voiceBindChange") : t("voiceBindAdd")}
                        >
                            <Volume2 size={10} className={voiceId ? "text-primary" : "text-text-muted"} />
                            <span className="truncate flex-1 text-left">
                                {voiceName || (voiceId ? voiceId : t("voiceBindNone"))}
                            </span>
                            <span className="font-mono text-[8px] text-text-muted shrink-0">▼</span>
                        </button>
                        {voiceId && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleInlinePreview(); }}
                                aria-label={playing ? "Stop preview" : "Play preview"}
                                className={`shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
                                    playing
                                        ? "border-primary bg-primary/15 text-primary"
                                        : "border-glass-border bg-black/30 text-text-secondary hover:border-white/20 hover:text-foreground"
                                }`}
                            >
                                {previewing ? <Loader2 size={10} className="animate-spin" /> : playing ? <Pause size={10} /> : <Play size={10} />}
                            </button>
                        )}
                    </div>
                )}
                {/* P1-c — history (cross-episode appearances) trigger.
                    Only for characters in series-affiliated episodes. */}
                {item.kind === "character" && currentProject?.series_id && (
                    <button
                        onClick={() => setHistoryOpen(true)}
                        className="absolute top-1 right-1 p-1 rounded bg-overlay/0 text-text-muted opacity-0 group-hover/cast-card:opacity-100 hover:text-foreground hover:bg-overlay transition-all"
                        title={t("viewHistory")}
                    >
                        <Sparkles size={11} />
                    </button>
                )}
            </div>
            {historyOpen && currentProject?.series_id && (
                <CharacterHistoryPopover
                    seriesId={currentProject.series_id}
                    characterId={item.id}
                    onClose={() => setHistoryOpen(false)}
                />
            )}
            {pickerOpen && character && (
                <VoicePickerModal
                    isOpen={pickerOpen}
                    onClose={() => setPickerOpen(false)}
                    characterName={item.name}
                    characterGender={character.gender}
                    currentVoiceId={voiceId}
                    onApply={handleApplyVoice}
                    seriesId={currentProject?.series_id || null}
                    characterDescription={character.description}
                />
            )}
        </>
    );
}

function CharacterHistoryPopover({ seriesId, characterId, onClose }: { seriesId: string; characterId: string; onClose: () => void }) {
    const t = useTranslations("cast");
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        api.getCharacterAppearances(seriesId, characterId)
            .then(d => { if (!cancelled) setData(d); })
            .catch(err => { if (!cancelled) setError(err?.response?.data?.detail || err?.message || "Load failed"); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [seriesId, characterId]);

    return (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-overlay backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-md rounded-2xl border border-glass-border bg-elevated p-6 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.7)]"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-3 mb-4">
                    <div className="grid h-9 w-9 place-items-center rounded-full border border-pink-400/40 bg-pink-400/10 text-pink-300">
                        <Sparkles size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-display text-display font-medium text-foreground truncate">
                            {data?.character?.name || t("loading")}
                        </h3>
                        {data?.character?.persona && (
                            <p className="text-xs text-text-secondary mt-0.5">Persona · {data.character.persona}</p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-hover-bg rounded-lg text-text-muted hover:text-foreground transition-colors">
                        <X size={16} />
                    </button>
                </div>
                {loading ? (
                    <div className="grid place-items-center py-8 text-text-muted"><Loader2 className="animate-spin" size={18} /></div>
                ) : error ? (
                    <p className="rounded-lg border border-status-failed-border/40 bg-status-failed-bg/50 px-3 py-2 text-status-failed-fg text-xs">{error}</p>
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs text-text-secondary">
                            {t("totalAppearances", { count: data?.total_frames ?? 0, episodes: data?.appearances?.length ?? 0 })}
                        </p>
                        <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
                            {(data?.appearances || []).map((app: any) => (
                                <div key={app.episode_id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-glass-border bg-glass">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-foreground truncate">
                                            EP{app.episode_number ?? "?"} · {app.episode_title}
                                        </p>
                                    </div>
                                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-pink-300">
                                        {t("appearancesCount", { count: app.frame_count })}
                                    </span>
                                </div>
                            ))}
                            {data?.appearances?.length === 0 && (
                                <p className="text-center py-4 text-xs text-text-muted">{t("noAppearancesYet")}</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: "ready" | "pending" | "new" }) {
    const t = useTranslations("cast");
    if (status === "ready") {
        return (
            <span className="inline-flex items-center rounded-full bg-[rgba(100,108,255,0.12)] px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-[#a5aaff]">
                {t("statusReady")}
            </span>
        );
    }
    if (status === "pending") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(245,158,11,0.12)] px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-[#fbbf24]">
                <AlertTriangle size={9} aria-hidden="true" />
                {t("statusPending")}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(236,72,153,0.14)] px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-[#f472b6]">
            🆕 {t("statusNew")}
        </span>
    );
}
