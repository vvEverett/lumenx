"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useProjectStore } from "@/store/projectStore";
import { api, type VideoTask } from "@/lib/api";
import { getAssetUrl } from "@/lib/utils";
import type { BatchSummary } from "./storyboard-r2v/shot-panel/CandidatesSection";
import { getR2vRouteModelId, isR2vImageBased, VIDEO_I2V_MODELS, VIDEO_R2V_MODELS, DEFAULT_I2V_MODEL_ID, DEFAULT_R2V_MODEL_ID } from "@/lib/modelCatalog";
import ShotCard, { type ShotNode } from "./storyboard-r2v/ShotCard";
import AssetDrawer from "./storyboard-r2v/AssetDrawer";
import { type VideoConfig, DEFAULT_VIDEO_CONFIG } from "./storyboard-r2v/VideoConfigModal";
import {
    migrateShotNode,
    appendT2IImage,
    setActiveT2IIndex,
    removeT2IImage,
    appendVideoTaskId,
    videoTaskIdsForTab,
    getActiveT2IImageUrl,
} from "./storyboard-r2v/shotNodeHelpers";
import ShotPanel from "./storyboard-r2v/shot-panel/ShotPanel";
import ParamsSection, { type ParamsState } from "./storyboard-r2v/shot-panel/ParamsSection";
import T2ISubsection from "./storyboard-r2v/shot-panel/T2ISubsection";
import CandidatesSection from "./storyboard-r2v/shot-panel/CandidatesSection";
import CompareModal from "./storyboard-r2v/shot-panel/CompareModal";
import TaskQueueButton from "./storyboard-r2v/shot-panel/TaskQueueButton";
import TaskQueuePanel from "./storyboard-r2v/shot-panel/TaskQueuePanel";

