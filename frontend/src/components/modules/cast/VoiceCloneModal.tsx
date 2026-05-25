"use client";
/**
 * VoiceCloneModal — PR-3h #4
 *
 * Small sub-modal opened from VoicePickerModal "+ 上传新音频" button
 * (我的复刻 tab). Captures one audio sample + label, uploads via
 * /upload to get URL, then calls /voice/clone which dispatches the
 * dashscope customization API.
 *
 * Per Q16.2 推荐 B: dedicated sub-modal keeps picker focused on
 * SELECTION; creation has its own UX surface that matches the simple
 * transactional flow (upload → wait → done).
 *
 * Audio requirements (frontend pre-validation per dashscope doc):
 *   - MP3 / WAV / M4A
 *   - ≤ 10 MB
 *   - Recommend 10-20s, max 60s (not enforced — backend will reject)
 *
 * Spec: r2v-workflow-v3-unified.md §6.1 PR-3h + Q15.2 + Q16
 */
import { useRef, useState } from "react";
import { X, Upload, Loader2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, type CustomVoice } from "@/lib/api";

const ALLOWED_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/x-m4a", "audio/mp4"];
const ALLOWED_EXTS = [".mp3", ".wav", ".m4a"];
const MAX_BYTES = 10 * 1024 * 1024;

interface VoiceCloneModalProps {
    isOpen: boolean;
    onClose: () => void;
    seriesId: string;
    onCreated: (voice: CustomVoice) => void;
}

type Phase = "pick" | "uploading" | "cloning" | "done" | "error";

