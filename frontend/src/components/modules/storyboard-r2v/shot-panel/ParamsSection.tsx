"use client";
/**
 * ParamsSection — the upper half of the attached ShotPanel. Contains:
 *   - model picker (pills, wraps to next line if many)
 *   - basic params (duration / count / resolution / ratio)
 *   - advanced params (collapsible: negative / seed / cfg / mode /
 *     movement / sound / vidu audio / prompt extend / shot type)
 *   - Generate ×N button (bottom-right)
 *
 * Param visibility is fully driven by the active model's
 * `modelParams: ModelParamSupport` from the catalog. Switching models
 * resets per-param defaults (except NegativePrompt, which is
 * preserved across model swaps because users hate losing typed
 * prompts).
 *
 * This component is parameter-list rendering only. Actual generation
 * is delegated via onGenerate(payload) so the host (StoryboardR2V)
 * can manage tasks, queue, and shot-state updates.
 */
import { useCallback, useMemo } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { I2VModelConfig, DurationConfig, ModelParamSupport } from "@/lib/modelCatalog";
import { usePanelSectionState } from "./usePanelSectionState";
import SectionShell from "./SectionShell";

/** Snapshot of every configurable param this panel can collect.
 *  Sub-fields are kept Optional so a model that doesn't expose a
 *  given param simply leaves the field as undefined / default. */
export interface ParamsState {
    model: string;
    duration: number;
    count: number;
    resolution?: string;
    ratio?: string;
    // Advanced
    negativePrompt?: string;
    seed?: number;
    promptExtend?: boolean;
    cfgScale?: number;
    mode?: string;
    movementAmplitude?: string;
    sound?: boolean;
    viduAudio?: boolean;
    shotType?: string;
}

interface ParamsSectionProps {
    shotId: string;
    /** Pickable models for this section (already filtered for the
     *  active tab — I2V models for t2i_i2v, R2V models for direct_r2v). */
    modelList: I2VModelConfig[];
    /** Section title shown in the SectionShell header. */
    title: string;
    params: ParamsState;
    onChange: (next: ParamsState) => void;
    onGenerate: (params: ParamsState) => void;
    /** When true, Generate is disabled (e.g. provider key missing,
     *  task already in-flight). Tooltip shows the reason. */
    generateDisabled?: boolean;
    generateDisabledReason?: string;
    /** Active in-flight count for this shot — flips the button text
     *  to "Generating…" while a batch is running. */
    inFlightCount?: number;
}

const COUNT_OPTIONS = [1, 2, 4, 6] as const;

