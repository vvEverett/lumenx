"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { Save, Loader2, ChevronDown, ChevronRight, FolderOpen, WifiOff, Copy, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, type EnvConfigPayload, type ProviderMode, API_URL } from "@/lib/api";
import { ASPECT_RATIOS } from "@/store/projectStore";
import {
  DEFAULT_MODEL_SETTINGS,
  GLOBAL_I2V_MODELS,
  GLOBAL_R2V_MODELS,
  GLOBAL_IMAGE_MODELS,
  normalizeModelSettings,
  type FrontendModelSettings,
} from "@/lib/modelCatalog";
import { useSettingsStore, type Locale, type ThemePreset } from "@/store/settingsStore";
import { toast } from "@/store/toastStore";
import { rovingKeyDown } from "@/lib/a11y";
import { Image, Video, Layout, User, Building, Box } from "lucide-react";
import GroupedModelGrid from "@/components/common/GroupedModelGrid";
import LumenXBranding from "@/components/layout/LumenXBranding";
import UpdateChecker from "./UpdateChecker";
type SettingsCategory = "general" | "models" | "prompts" | "apikeys" | "storage" | "about";
import {
  FormRow,
  FieldLabel,
  KeyField,
  Toggle,
  ModeSegment,
  settingsInputClass,
} from "./SettingsControls";

const APP_VERSION = "v0.2.0";

type EnvConfig = EnvConfigPayload & {
  DASHSCOPE_API_KEY: string;
  ALIBABA_CLOUD_ACCESS_KEY_ID: string;
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: string;
  OSS_ENABLE: boolean;
  OSS_BUCKET_NAME: string;
  OSS_ENDPOINT: string;
  OSS_BASE_PATH: string;
  KLING_PROVIDER_MODE: ProviderMode;
  VIDU_PROVIDER_MODE: ProviderMode;
  PIXVERSE_PROVIDER_MODE: ProviderMode;
  KLING_ACCESS_KEY: string;
  KLING_SECRET_KEY: string;
  VIDU_API_KEY: string;
  MULEROUTER_API_KEY: string;
  MULERUN_CLI_LOGGED_IN?: boolean;
  endpoint_overrides: Record<string, string>;
};

const ENDPOINT_PROVIDERS = [
  { key: "DASHSCOPE_BASE_URL", label: "DashScope", placeholder: "https://dashscope.aliyuncs.com" },
  { key: "KLING_BASE_URL", label: "Kling", placeholder: "https://api-beijing.klingai.com/v1" },
  { key: "VIDU_BASE_URL", label: "Vidu", placeholder: "https://api.vidu.cn/ent/v2" },
  { key: "MULEROUTER_BASE_URL", label: "MuleRouter", placeholder: "https://api.mulerouter.ai" },
];

const DEFAULT_CONFIG: EnvConfig = {
  DASHSCOPE_API_KEY: "",
  ALIBABA_CLOUD_ACCESS_KEY_ID: "",
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: "",
  OSS_ENABLE: true,
  OSS_BUCKET_NAME: "",
  OSS_ENDPOINT: "",
  OSS_BASE_PATH: "",
  KLING_PROVIDER_MODE: "dashscope",
  VIDU_PROVIDER_MODE: "dashscope",
  PIXVERSE_PROVIDER_MODE: "dashscope",
  KLING_ACCESS_KEY: "",
  KLING_SECRET_KEY: "",
  VIDU_API_KEY: "",
  MULEROUTER_API_KEY: "",
  endpoint_overrides: {},
};

const normalizeProviderMode = (mode?: string): ProviderMode => (mode === "vendor" ? "vendor" : "dashscope");

const normalizeEnvConfig = (existing: EnvConfig, data?: EnvConfigPayload): EnvConfig => ({
  ...existing,
  ...data,
  KLING_PROVIDER_MODE: normalizeProviderMode(data?.KLING_PROVIDER_MODE ?? existing.KLING_PROVIDER_MODE),
  VIDU_PROVIDER_MODE: normalizeProviderMode(data?.VIDU_PROVIDER_MODE ?? existing.VIDU_PROVIDER_MODE),
  PIXVERSE_PROVIDER_MODE: normalizeProviderMode(data?.PIXVERSE_PROVIDER_MODE ?? existing.PIXVERSE_PROVIDER_MODE),
  endpoint_overrides: data?.endpoint_overrides ?? existing.endpoint_overrides ?? {},
});

const getValidationErrors = (env: EnvConfig): string[] => {
  const errors: string[] = [];
  if (!env.DASHSCOPE_API_KEY?.trim()) errors.push("DashScope API Key");
  if (env.KLING_PROVIDER_MODE === "vendor") {
    if (!env.KLING_ACCESS_KEY?.trim()) errors.push("Kling Access Key (vendor mode)");
    if (!env.KLING_SECRET_KEY?.trim()) errors.push("Kling Secret Key (vendor mode)");
  }
  if (env.VIDU_PROVIDER_MODE === "vendor" && !env.VIDU_API_KEY?.trim()) {
    errors.push("Vidu API Key (vendor mode)");
  }
  return errors;
};

