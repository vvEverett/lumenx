import rawCatalog from '@/generated/modelCatalog.json';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    DEFAULT_MODEL_SETTINGS,
    GLOBAL_I2I_MODELS,
    GLOBAL_I2V_MODELS,
    GLOBAL_T2I_MODELS,
    R2V_ROUTE_MODEL_ID,
    R2V_SELECTION_MODEL_ID,
    getMaxReferenceImages,
    resolveModelSettings,
} from '@/lib/modelCatalog';

type MockCatalog = Omit<typeof rawCatalog, 'model_lines' | 'modes' | 'compat'> & {
    model_lines?: Record<string, { id: string; family: string }>;
    modes?: Record<string, { id: string; model_line_id: string; mode: string }>;
    compat?: {
        legacy_model_ids?: Record<string, string>;
    };
};

afterEach(() => {
    vi.doUnmock('@/generated/modelCatalog.json');
    vi.resetModules();
});

describe('model catalog selectors', () => {
    it('derives visible model selectors from catalog defaults', () => {
        expect(DEFAULT_MODEL_SETTINGS).toMatchObject({
            t2i_model: 'wan2.6-t2i',
            i2i_model: 'wan2.6-image',
            i2v_model: 'wan2.6-i2v',
        });

        expect(GLOBAL_T2I_MODELS.map((model) => model.id)).toEqual([
            'wan2.6-t2i',
            'wan2.5-t2i-preview',
            'wan2.2-t2i-plus',
            'wan2.2-t2i-flash',
        ]);

        expect(GLOBAL_I2I_MODELS.map((model) => model.id)).toEqual([
            'wan2.6-image',
            'wan2.5-i2i-preview',
        ]);

        expect(GLOBAL_I2V_MODELS.map((model) => model.id)).toEqual([
            'wan2.6-i2v',
            'wan2.6-i2v-flash',
            'wan2.5-i2v-preview',
            'wan2.2-i2v-plus',
            'wan2.2-i2v-flash',
            'kling-v3',
            'viduq3-pro',
            'viduq3-turbo',
        ]);
    });

    it('keeps hidden and planned catalog entries out of visible selectors', () => {
        expect(GLOBAL_I2V_MODELS.some((model) => model.id === 'wan2.6-r2v')).toBe(false);
        expect(GLOBAL_I2V_MODELS.some((model) => model.id === 'pixverse-v4-i2v')).toBe(false);
    });
});

describe('model catalog fallbacks', () => {
    it('falls back unknown and legacy-surface ids to catalog defaults', () => {
        expect(
            resolveModelSettings(
                {
                    t2i_model: 'missing-model',
                    i2i_model: 'wan2.6-r2v',
                    i2v_model: 'missing-video-model',
                },
                'global_settings'
            )
        ).toMatchObject({
            t2i_model: 'wan2.6-t2i',
            i2i_model: 'wan2.6-image',
            i2v_model: 'wan2.6-i2v',
        });
    });

    it('normalizes canonical mode ids back to legacy compatibility ids when compat metadata exists', async () => {
        const catalogWithCompat = structuredClone(rawCatalog) as MockCatalog;
        catalogWithCompat.model_lines = {
            'wan/wan2.6-image': {
                id: 'wan/wan2.6-image',
                family: 'wan',
            },
            'wan/wan2.6-video': {
                id: 'wan/wan2.6-video',
                family: 'wan',
            },
        };
        catalogWithCompat.modes = {
            'wan/wan2.6-image#i2i': {
                id: 'wan/wan2.6-image#i2i',
                model_line_id: 'wan/wan2.6-image',
                mode: 'i2i',
            },
            'wan/wan2.6-video#i2v': {
                id: 'wan/wan2.6-video#i2v',
                model_line_id: 'wan/wan2.6-video',
                mode: 'i2v',
            },
            'wan/wan2.6-video#r2v': {
                id: 'wan/wan2.6-video#r2v',
                model_line_id: 'wan/wan2.6-video',
                mode: 'r2v',
            },
        };
        catalogWithCompat.compat = {
            legacy_model_ids: {
                'wan2.6-image': 'wan/wan2.6-image#i2i',
                'wan2.6-i2v': 'wan/wan2.6-video#i2v',
                'wan2.6-r2v': 'wan/wan2.6-video#r2v',
            },
        };

        vi.doMock('@/generated/modelCatalog.json', () => ({
            default: catalogWithCompat,
        }));

        const {
            GLOBAL_I2V_MODELS: compatI2vModels,
            R2V_ROUTE_MODEL_ID: compatR2vRouteModelId,
            R2V_SELECTION_MODEL_ID: compatR2vSelectionModelId,
            resolveModelSettings: resolveCompatModelSettings,
        } = await import('@/lib/modelCatalog');

        expect(
            resolveCompatModelSettings(
                {
                    i2i_model: 'wan/wan2.6-image#i2i',
                    i2v_model: 'wan/wan2.6-video#i2v',
                },
                'global_settings'
            )
        ).toMatchObject({
            i2i_model: 'wan2.6-image',
            i2v_model: 'wan2.6-i2v',
        });

        expect(
            resolveCompatModelSettings(
                {
                    i2v_model: 'wan/wan2.6-video#r2v',
                },
                'global_settings'
            ).i2v_model
        ).toBe('wan2.6-i2v');

        expect(compatI2vModels.map((model) => model.id)).toContain('wan2.6-i2v');
        expect(compatI2vModels.some((model) => model.id === 'wan/wan2.6-video#i2v')).toBe(false);
        expect(compatR2vSelectionModelId).toBe('wan2.6-i2v');
        expect(compatR2vRouteModelId).toBe('wan2.6-r2v');
    });
});

describe('model catalog runtime helpers', () => {
    it('derives the current R2V selection and route ids from catalog data', () => {
        expect(R2V_SELECTION_MODEL_ID).toBe('wan2.6-i2v');
        expect(R2V_ROUTE_MODEL_ID).toBe('wan2.6-r2v');
    });

    it('reads per-model reference image limits from catalog metadata', () => {
        expect(getMaxReferenceImages('wan2.6-image')).toBe(4);
        expect(getMaxReferenceImages('wan2.5-i2i-preview')).toBe(3);
    });
});
