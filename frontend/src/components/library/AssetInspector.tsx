"use client";

import { useState, useEffect } from "react";
import { X, Star, Download } from "lucide-react";
import type { Character, Scene, Prop, ImageAsset } from "@/store/projectStore";

type AssetTab = "characters" | "scenes" | "props";

const TYPE_LABEL: Record<AssetTab, string> = {
  characters: "角色",
  scenes: "场景",
  props: "道具",
};

interface AssetInspectorProps {
  asset: Character | Scene | Prop;
  type: AssetTab;
  sourceName: string;
  starred: boolean;
  onClose: () => void;
  onToggleStar: () => void;
}

/** Character 优先 reference_sheet（新 schema，归一化成 ImageAsset 形状）→ full_body_asset（legacy）；scene/prop 用 image_asset。 */
function primaryImageAsset(asset: Character | Scene | Prop, type: AssetTab): ImageAsset | undefined {
  if (type === "characters") {
    const c = asset as Character;
    const rs = c.reference_sheet;
    if (rs?.image_variants?.length) {
      return { selected_id: rs.selected_image_id, variants: rs.image_variants };
    }
    return c.full_body_asset;
  }
  return (asset as Scene | Prop).image_asset;
}

function fallbackUrl(asset: Character | Scene | Prop, type: AssetTab): string | undefined {
  if (type === "characters") {
    const c = asset as Character;
    return c.image_url || c.full_body_image_url;
  }
  return (asset as Scene | Prop).image_url;
}

function timeAgo(ts?: number): string {
  if (!ts) return "—";
  const tsMs = ts > 1e12 ? ts : ts * 1000; // created_at 来自 time.time()（秒）；容错已是毫秒的情况
  const days = Math.floor((Date.now() - tsMs) / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

/**
 * 资产库右侧详情抽屉（Line B "Luminous Atelier"）。
 * 库专用，不复用共享 AssetCard。展示选中资产的 hero + 变体条 + 元数据 + prompt + 下载。
 * SEED/MODEL/SIZE 当前数据模型未存（变体仅 id/url/created_at/prompt_used），故不显示。
 * 「用于分镜 / 生成更多变体」涉及跨模块流程，v1 暂不接入。
 */
export default function AssetInspector({
  asset,
  type,
  sourceName,
  starred,
  onClose,
  onToggleStar,
}: AssetInspectorProps) {
  const imageAsset = primaryImageAsset(asset, type);
  const variants = imageAsset?.variants ?? [];
  const defaultId = imageAsset?.selected_id ?? variants[0]?.id ?? null;
  const [activeVariantId, setActiveVariantId] = useState<string | null>(defaultId);

  // 切换选中资产时重置本地高亮的变体。
  useEffect(() => {
    setActiveVariantId(defaultId);
  }, [asset.id, defaultId]);

  const activeVariant = variants.find((v) => v.id === activeVariantId) ?? variants[0];
  const heroUrl = activeVariant?.url ?? fallbackUrl(asset, type);
  const prompt = activeVariant?.prompt_used ?? "";

  const handleDownload = () => {
    if (!heroUrl) return;
    const a = document.createElement("a");
    a.href = heroUrl;
    a.download = `${asset.name || "asset"}.png`;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  };

  return (
    <aside
      className="w-[340px] flex-shrink-0 h-full flex flex-col overflow-y-auto bg-surface border-l border-glass-border shadow-2xl atelier-reveal"
      aria-label="资产详情"
    >
      {/* Hero */}
      <div className="relative aspect-[3/4] bg-surface-inset overflow-hidden flex-shrink-0">
        {heroUrl ? (
          <img src={heroUrl} alt={asset.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-text-muted text-sm">无图像</div>
        )}
        {/* amber halation overlay (atelier signature) */}
        <div
          className="pointer-events-none absolute inset-0 shadow-[inset_0_0_60px_-10px_var(--color-status-starred-bg)]"
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={onToggleStar}
          aria-pressed={starred}
          aria-label={starred ? "取消加星" : "加星"}
          className={`absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-[0.1em] backdrop-blur-md border transition-colors ${
            starred
              ? "text-status-starred-fg bg-status-starred-bg border-status-starred-border"
              : "text-text-secondary bg-black/40 border-transparent hover:text-foreground"
          }`}
        >
          <Star size={12} className={starred ? "fill-current" : ""} />
          {starred ? "已加星" : "加星"}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭详情"
          className="absolute top-3 right-3 w-8 h-8 rounded-full grid place-items-center bg-black/50 backdrop-blur-md text-foreground hover:bg-black/70 transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      <div className="p-5 flex flex-col gap-5">
        <div>
          <div className="font-display atelier-display text-xl font-semibold text-foreground tracking-tight">
            {asset.name}
          </div>
          <div className="font-mono text-[9.5px] text-text-muted tracking-[0.06em] uppercase mt-1.5">
            {TYPE_LABEL[type]} · {sourceName} · {variants.length} 变体
          </div>
        </div>

        {/* Variant strip */}
        {variants.length > 1 && (
          <div>
            <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-text-secondary mb-2.5">
              变体 · VARIANTS
            </div>
            <div className="grid grid-cols-4 gap-2">
              {variants.map((v) => {
                const on = v.id === activeVariant?.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setActiveVariantId(v.id)}
                    aria-pressed={on}
                    className={`relative aspect-square rounded-md overflow-hidden transition-transform hover:-translate-y-0.5 ${
                      on ? "ring-2 ring-primary" : "ring-1 ring-glass-border"
                    }`}
                  >
                    <img src={v.url} alt="变体" className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div>
          <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-text-secondary mb-2.5">
            元数据 · METADATA
          </div>
          <div className="flex flex-col">
            {[
              { k: "类型", v: TYPE_LABEL[type] },
              { k: "来源", v: sourceName },
              { k: "变体", v: `${variants.length}` },
              { k: "创建", v: timeAgo(activeVariant?.created_at) },
            ].map((row) => (
              <div
                key={row.k}
                className="flex justify-between items-center py-2 border-b border-glass-border last:border-b-0 text-[13px]"
              >
                <span className="font-mono text-[10px] text-text-muted tracking-[0.04em]">{row.k}</span>
                <span className="text-foreground font-medium">{row.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Prompt */}
        {prompt && (
          <div>
            <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-text-secondary mb-2.5">
              生成提示词 · PROMPT
            </div>
            <div className="bg-surface-inset rounded-lg p-3.5 text-[13px] leading-relaxed text-text-secondary border-l-2 border-status-starred-border">
              {prompt}
            </div>
          </div>
        )}

        {/* Actions（v1：下载实做；用于分镜/生成更多变体待接入跨模块流程） */}
        <button
          type="button"
          onClick={handleDownload}
          disabled={!heroUrl}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-surface-inset border border-glass-border text-foreground text-sm font-medium hover:bg-hover-bg transition-colors disabled:opacity-40"
        >
          <Download size={15} />
          下载
        </button>
      </div>
    </aside>
  );
}
