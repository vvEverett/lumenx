"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Search, Image as ImageIcon, Star, ArrowDownUp } from "lucide-react";
import { api } from "@/lib/api";
import type { Series, Project, Character, Scene, Prop } from "@/store/projectStore";
import AssetInspector from "./AssetInspector";

type AssetTab = "characters" | "scenes" | "props";
type TypeFilter = AssetTab | "all";
type SortMode = "default" | "name";

const SINGULAR: Record<AssetTab, string> = { characters: "character", scenes: "scene", props: "prop" };

interface AssetSource {
  id: string; // `series-X` / `project-X`（列表 key）
  rawId: string; // 裸 series/project id（调 API 用）
  name: string;
  kind: "series" | "project";
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
}

/** 取图：character 优先 reference_sheet（新 schema）→ full_body_asset（legacy）→ 顶层 url；scene/prop 用 image_asset。 */
function getImageUrl(asset: Character | Scene | Prop, type: AssetTab): string | undefined {
  if (type === "characters") {
    const c = asset as Character;
    const rs = c.reference_sheet;
    if (rs?.image_variants?.length) {
      const sel = rs.image_variants.find((v) => v.id === rs.selected_image_id);
      return sel?.url || rs.image_variants[0]?.url;
    }
    if (c.full_body_asset?.variants?.length) {
      const sel = c.full_body_asset.variants.find((v) => v.id === c.full_body_asset?.selected_id);
      return sel?.url || c.full_body_asset.variants[0]?.url;
    }
    return c.image_url || c.full_body_image_url;
  }
  const a = asset as Scene | Prop;
  if (a.image_asset?.variants?.length) {
    const sel = a.image_asset.variants.find((v) => v.id === a.image_asset?.selected_id);
    return sel?.url || a.image_asset.variants[0]?.url;
  }
  return a.image_url;
}

function variantCount(asset: Character | Scene | Prop, type: AssetTab): number {
  if (type === "characters") {
    const c = asset as Character;
    const rsLen = c.reference_sheet?.image_variants?.length ?? 0;
    return rsLen || (c.full_body_asset?.variants?.length ?? 0);
  }
  return (asset as Scene | Prop).image_asset?.variants?.length ?? 0;
}

