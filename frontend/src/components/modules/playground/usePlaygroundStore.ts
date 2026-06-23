import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlaygroundMode = 't2i' | 'i2i' | 't2v' | 'i2v' | 'r2v' | 'v2v';

export interface PlaygroundOutput {
  id: string;
  media_path: string;
  media_type: 'image' | 'video';
  thumbnail_path?: string;
  saved_to_library: boolean;
  library_path?: string;
}

export type PlaygroundParameterValue = string | number | boolean | null | undefined;

export interface PlaygroundGeneration {
  id: string;
  mode: PlaygroundMode;
  model_id: string;
  prompt: string;
  negative_prompt?: string;
  input_media: string[];
  parameters: Record<string, PlaygroundParameterValue>;
  batch_size: number;
  outputs: PlaygroundOutput[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  created_at: string;
}

export interface PlaygroundInputMediaInfo {
  mediaType?: 'image' | 'video' | 'audio' | 'unknown';
  width?: number;
  height?: number;
}

export interface PlaygroundTemplate {
  id: string;
  name: string;
  category: string;
  prompt: string;
  negative_prompt?: string;
  default_mode?: PlaygroundMode;
  default_model_id?: string;
  default_parameters: Record<string, PlaygroundParameterValue>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// State & Actions
// ---------------------------------------------------------------------------

interface PlaygroundState {
  // Current input
  mode: PlaygroundMode;
  modelId: string;
  prompt: string;
  negativePrompt: string;
  inputMedia: string[];
  inputMediaInfo: Record<string, PlaygroundInputMediaInfo>;
  parameters: Record<string, PlaygroundParameterValue>;
  batchSize: number;

  // Model preferences (mode -> last used modelId)
  modelPreferences: Partial<Record<PlaygroundMode, string>>;

  // History
  history: PlaygroundGeneration[];
  historyTotal: number;

  // Templates
  templates: PlaygroundTemplate[];

  // UI
  isGenerating: boolean;
  activeGenerationIds: string[];
  showAdvancedParams: boolean;
  showTemplateModal: boolean;
  showHistoryDrawer: boolean;

  // Template favorites (local, not persisted to backend)
  favoriteTemplateIds: string[];
  toggleTemplateFavorite: (id: string) => void;
  isTemplateFavorited: (id: string) => boolean;

  // Actions — input setters
  setMode: (mode: PlaygroundMode) => void;
  setModelId: (modelId: string) => void;
  setPrompt: (prompt: string) => void;
  setNegativePrompt: (neg: string) => void;
  setInputMedia: (media: string[]) => void;
  setInputMediaInfo: (path: string, info: PlaygroundInputMediaInfo) => void;
  setParameters: (params: Record<string, PlaygroundParameterValue>) => void;
  setBatchSize: (size: number) => void;
  setShowAdvancedParams: (show: boolean) => void;
  setShowTemplateModal: (show: boolean) => void;
  setShowHistoryDrawer: (show: boolean) => void;

  // Actions — generation lifecycle
  startGeneration: (gen: PlaygroundGeneration) => void;
  updateGeneration: (gen: PlaygroundGeneration) => void;
  removeGeneration: (id: string) => void;

  // Actions — history
  setHistory: (history: PlaygroundGeneration[]) => void;
  setHistoryPage: (history: PlaygroundGeneration[], total: number) => void;
  appendHistoryPage: (history: PlaygroundGeneration[], total: number) => void;
  appendToHistory: (gen: PlaygroundGeneration) => void;

  // Actions — templates
  setTemplates: (templates: PlaygroundTemplate[]) => void;
  addTemplate: (template: PlaygroundTemplate) => void;
  updateTemplate: (template: PlaygroundTemplate) => void;
  removeTemplate: (id: string) => void;
  applyTemplate: (template: PlaygroundTemplate) => void;

  // Actions — reset
  resetInput: () => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MODE: PlaygroundMode = 't2i';
const DEFAULT_MODEL_ID = '';
const DEFAULT_PROMPT = '';
const DEFAULT_BATCH_SIZE = 1;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  // -- Current input --------------------------------------------------------
  mode: DEFAULT_MODE,
  modelId: DEFAULT_MODEL_ID,
  prompt: DEFAULT_PROMPT,
  negativePrompt: '',
  inputMedia: [],
  inputMediaInfo: {},
  parameters: {},
  batchSize: DEFAULT_BATCH_SIZE,

  // -- Model preferences ----------------------------------------------------
  modelPreferences: {},

  // -- History ---------------------------------------------------------------
  history: [],
  historyTotal: 0,

  // -- Templates -------------------------------------------------------------
  templates: [],

  // -- UI --------------------------------------------------------------------
  isGenerating: false,
  activeGenerationIds: [],
  showAdvancedParams: false,
  showTemplateModal: false,
  showHistoryDrawer: false,

  // -- Template favorites ----------------------------------------------------
  favoriteTemplateIds: [],
  toggleTemplateFavorite: (id) => {
    const { favoriteTemplateIds } = get();
    if (favoriteTemplateIds.includes(id)) {
      set({ favoriteTemplateIds: favoriteTemplateIds.filter((fid) => fid !== id) });
    } else {
      set({ favoriteTemplateIds: [...favoriteTemplateIds, id] });
    }
  },
  isTemplateFavorited: (id) => get().favoriteTemplateIds.includes(id),