export default function ParamsSection({
    shotId,
    modelList,
    title,
    params,
    onChange,
    onGenerate,
    generateDisabled = false,
    generateDisabledReason,
    inFlightCount = 0,
}: ParamsSectionProps) {
    const [open, setOpen] = usePanelSectionState(shotId, "params", true);
    const [advOpen, setAdvOpen] = usePanelSectionState(shotId, "params-advanced", false);

    const activeModel: I2VModelConfig | undefined = useMemo(
        () => modelList.find((m) => m.id === params.model) ?? modelList[0],
        [modelList, params.model],
    );
    const modelParams: ModelParamSupport = activeModel?.params ?? {};
    const durationCfg: DurationConfig = activeModel?.duration ?? { type: "fixed", value: 5 };

    const set = useCallback(<K extends keyof ParamsState>(key: K, value: ParamsState[K]) => {
        onChange({ ...params, [key]: value });
    }, [params, onChange]);

    const handleModelChange = useCallback((nextModelId: string) => {
        const next = modelList.find((m) => m.id === nextModelId);
        if (!next) return;
        // Reset per-model defaults but PRESERVE the user's negative
        // prompt across model swaps — losing typed text on a model
        // switch is a frequent papercut.
        const dc = next.duration;
        const safeDuration = (() => {
            if (dc.type === "fixed") return dc.value;
            if (dc.type === "slider") {
                if (params.duration >= dc.min && params.duration <= dc.max) return params.duration;
                return dc.default;
            }
            if (dc.options.includes(params.duration)) return params.duration;
            return dc.default;
        })();
        const np = next.params ?? {};
        onChange({
            ...params,
            model: nextModelId,
            duration: safeDuration,
            resolution: np.resolution?.default ?? params.resolution,
            ratio: np.ratio?.default ?? params.ratio,
            promptExtend: typeof np.promptExtend === "boolean" ? np.promptExtend : params.promptExtend,
            cfgScale: np.cfgScale?.default ?? params.cfgScale,
            mode: np.mode?.default ?? params.mode,
            movementAmplitude: np.movementAmplitude?.default ?? params.movementAmplitude,
            sound: typeof np.sound === "boolean" ? np.sound : params.sound,
            viduAudio: typeof np.viduAudio === "boolean" ? np.viduAudio : params.viduAudio,
            // negativePrompt intentionally preserved
        });
    }, [modelList, params, onChange]);

    const hasAdvanced =
        !!modelParams.negativePrompt ||
        !!modelParams.seed ||
        !!modelParams.promptExtend ||
        !!modelParams.cfgScale ||
        !!modelParams.mode ||
        !!modelParams.movementAmplitude ||
        !!modelParams.sound ||
        !!modelParams.viduAudio ||
        !!modelParams.shotType;

    const generating = inFlightCount > 0;

    return (
        <SectionShell
            title={title}
            open={open}
            onToggle={() => setOpen(!open)}
            subtitle={activeModel ? `${activeModel.name}` : undefined}
        >
            <div className="space-y-3">
                {/* Model picker — pills wrap. */}
                <ParamRow label="Model">
                    <div className="flex flex-wrap gap-1.5">
                        {modelList.map((m) => {
                            const active = params.model === m.id;
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => handleModelChange(m.id)}
                                    title={m.description}
                                    className={`rounded-full border px-2.5 py-[3px] font-mono text-[10px] font-medium tracking-wide transition-colors ${
                                        active
                                            ? "border-primary/45 bg-primary/15 text-primary"
                                            : "border-white/10 bg-black/20 text-text-secondary hover:border-white/20 hover:text-foreground"
                                    }`}
                                >
                                    {m.name}
                                </button>
                            );
                        })}
                    </div>
                </ParamRow>

                {/* Duration */}
                <ParamRow label="Duration">
                    <DurationControl
                        cfg={durationCfg}
                        value={params.duration}
                        onChange={(v) => set("duration", v)}
                    />
                </ParamRow>

                {/* Count (batch size) */}
                <ParamRow label="Count">
                    <div className="flex items-center gap-1">
                        {COUNT_OPTIONS.map((n) => {
                            const active = params.count === n;
                            return (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => set("count", n)}
                                    className={`grid h-7 w-9 place-items-center rounded-md border font-mono text-[11px] font-medium transition-colors ${
                                        active
                                            ? "border-primary/45 bg-primary/15 text-primary"
                                            : "border-white/10 bg-black/20 text-text-secondary hover:border-white/20 hover:text-foreground"
                                    }`}
                                >
                                    ×{n}
                                </button>
                            );
                        })}
                    </div>
                </ParamRow>

                {/* Resolution */}
                {modelParams.resolution ? (
                    <ParamRow label="Resolution">
                        <PillCluster
                            options={modelParams.resolution.options}
                            value={params.resolution ?? modelParams.resolution.default}
                            onChange={(v) => set("resolution", v)}
                        />
                    </ParamRow>
                ) : null}

                {/* Ratio */}
                {modelParams.ratio ? (
                    <ParamRow label="Ratio">
                        <PillCluster
                            options={modelParams.ratio.options}
                            value={params.ratio ?? modelParams.ratio.default}
                            onChange={(v) => set("ratio", v)}
                        />
                    </ParamRow>
                ) : null}

                {/* Advanced fold */}
                {hasAdvanced ? (
                    <div className="rounded-md border border-dashed border-white/8">
                        <button
                            type="button"
                            onClick={() => setAdvOpen(!advOpen)}
                            className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-text-secondary hover:text-foreground"
                        >
                            <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.22em]">
                                {advOpen ? "▼" : "▶"} Advanced
                            </span>
                            <span className="font-mono text-[9px] tracking-tight text-text-muted/85">
                                {countAdvancedParams(modelParams)} params
                            </span>
                        </button>
                        {advOpen ? (
                            <div className="space-y-3 border-t border-white/6 px-3 py-3">
                                {modelParams.negativePrompt ? (
                                    <ParamRow label="Negative">
                                        <input
                                            type="text"
                                            value={params.negativePrompt ?? ""}
                                            onChange={(e) => set("negativePrompt", e.target.value)}
                                            placeholder="things to avoid…"
                                            className="w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-foreground placeholder:text-text-muted/65 outline-none focus:border-primary/45"
                                        />
                                    </ParamRow>
                                ) : null}
                                {modelParams.seed ? (
                                    <ParamRow label="Seed">
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="number"
                                                value={params.seed ?? ""}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    set("seed", v === "" ? undefined : parseInt(v, 10));
                                                }}
                                                placeholder="random"
                                                className="w-32 rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-[11px] text-foreground placeholder:text-text-muted/65 outline-none focus:border-primary/45"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => set("seed", Math.floor(Math.random() * 1_000_000_000))}
                                                className="grid h-7 w-7 place-items-center rounded text-text-muted hover:bg-white/[0.06] hover:text-foreground"
                                                title="New random seed"
                                            >
                                                🎲
                                            </button>
                                        </div>
                                    </ParamRow>
                                ) : null}
                                {modelParams.cfgScale ? (
                                    <ParamRow label="CFG">
                                        <SliderControl
                                            min={modelParams.cfgScale.min}
                                            max={modelParams.cfgScale.max}
                                            step={modelParams.cfgScale.step}
                                            value={params.cfgScale ?? modelParams.cfgScale.default}
                                            onChange={(v) => set("cfgScale", v)}
                                        />
                                    </ParamRow>
                                ) : null}
                                {modelParams.mode ? (
                                    <ParamRow label="Mode">
                                        <PillCluster
                                            options={modelParams.mode.options}
                                            value={params.mode ?? modelParams.mode.default}
                                            onChange={(v) => set("mode", v)}
                                        />
                                    </ParamRow>
                                ) : null}
                                {modelParams.movementAmplitude ? (
                                    <ParamRow label="Motion">
                                        <PillCluster
                                            options={modelParams.movementAmplitude.options}
                                            value={params.movementAmplitude ?? modelParams.movementAmplitude.default}
                                            onChange={(v) => set("movementAmplitude", v)}
                                        />
                                    </ParamRow>
                                ) : null}
                                {modelParams.sound ? (
                                    <ParamRow label="Sound">
                                        <ToggleControl
                                            value={!!params.sound}
                                            onChange={(v) => set("sound", v)}
                                        />
                                    </ParamRow>
                                ) : null}
                                {modelParams.viduAudio ? (
                                    <ParamRow label="Vidu audio">
                                        <ToggleControl
                                            value={!!params.viduAudio}
                                            onChange={(v) => set("viduAudio", v)}
                                        />
                                    </ParamRow>
                                ) : null}
                                {modelParams.promptExtend ? (
                                    <ParamRow label="Prompt extend">
                                        <ToggleControl
                                            value={!!params.promptExtend}
                                            onChange={(v) => set("promptExtend", v)}
                                        />
                                    </ParamRow>
                                ) : null}
                                {modelParams.shotType ? (
                                    <ParamRow label="Shot type">
                                        <PillCluster
                                            options={typeof modelParams.shotType === "boolean"
                                                ? ["single", "multi"]
                                                : modelParams.shotType.options}
                                            value={params.shotType ?? (typeof modelParams.shotType === "object" ? modelParams.shotType.default : "single")}
                                            onChange={(v) => set("shotType", v)}
                                        />
                                    </ParamRow>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {/* Generate */}
                <div className="flex items-center justify-end pt-1">
                    <button
                        type="button"
                        onClick={() => onGenerate(params)}
                        disabled={generateDisabled || generating}
                        title={generateDisabledReason}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),0_4px_12px_-4px_rgba(100,108,255,0.5)] transition-all hover:bg-primary/92 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {generating ? (
                            <>
                                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                                Generating {inFlightCount}…
                            </>
                        ) : (
                            <>
                                <Sparkles size={12} aria-hidden="true" />
                                Generate ×{params.count}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </SectionShell>
    );
}