export default function AssetLibraryPage() {
  const t = useTranslations("library");
  const tc = useTranslations("common");
  const [sources, setSources] = useState<AssetSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<TypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [starredOnly, setStarredOnly] = useState(false);
  const [selected, setSelected] = useState<{ sourceId: string; assetId: string; type: AssetTab } | null>(null);

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const [seriesList, projects] = await Promise.all([api.listSeries(), api.getProjects()]);
      const result: AssetSource[] = [];

      for (const s of seriesList as Series[]) {
        if ((s.characters?.length || 0) + (s.scenes?.length || 0) + (s.props?.length || 0) > 0) {
          result.push({
            id: `series-${s.id}`,
            rawId: s.id,
            name: s.title,
            kind: "series",
            characters: s.characters || [],
            scenes: s.scenes || [],
            props: s.props || [],
          });
        }
      }

      const standaloneProjects = (projects as Project[]).filter((p) => !p.series_id);
      for (const p of standaloneProjects) {
        if ((p.characters?.length || 0) + (p.scenes?.length || 0) + (p.props?.length || 0) > 0) {
          result.push({
            id: `project-${p.id}`,
            rawId: p.id,
            name: p.title,
            kind: "project",
            characters: p.characters || [],
            scenes: p.scenes || [],
            props: p.props || [],
          });
        }
      }

      setSources(result);
    } catch (error) {
      console.error("Failed to load asset library:", error);
    } finally {
      setLoading(false);
    }
  };

  // 全局计数（facet 总览；不受搜索/星标过滤影响，与分组标题里的计数互补）。
  const counts = useMemo(() => {
    let ch = 0,
      sc = 0,
      pr = 0,
      st = 0;
    for (const s of sources) {
      ch += s.characters.length;
      sc += s.scenes.length;
      pr += s.props.length;
      st +=
        s.characters.filter((a) => a.starred).length +
        s.scenes.filter((a) => a.starred).length +
        s.props.filter((a) => a.starred).length;
    }
    return { characters: ch, scenes: sc, props: pr, all: ch + sc + pr, starred: st };
  }, [sources]);

  const typePills: { id: TypeFilter; label: string; count: number }[] = [
    { id: "all", label: "全部", count: counts.all },
    { id: "characters", label: t("characterLabel"), count: counts.characters },
    { id: "scenes", label: t("sceneLabel"), count: counts.scenes },
    { id: "props", label: t("propLabel"), count: counts.props },
  ];

  const TYPE_LABEL: Record<AssetTab, string> = {
    characters: t("characterLabel"),
    scenes: t("sceneLabel"),
    props: t("propLabel"),
  };

  // 渲染模型：按 source 分组，组内按当前类型范围 + 搜索 + 星标过滤、按排序模式排列。
  const groups = useMemo(() => {
    const scopedTypes: AssetTab[] = activeType === "all" ? ["characters", "scenes", "props"] : [activeType];
    const q = searchQuery.trim().toLowerCase();
    return sources
      .map((src) => {
        const items: { asset: Character | Scene | Prop; type: AssetTab }[] = [];
        for (const ty of scopedTypes) {
          const list = src[ty] as (Character | Scene | Prop)[];
          for (const a of list) {
            if (starredOnly && !a.starred) continue;
            if (q && !(a.name.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q))) continue;
            items.push({ asset: a, type: ty });
          }
        }
        if (sortMode === "name") items.sort((x, y) => x.asset.name.localeCompare(y.asset.name, "zh"));
        return { src, items };
      })
      .filter((g) => g.items.length > 0);
  }, [sources, activeType, searchQuery, starredOnly, sortMode]);

  const visibleCount = groups.reduce((acc, g) => acc + g.items.length, 0);

  const toggleStar = async (sourceId: string, assetId: string, type: AssetTab) => {
    const src = sources.find((s) => s.id === sourceId);
    if (!src) return;
    const flip = (prev: AssetSource[]) =>
      prev.map((s) =>
        s.id !== sourceId
          ? s
          : { ...s, [type]: (s[type] as (Character | Scene | Prop)[]).map((a) => (a.id === assetId ? { ...a, starred: !a.starred } : a)) }
      );
    setSources(flip); // 乐观更新
    try {
      if (src.kind === "series") await api.toggleSeriesAssetStarred(src.rawId, assetId, SINGULAR[type]);
      else await api.toggleAssetStarred(src.rawId, assetId, SINGULAR[type]);
    } catch (e) {
      console.error("toggle star failed", e);
      setSources(flip); // 失败回滚（再翻一次）
    }
  };

  // 选中资产的实时引用（以 sources 为单一数据源，保证星标等变更同步到 inspector）。
  const selectedSource = selected ? sources.find((s) => s.id === selected.sourceId) : undefined;
  const selectedAsset =
    selected && selectedSource
      ? (selectedSource[selected.type] as (Character | Scene | Prop)[]).find((a) => a.id === selected.assetId)
      : undefined;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="px-7 pt-6 pb-3 flex items-end gap-5">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-text-muted">
            ASSET LIBRARY · <span className="text-primary font-semibold atelier-eyebrow-accent">{t("gallery") || "画廊"}</span>
          </div>
          <h1 className="text-[34px] font-display atelier-display font-semibold text-foreground leading-tight tracking-tight mt-1">
            {t("title")}
          </h1>
        </div>
        <div className="flex items-center gap-2.5 pb-1">
          <span className="font-mono text-[10px] text-text-muted tracking-wide uppercase">
            {t("assetCount", { count: visibleCount })}
          </span>
        </div>
      </header>

      {/* Toolbar: 类型 pills（带计数）+ ★ + 搜索 + 排序 */}
      <div className="px-7 pb-2 flex flex-wrap items-center gap-3">
        <div className="inline-flex p-[3px] rounded-full bg-surface-inset atelier-pill-tabs" role="tablist" aria-label="资产类型">
          {typePills.map((pill) => {
            const on = activeType === pill.id;
            return (
              <button
                key={pill.id}
                role="tab"
                aria-selected={on}
                onClick={() => setActiveType(pill.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                  on ? "text-foreground atelier-pill-tab-active bg-surface shadow-sm" : "text-text-muted hover:text-foreground"
                }`}
              >
                {pill.label}
                <span className={`font-mono text-[9.5px] ${on ? "text-text-secondary" : "text-text-muted"}`}>{pill.count}</span>
              </button>
            );
          })}
        </div>

        {/* ★ 加星过滤 */}
        <button
          type="button"
          aria-pressed={starredOnly}
          onClick={() => setStarredOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
            starredOnly
              ? "text-status-starred-fg bg-status-starred-bg border-status-starred-border"
              : "text-text-muted border-glass-border hover:text-foreground"
          }`}
        >
          <Star size={12} className={starredOnly ? "fill-current" : ""} />
          {counts.starred}
        </button>

        <div className="relative flex-1 min-w-[200px] max-w-[340px] atelier-search-input">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full bg-transparent border-0 rounded-full py-2 pl-9 pr-4 text-[13px] text-foreground placeholder-text-muted focus:outline-none"
          />
        </div>

        {/* 排序：默认 / 名称（最近排序需资产级时间戳，scenes/props 暂无） */}
        <button
          type="button"
          onClick={() => setSortMode((m) => (m === "default" ? "name" : "default"))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-text-muted border border-glass-border hover:text-foreground transition-colors"
          title="切换排序"
        >
          <ArrowDownUp size={12} />
          {sortMode === "name" ? "名称" : "默认"}
        </button>
      </div>

      {/* Body: 网格（按系列分组）+ 右侧 inspector */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-7 pb-10 pt-3">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-text-secondary text-[13px]">{tc("loading")}</div>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <ImageIcon size={48} className="mb-3 opacity-60" />
              <p className="text-[15px] font-display atelier-display">{t("noAssets")}</p>
              <p className="text-[12px] text-text-muted mt-1">{t("noAssetsHint")}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map(({ src, items }) => (
                <div key={src.id}>
                  {/* 分组标题 + 尾线 + 计数 */}
                  <div className="flex items-baseline gap-3 mb-4">
                    <span className="text-[24px] font-display atelier-display font-semibold text-foreground tracking-tight">{src.name}</span>
                    <span className="font-mono text-[10px] text-text-muted tracking-wide uppercase">
                      {src.kind === "series" ? t("series") : t("project")} · {items.length}
                    </span>
                    <span className="atelier-group-line flex-1 h-px bg-border-subtle" />
                  </div>

                  {/* 卡片网格（库专用富卡片） */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {items.map(({ asset, type }, i) => {
                      const url = getImageUrl(asset, type);
                      const vc = variantCount(asset, type);
                      const isSel = selected?.sourceId === src.id && selected?.assetId === asset.id;
                      const isStar = !!asset.starred;
                      return (
                        <div
                          key={`${type}-${asset.id}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelected({ sourceId: src.id, assetId: asset.id, type })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelected({ sourceId: src.id, assetId: asset.id, type });
                            }
                          }}
                          aria-pressed={isSel}
                          className={`atelier-asset-card atelier-reveal group relative text-left rounded-xl overflow-hidden border transition-all cursor-pointer ${
                            isSel ? "border-primary/60 ring-1 ring-primary/40" : "border-glass-border hover:-translate-y-1"
                          }`}
                          style={{ animationDelay: `${Math.min(i * 50, 250)}ms` }}
                        >
                          <div className="aspect-square bg-surface-inset overflow-hidden relative">
                            {url ? (
                              <img src={url} alt={asset.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                            ) : (
                              <div className="w-full h-full grid place-items-center">
                                <ImageIcon size={28} className="text-text-muted" />
                              </div>
                            )}
                            {isStar && (
                              <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_44px_-8px_var(--color-status-starred-bg)]" aria-hidden="true" />
                            )}
                            {/* top row: star chip + variant chip */}
                            <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
                              <button
                                type="button"
                                aria-label={isStar ? "取消加星" : "加星"}
                                aria-pressed={isStar}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleStar(src.id, asset.id, type);
                                }}
                                className={`w-7 h-7 rounded-full grid place-items-center backdrop-blur-md cursor-pointer transition-colors ${
                                  isStar ? "text-status-starred-fg bg-status-starred-bg" : "text-white bg-black/45 hover:text-status-starred-fg"
                                }`}
                              >
                                <Star size={13} className={isStar ? "fill-current" : ""} />
                              </button>
                              {vc > 0 && (
                                <span className="px-2 py-[3px] rounded-full font-mono text-[9px] font-semibold text-white bg-black/55 backdrop-blur-md tracking-wide">
                                  {vc} 变体
                                </span>
                              )}
                            </div>
                            {/* kind chip（仅“全部”视图下显示，告诉用户这是什么类型） */}
                            {activeType === "all" && (
                              <span className="absolute bottom-2 left-2 px-2 py-[3px] rounded-full font-mono text-[8.5px] font-semibold uppercase tracking-[0.06em] text-white bg-black/55 backdrop-blur-md">
                                {TYPE_LABEL[type]}
                              </span>
                            )}
                          </div>
                          <div className="p-3">
                            <div className="text-sm font-medium text-foreground truncate">{asset.name}</div>
                            {asset.description && <div className="text-[11px] text-text-muted truncate mt-0.5">{asset.description}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右侧 inspector（选中才出现） */}
        {selected && selectedAsset && selectedSource && (
          <AssetInspector
            asset={selectedAsset}
            type={selected.type}
            sourceName={selectedSource.name}
            starred={!!selectedAsset.starred}
            onClose={() => setSelected(null)}
            onToggleStar={() => toggleStar(selected.sourceId, selected.assetId, selected.type)}
          />
        )}
      </div>
    </div>
  );
}
