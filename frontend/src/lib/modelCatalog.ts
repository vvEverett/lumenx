import rawCatalog from '@/generated/modelCatalog.json';

export type DurationConfig =
    | { type: 'slider'; min: number; max: number; step: number; default: number }
    | { type: 'buttons'; options: number[]; default: number }
    | { type: 'fixed'; value: number };

export interface ModelParamSupport {
    resolution?: { options: string[]; default: string };
    seed?: boolean;
    negativePrompt?: boolean;
    promptExtend?: boolean;
    shotType?: boolean;
    audio?: boolean;
    mode?: { options: string[]; default: string };
    sound?: boolean;
    cfgScale?: { min: number; max: number; step: number; default: number };
    viduAudio?: boolean;
    movementAmplitude?: { options: string[]; default: string };
}

export interface I2VModelConfig {
    id: string;
    name: string;
    description: string;
    duration: DurationConfig;
    params: ModelParamSupport;
    badges?: string[];
    recommended?: boolean;
    family?: string;
    status?: string;
}

export interface SelectableModelOption {
    id: string;
    name: string;
    description: string;
    badges?: string[];
    recommended?: boolean;
    family?: string;
    status?: string;
}

export type ModelOption = SelectableModelOption;

export interface FrontendModelSettings {
    t2i_model: string;
    i2i_model: string;
    i2v_model: string;
    character_aspect_ratio: string;
    scene_aspect_ratio: string;
    prop_aspect_ratio: string;
    storyboard_aspect_ratio: string;
}

type SelectionGroup = 't2i' | 'i2i' | 'i2v';
type ModelStatus = 'active' | 'planned' | 'deprecated' | 'hidden';
type SettingsSurface = 'project_settings' | 'series_settings' | 'global_settings';
type VisibilitySurface = SettingsSurface | 'video_sidebar';

interface CatalogModel {
    id: string;
    display_name: string;
    description: string;
    family: string;
    status: ModelStatus;
    capabilities: string[];
    duration?: DurationConfig | null;
    params?: ModelParamSupport;
    inputs?: {
        reference_images?: {
            max?: number;
        };
        [key: string]: unknown;
    };
    ui: {
        selection_group: SelectionGroup;
        visible_in: VisibilitySurface[];
        recommended?: boolean;
        order?: number;
        badges?: string[];
    };
}

interface ModelCatalog {
    defaults: {
        model_settings: {
            t2i_model: string;
            i2i_model: string;
            i2v_model: string;
        };
    };
    models: Record<string, CatalogModel>;
    model_lines?: Record<string, unknown>;
    modes?: Record<string, unknown>;
    canonical_defaults?: {
        t2i_mode_id?: string;
        i2i_mode_id?: string;
        i2v_mode_id?: string;
    };
    compat?: {
        legacy_model_ids?: Record<string, string>;
    };
}

const MODEL_CATALOG = rawCatalog as ModelCatalog;
const CATALOG_MODELS = Object.values(MODEL_CATALOG.models);
const LEGACY_MODEL_ID_ALIASES = MODEL_CATALOG.compat?.legacy_model_ids ?? {};
const CANONICAL_MODEL_ID_ALIASES = Object.freeze(
    Object.fromEntries(
        Object.entries(LEGACY_MODEL_ID_ALIASES).map(([legacyModelId, canonicalModeId]) => [
            canonicalModeId,
            legacyModelId,
        ])
    ) as Record<string, string>
);

const DEFAULT_ASPECT_RATIOS = Object.freeze({
    character_aspect_ratio: '9:16',
    scene_aspect_ratio: '16:9',
    prop_aspect_ratio: '1:1',
    storyboard_aspect_ratio: '16:9',
});

export const DEFAULT_MODEL_SETTINGS: FrontendModelSettings = Object.freeze({
    ...MODEL_CATALOG.defaults.model_settings,
    ...DEFAULT_ASPECT_RATIOS,
});

const SORTED_MODEL_ENTRIES = [...CATALOG_MODELS].sort((left, right) => {
    const orderDelta = (right.ui.order ?? 0) - (left.ui.order ?? 0);
    if (orderDelta !== 0) {
        return orderDelta;
    }
    return left.display_name.localeCompare(right.display_name);
});

function isVisibleModel(model: CatalogModel, surface: VisibilitySurface): boolean {
    return (
        model.status !== 'planned' &&
        model.status !== 'hidden' &&
        model.ui.visible_in.includes(surface)
    );
}

function getVisibleModels(group: SelectionGroup, surface: VisibilitySurface): CatalogModel[] {
    return SORTED_MODEL_ENTRIES.filter(
        (model) => model.ui.selection_group === group && isVisibleModel(model, surface)
    );
}

function toSelectableModel(model: CatalogModel): SelectableModelOption {
    return {
        id: model.id,
        name: model.display_name,
        description: model.description,
        badges: model.ui.badges ?? [],
        recommended: !!model.ui.recommended,
        family: model.family,
        status: model.status,
    };
}

function toI2VModel(model: CatalogModel): I2VModelConfig {
    return {
        id: model.id,
        name: model.display_name,
        description: model.description,
        duration: model.duration ?? { type: 'fixed', value: 5 },
        params: model.params ?? {},
        badges: model.ui.badges ?? [],
        recommended: !!model.ui.recommended,
        family: model.family,
        status: model.status,
    };
}

function getConfiguredDefaultId(group: SelectionGroup): string {
    if (group === 't2i') {
        return MODEL_CATALOG.defaults.model_settings.t2i_model;
    }
    if (group === 'i2i') {
        return MODEL_CATALOG.defaults.model_settings.i2i_model;
    }
    return MODEL_CATALOG.defaults.model_settings.i2v_model;
}