export default function VoiceCloneModal({ isOpen, onClose, seriesId, onCreated }: VoiceCloneModalProps) {
    const t = useTranslations("voiceClone");
    const [file, setFile] = useState<File | null>(null);
    const [label, setLabel] = useState("");
    const [phase, setPhase] = useState<Phase>("pick");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [dragHot, setDragHot] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const reset = () => {
        setFile(null);
        setLabel("");
        setPhase("pick");
        setErrorMsg(null);
    };

    const handleClose = () => {
        if (phase === "uploading" || phase === "cloning") return; // block close mid-flight
        reset();
        onClose();
    };

    const validate = (f: File): string | null => {
        const lower = f.name.toLowerCase();
        const extOk = ALLOWED_EXTS.some((ext) => lower.endsWith(ext));
        const typeOk = ALLOWED_TYPES.includes(f.type);
        if (!extOk && !typeOk) return t("errorBadType");
        if (f.size > MAX_BYTES) return t("errorTooLarge");
        return null;
    };

    const handleFile = (f: File) => {
        setErrorMsg(null);
        const err = validate(f);
        if (err) {
            setErrorMsg(err);
            return;
        }
        setFile(f);
        if (!label.trim()) {
            // Auto-suggest label from filename minus extension
            const base = f.name.replace(/\.[^.]+$/, "");
            setLabel(base.slice(0, 30));
        }
    };

    const handleSubmit = async () => {
        if (!file || !label.trim()) return;
        setErrorMsg(null);
        setPhase("uploading");
        try {
            // Step 1: upload audio file to get a URL
            const formData = new FormData();
            formData.append("file", file);
            const uploadResp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/upload`, {
                method: "POST",
                body: formData,
            });
            if (!uploadResp.ok) {
                throw new Error(`Upload failed: ${uploadResp.status}`);
            }
            const { url } = await uploadResp.json();
            if (!url) throw new Error("Upload response missing url");

            // Step 2: call /voice/clone
            setPhase("cloning");
            const voice = await api.cloneVoice({
                series_id: seriesId,
                audio_url: url,
                label: label.trim(),
            });

            setPhase("done");
            // Allow user to see success briefly, then close
            setTimeout(() => {
                onCreated(voice);
                reset();
                onClose();
            }, 600);
        } catch (e: any) {
            setErrorMsg(e?.message || "Clone failed");
            setPhase("error");
        }
    };

    const inFlight = phase === "uploading" || phase === "cloning";

    return (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-overlay backdrop-blur-sm" onClick={handleClose}>
            <div
                className="w-full max-w-md rounded-2xl border border-glass-border bg-elevated shadow-[0_24px_64px_-12px_rgba(0,0,0,0.7)]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-glass-border">
                    <h2 className="text-display font-medium text-foreground">{t("title")}</h2>
                    <button
                        onClick={handleClose}
                        disabled={inFlight}
                        aria-label={t("close")}
                        className="p-1.5 rounded-lg hover:bg-hover-bg text-text-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-4">
                    {/* Drop zone */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); if (!inFlight) setDragHot(true); }}
                        onDragLeave={() => setDragHot(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragHot(false);
                            if (inFlight) return;
                            const f = e.dataTransfer.files?.[0];
                            if (f) handleFile(f);
                        }}
                        onClick={() => { if (!inFlight) fileInputRef.current?.click(); }}
                        className={`relative rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                            dragHot
                                ? "border-primary bg-primary/10"
                                : file
                                    ? "border-primary/50 bg-primary/5"
                                    : "border-glass-border hover:border-white/20 bg-black/30"
                        } ${inFlight ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".mp3,.wav,.m4a,audio/*"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFile(f);
                            }}
                            className="hidden"
                        />
                        {file ? (
                            <div className="flex items-center justify-center gap-2 text-foreground">
                                <Check size={14} className="text-primary" />
                                <span className="text-[13px] truncate max-w-[280px]" title={file.name}>{file.name}</span>
                                <span className="font-mono text-[10px] text-text-muted">
                                    {(file.size / 1024 / 1024).toFixed(1)}MB
                                </span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <Upload size={20} className="text-text-muted" />
                                <p className="text-[13px] text-text-secondary">{t("dropHint")}</p>
                                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">{t("requirements")}</p>
                            </div>
                        )}
                    </div>

                    {/* Label input */}
                    <div>
                        <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted mb-1">
                            {t("labelLabel")}
                        </label>
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value.slice(0, 30))}
                            placeholder={t("labelPlaceholder")}
                            disabled={inFlight}
                            maxLength={30}
                            className="w-full rounded-md border border-glass-border bg-black/30 px-3 py-2 text-[13px] text-foreground placeholder:text-text-muted focus:outline-none focus:border-primary/40 disabled:opacity-60"
                        />
                    </div>

                    {/* Error */}
                    {errorMsg && (
                        <div className="rounded-md border border-status-failed-border bg-status-failed-bg px-3 py-2 text-body-sm text-status-failed-fg" role="alert">
                            {errorMsg}
                        </div>
                    )}

                    {/* Status banner during flight */}
                    {inFlight && (
                        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-body-sm text-foreground">
                            <Loader2 size={13} className="animate-spin text-primary" />
                            <span>{phase === "uploading" ? t("uploading") : t("cloning")}</span>
                        </div>
                    )}
                    {phase === "done" && (
                        <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-body-sm text-primary">
                            <Check size={13} />
                            <span>{t("doneCloned")}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-glass-border">
                    <button
                        onClick={handleClose}
                        disabled={inFlight}
                        className="inline-flex items-center px-3 py-1.5 rounded-md bg-glass border border-glass-border text-text-secondary hover:text-foreground hover:bg-hover-bg transition-colors text-[12px] disabled:opacity-30"
                    >
                        {t("cancel")}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!file || !label.trim() || inFlight || phase === "done"}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-white border border-[rgba(100,108,255,0.65)] shadow-[inset_0_1.5px_0_rgba(255,255,255,0.14)] hover:bg-[#7a82ff] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[12px] font-semibold"
                    >
                        {phase === "done" ? <Check size={12} /> : null}
                        {phase === "done" ? t("done") : t("submit")}
                    </button>
                </div>
            </div>
        </div>
    );
}