export default function StoryboardR2V() {
    const currentProject = useProjectStore((state) => state.currentProject);
    const updateProject = useProjectStore((state) => state.updateProject);
    const t = useTranslations("storyboardR2V");

    // Derive shots from project frames or initialize empty. Each shot
    // gets pushed through migrateShotNode so the new t2iImageUrls /
    // videoTaskIdsByTab fields are present even for legacy drafts.
    const [shots, setShots] = useState<ShotNode[]>(() => {
        if (currentProject?.frames && currentProject.frames.length > 0) {
            return currentProject.frames.map((frame: any) => migrateShotNode({
                id: frame.id,
                prompt: frame.action_description || "",
                tabMode: "direct_r2v" as const,
                videoUrl: frame.video_url || undefined,
                videoStatus: frame.video_url ? ("completed" as const) : undefined,
                imageUrl: frame.rendered_image_url || frame.image_url || undefined,
            }));
        }
        return [migrateShotNode({ id: `shot_${Date.now()}`, prompt: "", tabMode: "direct_r2v" })];
    });

    // Global video config (with localStorage persistence for model selection)
    const [videoConfig, setVideoConfig] = useState<VideoConfig>(() => {
        const ls = typeof window !== 'undefined' ? window.localStorage : null;
        const savedI2v = ls?.getItem('storyboard-r2v-model') ?? null;
        const savedR2v = ls?.getItem('storyboard-r2v-r2v-model') ?? null;
        const projectI2v = currentProject?.model_settings?.i2v_model || DEFAULT_I2V_MODEL_ID;

        // I2V — defensive: a cached localStorage model id may have been
        // hidden or removed from the I2V list since it was last
        // selected (e.g. the user once picked `wan2.7-r2v` while it was
        // visible, the catalog later marked it hidden, and now the ID
        // lingers in their browser). Falling back to the default avoids
        // silently shipping the wrong model into the I2V flow.
        const i2vCandidate = savedI2v || projectI2v;
        const i2vOk = VIDEO_I2V_MODELS.find(m => m.id === i2vCandidate);
        const i2vModelId = i2vOk ? i2vCandidate : DEFAULT_I2V_MODEL_ID;
        if (!i2vOk && ls && savedI2v) {
            ls.removeItem('storyboard-r2v-model');
            // eslint-disable-next-line no-console
            console.warn(
                `[Studio] Cached I2V model "${i2vCandidate}" is no longer in the visible I2V list; ` +
                `falling back to "${DEFAULT_I2V_MODEL_ID}".`,
            );
        }

        // R2V preference order:
        //   1. localStorage (user's last explicit pick — survives reloads)
        //   2. project.model_settings.r2v_model (project-level default,
        //      set in 生成设置 — Plan B "specialize" hierarchy)
        //   3. derived from i2v family (initial coherence on first mount)
        //   4. catalog DEFAULT_R2V_MODEL_ID
        // Each candidate is validated against VIDEO_R2V_MODELS so a
        // hidden id from any layer falls through cleanly.
        const projectR2v = currentProject?.model_settings?.r2v_model;
        const r2vDerived = getR2vRouteModelId(i2vModelId);
        const r2vCandidate = savedR2v || projectR2v || r2vDerived || DEFAULT_R2V_MODEL_ID;
        const r2vOk = VIDEO_R2V_MODELS.find(m => m.id === r2vCandidate);
        const r2vModelId = r2vOk ? r2vCandidate : (VIDEO_R2V_MODELS[0]?.id ?? DEFAULT_R2V_MODEL_ID);
        if (!r2vOk && ls && savedR2v) {
            ls.removeItem('storyboard-r2v-r2v-model');
        }

        const finalConfig = VIDEO_I2V_MODELS.find(m => m.id === i2vModelId);
        const dc = finalConfig?.duration;
        const defaultDuration = dc ? (dc.type === 'fixed' ? dc.value : dc.default) : 5;
        return {
            ...DEFAULT_VIDEO_CONFIG,
            model: i2vModelId,
            r2vModel: r2vModelId,
            duration: defaultDuration,
        };
    });

    // Modal & drawer state (configModalOpen retired with the gear; the
    // old VideoConfigModal mount is gone, replaced by per-shot
    // ParamsSection panels under each ShotCard. handleConfigChange is
    // also gone — model writes now flow through handleShotParamsChange
    // below, which mirrors them to localStorage.)
    const [drawerState, setDrawerState] = useState<{ isOpen: boolean; targetShotIndex: number | null }>({
        isOpen: false,
        targetShotIndex: null,
    });

    // Task-queue side panel state. Persisted across renders only; we
    // intentionally don't localStorage this — it's transient "I want
    // to peek at queue" UI affordance, not a saved layout preference.
    const [queueOpen, setQueueOpen] = useState(false);

    // Compare-mode selection: a Set of task ids the user shift-clicked
    // in any shot's candidate panel. Multi-shot compare is a future
    // feature; for now the same Set is shared across shots so user
    // can only effectively compare within one shot at a time. Cleared
    // on Compare modal close.
    const [compareSelectedIds, setCompareSelectedIds] = useState<Set<string>>(() => new Set());
    const [compareModalOpen, setCompareModalOpen] = useState(false);

    // Refs map for textareas (for asset insertion from drawer)
    const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
    // Refs to each shot's outer wrapper so the task-queue panel can
    // jump-scroll the canvas to a specific frame.
    const shotWrapperRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

    // Per-shot batch count (the "抽卡 ×N" knob). Decoupled from
    // videoConfig because users typically pick the model + duration
    // once and vary count per shot. Keyed by shot.id so insert/move
    // don't shuffle counts onto the wrong shot.
    const [shotCounts, setShotCounts] = useState<Record<string, number>>({});

    const characters = currentProject?.characters || [];
    const scenes = currentProject?.scenes || [];
    const props = currentProject?.props || [];

    // Add a new shot after the given index
    const addShot = useCallback((afterIndex: number) => {
        const newShot: ShotNode = {
            id: `shot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            prompt: "",
            tabMode: "direct_r2v",
        };
        setShots(prev => {
            const updated = [...prev];
            updated.splice(afterIndex + 1, 0, newShot);
            return updated;
        });
    }, []);

    // Delete a shot
    const deleteShot = useCallback((index: number) => {
        setShots(prev => prev.filter((_, i) => i !== index));
    }, []);

    // Move shot up/down
    const moveShot = useCallback((index: number, direction: "up" | "down") => {
        setShots(prev => {
            const updated = [...prev];
            const targetIndex = direction === "up" ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= updated.length) return prev;
            [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
            return updated;
        });
    }, []);

    // Duplicate a shot
    const duplicateShot = useCallback((index: number) => {
        setShots(prev => {
            const source = prev[index];
            const newShot: ShotNode = {
                ...source,
                id: `shot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                videoUrl: undefined,
                videoTaskId: undefined,
                videoStatus: undefined,
                t2iImageUrl: undefined,
                t2iTaskId: undefined,
                t2iStatus: undefined,
            };
            const updated = [...prev];
            updated.splice(index + 1, 0, newShot);
            return updated;
        });
    }, []);

    // Update shot prompt
    const updatePrompt = useCallback((index: number, prompt: string) => {
        setShots(prev => prev.map((s, i) => i === index ? { ...s, prompt } : s));
    }, []);

    // Set shot tab mode
    const setTabMode = useCallback((index: number, mode: "t2i_i2v" | "direct_r2v") => {
        setShots(prev => prev.map((s, i) => i === index ? { ...s, tabMode: mode } : s));
    }, []);

    // Parse asset tags from prompt and resolve to URLs
    const parseAssetTags = useCallback((prompt: string): string[] => {
        const urls: string[] = [];
        const tagPattern = /\[(character\d+|scene|prop):([^\]]+)\]/g;
        let match;
        while ((match = tagPattern.exec(prompt)) !== null) {
            const [, type, name] = match;
            if (type.startsWith("character")) {
                const char = characters.find((c: any) => c.name === name);
                if (char) {
                    const asset = char.full_body_asset;
                    if (asset?.selected_id && asset.variants?.length) {
                        const selected = asset.variants.find((v: any) => v.id === asset.selected_id);
                        if (selected) urls.push(selected.url);
                    } else if (asset?.variants?.[0]) {
                        urls.push(asset.variants[0].url);
                    }
                }
            } else if (type === "scene") {
                const scene = scenes.find((s: any) => s.name === name);
                if (scene?.image_asset?.variants?.[0]) {
                    urls.push(scene.image_asset.variants[0].url);
                }
            } else if (type === "prop") {
                const prop = props.find((p: any) => p.name === name);
                if (prop?.image_asset?.variants?.[0]) {
                    urls.push(prop.image_asset.variants[0].url);
                }
            }
        }
        return urls;
    }, [characters, scenes, props]);

    // Strip tags from prompt for clean text
    const cleanPrompt = (prompt: string): string => {
        return prompt.replace(/\[(character\d+|scene|prop):[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
    };

    // Generate T2I image for a shot (t2i_i2v mode stage 1)
    const generateT2I = useCallback(async (index: number) => {
        const shot = shots[index];
        if (!currentProject || !shot.prompt.trim()) return;

        setShots(prev => prev.map((s, i) =>
            i === index ? { ...s, t2iStatus: "pending" } : s
        ));

        try {
            const result = await api.renderFrame(
                currentProject.id,
                shot.id,
                {},  // compositionData (empty for now)
                cleanPrompt(shot.prompt),
                1    // batchSize
            );

            if (result?.task_id || result?.id) {
                const taskId = result.task_id || result.id;
                setShots(prev => prev.map((s, i) =>
                    i === index ? { ...s, t2iTaskId: taskId, t2iStatus: "processing" } : s
                ));
            } else if (result?.image_url || result?.rendered_image_url) {
                // Immediate result (synchronous render). Append to T2I
                // history + auto-select so the new image becomes the
                // active首帧 used by downstream I2V generation.
                const imageUrl = result.image_url || result.rendered_image_url;
                setShots(prev => prev.map((s, i) =>
                    i === index ? appendT2IImage({ ...s, t2iStatus: "completed" }, imageUrl) : s
                ));
            }
        } catch (error) {
            console.error("Failed to generate T2I for shot:", error);
            setShots(prev => prev.map((s, i) =>
                i === index ? { ...s, t2iStatus: "failed" } : s
            ));
        }
    }, [shots, currentProject]);

    // Generate video for a shot
    const generateVideo = useCallback(async (index: number) => {
        const shot = shots[index];
        if (!currentProject || !shot.prompt.trim()) return;

        const promptText = cleanPrompt(shot.prompt);

        setShots(prev => prev.map((s, i) =>
            i === index ? { ...s, videoStatus: "pending" } : s
        ));

        try {
            if (shot.tabMode === "direct_r2v") {
                // R2V mode: use reference assets. We prefer the user's
                // explicit R2V model choice (videoConfig.r2vModel) over
                // the derived route from the I2V model. The derivation
                // is kept as a fallback when the explicit r2vModel is
                // missing or invalid (which can only happen if the
                // catalog flipped under our feet).
                const referenceUrls = parseAssetTags(shot.prompt);
                const explicitR2v = videoConfig.r2vModel;
                const explicitOk = VIDEO_R2V_MODELS.some(m => m.id === explicitR2v);
                const routeModelId = explicitOk
                    ? explicitR2v
                    : getR2vRouteModelId(videoConfig.model);
                const imageBased = isR2vImageBased(routeModelId);

                const task = await api.createVideoTask(
                    currentProject.id,
                    "",  // no image_url for R2V
                    promptText,
                    videoConfig.duration,
                    undefined, // seed
                    videoConfig.resolution,
                    false, // generateAudio
                    "", // audioUrl
                    videoConfig.promptExtend,
                    videoConfig.negativePrompt,
                    1, // batchSize
                    routeModelId,  // use routed R2V model
                    shot.id, // frameId
                    "multi", // shotType
                    "r2v", // generationMode
                    !imageBased ? referenceUrls : undefined, // referenceVideoUrls (Wan 2.6 legacy)
                    undefined, undefined, undefined, // kling params
                    undefined, undefined, // vidu params
                    imageBased ? referenceUrls : undefined, // referenceImageUrls
                );

                if (task && task.id) {
                    setShots(prev => prev.map((s, i) =>
                        i === index ? { ...s, videoTaskId: task.id, videoStatus: "processing" } : s
                    ));
                }
            } else {
                // I2V mode: use T2I image as first frame.
                // Bug A guard: even if videoConfig.model passed the
                // mount-time check, the catalog can change at runtime
                // (catalog reload, project setting flip). Last sanity
                // check right before submit so we never ship an r2v-
                // only model into the I2V flow.
                const i2vModelOk = VIDEO_I2V_MODELS.some(m => m.id === videoConfig.model);
                if (!i2vModelOk) {
                    // eslint-disable-next-line no-console
                    console.warn(
                        `[Studio] Refusing to submit I2V task with model "${videoConfig.model}" ` +
                        `which is not in the visible I2V list. Falling back to "${DEFAULT_I2V_MODEL_ID}".`,
                    );
                    setVideoConfig(c => ({ ...c, model: DEFAULT_I2V_MODEL_ID }));
                    if (typeof window !== 'undefined') {
                        localStorage.removeItem('storyboard-r2v-model');
                    }
                    setShots(prev => prev.map((s, i) =>
                        i === index ? { ...s, videoStatus: "failed" as const } : s,
                    ));
                    return;
                }
                const imageUrl = shot.t2iImageUrl || shot.imageUrl || "";

                const task = await api.createVideoTask(
                    currentProject.id,
                    imageUrl,
                    promptText,
                    videoConfig.duration,
                    undefined, // seed
                    videoConfig.resolution,
                    false, // generateAudio
                    "", // audioUrl
                    videoConfig.promptExtend,
                    videoConfig.negativePrompt,
                    1, // batchSize
                    videoConfig.model, // direct I2V model
                    shot.id, // frameId
                    "multi", // shotType
                    "i2v", // generationMode
                    undefined, // referenceVideoUrls
                    // Kling params
                    videoConfig.mode,
                    videoConfig.sound,
                    videoConfig.cfgScale,
                    // Vidu params
                    videoConfig.viduAudio,
                    videoConfig.movementAmplitude,
                    // HappyHorse
                    undefined,
                );

                if (task && task.id) {
                    setShots(prev => prev.map((s, i) =>
                        i === index ? { ...s, videoTaskId: task.id, videoStatus: "processing" } : s
                    ));
                }
            }
        } catch (error) {
            console.error("Failed to generate video for shot:", error);
            setShots(prev => prev.map((s, i) =>
                i === index ? { ...s, videoStatus: "failed" } : s
            ));
        }
    }, [shots, currentProject, videoConfig, parseAssetTags]);

    // Batch-aware generation. The user's "抽卡" mental model: one
    // click of Generate ×N fires N independent createVideoTask calls
    // in parallel (each becomes its own VideoTask record on the
    // backend). All N task ids get appended to the shot's per-tab
    // bucket so the CandidatesSection can render them as one batch.
    // Refactored from the single-task generateVideo to support both
    // R2V and I2V paths; falls back to N=1 if count is undefined.
    const generateVideoBatch = useCallback(async (
        index: number,
        count: number,
        params?: Partial<ParamsState>,
    ) => {
        const shot = shots[index];
        if (!currentProject || !shot?.prompt.trim()) return;
        const promptText = cleanPrompt(shot.prompt);
        const tabMode = shot.tabMode;
        const effectiveCount = Math.max(1, Math.min(6, count || 1));

        setShots(prev => prev.map((s, i) =>
            i === index ? { ...s, videoStatus: "pending" } : s
        ));

        try {
            // Build a per-call factory so the batch fires N parallel
            // requests through Promise.all — fail-fast on any one
            // failure leaves the others untouched on the backend (the
            // BG-task wrapper handles their lifecycle independently).
            const createOne = async (): Promise<string | null> => {
                if (tabMode === "direct_r2v") {
                    const referenceUrls = parseAssetTags(shot.prompt);
                    const explicitR2v = params?.model ?? videoConfig.r2vModel;
                    const explicitOk = VIDEO_R2V_MODELS.some(m => m.id === explicitR2v);
                    const routeModelId = explicitOk
                        ? explicitR2v
                        : getR2vRouteModelId(videoConfig.model);
                    const imageBased = isR2vImageBased(routeModelId);
                    const task = await api.createVideoTask(
                        currentProject.id,
                        "",
                        promptText,
                        params?.duration ?? videoConfig.duration,
                        params?.seed,
                        params?.resolution ?? videoConfig.resolution,
                        false,
                        "",
                        params?.promptExtend ?? videoConfig.promptExtend,
                        params?.negativePrompt ?? videoConfig.negativePrompt,
                        1,
                        routeModelId,
                        shot.id,
                        params?.shotType ?? "multi",
                        "r2v",
                        !imageBased ? referenceUrls : undefined,
                        undefined, undefined, undefined,
                        undefined, undefined,
                        imageBased ? referenceUrls : undefined,
                        params?.ratio ?? videoConfig.resolution,
                    );
                    return task?.id ?? null;
                }
                // I2V branch — same defensive check on the model.
                const i2vModelId = params?.model ?? videoConfig.model;
                const i2vModelOk = VIDEO_I2V_MODELS.some(m => m.id === i2vModelId);
                if (!i2vModelOk) {
                    console.warn(`[Studio] Refusing I2V submission with non-I2V model "${i2vModelId}".`);
                    return null;
                }
                const imageUrl = getActiveT2IImageUrl(shot) || shot.imageUrl || "";
                const task = await api.createVideoTask(
                    currentProject.id,
                    imageUrl,
                    promptText,
                    params?.duration ?? videoConfig.duration,
                    params?.seed,
                    params?.resolution ?? videoConfig.resolution,
                    false,
                    "",
                    params?.promptExtend ?? videoConfig.promptExtend,
                    params?.negativePrompt ?? videoConfig.negativePrompt,
                    1,
                    i2vModelId,
                    shot.id,
                    params?.shotType ?? "multi",
                    "i2v",
                    undefined,
                    params?.mode ?? videoConfig.mode,
                    params?.sound ?? videoConfig.sound,
                    params?.cfgScale ?? videoConfig.cfgScale,
                    params?.viduAudio ?? videoConfig.viduAudio,
                    params?.movementAmplitude ?? videoConfig.movementAmplitude,
                    undefined,
                );
                return task?.id ?? null;
            };

            const taskIds = (await Promise.all(
                Array.from({ length: effectiveCount }, createOne),
            )).filter((id): id is string => !!id);

            if (taskIds.length > 0) {
                setShots(prev => prev.map((s, i) => {
                    if (i !== index) return s;
                    // Stamp each new task into the per-tab bucket; the
                    // legacy single videoTaskId mirrors the latest one
                    // so any code still reading the single field gets
                    // the most-recent batch's last task.
                    let next = s;
                    for (const tid of taskIds) {
                        next = appendVideoTaskId(next, tabMode, tid);
                    }
                    return { ...next, videoStatus: "processing" as const };
                }));
            } else {
                setShots(prev => prev.map((s, i) =>
                    i === index ? { ...s, videoStatus: "failed" as const } : s
                ));
            }
        } catch (error) {
            console.error("Batch generate failed for shot:", error);
            setShots(prev => prev.map((s, i) =>
                i === index ? { ...s, videoStatus: "failed" as const } : s
            ));
        }
    }, [shots, currentProject, videoConfig, parseAssetTags]);

    // Project-level task refresh: when any task on any shot is in
    // flight, refetch the whole project every 5s. The candidates
    // panel + queue read from currentProject.video_tasks for canonical
    // state. Cheap because it's just a GET; cancels when nothing is
    // in flight. This is independent of the per-shot poll above (the
    // per-shot poll updates shot.videoStatus / videoUrl which drives
    // the ShotCard preview; the project refresh fills in candidate
    // metadata like is_starred / label / error / final video_url).
    useEffect(() => {
        if (!currentProject?.id) return;
        const allTasks: any[] = (currentProject as any).video_tasks ?? [];
        const anyInFlight = allTasks.some(
            (t) => t.status === "pending" || t.status === "processing",
        );
        // Also poll if any local shot has an unresolved task id — that
        // covers the just-created-task window before the project state
        // has caught up.
        const localInFlight = shots.some((s) => {
            const ids = [
                ...(videoTaskIdsForTab(s, "t2i_i2v") || []),
                ...(videoTaskIdsForTab(s, "direct_r2v") || []),
            ];
            return ids.some((id) => {
                const t = allTasks.find((tt) => tt.id === id);
                return !t || t.status === "pending" || t.status === "processing";
            });
        });
        if (!anyInFlight && !localInFlight) return;
        const projectId = currentProject.id;
        const id = window.setInterval(async () => {
            try {
                const fresh = await api.getProject(projectId);
                updateProject(projectId, fresh);
            } catch {
                /* swallow — network blips are fine, next tick retries */
            }
        }, 5000);
        return () => window.clearInterval(id);
    }, [currentProject?.id, (currentProject as any)?.video_tasks, shots, updateProject]);

    // Poll for task completion (both T2I and video)
    useEffect(() => {
        const processingShots = shots.filter(s =>
            (s.videoTaskId && (s.videoStatus === "processing" || s.videoStatus === "pending")) ||
            (s.t2iTaskId && (s.t2iStatus === "processing" || s.t2iStatus === "pending"))
        );
        if (processingShots.length === 0) return;

        const interval = setInterval(async () => {
            for (const shot of processingShots) {
                // Poll video task
                if (shot.videoTaskId && (shot.videoStatus === "processing" || shot.videoStatus === "pending")) {
                    try {
                        const status = await api.getTaskStatus(shot.videoTaskId);
                        if (status.status === "completed" && status.video_url) {
                            setShots(prev => prev.map(s =>
                                s.id === shot.id ? { ...s, videoStatus: "completed", videoUrl: status.video_url } : s
                            ));
                        } else if (status.status === "failed") {
                            setShots(prev => prev.map(s =>
                                s.id === shot.id ? { ...s, videoStatus: "failed" } : s
                            ));
                        }
                    } catch (error) {
                        console.error("Video poll failed for shot:", shot.id, error);
                    }
                }
                // Poll T2I task
                if (shot.t2iTaskId && (shot.t2iStatus === "processing" || shot.t2iStatus === "pending")) {
                    try {
                        const status = await api.getTaskStatus(shot.t2iTaskId);
                        if (status.status === "completed") {
                            const imageUrl = status.image_url || status.video_url || status.result_url;
                            if (imageUrl) {
                                setShots(prev => prev.map(s =>
                                    s.id === shot.id
                                        ? appendT2IImage({ ...s, t2iStatus: "completed" }, imageUrl)
                                        : s
                                ));
                            }
                        } else if (status.status === "failed") {
                            setShots(prev => prev.map(s =>
                                s.id === shot.id ? { ...s, t2iStatus: "failed" } : s
                            ));
                        }
                    } catch (error) {
                        console.error("T2I poll failed for shot:", shot.id, error);
                    }
                }
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [shots]);

    // Insert asset tag from drawer into target shot
    const insertAssetFromDrawer = useCallback((type: string, name: string) => {
        const shotIndex = drawerState.targetShotIndex;
        if (shotIndex === null || shotIndex === undefined) return;

        const tag = `[${type}:${name}]`;
        const textarea = textareaRefs.current.get(shotIndex) ?? null;
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const currentPrompt = shots[shotIndex].prompt;
            const newPrompt = currentPrompt.slice(0, start) + tag + currentPrompt.slice(end);
            updatePrompt(shotIndex, newPrompt);
            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = start + tag.length;
                textarea.focus();
            }, 0);
        } else {
            updatePrompt(shotIndex, shots[shotIndex].prompt + " " + tag);
        }
    }, [drawerState.targetShotIndex, shots, updatePrompt]);

    // Toolbar model display: surface the model the project's workflow
    // mode actually uses, not the I2V parent. R2V projects were
    // showing "wan2.7-i2v" while their generation actually went
    // through wan2.6-r2v / wan2.7-r2v — confusing and the source of
    // the "but I selected R2V" support thread.
    const isR2VWorkflow = (currentProject?.workflow_mode ?? "r2v") === "r2v";
    const currentModelName = isR2VWorkflow
        ? (VIDEO_R2V_MODELS.find(m => m.id === videoConfig.r2vModel)?.name ?? videoConfig.r2vModel)
        : (VIDEO_I2V_MODELS.find(m => m.id === videoConfig.model)?.name ?? videoConfig.model);

    // ---- Project-level task derivations (drive Queue + Candidates) ----
    // We derive these via useMemo so per-render allocation is cheap and
    // children can rely on referentially-stable arrays (set-membership
    // tests in CompareModal etc. are correctness-sensitive).
    const allVideoTasks: VideoTask[] = useMemo(
        () => ((currentProject as any)?.video_tasks ?? []) as VideoTask[],
        [currentProject],
    );

    const tasksById = useMemo(() => {
        const map = new Map<string, VideoTask>();
        for (const t of allVideoTasks) map.set(t.id, t);
        return map;
    }, [allVideoTasks]);

    // Map shot.id → human label for the queue panel's frame column.
    const shotLabelByFrameId = useMemo(() => {
        const out: Record<string, string> = {};
        shots.forEach((s, i) => { out[s.id] = `Shot ${i + 1}`; });
        return out;
    }, [shots]);

    // In-flight aggregate count drives the TaskQueueButton badge.
    const inFlightTaskCount = useMemo(
        () => allVideoTasks.filter(t => t.status === "pending" || t.status === "processing").length,
        [allVideoTasks],
    );

    // Compare modal needs the actual VideoTask objects for the
    // currently-selected ids (in whatever order they were selected).
    const compareTasks = useMemo(() => {
        const out: VideoTask[] = [];
        Array.from(compareSelectedIds).forEach((id) => {
            const t = tasksById.get(id);
            if (t) out.push(t);
        });
        return out;
    }, [compareSelectedIds, tasksById]);

    // Per-shot candidate tasks: walk the shot's per-tab id bucket and
    // resolve each id to a project-level VideoTask. Tasks not yet
    // round-tripped to the project record are skipped (the next 5s
    // refresh tick picks them up).
    const tasksForShot = useCallback((shot: ShotNode): VideoTask[] => {
        const ids = videoTaskIdsForTab(shot, shot.tabMode);
        const out: VideoTask[] = [];
        for (const id of ids) {
            const t = tasksById.get(id);
            if (t) out.push(t);
        }
        return out;
    }, [tasksById]);

    // Build a ParamsState from videoConfig + per-shot count override.
    // Single source of truth: videoConfig drives shared knobs; shotCounts
    // overrides the batch size per shot.
    const paramsStateForShot = useCallback((shot: ShotNode): ParamsState => {
        const isR2v = shot.tabMode === "direct_r2v";
        const modelId = isR2v ? videoConfig.r2vModel : videoConfig.model;
        return {
            model: modelId,
            duration: videoConfig.duration,
            count: shotCounts[shot.id] ?? 1,
            resolution: videoConfig.resolution,
            ratio: videoConfig.resolution,
            negativePrompt: videoConfig.negativePrompt,
            promptExtend: videoConfig.promptExtend,
            cfgScale: videoConfig.cfgScale,
            mode: videoConfig.mode,
            movementAmplitude: videoConfig.movementAmplitude,
            sound: videoConfig.sound,
            viduAudio: videoConfig.viduAudio,
        };
    }, [videoConfig, shotCounts]);

    // ParamsSection.onChange handler: count goes into the per-shot
    // map; everything else writes back to the shared videoConfig (so
    // the user's most-recent picks become the new default for siblings).
    const handleShotParamsChange = useCallback((shot: ShotNode, next: ParamsState) => {
        setShotCounts(prev => ({ ...prev, [shot.id]: next.count }));
        const isR2v = shot.tabMode === "direct_r2v";
        const ls = typeof window !== "undefined" ? window.localStorage : null;
        setVideoConfig(prev => {
            const updated: VideoConfig = {
                ...prev,
                duration: next.duration,
                resolution: next.resolution ?? prev.resolution,
                negativePrompt: next.negativePrompt ?? prev.negativePrompt,
                promptExtend: next.promptExtend ?? prev.promptExtend,
                cfgScale: next.cfgScale ?? prev.cfgScale,
                mode: next.mode ?? prev.mode,
                movementAmplitude: next.movementAmplitude ?? prev.movementAmplitude,
                sound: next.sound ?? prev.sound,
                viduAudio: next.viduAudio ?? prev.viduAudio,
            };
            if (isR2v) {
                updated.r2vModel = next.model;
                ls?.setItem("storyboard-r2v-r2v-model", next.model);
            } else {
                updated.model = next.model;
                ls?.setItem("storyboard-r2v-model", next.model);
            }
            return updated;
        });
    }, []);

    // Annotate handlers wire CandidateThumb's star/label CTAs to the
    // backend PATCH endpoint. We refresh the project after each call
    // so the candidate cell re-renders with the new flag without
    // waiting for the 5s polling tick.
    const refreshProject = useCallback(async () => {
        if (!currentProject?.id) return;
        try {
            const fresh = await api.getProject(currentProject.id);
            updateProject(currentProject.id, fresh);
        } catch { /* swallow */ }
    }, [currentProject?.id, updateProject]);

    const handleToggleStar = useCallback(async (task: VideoTask, next: boolean) => {
        if (!currentProject?.id) return;
        try {
            await api.annotateVideoTask(currentProject.id, task.id, { is_starred: next });
            await refreshProject();
        } catch (err) {
            console.error("Failed to toggle star:", err);
        }
    }, [currentProject?.id, refreshProject]);

    const handleSetLabel = useCallback(async (task: VideoTask, next: string | null) => {
        if (!currentProject?.id) return;
        try {
            if (next === null || next === "") {
                await api.annotateVideoTask(currentProject.id, task.id, { clear_label: true });
            } else {
                await api.annotateVideoTask(currentProject.id, task.id, { label: next });
            }
            await refreshProject();
        } catch (err) {
            console.error("Failed to set label:", err);
        }
    }, [currentProject?.id, refreshProject]);

    const handleCancelTask = useCallback(async (task: VideoTask) => {
        if (!currentProject?.id) return;
        try {
            await api.cancelVideoTask(currentProject.id, task.id);
            await refreshProject();
        } catch (err) {
            console.error("Failed to cancel task:", err);
        }
    }, [currentProject?.id, refreshProject]);

    // Retry = fire a fresh batch of 1 for the shot owning this task,
    // reusing the task's params as best-effort. Falls back to current
    // ParamsSection state if we can't find the owner.
    const handleRetryTask = useCallback(async (task: VideoTask) => {
        const ownerIdx = shots.findIndex((s) => {
            const ids = videoTaskIdsForTab(s, s.tabMode);
            return ids.includes(task.id);
        });
        if (ownerIdx < 0) return;
        await generateVideoBatch(ownerIdx, 1);
    }, [shots, generateVideoBatch]);

    // Click on a candidate thumb: plain click = preview (open new
    // window for v1), shift-click = toggle compare-selection.
    const handleCandidateClick = useCallback((task: VideoTask, mods: { shift: boolean; meta: boolean }) => {
        if (mods.shift) {
            setCompareSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(task.id)) next.delete(task.id);
                else next.add(task.id);
                return next;
            });
            return;
        }
        if (task.video_url) {
            window.open(getAssetUrl(task.video_url), "_blank", "noopener");
        }
    }, []);

    // 复用此批参数: copy a batch's model + neg_prompt into videoConfig,
    // so the next Generate uses the same recipe. We don't change count
    // here — count remains the per-shot knob the user chose.
    const handleReuseBatchParams = useCallback((batch: BatchSummary) => {
        const first = batch.tasks[0];
        if (!first) return;
        setVideoConfig(prev => {
            const updated = { ...prev };
            // Decide which slot the batch's model lives in (I2V or R2V).
            if (VIDEO_R2V_MODELS.some(m => m.id === first.model)) {
                updated.r2vModel = first.model!;
            } else if (VIDEO_I2V_MODELS.some(m => m.id === first.model)) {
                updated.model = first.model!;
            }
            if (first.duration) updated.duration = first.duration;
            if (first.resolution) updated.resolution = first.resolution;
            if (first.negative_prompt !== undefined) updated.negativePrompt = first.negative_prompt;
            return updated;
        });
    }, []);

    // Queue's jump-to-shot: scroll the shot's wrapper into view.
    const handleJumpToShot = useCallback((frameId: string) => {
        const el = shotWrapperRefs.current.get(frameId);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, []);

    // Active candidate URL resolver — many backend video URLs are
    // relative paths needing the asset prefix to render in <video>.
    const resolveAssetUrl = useCallback((u: string) => getAssetUrl(u), []);

    return (
        <div className="h-full flex overflow-hidden relative">
        {/* Main column — pushed (compressed) when the queue panel opens
            so the queue doesn't overlay content. The flex parent splits
            available width between this main column and the side queue. */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-xl shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">
                        {shots.length} {shots.length === 1 ? "Shot" : "Shots"}
                    </span>
                    <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => addShot(shots.length - 1)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                        <Plus size={14} strokeWidth={2} />
                        {t("addShot")}
                    </motion.button>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[11px] text-text-secondary tracking-wide">{t("currentModel")}: <span className="text-foreground font-medium">{currentModelName}</span></span>
                    <TaskQueueButton
                        inFlightCount={inFlightTaskCount}
                        open={queueOpen}
                        onToggle={() => setQueueOpen(v => !v)}
                    />
                </div>
            </div>

            {/* Shot List (Timeline) */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                {shots.map((shot, index) => {
                    const shotTasks = tasksForShot(shot);
                    const shotInFlight = shotTasks.filter(
                        (t) => t.status === "pending" || t.status === "processing",
                    ).length;
                    const paramsState = paramsStateForShot(shot);
                    const isI2vTab = shot.tabMode === "t2i_i2v";
                    const modelList = shot.tabMode === "direct_r2v" ? VIDEO_R2V_MODELS : VIDEO_I2V_MODELS;
                    return (
                    <motion.div
                        key={shot.id}
                        ref={(el) => { shotWrapperRefs.current.set(shot.id, el); }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                            type: "spring",
                            stiffness: 100,
                            damping: 20,
                            delay: Math.min(index * 0.03, 0.3),
                        }}
                    >
                        <ShotCard
                            shot={shot}
                            index={index}
                            totalShots={shots.length}
                            characters={characters}
                            scenes={scenes}
                            props={props}
                            onUpdatePrompt={(prompt) => updatePrompt(index, prompt)}
                            onGenerateT2I={() => generateT2I(index)}
                            onGenerateVideo={() => generateVideo(index)}
                            onDelete={() => deleteShot(index)}
                            onMoveUp={() => moveShot(index, "up")}
                            onMoveDown={() => moveShot(index, "down")}
                            onDuplicate={() => duplicateShot(index)}
                            onSetTabMode={(mode) => setTabMode(index, mode)}
                            onOpenDrawer={() => setDrawerState({ isOpen: true, targetShotIndex: index })}
                            onInsertAsset={(type, name) => {
                                // Direct chip insert (same as chip bar logic, delegated to chip bar)
                                const tag = `[${type}:${name}]`;
                                updatePrompt(index, shots[index].prompt + " " + tag);
                            }}
                            onCancelVideo={
                                shot.videoTaskId && currentProject
                                    ? async () => {
                                        const projectId = currentProject.id;
                                        const taskId = shot.videoTaskId!;
                                        try {
                                            await api.cancelVideoTask(projectId, taskId);
                                        } finally {
                                            // Optimistic local flip — backend has
                                            // already marked failed, but the next
                                            // refetch may take a beat. Failed state
                                            // surfaces the existing Retry button.
                                            setShots(prev => prev.map((s, i) =>
                                                i === index ? { ...s, videoStatus: "failed" as const } : s,
                                            ));
                                        }
                                    }
                                    : undefined
                            }
                        />
                        {/* Attached workbench: params on top + (optional)
                            T2I首帧 strip inline + candidates panel below.
                            Connector line in ShotPanel hints "child of". */}
                        <ShotPanel>
                            <ParamsSection
                                shotId={shot.id}
                                modelList={modelList}
                                title={isI2vTab ? "I2V Params" : "R2V Params"}
                                params={paramsState}
                                onChange={(next) => handleShotParamsChange(shot, next)}
                                onGenerate={(p) => generateVideoBatch(index, p.count, p)}
                                inFlightCount={shotInFlight}
                            />
                            {isI2vTab ? (
                                <div className="border-t border-white/[0.04] px-3 py-2.5">
                                    <T2ISubsection
                                        imageUrls={shot.t2iImageUrls ?? []}
                                        selectedIndex={shot.t2iSelectedIndex ?? 0}
                                        generating={shot.t2iStatus === "pending" || shot.t2iStatus === "processing"}
                                        inFlightTaskId={shot.t2iTaskId}
                                        inFlightStatus={shot.t2iStatus}
                                        onSelect={(i) => setShots(prev => prev.map((s, j) =>
                                            j === index ? setActiveT2IIndex(s, i) : s,
                                        ))}
                                        onRemove={(i) => setShots(prev => prev.map((s, j) =>
                                            j === index ? removeT2IImage(s, i) : s,
                                        ))}
                                        onGenerate={() => generateT2I(index)}
                                        resolveUrl={resolveAssetUrl}
                                    />
                                </div>
                            ) : null}
                            <div className="border-t border-white/[0.04] px-3 py-2.5">
                                <CandidatesSection
                                    shotId={shot.id}
                                    tasks={shotTasks}
                                    activeModel={paramsState.model}
                                    compareSelectedIds={compareSelectedIds}
                                    onClickThumb={handleCandidateClick}
                                    onToggleStar={handleToggleStar}
                                    onSetLabel={handleSetLabel}
                                    onCancel={handleCancelTask}
                                    onRetry={handleRetryTask}
                                    onReuseBatchParams={handleReuseBatchParams}
                                    onOpenCompare={() => setCompareModalOpen(true)}
                                    resolveUrl={resolveAssetUrl}
                                />
                            </div>
                        </ShotPanel>
                    </motion.div>
                    );
                })}

                {/* Add shot at end */}
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(shots.length * 0.03, 0.3) }}
                    whileHover={{ scale: 1.005 }}
                    whileTap={{ scale: 0.995 }}
                    onClick={() => addShot(shots.length - 1)}
                    className="w-full py-3.5 border border-dashed border-white/[0.08] hover:border-primary/40 rounded-xl text-text-secondary hover:text-primary text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 bg-white/[0.01] hover:bg-white/[0.03]"
                >
                    <Plus size={16} strokeWidth={1.5} />
                    {t("addShot")}
                </motion.button>
            </div>

            {/* Asset Drawer (fixed overlay) */}
            <AssetDrawer
                isOpen={drawerState.isOpen}
                onClose={() => setDrawerState({ isOpen: false, targetShotIndex: null })}
                characters={characters}
                scenes={scenes}
                props={props}
                onSelectAsset={insertAssetFromDrawer}
            />
        </div>
        {/* Right-side Task Queue — pushes (does not overlay) the main
            column. Mounted in the layout flex, not as a fixed overlay,
            so width compression is automatic when it opens. */}
        <TaskQueuePanel
            open={queueOpen}
            onClose={() => setQueueOpen(false)}
            tasks={allVideoTasks}
            shotLabelByFrameId={shotLabelByFrameId}
            onJumpToShot={handleJumpToShot}
            onCancel={handleCancelTask}
            onRetry={handleRetryTask}
        />
        {/* Compare modal — portaled to body to escape clipped/transformed
            ancestors. Shows once user has shift-selected ≥2 and clicked
            the floating Compare button in any CandidatesSection. */}
        {compareModalOpen && compareTasks.length >= 2 ? (
            <CompareModal
                tasks={compareTasks}
                onClose={() => setCompareModalOpen(false)}
                resolveUrl={resolveAssetUrl}
            />
        ) : null}
        </div>
    );
}