const LS_KEY_MODEL = "lumenx_default_model_settings";
const LS_KEY_PROMPT = "lumenx_default_prompt_config";

interface DefaultPromptConfig {
  storyboard_polish: string;
  video_polish: string;
  r2v_polish: string;
  entity_extraction: string;
  style_analysis: string;
  storyboard_extraction: string;
}

const EMPTY_PROMPT_CONFIG: DefaultPromptConfig = {
  storyboard_polish: "",
  video_polish: "",
  r2v_polish: "",
  entity_extraction: "",
  style_analysis: "",
  storyboard_extraction: "",
};

function loadFromLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

const THEME_OPTIONS: { id: ThemePreset; name: string; desc: string; base: string; primary: string; accent: string }[] = [
  { id: "atelier-dark",  name: "Atelier 暗",  desc: "暖石墨 · teal",   base: "#0c0b0e", primary: "#34d8c4", accent: "#ffa94d" },
  { id: "bridge-dark",   name: "Warm Bridge", desc: "暖中性 · 品牌蓝", base: "#0a0a0d", primary: "#646cff", accent: "#ffa94d" },
  { id: "brand-dark",    name: "Brand 暗",    desc: "冷黑 · 品牌蓝",   base: "#050508", primary: "#646cff", accent: "#ff0080" },
  { id: "atelier-light", name: "Atelier 亮",  desc: "暖陶白 · teal",   base: "#f6f1e9", primary: "#1d9c8d", accent: "#e8852b" },
  { id: "brand-light",   name: "品牌亮",      desc: "冷白 · 品牌蓝",   base: "#f8f9fa", primary: "#646cff", accent: "#ff0080" },
];

interface SystemReport {
  ffmpeg?: { available: boolean; message: string; path: string | null };
  status?: string;
}

/* Frameless atelier section wrapper (Phase 2 ①): no glass panel / heavy
   border — each section blends into the page background. Serif title + a
   single hairline divider keep structure. Replaces the boxed Section
   on the settings page (model cards / inputs keep their own surfaces). */
