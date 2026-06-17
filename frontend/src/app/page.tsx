"use client";

import { useState, useEffect, useRef, useId } from "react";
import { motion } from "framer-motion";
import {
  Plus, RefreshCw, Library, FileUp, X, ChevronDown, FileText,
  Zap, Film, Sparkles, Search,
} from "lucide-react";
import { useProjectStore, Project } from "@/store/projectStore";
import ProjectCard, { deriveStatus, type DerivedStatus } from "@/components/project/ProjectCard";
import CreateProjectDialog from "@/components/project/CreateProjectDialog";
import EnvConfigDialog from "@/components/project/EnvConfigDialog";
import CreativeCanvas from "@/components/canvas/CreativeCanvas";
import AppShell from "@/components/layout/AppShell";
import type { GlobalTab } from "@/components/layout/GlobalSidebar";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";

const ProjectClient = dynamic(() => import("@/components/project/ProjectClient"), { ssr: false });
const SeriesDetailPage = dynamic(() => import("@/components/series/SeriesDetailPage"), { ssr: false });
const ImportFileDialog = dynamic(() => import("@/components/series/ImportFileDialog"), { ssr: false });
const SettingsPage = dynamic(() => import("@/components/settings/SettingsPage"), { ssr: false });
const AssetLibraryPage = dynamic(() => import("@/components/library/AssetLibraryPage"), { ssr: false });
const PlaygroundPage = dynamic(() => import("@/components/modules/playground/PlaygroundPage"), { ssr: false });