// ---------- Sub-components ----------

function ParamRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-3">
            <span className="w-24 shrink-0 pt-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-text-muted/85">
                {label}
            </span>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

function PillCluster({
    options,
    value,
    onChange,
}: {
    options: ReadonlyArray<string | number>;
    value: string | number;
    onChange: (v: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-1">
            {options.map((opt) => {
                const active = String(value) === String(opt);
                return (
                    <button
                        key={String(opt)}
                        type="button"
                        onClick={() => onChange(String(opt))}
                        className={`rounded-md border px-2 py-[3px] font-mono text-[10px] font-medium transition-colors ${
                            active
                                ? "border-primary/45 bg-primary/15 text-primary"
                                : "border-white/10 bg-black/20 text-text-secondary hover:border-white/20 hover:text-foreground"
                        }`}
                    >
                        {opt}
                    </button>
                );
            })}
        </div>
    );
}

function DurationControl({
    cfg,
    value,
    onChange,
}: {
    cfg: DurationConfig;
    value: number;
    onChange: (v: number) => void;
}) {
    if (cfg.type === "fixed") {
        return (
            <span className="font-mono text-[11px] text-text-secondary">
                {cfg.value}s <span className="text-text-muted/65">(fixed)</span>
            </span>
        );
    }
    if (cfg.type === "buttons") {
        return (
            <PillCluster
                options={cfg.options.map((n) => String(n))}
                value={String(value)}
                onChange={(v) => onChange(parseInt(v, 10))}
            />
        );
    }
    // slider
    return (
        <div className="flex items-center gap-2">
            <input
                type="range"
                min={cfg.min}
                max={cfg.max}
                step={cfg.step}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value, 10))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-primary"
            />
            <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">
                {value}s
            </span>
        </div>
    );
}

function SliderControl({
    min,
    max,
    step,
    value,
    onChange,
}: {
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-primary"
            />
            <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">
                {value}
            </span>
        </div>
    );
}

function ToggleControl({
    value,
    onChange,
}: {
    value: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => onChange(!value)}
            aria-pressed={value}
            className={`relative h-5 w-9 rounded-full transition-colors ${
                value ? "bg-primary" : "bg-white/10"
            }`}
        >
            <span
                className={`absolute top-[2px] h-4 w-4 rounded-full bg-white shadow transition-all ${
                    value ? "left-[18px]" : "left-[2px]"
                }`}
            />
        </button>
    );
}

function countAdvancedParams(mp: ModelParamSupport): number {
    let n = 0;
    if (mp.negativePrompt) n++;
    if (mp.seed) n++;
    if (mp.cfgScale) n++;
    if (mp.mode) n++;
    if (mp.movementAmplitude) n++;
    if (mp.sound) n++;
    if (mp.viduAudio) n++;
    if (mp.promptExtend) n++;
    if (mp.shotType) n++;
    return n;
}
