'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Image as ImageIcon, Film, Loader2 } from 'lucide-react';
import { API_URL, playgroundApi } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  accept: 'image' | 'video' | 'all';
}

interface AssetItem {
  id: string;
  path: string;
  type: 'image' | 'video';
  thumbnail?: string;
  label: string;
  source: SourceTab;
}

type FilterTab = 'all' | 'image' | 'video';
type SourceTab = 'uploads' | 'saved' | 'history';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isVideoPath(path: string): boolean {
  return /\.(mp4|mov|webm|avi|mkv)$/i.test(path);
}

function getFileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/** Convert a media_path (e.g. "output/storyboard/foo.png") to a /files/ URL */
function toFileUrl(mediaPath: string): string {
  const relative = mediaPath.replace(/^output\//, '');
  return API_URL + '/files/' + relative;
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 16 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

const springModal = { type: 'spring' as const, stiffness: 400, damping: 30 };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AssetPickerModal({
  isOpen,
  onClose,
  onSelect,
  accept,
}: AssetPickerModalProps) {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<SourceTab>('uploads');
  const [activeTab, setActiveTab] = useState<FilterTab>(
    accept === 'all' ? 'all' : accept
  );

  // -------------------------------------------------------------------------
  // Fetch assets from playground history
  // -------------------------------------------------------------------------

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [library, history] = await Promise.all([
        playgroundApi.getLibrary(100, 0),
        playgroundApi.getHistory(100, 0),
      ]);
      const items: AssetItem[] = [];
      const seenLibrary = new Set<string>();
      const seenHistory = new Set<string>();

      for (const item of library) {
        if (!item.media_path || seenLibrary.has(item.media_path)) continue;
        seenLibrary.add(item.media_path);

        const isVideo = item.media_type === 'video' || isVideoPath(item.media_path);
        items.push({
          id: 'library-' + item.id,
          path: item.media_path,
          type: isVideo ? 'video' : 'image',
          thumbnail: item.thumbnail_path || undefined,
          label: getFileName(item.media_path),
          source: item.category === 'uploads' ? 'uploads' : 'saved',
        });
      }

      for (const gen of history) {
        if (gen.status !== 'completed') continue;
        for (const output of gen.outputs) {
          if (!output.media_path || seenHistory.has(output.media_path)) continue;
          seenHistory.add(output.media_path);

          const isVideo = isVideoPath(output.media_path);
          items.push({
            id: 'history-' + output.id,
            path: output.media_path,
            type: isVideo ? 'video' : 'image',
            thumbnail: output.thumbnail_path || undefined,
            label: getFileName(output.media_path),
            source: 'history',
          });
        }

        // Also include input media from history entries
        if (gen.input_media) {
          for (const inputPath of gen.input_media) {
            if (!inputPath || seenHistory.has(inputPath)) continue;
            seenHistory.add(inputPath);

            const isVideo = isVideoPath(inputPath);
            items.push({
              id: 'history-input-' + inputPath,
              path: inputPath,
              type: isVideo ? 'video' : 'image',
              label: getFileName(inputPath),
              source: 'history',
            });
          }
        }
      }

      setAssets(items);
    } catch (err) {
      console.error('[AssetPickerModal] fetch failed:', err);
      setError('Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelected(null);
      setActiveSource('uploads');
      fetchAssets();
    }
  }, [isOpen, fetchAssets]);

  // Reset active tab when accept changes
  useEffect(() => {
    setActiveTab(accept === 'all' ? 'all' : accept);
  }, [accept]);

  // -------------------------------------------------------------------------
  // Filter
  // -------------------------------------------------------------------------

  const filteredAssets = useMemo(() => {
    // First filter by what the caller accepts
    let pool = assets.filter((a) => a.source === activeSource);
    if (accept !== 'all') {
      pool = pool.filter((a) => a.type === accept);
    }
    // Then by active tab
    if (activeTab !== 'all') {
      pool = pool.filter((a) => a.type === activeTab);
    }
    return pool;
  }, [assets, accept, activeSource, activeTab]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleSelect = () => {
    if (selected) {
      onSelect(selected);
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // -------------------------------------------------------------------------
  // Tab config
  // -------------------------------------------------------------------------

  const tabs: { key: FilterTab; label: string; icon: React.ReactNode; show: boolean }[] = [
    {
      key: 'all',
      label: '全部',
      icon: null,
      show: accept === 'all',
    },
    {
      key: 'image',
      label: '图片',
      icon: <ImageIcon className="w-3.5 h-3.5" />,
      show: accept === 'all' || accept === 'image',
    },
    {
      key: 'video',
      label: '视频',
      icon: <Film className="w-3.5 h-3.5" />,
      show: accept === 'all' || accept === 'video',
    },
  ];

  const visibleTabs = tabs.filter((t) => t.show);
  const sourceTabs: { key: SourceTab; label: string; count: number }[] = [
    {
      key: 'uploads',
      label: '上传资产',
      count: assets.filter((a) => a.source === 'uploads').length,
    },
    {
      key: 'saved',
      label: '收藏资产',
      count: assets.filter((a) => a.source === 'saved').length,
    },
    {
      key: 'history',
      label: '生成历史',
      count: assets.filter((a) => a.source === 'history').length,
    },
  ];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.2 }}
          onClick={handleBackdropClick}
        >
          <motion.div
            className="
              w-[640px] max-h-[80vh]
              bg-[#141416] border border-white/[0.08]
              rounded-2xl shadow-2xl
              flex flex-col overflow-hidden
            "
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={springModal}
            onClick={(e) => e.stopPropagation()}
          >
            {/* -------------------------------------------------------------- */}
            {/* Header                                                          */}
            {/* -------------------------------------------------------------- */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-sm font-semibold text-white/90">
                选择素材
              </h2>

              <button
                type="button"
                onClick={onClose}
                className="
                  w-7 h-7 rounded-lg flex items-center justify-center
                  text-white/40 hover:text-white/80 hover:bg-white/[0.06]
                  transition-colors
                "
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1.5 px-5 pb-3">
              {sourceTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setActiveSource(tab.key);
                    setSelected(null);
                  }}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                    transition-colors border
                    ${
                      activeSource === tab.key
                        ? 'bg-[#646cff]/15 text-[#646cff] border-[#646cff]/30'
                        : 'text-white/50 hover:text-white/70 hover:bg-white/[0.04] border-transparent'
                    }
                  `}
                >
                  {tab.label}
                  <span className="font-mono text-[10px] opacity-60">{tab.count}</span>
                </button>
              ))}
            </div>

            {visibleTabs.length > 1 && (
              <div className="flex items-center gap-1.5 px-5 pb-3">
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                      transition-colors
                      ${
                        activeTab === tab.key
                          ? 'bg-[#646cff]/15 text-[#646cff] border border-[#646cff]/30'
                          : 'text-white/50 hover:text-white/70 hover:bg-white/[0.04] border border-transparent'
                      }
                    `}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* -------------------------------------------------------------- */}
            {/* Grid                                                            */}
            {/* -------------------------------------------------------------- */}
            <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0">
              {loading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
                  <span className="text-xs text-white/40">加载中...</span>
                </div>
              )}

              {error && !loading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <span className="text-xs text-red-400/80">{error}</span>
                  <button
                    type="button"
                    onClick={fetchAssets}
                    className="text-xs text-[#646cff] hover:underline"
                  >
                    重试
                  </button>
                </div>
              )}

              {!loading && !error && filteredAssets.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <ImageIcon className="w-8 h-8 text-white/20" />
                  <span className="text-xs text-white/40">
                    {activeSource === 'uploads'
                      ? '暂无上传素材'
                      : activeSource === 'saved'
                        ? '暂无收藏素材'
                        : '暂无历史素材'}
                  </span>
                  <span className="text-[11px] text-white/25">
                    {activeSource === 'uploads'
                      ? '本地上传的图片或视频会出现在这里'
                      : activeSource === 'saved'
                        ? '收藏生成结果后会出现在这里'
                        : '在 Playground 中生成内容后，输出将出现在这里'}
                  </span>
                </div>
              )}

              {!loading && !error && filteredAssets.length > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  {filteredAssets.map((asset) => {
                    const isSelected = selected === asset.path;
                    const thumbUrl = asset.thumbnail
                      ? toFileUrl(asset.thumbnail)
                      : toFileUrl(asset.path);

                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() =>
                          setSelected(isSelected ? null : asset.path)
                        }
                        className={`
                          relative aspect-square rounded-lg overflow-hidden
                          bg-white/[0.04] cursor-pointer
                          transition-all duration-150
                          ${
                            isSelected
                              ? 'border-2 border-[#646cff] ring-2 ring-[#646cff]/30'
                              : 'border border-white/[0.04] hover:border-[#646cff]/50'
                          }
                        `}
                      >
                        {/* Thumbnail */}
                        {asset.type === 'video' ? (
                          <video
                            src={thumbUrl}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                          />
                        ) : (
                          <img
                            src={thumbUrl}
                            alt={asset.label}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        )}

                        {/* Type badge */}
                        {asset.type === 'video' && (
                          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm">
                            <Film className="w-3 h-3 text-white/70" />
                          </div>
                        )}

                        {/* Selected checkmark */}
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#646cff] flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}

                        {/* File name */}
                        <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/70 to-transparent">
                          <span className="text-[10px] text-white/70 truncate block">
                            {asset.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* -------------------------------------------------------------- */}
            {/* Footer                                                          */}
            {/* -------------------------------------------------------------- */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={onClose}
                className="
                  px-4 py-2 rounded-lg text-xs
                  text-white/60 hover:text-white/80
                  hover:bg-white/[0.04]
                  transition-colors
                "
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSelect}
                disabled={!selected}
                className={`
                  flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium
                  transition-all
                  ${
                    selected
                      ? 'bg-[#646cff] text-white hover:bg-[#545ae0] shadow-lg shadow-[#646cff]/20'
                      : 'bg-white/[0.06] text-white/30 cursor-not-allowed'
                  }
                `}
              >
                <Check className="w-3.5 h-3.5" />
                选择
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