function getFallbackVisibleModelId(group: SelectionGroup, surface: VisibilitySurface): string {
    const visibleModels = getVisibleModels(group, surface);
    const configuredDefaultId = getConfiguredDefaultId(group);

    if (visibleModels.some((model) => model.id === configuredDefaultId)) {
        return configuredDefaultId;
    }

    return visibleModels[0]?.id ?? configuredDefaultId;
}

function warnModelFallback(
    group: SelectionGroup,
    requestedId: string,
    surface: VisibilitySurface,
    fallbackId: string
): void {
    console.warn(
        `[model_catalog] Falling back ${group} model "${requestedId}" to "${fallbackId}" for ${surface}.`
    );
}

function normalizeRequestedModelId(requestedId: string | null | undefined): string | undefined {
    if (!requestedId) {
        return undefined;
    }

    return CANONICAL_MODEL_ID_ALIASES[requestedId] ?? requestedId;
}

export function resolveModelId(
    group: SelectionGroup,
    requestedId: string | null | undefined,
    surface: VisibilitySurface
): string {
    const visibleModels = getVisibleModels(group, surface);
    const normalizedRequestedId = normalizeRequestedModelId(requestedId);

    if (normalizedRequestedId && visibleModels.some((model) => model.id === normalizedRequestedId)) {
        return normalizedRequestedId;
    }

    const fallbackId = getFallbackVisibleModelId(group, surface);
    if (requestedId && normalizedRequestedId !== fallbackId) {
        warnModelFallback(group, requestedId, surface, fallbackId);
    }
    return fallbackId;
}

export function resolveModelSettings(
    settings?: Partial<FrontendModelSettings> | null,
    surface: SettingsSurface = 'project_settings'
): FrontendModelSettings {
    return {
        ...DEFAULT_MODEL_SETTINGS,
        ...settings,
        t2i_model: resolveModelId('t2i', settings?.t2i_model, surface),
        i2i_model: resolveModelId('i2i', settings?.i2i_model, surface),
        i2v_model: resolveModelId('i2v', settings?.i2v_model, surface),
        character_aspect_ratio:
            settings?.character_aspect_ratio || DEFAULT_MODEL_SETTINGS.character_aspect_ratio,
        scene_aspect_ratio:
            settings?.scene_aspect_ratio || DEFAULT_MODEL_SETTINGS.scene_aspect_ratio,
        prop_aspect_ratio:
            settings?.prop_aspect_ratio || DEFAULT_MODEL_SETTINGS.prop_aspect_ratio,
        storyboard_aspect_ratio:
            settings?.storyboard_aspect_ratio || DEFAULT_MODEL_SETTINGS.storyboard_aspect_ratio,
    };
}

export const normalizeModelSettings = resolveModelSettings;
export const normalizeModelId = resolveModelId;

export function getMaxReferenceImages(modelId?: string | null): number {
    const resolvedModelId = resolveModelId('i2i', modelId, 'project_settings');
    const maxReferenceImages =
        MODEL_CATALOG.models[resolvedModelId]?.inputs?.reference_images?.max;

    return typeof maxReferenceImages === 'number' ? maxReferenceImages : 3;
}

export const PROJECT_T2I_MODELS = getVisibleModels('t2i', 'project_settings').map(toSelectableModel);
export const SERIES_T2I_MODELS = getVisibleModels('t2i', 'series_settings').map(toSelectableModel);
export const GLOBAL_T2I_MODELS = getVisibleModels('t2i', 'global_settings').map(toSelectableModel);

export const PROJECT_I2I_MODELS = getVisibleModels('i2i', 'project_settings').map(toSelectableModel);
export const SERIES_I2I_MODELS = getVisibleModels('i2i', 'series_settings').map(toSelectableModel);
export const GLOBAL_I2I_MODELS = getVisibleModels('i2i', 'global_settings').map(toSelectableModel);

export const PROJECT_I2V_MODELS = getVisibleModels('i2v', 'project_settings').map(toI2VModel);
export const SERIES_I2V_MODELS = getVisibleModels('i2v', 'series_settings').map(toI2VModel);
export const GLOBAL_I2V_MODELS = getVisibleModels('i2v', 'global_settings').map(toI2VModel);
export const VIDEO_I2V_MODELS = getVisibleModels('i2v', 'video_sidebar').map(toI2VModel);

export const T2I_MODELS = PROJECT_T2I_MODELS;
export const I2I_MODELS = PROJECT_I2I_MODELS;
export const I2V_MODELS = PROJECT_I2V_MODELS;
export const VIDEO_SIDEBAR_I2V_MODELS = VIDEO_I2V_MODELS;

const R2V_CANDIDATES = SORTED_MODEL_ENTRIES.filter((model) =>
    model.capabilities.includes('r2v')
);

export const DEFAULT_I2V_MODEL_ID = resolveModelId('i2v', undefined, 'video_sidebar');
export const R2V_SELECTION_MODEL_ID =
    R2V_CANDIDATES.find((model) => isVisibleModel(model, 'video_sidebar'))?.id ??
    DEFAULT_I2V_MODEL_ID;
export const R2V_ROUTE_MODEL_ID =
    R2V_CANDIDATES.find((model) => model.ui.visible_in.length === 0)?.id ??
    R2V_SELECTION_MODEL_ID;

export function isR2vSelectionModel(modelId: string): boolean {
    return modelId === R2V_SELECTION_MODEL_ID;
}