  // =========================================================================
  // Actions
  // =========================================================================

  // -- Input setters ---------------------------------------------------------

  setMode: (mode) => {
    const { modelPreferences } = get();
    const preferredModel = modelPreferences[mode];
    set({
      mode,
      ...(preferredModel !== undefined ? { modelId: preferredModel } : {}),
    });
  },

  setModelId: (modelId) => {
    const { mode, modelPreferences } = get();
    set({
      modelId,
      modelPreferences: { ...modelPreferences, [mode]: modelId },
    });
  },

  setPrompt: (prompt) => set({ prompt }),

  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),

  setInputMedia: (inputMedia) =>
    set((s) => {
      const kept = new Set(inputMedia);
      const inputMediaInfo = Object.fromEntries(
        Object.entries(s.inputMediaInfo).filter(([path]) => kept.has(path))
      );
      return { inputMedia, inputMediaInfo };
    }),

  setInputMediaInfo: (path, info) =>
    set((s) => ({
      inputMediaInfo: {
        ...s.inputMediaInfo,
        [path]: {
          ...s.inputMediaInfo[path],
          ...info,
        },
      },
    })),

  setParameters: (parameters) => set({ parameters }),

  setBatchSize: (batchSize) => set({ batchSize }),

  setShowAdvancedParams: (showAdvancedParams) => set({ showAdvancedParams }),

  setShowTemplateModal: (showTemplateModal) => set({ showTemplateModal }),

  setShowHistoryDrawer: (showHistoryDrawer) => set({ showHistoryDrawer }),

  // -- Generation lifecycle --------------------------------------------------

  startGeneration: (gen) => {
    const { activeGenerationIds, history, historyTotal } = get();
    const alreadyInHistory = history.some((item) => item.id === gen.id);
    set({
      activeGenerationIds: [...activeGenerationIds, gen.id],
      history: alreadyInHistory ? history : [gen, ...history],
      historyTotal: alreadyInHistory
        ? historyTotal
        : Math.max(historyTotal, history.length) + 1,
      isGenerating: true,
    });
  },

  updateGeneration: (gen) => {
    const { history, activeGenerationIds } = get();
    const updatedHistory = history.map((h) => (h.id === gen.id ? gen : h));
    const isTerminal = gen.status === 'completed' || gen.status === 'failed';
    const updatedActive = isTerminal
      ? activeGenerationIds.filter((id) => id !== gen.id)
      : activeGenerationIds;

    set({
      history: updatedHistory,
      activeGenerationIds: updatedActive,
      isGenerating: updatedActive.length > 0,
    });
  },

  removeGeneration: (id) => {
    const { history, activeGenerationIds, historyTotal } = get();
    const updatedActive = activeGenerationIds.filter((gid) => gid !== id);
    const existedInHistory = history.some((h) => h.id === id);
    set({
      history: history.filter((h) => h.id !== id),
      historyTotal: existedInHistory
        ? Math.max(0, Math.max(historyTotal, history.length) - 1)
        : historyTotal,
      activeGenerationIds: updatedActive,
      isGenerating: updatedActive.length > 0,
    });
  },

  // -- History ---------------------------------------------------------------

  setHistory: (history) => set({ history, historyTotal: history.length }),

  setHistoryPage: (history, total) => set({ history, historyTotal: total }),

  appendHistoryPage: (history, total) => set((s) => {
    const seenIds = new Set(s.history.map((item) => item.id));
    const newItems = history.filter((item) => !seenIds.has(item.id));
    return {
      history: [...s.history, ...newItems],
      historyTotal: total,
    };
  }),

  appendToHistory: (gen) => set((s) => {
    const alreadyInHistory = s.history.some((item) => item.id === gen.id);
    return {
      history: alreadyInHistory ? s.history : [gen, ...s.history],
      historyTotal: alreadyInHistory
        ? s.historyTotal
        : Math.max(s.historyTotal, s.history.length) + 1,
    };
  }),

  // -- Templates -------------------------------------------------------------

  setTemplates: (templates) => set({ templates }),

  addTemplate: (template) =>
    set((s) => ({ templates: [...s.templates, template] })),

  updateTemplate: (template) =>
    set((s) => ({
      templates: s.templates.map((t) => (t.id === template.id ? template : t)),
    })),

  removeTemplate: (id) =>
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),

  applyTemplate: (template) => {
    const patch: Partial<PlaygroundState> = {
      prompt: template.prompt,
    };
    if (template.negative_prompt != null) {
      patch.negativePrompt = template.negative_prompt;
    }
    if (template.default_mode != null) {
      patch.mode = template.default_mode;
    }
    if (template.default_model_id != null) {
      patch.modelId = template.default_model_id;
    }
    if (
      template.default_parameters != null &&
      Object.keys(template.default_parameters).length > 0
    ) {
      patch.parameters = template.default_parameters;
    }
    set(patch);
  },

  // -- Reset -----------------------------------------------------------------

  resetInput: () =>
    set({
      prompt: DEFAULT_PROMPT,
      negativePrompt: '',
      inputMedia: [],
      inputMediaInfo: {},
      parameters: {},
      batchSize: DEFAULT_BATCH_SIZE,
    }),
}));