function Section({
  id,
  title,
  desc,
  children,
}: {
  id?: string;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="mb-5 pb-3.5 border-b border-glass-border">
        <h2
          id={id ? `${id}-title` : undefined}
          className="font-display atelier-display text-xl font-semibold text-foreground tracking-tight"
        >
          {title}
        </h2>
        {desc && <p className="text-[12px] text-text-secondary mt-1 leading-relaxed">{desc}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const { locale, theme, animations, setLocale, setTheme, setAnimations } = useSettingsStore();

  const [active, setActive] = useState<SettingsCategory>("general");

  // ── API Config ──
  const [config, setConfig] = useState<EnvConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [endpointsOpen, setEndpointsOpen] = useState(false);

  // ── Default Model Settings ──
  const [modelSettings, setModelSettings] = useState<FrontendModelSettings>(() =>
    normalizeModelSettings(loadFromLS(LS_KEY_MODEL, DEFAULT_MODEL_SETTINGS), "global_settings")
  );

  // ── Default Prompt Config ──
  // `promptConfig` is the displayed/editable text. localStorage (LS_KEY_PROMPT)
  // only ever stores DELTAS: an empty value means "use the built-in default".
  // `promptDefaults` holds the real built-in defaults fetched from the backend
  // so we can pre-fill the fields and run the delta comparison on save.
  const [promptConfig, setPromptConfig] = useState<DefaultPromptConfig>(() =>
    loadFromLS(LS_KEY_PROMPT, EMPTY_PROMPT_CONFIG)
  );
  const [promptDefaults, setPromptDefaults] = useState<Record<string, string>>({});

  // ── About / system ──
  const [online, setOnline] = useState(true);
  const [dataDir, setDataDir] = useState<string>("");
  const [logDir, setLogDir] = useState<string>("");
  const [system, setSystem] = useState<SystemReport | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemChecked, setSystemChecked] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getEnvConfig();
      setConfig((prev) => normalizeEnvConfig(prev, data));
    } catch {
      setLoadError("无法加载配置。后端是否已启动？");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Pre-fill the prompt fields with the real built-in defaults so users can see
  // and edit from them. We remember the fetched defaults for the delta-save
  // comparison, and only fill a field the user has NOT overridden (empty in LS).
  // If the fetch fails we leave the fields empty (placeholder) — no crash.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const defaults = await api.fetchPromptDefaults();
        if (cancelled || !defaults) return;
        setPromptDefaults(defaults);
        setPromptConfig((prev) => {
          const next = { ...prev };
          (Object.keys(EMPTY_PROMPT_CONFIG) as (keyof DefaultPromptConfig)[]).forEach((k) => {
            const d = defaults[k];
            if (typeof d === "string" && d && !prev[k]) next[k] = d;
          });
          return next;
        });
      } catch {
        /* defaults unavailable — fields fall back to empty placeholders */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Online/offline detection for the banner.
  useEffect(() => {
    const update = () => setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Pull health (data/log dir) once on mount so About + Storage can show paths.
  useEffect(() => {
    (async () => {
      try {
        const h = await api.healthCheck();
        if (h.log_dir) setLogDir(h.log_dir);
        if (h.log_file) {
          // data dir = parent of logs dir (logs lives under <data>/logs)
          const dir = h.log_dir.replace(/\/logs\/?$/, "");
          setDataDir(dir || h.log_dir);
        }
      } catch {
        /* backend offline — About shows fallback */
      }
    })();
  }, []);

  const loadSystem = useCallback(async () => {
    setSystemLoading(true);
    try {
      const r = await api.checkSystem();
      setSystem({ ffmpeg: r.dependencies?.ffmpeg, status: r.status });
      // Lock only on success so a recovered backend is reflected without
      // forcing a manual retry, while a successful read won't re-run.
      setSystemChecked(true);
    } catch {
      setSystem(null);
      // Leave systemChecked=false: re-entering the About tab retries once.
    } finally {
      setSystemLoading(false);
    }
  }, []);

  // Self-healing lazy load: auto-run the system check when the About tab
  // becomes active and we don't yet have a successful result. Driven off a
  // tab-transition ref so it fires once per entry (no render thrash) and is
  // not retried endlessly while the result is missing.
  const prevActiveRef = useRef<SettingsCategory | null>(null);
  useEffect(() => {
    const enteredAbout = active === "about" && prevActiveRef.current !== "about";
    prevActiveRef.current = active;
    if (active === "about" && !systemChecked && !systemLoading && enteredAbout) {
      loadSystem();
    }
  }, [active, systemChecked, systemLoading, loadSystem]);

  const handleSaveApiConfig = async () => {
    const errors = getValidationErrors(config);
    if (errors.length > 0) {
      toast.error("请填写必填项", { body: `- ${errors.join("\n- ")}` });
      return;
    }
    setSaving(true);
    try {
      await api.saveEnvConfig(config);
      toast.success(t("saveSuccess"));
    } catch {
      toast.error("保存配置失败。");
    } finally {
      setSaving(false);
    }
  };

  // Storage(OSS) 保存不应被 DashScope / 生成相关必填项挡住——它们与存储无关。
  const handleSaveStorage = async () => {
    setSaving(true);
    try {
      await api.saveEnvConfig(config);
      toast.success(t("saveSuccess"));
    } catch {
      toast.error("保存配置失败。");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: keyof EnvConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleEndpointChange = (envKey: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      endpoint_overrides: { ...prev.endpoint_overrides, [envKey]: value },
    }));
  };

  const handleSaveModelDefaults = () => {
    const normalized = normalizeModelSettings(modelSettings, "global_settings");
    // T2I and I2I share one image model in the UI; persist both backend
    // fields plus image_model so per-project backfill stays consistent.
    const merged: FrontendModelSettings = {
      ...normalized,
      i2i_model: normalized.t2i_model,
      image_model: normalized.t2i_model,
    };
    localStorage.setItem(LS_KEY_MODEL, JSON.stringify(merged));
    setModelSettings(merged);
    toast.success(t("saved"));
  };

  const handleSavePromptDefaults = () => {
    // DELTA persistence: a field equal to its built-in default is stored as ""
    // (=> use built-in, no snapshot pinning); only genuine overrides are saved.
    const delta: DefaultPromptConfig = { ...EMPTY_PROMPT_CONFIG };
    (Object.keys(EMPTY_PROMPT_CONFIG) as (keyof DefaultPromptConfig)[]).forEach((k) => {
      const text = promptConfig[k] ?? "";
      delta[k] = text === promptDefaults[k] ? "" : text;
    });
    localStorage.setItem(LS_KEY_PROMPT, JSON.stringify(delta));
    toast.success(t("saved"));
  };

  const copyPath = async (p: string) => {
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p);
      setCopiedPath(p);
      setTimeout(() => setCopiedPath(null), 1200);
    } catch {
      /* clipboard blocked */
    }
  };

  // MuleRun 登录轮询的 interval 句柄：卸载时清理，避免轮询泄漏 + setConfig-after-unmount。
  const mulerunPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (mulerunPollRef.current) clearInterval(mulerunPollRef.current);
  }, []);

  const PathField = ({ value, label }: { value: string; label: string }) => (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2">
        <input
          type="text"
          value={value || "—"}
          disabled
          className={settingsInputClass + " font-mono text-[11.5px] opacity-70 cursor-not-allowed"}
        />
        <button
          type="button"
          onClick={() => copyPath(value)}
          disabled={!value}
          title="复制路径"
          className="flex-shrink-0 px-3 rounded-md border border-glass-border bg-surface text-text-secondary hover:text-foreground transition-colors disabled:opacity-40 flex items-center gap-1.5 text-xs"
        >
          {copiedPath === value ? <Check size={13} className="text-emerald-400" /> : <FolderOpen size={13} />}
          {copiedPath === value ? "已复制" : "复制"}
        </button>
      </div>
    </div>
  );

  /* ── Section renderers ──────────────────────────────────────── */

  const renderGeneral = () => (
    <Section id="general" title="语言、主题与动效">
      <FormRow label={t("language")} hint={t("languageDesc")}>
        <FieldLabel>LANGUAGE</FieldLabel>
        <ModeSegment
          value={locale}
          onChange={(v) => setLocale(v as Locale)}
          options={[
            { id: "zh", label: t("chinese") },
            { id: "en", label: t("english") },
          ]}
        />
      </FormRow>

      <FormRow label={t("theme")} hint={t("themeDesc")}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label={t("theme")} onKeyDown={rovingKeyDown}>
          {THEME_OPTIONS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={theme === preset.id}
              tabIndex={theme === preset.id ? 0 : -1}
              onClick={() => setTheme(preset.id)}
              className={`group relative flex flex-col gap-2 p-3 rounded-xl border text-left transition-all ${
                theme === preset.id
                  ? "border-primary/60 bg-primary/10 ring-1 ring-primary/30"
                  : "border-glass-border bg-hover-bg hover:border-text-muted"
              }`}
            >
              <div
                className="h-10 w-full rounded-lg border border-glass-border overflow-hidden flex items-end p-1.5 gap-1"
                style={{ background: preset.base }}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: preset.primary }} />
                <span className="h-3 w-3 rounded-full" style={{ background: preset.accent }} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground truncate">{preset.name}</div>
                <div className="text-[10px] text-text-muted truncate">{preset.desc}</div>
              </div>
              {theme === preset.id && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </FormRow>

      <FormRow label="动效" hint="关闭后将降低过渡动画，并尊重系统的减少动态偏好。">
        <Toggle
          checked={animations}
          onChange={setAnimations}
          label={animations ? "已启用过渡动效" : "已降低动效"}
          sub="包含面板进出、签名动效等"
          ariaLabel="界面动效开关"
        />
      </FormRow>
    </Section>
  );

  const aspectButtons = (key: keyof FrontendModelSettings) => (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="画幅比例" onKeyDown={rovingKeyDown}>
      {ASPECT_RATIOS.map((ratio) => (
        <button
          key={ratio.id}
          type="button"
          role="radio"
          aria-checked={modelSettings[key] === ratio.id}
          tabIndex={modelSettings[key] === ratio.id ? 0 : -1}
          onClick={() => setModelSettings((s) => ({ ...s, [key]: ratio.id }))}
          className={`flex flex-col items-center py-2 px-2 rounded-lg border transition-all ${
            modelSettings[key] === ratio.id
              ? "border-primary/50 bg-primary/10"
              : "border-glass-border hover:border-text-muted bg-glass"
          }`}
        >
          <span className="text-xs font-medium text-foreground">{ratio.name}</span>
        </button>
      ))}
    </div>
  );

  const renderModels = () => (
    <Section
      id="models"
      title="模型与画幅选择"
      desc="新建项目时套用的默认模型与画幅。可在项目内单独覆盖。"
    >
      {/* Image model (T2I + I2I unified) */}
      <FormRow label="图像模型" hint="文生图与图生图（分镜首帧）使用同一模型。">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <Image size={15} className="text-emerald-400" />
          <span>Image Model · 文生图 / 图生图</span>
        </div>
        <GroupedModelGrid
          models={GLOBAL_IMAGE_MODELS}
          selectedId={modelSettings.t2i_model}
          onSelect={(id) => setModelSettings((s) => ({ ...s, t2i_model: id, i2i_model: id, image_model: id }))}
        />
      </FormRow>

      {/* Asset aspect ratios */}
      <FormRow label="资产画幅" hint="角色 / 场景 / 道具的默认生成比例。">
        <div className="grid grid-cols-3 gap-4">
          {(
            [
              { key: "character_aspect_ratio" as const, label: "角色", icon: User },
              { key: "scene_aspect_ratio" as const, label: "场景", icon: Building },
              { key: "prop_aspect_ratio" as const, label: "道具", icon: Box },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-1 text-xs text-text-secondary">
                <Icon size={12} />
                <label>{label}</label>
              </div>
              <div className="space-y-1">
                {ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio.id}
                    type="button"
                    onClick={() => setModelSettings((s) => ({ ...s, [key]: ratio.id }))}
                    className={`w-full flex flex-col items-center py-2 px-2 rounded border transition-all ${
                      modelSettings[key] === ratio.id
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-glass-border hover:border-text-muted bg-glass"
                    }`}
                  >
                    <span className="text-xs font-medium text-foreground">{ratio.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </FormRow>

      {/* Storyboard aspect ratio */}
      <FormRow label="分镜画幅" hint="分镜（图生图）首帧的默认比例。">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <Layout size={15} className="text-primary" />
          <span>Storyboard Aspect Ratio</span>
        </div>
        {aspectButtons("storyboard_aspect_ratio")}
      </FormRow>

      {/* I2V */}
      <FormRow label="首帧生视频(I2V)" hint="图生视频 · 分镜动态化。">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <Video size={15} className="text-purple-400" />
          <span>Image-to-Video</span>
        </div>
        <GroupedModelGrid
          models={GLOBAL_I2V_MODELS}
          selectedId={modelSettings.i2v_model}
          onSelect={(id) => setModelSettings((s) => ({ ...s, i2v_model: id }))}
        />
      </FormRow>

      {/* R2V */}
      <FormRow label="参考生视频 (R2V)" hint="参考图驱动的视频生成默认模型。">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <Video size={15} className="text-purple-400" />
          <span>Reference-to-Video</span>
        </div>
        <GroupedModelGrid
          models={GLOBAL_R2V_MODELS}
          selectedId={modelSettings.r2v_model ?? ""}
          onSelect={(id) => setModelSettings((s) => ({ ...s, r2v_model: id }))}
        />
      </FormRow>

      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={handleSaveModelDefaults}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-on-accent text-sm font-medium rounded-lg transition-all"
        >
          <Save size={16} />
          保存默认
        </button>
      </div>
    </Section>
  );

  const PROMPT_FIELDS: { key: keyof DefaultPromptConfig; label: string; desc: string }[] = [
    { key: "entity_extraction", label: "角色/场景/道具提取", desc: "从剧本/小说提取实体的系统提示词。留空使用内置默认。" },
    { key: "style_analysis", label: "视觉风格分析", desc: "从剧本推荐美术风格的系统提示词。留空使用内置默认。" },
    { key: "storyboard_extraction", label: "分镜提取 (剧本→分镜)", desc: "从剧本生成分镜（剧本→分镜）的系统提示词。留空使用内置默认。" },
    { key: "storyboard_polish", label: "分镜润色", desc: "分镜 / 图像提示词润色的系统提示词。" },
    { key: "video_polish", label: "I2V 视频润色", desc: "图生视频提示词润色的系统提示词。" },
    { key: "r2v_polish", label: "R2V 视频润色", desc: "参考生视频提示词润色的系统提示词。" },
  ];

  const renderPrompts = () => (
    <Section
      id="prompts"
      title="系统提示词配置"
      desc="新建项目的默认系统提示词（留空使用内置默认）。"
    >
      <div className="space-y-5">
        {PROMPT_FIELDS.map((f) => (
          <div key={f.key} className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">{f.label}</h3>
            <p className="text-[11px] text-text-muted">{f.desc}</p>
            <textarea
              value={promptConfig[f.key]}
              onChange={(e) => setPromptConfig((prev) => ({ ...prev, [f.key]: e.target.value }))}
              placeholder="留空使用系统默认…"
              className="w-full h-32 bg-input-bg border border-glass-border rounded-lg p-3 text-xs text-foreground resize-y focus:outline-none focus:border-primary/50 font-mono placeholder-text-muted"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={handleSavePromptDefaults}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-on-accent text-sm font-medium rounded-lg transition-colors"
        >
          <Save size={16} />
          保存默认
        </button>
      </div>
    </Section>
  );

  const renderApiKeys = () => (
    <Section
      id="apikeys"
      title="供应商凭证"
      desc="DashScope 优先；按需开启供应商直连。"
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="ml-2 text-text-secondary">加载配置中…</span>
        </div>
      ) : loadError ? (
        <div className="bg-status-failed-bg border border-status-failed-border rounded-lg p-4 text-sm text-status-failed-fg">
          {loadError}
        </div>
      ) : (
        <div className="space-y-1">
          <FormRow label="DashScope 密钥" hint="阿里云百炼 / 通义系列服务凭证（必填）。">
            <FieldLabel>DASHSCOPE_API_KEY *</FieldLabel>
            <KeyField
              value={config.DASHSCOPE_API_KEY}
              onChange={(v) => handleChange("DASHSCOPE_API_KEY", v)}
              placeholder="sk-..."
              status={
                config.DASHSCOPE_API_KEY?.trim()
                  ? { kind: "ok", text: "已填写" }
                  : { kind: "warn", text: "未配置 · 模型不可用" }
              }
            />
          </FormRow>

          <FormRow label="可灵 Kling" hint="DashScope 模式用主密钥；供应商直连需 AK/SK。">
            <ModeSegment
              value={config.KLING_PROVIDER_MODE}
              onChange={(v) => handleChange("KLING_PROVIDER_MODE", v)}
              options={[
                { id: "dashscope", label: "DashScope" },
                { id: "vendor", label: "供应商直连" },
              ]}
            />
            {config.KLING_PROVIDER_MODE === "vendor" && (
              <div className="space-y-3 mt-3">
                <div>
                  <FieldLabel>KLING_ACCESS_KEY *</FieldLabel>
                  <KeyField value={config.KLING_ACCESS_KEY} onChange={(v) => handleChange("KLING_ACCESS_KEY", v)} placeholder="Kling Access Key" />
                </div>
                <div>
                  <FieldLabel>KLING_SECRET_KEY *</FieldLabel>
                  <KeyField value={config.KLING_SECRET_KEY} onChange={(v) => handleChange("KLING_SECRET_KEY", v)} placeholder="Kling Secret Key" />
                </div>
              </div>
            )}
          </FormRow>

          <FormRow label="Vidu" hint="DashScope 模式用主密钥；供应商直连需 API Key。">
            <ModeSegment
              value={config.VIDU_PROVIDER_MODE}
              onChange={(v) => handleChange("VIDU_PROVIDER_MODE", v)}
              options={[
                { id: "dashscope", label: "DashScope" },
                { id: "vendor", label: "供应商直连" },
              ]}
            />
            {config.VIDU_PROVIDER_MODE === "vendor" && (
              <div className="mt-3">
                <FieldLabel>VIDU_API_KEY *</FieldLabel>
                <KeyField value={config.VIDU_API_KEY} onChange={(v) => handleChange("VIDU_API_KEY", v)} placeholder="Vidu API Key" />
              </div>
            )}
          </FormRow>

          <FormRow label="MuleRun / MuleRouter" hint="用于 Seedance 2.0 视频与 GPT-Image-2 图片生成。">
            {!config.MULEROUTER_API_KEY && !config.MULERUN_CLI_LOGGED_IN && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.triggerMulerunLogin();
                    if (mulerunPollRef.current) clearInterval(mulerunPollRef.current); // 重入守卫
                    const stop = () => {
                      if (mulerunPollRef.current) {
                        clearInterval(mulerunPollRef.current);
                        mulerunPollRef.current = null;
                      }
                    };
                    mulerunPollRef.current = setInterval(async () => {
                      try {
                        const env = await api.getEnvConfig();
                        if (env.MULERUN_CLI_LOGGED_IN) {
                          stop();
                          setConfig((c) => ({ ...c, MULERUN_CLI_LOGGED_IN: true }));
                        }
                      } catch {
                        /* silent */
                      }
                    }, 3000);
                    setTimeout(stop, 120000);
                  } catch (err: any) {
                    toast.error(err?.response?.data?.detail || "登录失败");
                  }
                }}
                className="w-full py-2.5 rounded-lg bg-primary text-on-accent text-sm font-medium hover:bg-primary-hover transition-colors mb-3"
              >
                一键登录 MuleRun
              </button>
            )}
            {!config.MULEROUTER_API_KEY && config.MULERUN_CLI_LOGGED_IN && (
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <Check size={16} />
                  MuleRun 已登录
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api.triggerMulerunLogin();
                    } catch (err: any) {
                      toast.error(err?.response?.data?.detail || "登录失败");
                    }
                  }}
                  className="text-xs text-text-secondary hover:text-foreground transition-colors underline underline-offset-2"
                >
                  重新登录
                </button>
              </div>
            )}
            <FieldLabel>MULEROUTER_API_KEY</FieldLabel>
            <KeyField
              value={config.MULEROUTER_API_KEY}
              onChange={(v) => setConfig((c) => ({ ...c, MULEROUTER_API_KEY: v }))}
              placeholder="muk-..."
            />
            <details className="group mt-3">
              <summary className="text-xs text-primary cursor-pointer hover:underline flex items-center gap-1">
                <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
                手动获取 Key
              </summary>
              <div className="mt-2 space-y-2 pl-4 border-l border-glass-border">
                {[
                  { n: "1", label: "安装 CLI", cmd: "npm i -g @mulerunai/cli" },
                  { n: "2", label: "浏览器登录", cmd: "mulerun login" },
                  { n: "3", label: "复制 Key", cmd: "mulerun studio config" },
                ].map((step) => (
                  <div key={step.n} className="flex items-center gap-2 text-xs text-text-secondary">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">
                      {step.n}
                    </span>
                    <span>{step.label}</span>
                    <code
                      className="ml-auto px-2 py-0.5 bg-glass rounded text-[11px] font-mono select-all cursor-pointer"
                      onClick={(e) => {
                        navigator.clipboard.writeText(step.cmd);
                        const el = e.currentTarget;
                        el.style.outline = "1px solid var(--color-primary)";
                        setTimeout(() => (el.style.outline = ""), 800);
                      }}
                    >
                      {step.cmd}
                    </code>
                  </div>
                ))}
                <p className="text-[11px] text-text-muted mt-1">Key 格式为 muk-...，粘贴到上方输入框即可。本地开发如已登录 CLI，无需填写。</p>
              </div>
            </details>
          </FormRow>

          <FormRow label="高级 · API 端点" hint="自定义各供应商 Base URL，留空使用默认。">
            <button
              type="button"
              onClick={() => setEndpointsOpen(!endpointsOpen)}
              className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground transition-colors"
            >
              {endpointsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              {endpointsOpen ? "收起端点配置" : "展开端点配置"}
            </button>
            {endpointsOpen && (
              <div className="mt-3 space-y-3">
                {ENDPOINT_PROVIDERS.map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <FieldLabel>{label} BASE URL</FieldLabel>
                    <input
                      type="text"
                      value={config.endpoint_overrides[key] || ""}
                      onChange={(e) => handleEndpointChange(key, e.target.value)}
                      placeholder={placeholder}
                      className={settingsInputClass + " font-mono text-[11.5px]"}
                    />
                  </div>
                ))}
              </div>
            )}
          </FormRow>

          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={handleSaveApiConfig}
              disabled={saving || loading || !online}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-on-accent text-sm font-medium rounded-lg transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? "保存中…" : "保存配置"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );

  const renderStorage = () => (
    <Section
      id="storage"
      title="云端镜像与本地路径"
      desc="生成结果默认本地优先；OSS 仅用于可选云端镜像。"
    >
      <FormRow label="云存储">
        <Toggle
          checked={config.OSS_ENABLE}
          onChange={(v) => setConfig((c) => ({ ...c, OSS_ENABLE: v }))}
          label="启用云存储"
          sub="启用云存储，将资产与成片上传到对象存储。关闭则仅保存在本地 output/。"
          ariaLabel="启用云存储开关"
        />
      </FormRow>

      <FormRow label="阿里云 AK / SK" hint="仅在启用 OSS 镜像时需要填写。">
        <div className="space-y-3">
          <div>
            <FieldLabel>ALIBABA_CLOUD_ACCESS_KEY_ID</FieldLabel>
            <KeyField
              value={config.ALIBABA_CLOUD_ACCESS_KEY_ID}
              onChange={(v) => handleChange("ALIBABA_CLOUD_ACCESS_KEY_ID", v)}
              placeholder="可选，用于 OSS 镜像"
            />
          </div>
          <div>
            <FieldLabel>ALIBABA_CLOUD_ACCESS_KEY_SECRET</FieldLabel>
            <KeyField
              value={config.ALIBABA_CLOUD_ACCESS_KEY_SECRET}
              onChange={(v) => handleChange("ALIBABA_CLOUD_ACCESS_KEY_SECRET", v)}
              placeholder="可选，用于 OSS 镜像"
            />
          </div>
          <a
            href="https://help.aliyun.com/zh/ram/user-guide/create-an-accesskey-pair"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
          >
            如何获取 AccessKey?
          </a>
        </div>
      </FormRow>

      <FormRow label="Bucket 名称" hint="存储桶标识。">
        <FieldLabel>OSS_BUCKET</FieldLabel>
        <input
          type="text"
          value={config.OSS_BUCKET_NAME}
          onChange={(e) => handleChange("OSS_BUCKET_NAME", e.target.value)}
          placeholder="your_bucket_name（可选）"
          className={settingsInputClass + " font-mono text-[11.5px]"}
        />
      </FormRow>

      <FormRow label="Endpoint" hint="区域访问端点。">
        <FieldLabel>OSS_ENDPOINT</FieldLabel>
        <input
          type="text"
          value={config.OSS_ENDPOINT}
          onChange={(e) => handleChange("OSS_ENDPOINT", e.target.value)}
          placeholder="oss-cn-beijing.aliyuncs.com（可选）"
          className={settingsInputClass + " font-mono text-[11.5px]"}
        />
      </FormRow>

      <FormRow label="Base Path" hint="对象前缀路径。">
        <FieldLabel>OSS_BASE_PATH</FieldLabel>
        <input
          type="text"
          value={config.OSS_BASE_PATH}
          onChange={(e) => handleChange("OSS_BASE_PATH", e.target.value)}
          placeholder="lumenx"
          className={settingsInputClass + " font-mono text-[11.5px]"}
        />
      </FormRow>

      <FormRow label="本地数据目录" hint="只读 · 由系统管理（可设 LUMENX_DATA_DIR 环境变量覆盖）。">
        <PathField value={dataDir} label="DATA_DIR · MANAGED" />
      </FormRow>

      <FormRow label="日志目录" hint="只读 · 由系统管理（可设 LUMENX_LOG_DIR 环境变量覆盖）。">
        <PathField value={logDir} label="LOG_DIR · MANAGED" />
      </FormRow>

      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={handleSaveStorage}
          disabled={saving || loading || !online}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-on-accent text-sm font-medium rounded-lg transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "保存中…" : "保存配置"}
        </button>
      </div>
    </Section>
  );

  const renderAbout = () => {
    const ff = system?.ffmpeg;
    const aboutRows: { k: string; v: string; tone?: "ok" | "warn" }[] = [
      { k: "应用版本", v: `LumenX Studio ${APP_VERSION}` },
      { k: "后端 API", v: API_URL },
      { k: "数据目录", v: dataDir || "—" },
      { k: "日志目录", v: logDir || "—" },
    ];
    return (
      <Section id="about" title="版本信息与系统状态">
        {/* Line B brand signature block — teal-glow logo, serif name, amber tagline */}
        <div className="flex flex-col items-start gap-3 pb-6 mb-6 border-b border-glass-border">
          <LumenXBranding size="md" showSlogan={false} />
          <p className="font-display atelier-display text-base italic text-accent leading-snug">
            “Render Noise into Narrative”
          </p>
          <div className="font-mono text-[10px] tracking-[0.08em] text-text-muted uppercase">
            VERSION {APP_VERSION.replace(/^v/, "")} · BUILD 20260613
          </div>
          <p className="text-[12.5px] text-text-secondary leading-relaxed max-w-md">
            AI 漫画 / 短片创作平台 · 由 Next.js + FastAPI 驱动，集成阿里云 Qwen / Wanx 服务。
          </p>
        </div>

        {/* Check for updates — compares APP_VERSION against latest GitHub release */}
        <div className="mb-6">
          <UpdateChecker />
        </div>

        {/* Technical info table */}
        <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-text-muted mb-3">
          技术信息 · SYSTEM
        </div>
        <div className="space-y-0">
          {aboutRows.map((r) => (
            <div key={r.k} className="flex justify-between items-center py-2.5 border-b border-glass-border last:border-b-0 text-[12.5px] gap-3">
              <span className="text-text-secondary shrink-0">{r.k}</span>
              <span className="font-mono text-[11.5px] text-foreground truncate text-right">{r.v}</span>
            </div>
          ))}
          {/* FFmpeg row with live detection */}
          <div className="flex justify-between items-center py-2.5 border-b border-glass-border last:border-b-0 text-[12.5px] gap-3">
            <span className="text-text-secondary shrink-0">FFmpeg</span>
            <span className="font-mono text-[11.5px] text-right truncate">
              {systemLoading ? (
                <span className="inline-flex items-center gap-1.5 text-text-muted">
                  <Loader2 size={12} className="animate-spin" /> 检测中…
                </span>
              ) : ff ? (
                ff.available ? (
                  <span className="text-emerald-400" title={ff.message}>已检测 · 可用</span>
                ) : (
                  <span className="text-amber-400" title={ff.message}>未检测到</span>
                )
              ) : (
                <span className="text-text-muted">无法获取（后端离线？）</span>
              )}
            </span>
          </div>
        </div>
        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={loadSystem}
            disabled={systemLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-glass-border bg-surface text-text-secondary hover:text-foreground transition-colors disabled:opacity-50"
          >
            {systemLoading ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />}
            重新检测
          </button>
        </div>
      </Section>
    );
  };

  const renderActive = () => {
    switch (active) {
      case "general":
        return renderGeneral();
      case "models":
        return renderModels();
      case "prompts":
        return renderPrompts();
      case "apikeys":
        return renderApiKeys();
      case "storage":
        return renderStorage();
      case "about":
        return renderAbout();
      default:
        return null;
    }
  };

  const CATEGORY_TITLE: Record<SettingsCategory, string> = {
    general: "通用与主题",
    models: "默认模型",
    prompts: "默认 Prompt",
    apikeys: "API 密钥",
    storage: "存储 OSS",
    about: "关于",
  };

  // 横向 Tab 短标签（取代竖向 SettingsSidebar；与全局品牌侧栏轴向正交，不再撞脸）。
  const TABS: { id: SettingsCategory; label: string }[] = [
    { id: "general", label: "通用" },
    { id: "models", label: "模型" },
    { id: "prompts", label: "默认 Prompt" },
    { id: "apikeys", label: "API 密钥" },
    { id: "storage", label: "存储" },
    { id: "about", label: "关于" },
  ];

  return (
    <div className="relative h-full flex flex-col">
      {/* Atelier signature layers — inert on non-atelier themes. */}
      <div className="atelier-page-bloom" aria-hidden="true" />
      <div className="atelier-page-grain" aria-hidden="true" />

      {/* Head: eyebrow(当前分类) + 「设置」标题 + 横向 Tab —— 取代竖向子栏 */}
      <header className="flex-shrink-0 border-b border-glass-border px-5 md:px-10 pt-6 pb-4 bg-surface relative z-10">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
          SETTINGS · <span className="text-primary">{CATEGORY_TITLE[active]}</span>
        </div>
        <h1 className="font-display atelier-display text-[24px] md:text-[32px] leading-none font-semibold text-foreground mt-2 tracking-tight">
          设置
        </h1>
        <nav className="flex flex-wrap gap-1 mt-5" role="tablist" aria-label="设置分类" onKeyDown={rovingKeyDown}>
          {TABS.map((tab) => {
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(tab.id)}
                className={`px-3.5 py-1.5 rounded-full text-[13px] transition-colors ${
                  isActive
                    ? "bg-primary/10 text-foreground font-semibold"
                    : "text-text-muted hover:text-foreground hover:bg-hover-bg font-medium"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Scroll area */}
      <div className="flex-1 overflow-y-auto px-10 py-8 relative z-10">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">
          {!online && (
            <div
              role="status"
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-status-processing-bg border border-status-processing-border"
            >
              <WifiOff size={18} className="text-status-processing-fg flex-shrink-0" />
              <div className="flex-1">
                <div className="text-[12.5px] font-semibold text-foreground">当前处于离线模式</div>
                <div className="text-[11px] text-text-secondary mt-0.5">
                  未检测到网络连接。已缓存的资产仍可浏览，生成与导出将在恢复网络后执行。
                </div>
              </div>
            </div>
          )}

          {renderActive()}
          <div className="pb-8" />
        </div>
      </div>
    </div>
  );
}
