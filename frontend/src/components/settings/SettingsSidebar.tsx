"use client";

import { Sliders, Boxes, MessageSquareCode, KeyRound, Database, Info } from "lucide-react";

export type SettingsCategory =
  | "general"
  | "models"
  | "prompts"
  | "apikeys"
  | "storage"
  | "about";

interface NavItem {
  id: SettingsCategory;
  label: string;
  icon: typeof Sliders;
}

const NAV: NavItem[] = [
  { id: "general", label: "通用", icon: Sliders },
  { id: "models", label: "模型", icon: Boxes },
  { id: "prompts", label: "默认 Prompt", icon: MessageSquareCode },
  { id: "apikeys", label: "API 密钥", icon: KeyRound },
  { id: "storage", label: "存储 OSS", icon: Database },
  { id: "about", label: "关于", icon: Info },
];

interface SettingsSidebarProps {
  active: SettingsCategory;
  onSelect: (id: SettingsCategory) => void;
  /** Footer build string, e.g. "LUMENX STUDIO · v0.2.0". */
  footer?: string;
}

/**
 * Settings inner navigation (Line A "Cyber Refined" IA). Sits to the
 * right of the global rail and to the left of the settings main area.
 * Pure semantic-token styling so all 5 theme presets flip correctly.
 */
export default function SettingsSidebar({ active, onSelect, footer }: SettingsSidebarProps) {
  return (
    <aside className="w-[220px] flex-shrink-0 bg-surface border-r border-glass-border flex flex-col">
      <div className="px-4 py-4 border-b border-glass-border">
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">
          偏好设置 · PREFERENCES
        </div>
      </div>

      <nav className="flex-1 p-2 flex flex-col gap-0.5" aria-label="设置分类">
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors border ${
                isActive
                  ? "bg-primary/10 border-primary/20 text-foreground"
                  : "border-transparent text-text-secondary hover:bg-hover-bg hover:text-foreground"
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[18px] w-[3px] rounded-r bg-primary" />
              )}
              <Icon size={15} className="flex-shrink-0" />
              <span className={`text-sm ${isActive ? "font-semibold" : "font-medium"}`}>{label}</span>
            </button>
          );
        })}
      </nav>

      {footer && (
        <div className="px-4 py-3.5 border-t border-glass-border font-mono text-[9px] tracking-wide text-text-muted whitespace-pre-line">
          {footer}
        </div>
      )}
    </aside>
  );
}