// ── Create Series Dialog ──
function CreateSeriesDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workflowMode, setWorkflowMode] = useState<"r2v" | "i2v_legacy">("r2v");
  // R2V v2 Phase 6 — content_mode (scripted | freeform)
  const [contentMode, setContentMode] = useState<"scripted" | "freeform">("scripted");
  // PR-3e — default per-shot generation mode (r2v=节奏优先 / i2v=画面优先)
  const [defaultGenerationMode, setDefaultGenerationMode] = useState<"r2v" | "i2v">("r2v");
  const [isCreating, setIsCreating] = useState(false);
  const t = useTranslations("workspace");
  const tc = useTranslations("common");
  const tp = useTranslations("project");

  // a11y — dialog labelling + focus management
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Move focus into the dialog (the title input is the first field).
    const node = dialogRef.current;
    if (node) {
      const field = node.querySelector<HTMLElement>("input, textarea");
      (field ?? node.querySelector<HTMLElement>("button:not([disabled])"))?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialogRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!title.trim()) return;
    setIsCreating(true);
    try {
      // Use the v2 createSeriesV2 API directly so we can pass content_mode
      const { api } = await import("@/lib/api");
      const series = await api.createSeriesV2(title.trim(), {
        description: description.trim() || undefined,
        workflow_mode: workflowMode,
        content_mode: contentMode,
        default_generation_mode: defaultGenerationMode,
      });
      setTitle("");
      setDescription("");
      setWorkflowMode("r2v");
      setContentMode("scripted");
      setDefaultGenerationMode("r2v");
      onClose();
      window.location.hash = `#/series/${series.id}`;
    } catch (error) {
      console.error("Failed to create series:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm" onClick={onClose}>
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-elevated border border-border rounded-2xl p-8 w-full max-w-4xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 id={titleId} className="text-2xl font-display font-bold text-foreground">{t("newSeries")}</h2>
          <button onClick={onClose} aria-label={tc("close")} className="p-2 rounded-lg hover:bg-hover-bg transition-colors">
            <X size={20} className="text-text-secondary" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">{t("seriesTitle")} *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("seriesTitlePlaceholder")}
              className="glass-input w-full"
            />
          </div>

          {/* Workflow Mode */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">{tp("workflowMode")}</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setWorkflowMode("r2v")}
                className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                  workflowMode === "r2v"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface hover:border-text-muted"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Zap size={16} className={workflowMode === "r2v" ? "text-primary" : "text-text-secondary"} />
                  <span className="font-semibold text-sm text-foreground">{tp("workflowR2V")}</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">{tp("workflowR2VDesc")}</p>
                {workflowMode === "r2v" && (
                  <span className="absolute top-2 right-2 text-[10px] font-medium text-primary bg-primary/20 px-1.5 py-0.5 rounded">
                    {tc("recommended")}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setWorkflowMode("i2v_legacy")}
                className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                  workflowMode === "i2v_legacy"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface hover:border-text-muted"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Film size={16} className={workflowMode === "i2v_legacy" ? "text-primary" : "text-text-secondary"} />
                  <span className="font-semibold text-sm text-foreground">{tp("workflowI2V")}</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">{tp("workflowI2VDesc")}</p>
              </button>
            </div>
          </div>

          {/* R2V v2 Phase 6 — Content mode picker */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">{tp("contentMode")}</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setContentMode("scripted")}
                className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                  contentMode === "scripted"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface hover:border-text-muted"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-semibold text-sm text-foreground">{tp("contentScripted")}</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">{tp("contentScriptedDesc")}</p>
                {contentMode === "scripted" && (
                  <span className="absolute top-2 right-2 text-[10px] font-medium text-primary bg-primary/20 px-1.5 py-0.5 rounded">
                    {tc("recommended")}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setContentMode("freeform")}
                className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                  contentMode === "freeform"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface hover:border-text-muted"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-semibold text-sm text-foreground">{tp("contentFreeform")}</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">{tp("contentFreeformDesc")}</p>
              </button>
            </div>
          </div>

          {/* PR-3e · Visual Control Preference picker — decides new-shot default
              tabMode (r2v=direct_r2v / i2v=t2i_i2v). Series-level setting,
              episodes inherit, shots can override individually. */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">{tp("visualControlPref")}</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDefaultGenerationMode("r2v")}
                className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                  defaultGenerationMode === "r2v"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface hover:border-text-muted"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Zap size={16} className={defaultGenerationMode === "r2v" ? "text-primary" : "text-text-secondary"} />
                  <span className="font-semibold text-sm text-foreground">{tp("visualControlR2V")}</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">{tp("visualControlR2VDesc")}</p>
                {defaultGenerationMode === "r2v" && (
                  <span className="absolute top-2 right-2 text-[10px] font-medium text-primary bg-primary/20 px-1.5 py-0.5 rounded">
                    {tc("recommended")}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setDefaultGenerationMode("i2v")}
                className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                  defaultGenerationMode === "i2v"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface hover:border-text-muted"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Film size={16} className={defaultGenerationMode === "i2v" ? "text-primary" : "text-text-secondary"} />
                  <span className="font-semibold text-sm text-foreground">{tp("visualControlI2V")}</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">{tp("visualControlI2VDesc")}</p>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">{t("description")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              rows={4}
              className="glass-input w-full resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-6">
          <button
            onClick={onClose}
            className="flex-1 glass-button"
          >
            {tc("cancel")}
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || isCreating}
            className="flex-1 bg-primary hover:bg-primary/90 text-foreground px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? t("creating") : t("createSeries")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── New Project Tile (Line B dashed add card) ──
function NewProjectTile({ onClick }: { onClick: () => void }) {
  const t = useTranslations("workspace");
  return (
    <button
      onClick={onClick}
      className="atelier-new-tile group flex flex-col items-center justify-center gap-3.5 rounded-2xl border-[1.5px] border-dashed border-border bg-transparent cursor-pointer min-h-[240px] text-text-secondary hover:text-foreground hover:border-primary transition-all"
    >
      <span className="w-[54px] h-[54px] rounded-full grid place-items-center bg-surface shadow-sm group-hover:text-primary transition-all">
        <Plus size={24} />
      </span>
      <span className="text-[15px] font-semibold">{t("newProject")}</span>
      <span className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted">
        {t("fromScript") || "从脚本开始"}
      </span>
    </button>
  );
}

// ── Episode Breadcrumb Wrapper ──
function EpisodeBreadcrumbWrapper({ seriesId, episodeId }: { seriesId: string; episodeId: string }) {
  const [seriesTitle, setSeriesTitle] = useState<string>("");
  const [episodeNumber, setEpisodeNumber] = useState<number | null>(null);
  const t = useTranslations("workspace");

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const series = await api.getSeries(seriesId);
        setSeriesTitle(series.title || "");
        const episodes = await api.getSeriesEpisodes(seriesId);
        const ep = episodes.find((e: Project) => e.id === episodeId);
        if (ep) {
          setEpisodeNumber(ep.episode_number ?? null);
        }
      } catch (error) {
        console.error("Failed to fetch series info for breadcrumb:", error);
      }
    };
    fetchInfo();
  }, [seriesId, episodeId]);

  const segments = [
    { label: "LumenX", hash: "#/" },
    { label: seriesTitle || t("series"), hash: `#/series/${seriesId}` },
    { label: episodeNumber != null ? t("episodeNum", { number: episodeNumber }) : t("episodeLabel") },
  ];

  return (
    <ProjectClient id={episodeId} breadcrumbSegments={segments} />
  );
}

// ── Main Component ──
export default function Home() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSeriesDialogOpen, setIsSeriesDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);
  const [currentView, setCurrentView] = useState<'home' | 'project' | 'series' | 'series-episode' | 'library' | 'settings' | 'playground'>('home');
  const [activeTab, setActiveTab] = useState<GlobalTab>("workspace");
  const [wsSearch, setWsSearch] = useState("");
  const [wsStatus, setWsStatus] = useState<DerivedStatus | "all">("all");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [seriesEpisodes, setSeriesEpisodes] = useState<Record<string, Project[]>>({});
  const [, setEpisodesLoading] = useState(false);
  const projects = useProjectStore((state) => state.projects);
  const seriesList = useProjectStore((state) => state.seriesList);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const setProjects = useProjectStore((state) => state.setProjects);
  const fetchSeriesList = useProjectStore((state) => state.fetchSeriesList);
  const t = useTranslations("workspace");
  const tc = useTranslations("common");

  // Sync projects and series from backend on mount
  useEffect(() => {
    syncProjects();
    fetchSeriesList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load episodes for all series when seriesList changes
  useEffect(() => {
    if (seriesList.length === 0) return;
    loadAllSeriesEpisodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesList]);

  const loadAllSeriesEpisodes = async () => {
    setEpisodesLoading(true);
    try {
      const results = await Promise.all(
        seriesList.map(async (s) => {
          const eps = await api.getSeriesEpisodes(s.id);
          return [s.id, eps] as const;
        })
      );
      const map: Record<string, Project[]> = {};
      for (const [id, eps] of results) {
        map[id] = eps;
      }
      setSeriesEpisodes(map);
    } catch (error) {
      console.error("Failed to load series episodes:", error);
    } finally {
      setEpisodesLoading(false);
    }
  };

  const syncProjects = async () => {
    setIsSyncing(true);
    try {
      const backendProjects = await api.getProjects();
      if (backendProjects && backendProjects.length > 0) {
        setProjects(backendProjects);
      }
    } catch (error) {
      console.error("Failed to sync projects from backend:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncAll = async () => {
    await Promise.all([syncProjects(), fetchSeriesList()]);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showCreateDropdown) return;
    const handleClick = () => setShowCreateDropdown(false);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showCreateDropdown]);

  // 监听 hash 变化
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      // Match #/series/{id}/episode/{eid} first (more specific)
      const seriesEpisodeMatch = hash.match(/^#\/series\/([^/]+)\/episode\/([^/]+)$/);
      if (seriesEpisodeMatch) {
        setSeriesId(seriesEpisodeMatch[1]);
        setEpisodeId(seriesEpisodeMatch[2]);
        setProjectId(null);
        setCurrentView('series-episode');
        return;
      }
      // Match #/series/{id}
      const seriesMatch = hash.match(/^#\/series\/([^/]+)$/);
      if (seriesMatch) {
        setSeriesId(seriesMatch[1]);
        setEpisodeId(null);
        setProjectId(null);
        setCurrentView('series');
        return;
      }
      if (hash.startsWith('#/project/')) {
        const id = hash.replace('#/project/', '');
        setProjectId(id);
        setSeriesId(null);
        setEpisodeId(null);
        setCurrentView('project');
        return;
      }
      if (hash === '#/library') {
        setCurrentView('library');
        setActiveTab('library');
        setProjectId(null);
        setSeriesId(null);
        setEpisodeId(null);
        return;
      }
      if (hash === '#/settings') {
        setCurrentView('settings');
        setActiveTab('settings');
        setProjectId(null);
        setSeriesId(null);
        setEpisodeId(null);
        return;
      }
      if (hash === '#/playground') {
        setCurrentView('playground');
        setActiveTab('playground');
        setProjectId(null);
        setSeriesId(null);
        setEpisodeId(null);
        return;
      }
      // Default: workspace
      setCurrentView('home');
      setActiveTab('workspace');
      setProjectId(null);
      setSeriesId(null);
      setEpisodeId(null);
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // 项目详情页 — 全屏，无 GlobalSidebar
  if (currentView === 'project' && projectId) {
    return <ProjectClient id={projectId} />;
  }

  // 系列集数编辑 — 全屏，BreadcrumbBar 内嵌在 ProjectClient
  if (currentView === 'series-episode' && seriesId && episodeId) {
    return <EpisodeBreadcrumbWrapper seriesId={seriesId} episodeId={episodeId} />;
  }

  // 系列详情页 — 全屏，自带 BreadcrumbBar
  if (currentView === 'series' && seriesId) {
    return <SeriesDetailPage seriesId={seriesId} />;
  }

  // Filter standalone projects (not belonging to any series)
  const standaloneProjects = projects.filter((p) => !p.series_id);

  const totalCount = seriesList.length + standaloneProjects.length;

  const handleTabChange = (tab: GlobalTab) => {
    setActiveTab(tab);
  };

  // Determine content based on activeTab
  const renderContent = () => {
    if (currentView === 'library') {
      return <AssetLibraryPage />;
    }
    if (currentView === 'settings') {
      return <SettingsPage />;
    }
    if (currentView === 'playground') {
      return <PlaygroundPage />;
    }

    // Workspace view — Line B skeleton
    const wsAllProjects: Project[] = [...Object.values(seriesEpisodes).flat(), ...standaloneProjects];
    const wsStatusCounts: Record<"all" | DerivedStatus, number> = {
      all: wsAllProjects.length,
      completed: 0,
      processing: 0,
      pending: 0,
    };
    for (const p of wsAllProjects) wsStatusCounts[deriveStatus(p)]++;
    const wsQuery = wsSearch.trim().toLowerCase();
    const wsFiltering = wsStatus !== "all" || wsQuery.length > 0;
    const wsMatch = (p: Project, seriesTitleMatched = false) => {
      if (wsStatus !== "all" && deriveStatus(p) !== wsStatus) return false;
      // A matching series title keeps the whole series' episodes visible (search at group level).
      if (wsQuery && !seriesTitleMatched && !p.title.toLowerCase().includes(wsQuery)) return false;
      return true;
    };
    const wsStatusPills: { id: "all" | DerivedStatus; label: string; count: number }[] = [
      { id: "all", label: "全部", count: wsStatusCounts.all },
      { id: "completed", label: "已完成", count: wsStatusCounts.completed },
      { id: "processing", label: "进行中", count: wsStatusCounts.processing },
      { id: "pending", label: "草稿", count: wsStatusCounts.pending },
    ];
    // Precompute filtered groups once — single source of truth for the grid render
    // and the filtered-empty count below (avoids the two diverging).
    const wsSeriesGroups = seriesList.map((s) => {
      const seriesTitleMatched = wsQuery.length > 0 && s.title.toLowerCase().includes(wsQuery);
      const eps = [...(seriesEpisodes[s.id] || [])]
        .sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))
        .filter((ep) => wsMatch(ep, seriesTitleMatched));
      return { s, eps };
    });
    const wsVisibleStandalone = standaloneProjects.filter((p) => wsMatch(p));
    const wsVisibleCount =
      wsVisibleStandalone.length + wsSeriesGroups.reduce((n, g) => n + g.eps.length, 0);
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Page header — eyebrow + Fraunces title + actions */}
        <header className="px-7 pt-6 pb-3 flex items-end gap-5">
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-text-muted">
              WORKSPACE · <span className="text-primary font-semibold atelier-eyebrow-accent">{t("gallery") || "画廊"}</span>
            </div>
            <h1 className="text-[34px] font-display atelier-display font-semibold text-foreground leading-tight tracking-tight mt-1">
              {t("title")}
            </h1>
          </div>
          <div className="flex items-center gap-2.5 pb-1">
            <button
              onClick={syncAll}
              disabled={isSyncing}
              className="glass-button flex items-center gap-2 text-[13px] font-semibold disabled:opacity-50"
            >
              <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
              {tc("sync")}
            </button>
            <button
              onClick={() => setIsImportDialogOpen(true)}
              className="glass-button flex items-center gap-2 text-[13px] font-semibold"
            >
              <FileUp size={14} />
              {t("importFile")}
            </button>
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowCreateDropdown((v) => !v); }}
                className="bg-primary hover:bg-primary/90 text-on-accent px-4 py-2 rounded-[10px] font-semibold flex items-center gap-2 transition-all text-[13px] shadow-[var(--glow-primary)]"
              >
                <Plus size={14} />
                {t("new")}
                <ChevronDown size={12} />
              </button>
              {showCreateDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute right-0 top-full mt-1 w-48 bg-elevated border border-glass-border rounded-xl shadow-xl z-20 overflow-hidden"
                >
                  <button
                    onClick={() => { setIsSeriesDialogOpen(true); setShowCreateDropdown(false); }}
                    className="w-full px-4 py-2.5 text-sm text-left text-foreground hover:bg-hover-bg transition-colors flex items-center gap-2"
                  >
                    <Library size={16} className="text-primary" />
                    {t("newSeries")}
                  </button>
                  <button
                    onClick={() => { setIsDialogOpen(true); setShowCreateDropdown(false); }}
                    className="w-full px-4 py-2.5 text-sm text-left text-foreground hover:bg-hover-bg transition-colors flex items-center gap-2"
                  >
                    <FileText size={16} className="text-text-muted" />
                    {t("newProject")}
                  </button>
                  <div className="border-t border-glass-border" />
                  <button
                    onClick={() => { window.location.hash = '#/playground'; setShowCreateDropdown(false); }}
                    className="w-full px-4 py-2.5 text-sm text-left text-foreground hover:bg-hover-bg transition-colors flex items-center gap-2"
                  >
                    <Sparkles size={16} className="text-accent" />
                    Playground
                  </button>
                </motion.div>
              )}
            </div>
          </div>
        </header>

        {/* Toolbar — 状态横向筛选 + 搜索 + 视图切换 */}
        <div className="px-7 pb-2 flex flex-wrap items-center gap-3">
          <div className="inline-flex p-[3px] rounded-full bg-surface-inset atelier-pill-tabs" role="tablist" aria-label="项目状态">
            {wsStatusPills.map((pill) => {
              const on = wsStatus === pill.id;
              return (
                <button
                  key={pill.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setWsStatus(pill.id)}
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
          <div className="relative flex-1 min-w-[180px] max-w-[340px] bg-surface-inset border border-glass-border rounded-full atelier-search-input">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="search"
              value={wsSearch}
              onChange={(e) => setWsSearch(e.target.value)}
              placeholder={t("searchPlaceholder") || "搜索项目 / 系列…"}
              className="w-full bg-transparent border-0 rounded-full py-2 pl-9 pr-4 text-[13px] text-foreground placeholder-text-muted focus:outline-none"
            />
          </div>
          <div className="inline-flex p-[3px] rounded-full bg-surface-inset atelier-pill-tabs ml-auto">
            <button className="inline-flex items-center px-3.5 py-1.5 rounded-full text-[11px] font-semibold text-foreground atelier-pill-tab-active bg-surface shadow-sm">
              {t("gallery") || "画廊"}
            </button>
            <button className="inline-flex items-center px-3.5 py-1.5 rounded-full text-[11px] font-semibold text-text-muted hover:text-foreground transition-colors">
              {t("list") || "列表"}
            </button>
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-7 pb-10 pt-3">
          {totalCount === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16"
            >
              <div className="glass-panel atelier-card p-10 rounded-2xl border border-glass-border text-center max-w-[620px] w-full relative overflow-hidden">
                <div className="relative z-[1] flex flex-col items-center gap-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
                    RENDER NOISE INTO NARRATIVE
                  </div>
                  <p className="text-[34px] font-display atelier-display font-medium italic leading-[1.25] tracking-tight text-foreground">
                    {t("emptyQuote") || "\u201c每一座城市，都藏着一个还没被讲出来的故事。\u201d"}
                  </p>
                  <p className="text-[15px] text-text-secondary max-w-[440px]">
                    {t("emptyHint")}
                  </p>
                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={() => setIsSeriesDialogOpen(true)}
                      className="bg-primary hover:bg-primary/90 text-on-accent px-5 py-2.5 rounded-[10px] font-semibold flex items-center gap-2 transition-all text-[13px] shadow-[var(--glow-primary)]"
                    >
                      <Plus size={14} />
                      {t("createSeries")}
                    </button>
                    <button
                      onClick={() => setIsDialogOpen(true)}
                      className="glass-button flex items-center gap-2 text-[13px] font-semibold"
                    >
                      <FileText size={14} />
                      {t("createProject")}
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={syncAll}
                disabled={isSyncing}
                className="mt-5 glass-button flex items-center gap-2 text-[13px] font-semibold disabled:opacity-50"
              >
                <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                {t("syncFromBackend")}
              </button>
            </motion.div>
          ) : wsFiltering && wsVisibleCount === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-text-muted"
            >
              <Search size={48} className="mb-3 opacity-60" />
              <p className="text-[15px] font-display atelier-display text-foreground">没有匹配的项目</p>
              <p className="text-[12px] text-text-muted mt-1">试试调整筛选条件或搜索关键词</p>
              <button
                onClick={() => { setWsStatus("all"); setWsSearch(""); }}
                className="mt-4 glass-button text-[13px] font-semibold"
              >
                清除筛选
              </button>
            </motion.div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Per-series groups — Line B editorial gallery */}
              {wsSeriesGroups.map(({ s, eps }) => {
                if (eps.length === 0 && wsFiltering) return null;
                return (
                  <section key={`grp-${s.id}`} aria-label={s.title}>
                    <div className="flex items-baseline gap-3 mt-4 mb-4 mx-0.5">
                      <button
                        onClick={() => { window.location.hash = `#/series/${s.id}`; }}
                        className="font-display atelier-display text-[22px] font-semibold tracking-tight text-foreground hover:text-primary transition-colors"
                      >
                        {s.title}
                      </button>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        {t("series")} · {t("frames", { count: eps.length })}
                      </span>
                      <span className="atelier-group-line h-px flex-1 bg-glass-border" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                      {eps.map((ep, i) => (
                        <div
                          key={`ep-${ep.id}`}
                          className="atelier-reveal"
                          style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
                        >
                          <ProjectCard project={ep} onDelete={deleteProject} />
                        </div>
                      ))}
                      {!wsFiltering && <NewProjectTile onClick={() => { window.location.hash = `#/series/${s.id}`; }} />}
                    </div>
                  </section>
                );
              })}

              {/* Standalone projects group */}
              {(() => {
                if (standaloneProjects.length === 0) return null;
                const sp = wsVisibleStandalone;
                if (sp.length === 0 && wsFiltering) return null;
                return (
                <section aria-label={t("standaloneGroup") || "独立项目"}>
                  <div className="flex items-baseline gap-3 mt-6 mb-4 mx-0.5">
                    <span className="font-display atelier-display text-[22px] font-semibold tracking-tight text-foreground">
                      {t("standaloneGroup") || "独立项目"}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      {t("frames", { count: sp.length })}
                    </span>
                    <span className="atelier-group-line h-px flex-1 bg-glass-border" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {sp.map((p, i) => (
                      <div
                        key={`p-${p.id}`}
                        className="atelier-reveal"
                        style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
                      >
                        <ProjectCard project={p} onDelete={deleteProject} />
                      </div>
                    ))}
                    {!wsFiltering && <NewProjectTile onClick={() => setIsDialogOpen(true)} />}
                  </div>
                </section>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="relative h-screen w-screen bg-background flex flex-col">
      {/* Background Canvas */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <CreativeCanvas />
      </div>

      {/* Atelier atmosphere overlays — inert on non-atelier themes.
          Mounted at page level so bloom/grain cover workspace, playground, library, etc.
          SettingsPage also mounts its own copies (harmless duplicates). */}
      <div className="atelier-page-bloom" aria-hidden="true" />
      <div className="atelier-page-grain" aria-hidden="true" />

      {/* AppShell with GlobalSidebar + content */}
      <div className="relative z-10 flex-1 overflow-hidden">
        <AppShell activeTab={activeTab} onTabChange={handleTabChange}>
          {renderContent()}
        </AppShell>
      </div>

      {/* Create Project Dialog */}
      <CreateProjectDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />

      {/* Create Series Dialog */}
      <CreateSeriesDialog
        isOpen={isSeriesDialogOpen}
        onClose={() => setIsSeriesDialogOpen(false)}
      />

      {/* Environment Configuration Dialog (kept for EnvConfigChecker) */}
      <EnvConfigDialog
        isOpen={false}
        onClose={() => {}}
        isRequired={false}
      />

      {/* Import File Dialog */}
      <ImportFileDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onSuccess={() => fetchSeriesList()}
      />
    </main>
  );
}
