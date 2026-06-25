"use client";

import { useTranslations } from "next-intl";

interface AssetChipBarProps {
    characters: any[];
    scenes: any[];
    props: any[];
    onInsertAsset: (type: string, name: string) => void;
}

export default function AssetChipBar({ characters, scenes, props, onInsertAsset }: AssetChipBarProps) {
    const t = useTranslations("storyboardR2V");

    if (characters.length === 0 && scenes.length === 0 && props.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap items-center gap-2 py-1">
            {characters.map((c: any) => (
                <button
                    key={c.id}
                    onClick={() => onInsertAsset("character", c.name)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-glass-border bg-surface-inset px-2.5 py-1 text-[11px] text-text-secondary transition-colors duration-fast ease-out-quart hover:bg-hover-bg hover:text-foreground"
                >
                    <span className="h-[6px] w-[6px] rounded-full bg-blue-400" />
                    {c.name}
                </button>
            ))}
            {scenes.map((s: any) => (
                <button
                    key={s.id}
                    onClick={() => onInsertAsset("scene", s.name)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-glass-border bg-surface-inset px-2.5 py-1 text-[11px] text-text-secondary transition-colors duration-fast ease-out-quart hover:bg-hover-bg hover:text-foreground"
                >
                    <span className="h-[6px] w-[6px] rounded-full bg-teal-400" />
                    {s.name}
                </button>
            ))}
            {props.map((p: any) => (
                <button
                    key={p.id}
                    onClick={() => onInsertAsset("prop", p.name)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-glass-border bg-surface-inset px-2.5 py-1 text-[11px] text-text-secondary transition-colors duration-fast ease-out-quart hover:bg-hover-bg hover:text-foreground"
                >
                    <span className="h-[6px] w-[6px] rounded-full bg-orange-400" />
                    {p.name}
                </button>
            ))}
        </div>
    );
}
