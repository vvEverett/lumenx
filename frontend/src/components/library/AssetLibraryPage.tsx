"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Search, Users, MapPin, Package, Image as ImageIcon } from "lucide-react";
import { api } from "@/lib/api";
import AssetCard from "@/components/common/AssetCard";
import type { Series, Project, Character, Scene, Prop } from "@/store/projectStore";

type AssetTab = "characters" | "scenes" | "props";

interface AssetSource {
  id: string;
  name: string;
  type: "series" | "project";
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
}

export default function AssetLibraryPage() {
  const t = useTranslations("library");
  const tc = useTranslations("common");
  const [sources, setSources] = useState<AssetSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AssetTab>("characters");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const [seriesList, projects] = await Promise.all([
        api.listSeries(),
        api.getProjects(),
      ]);

      const result: AssetSource[] = [];

      for (const s of seriesList as Series[]) {
        if ((s.characters?.length || 0) + (s.scenes?.length || 0) + (s.props?.length || 0) > 0) {
          result.push({
            id: `series-${s.id}`,
            name: s.title,
            type: "series",
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
            name: p.title,
            type: "project",
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

  const tabs: { id: AssetTab; label: string; icon: typeof Users }[] = [
    { id: "characters", label: t("characterLabel"), icon: Users },
    { id: "scenes", label: t("sceneLabel"), icon: MapPin },
    { id: "props", label: t("propLabel"), icon: Package },
  ];

  const filteredSources = useMemo(() => {
    if (!searchQuery.trim()) return sources;
    const q = searchQuery.toLowerCase();
    return sources
      .map((source) => ({
        ...source,
        characters: source.characters.filter((a) => a.name.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q)),
        scenes: source.scenes.filter((a) => a.name.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q)),
        props: source.props.filter((a) => a.name.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q)),
      }))
      .filter((s) => {
        const count = activeTab === "characters" ? s.characters.length : activeTab === "scenes" ? s.scenes.length : s.props.length;
        return count > 0;
      });
  }, [sources, searchQuery, activeTab]);

  const totalCount = filteredSources.reduce((acc, s) => {
    return acc + (activeTab === "characters" ? s.characters.length : activeTab === "scenes" ? s.scenes.length : s.props.length);
  }, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header — eyebrow + Fraunces title + count */}
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
            {t("assetCount", { count: totalCount })}
          </span>
        </div>
      </header>

      {/* Toolbar — search + pill-tabs */}
      <div className="px-7 pb-2 flex items-center gap-3">
        <div className="relative flex-1 max-w-[340px] atelier-search-input">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full bg-transparent border-0 rounded-full py-2 pl-9 pr-4 text-[13px] text-foreground placeholder-text-muted focus:outline-none"
          />
        </div>
        <div className="inline-flex p-[3px] rounded-full bg-surface-inset atelier-pill-tabs ml-auto" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                activeTab === tab.id
                  ? "text-foreground atelier-pill-tab-active bg-surface shadow-sm"
                  : "text-text-muted hover:text-foreground"
              }`}
            >
              <tab.icon size={12} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-7 pb-10 pt-3">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-text-secondary text-[13px]">{tc("loading")}</div>
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted">
            <ImageIcon size={48} className="mb-3 opacity-60" />
            <p className="text-[15px] font-display atelier-display">{t("noAssets")}</p>
            <p className="text-[12px] text-text-muted mt-1">{t("noAssetsHint")}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredSources.map((source) => {
              const assets: (Character | Scene | Prop)[] =
                activeTab === "characters" ? source.characters : activeTab === "scenes" ? source.scenes : source.props;
              if (assets.length === 0) return null;

              return (
                <div key={source.id}>
                  {/* Group heading with trailing rule */}
                  <div className="flex items-baseline gap-3 mb-4">
                    <span className="text-[24px] font-display atelier-display font-semibold text-foreground tracking-tight">
                      {source.name}
                    </span>
                    <span className="font-mono text-[10px] text-text-muted tracking-wide uppercase">
                      {source.type === "series" ? t("series") : t("project")} · {assets.length}
                    </span>
                    <span className="atelier-group-line flex-1 h-px bg-border-subtle" />
                  </div>
                  {/* Asset grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {assets.map((asset, i) => (
                      <div
                        key={asset.id}
                        className="atelier-asset-card atelier-reveal border border-glass-border overflow-hidden"
                        style={{ animationDelay: `${Math.min(i * 50, 250)}ms` }}
                      >
                        <AssetCard asset={asset} type={activeTab} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
