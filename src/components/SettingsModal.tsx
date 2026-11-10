"use client";

import { useEffect, useState } from "react";
import { Field, Modal, SectionTitle, Select, Toggle, Btn } from "./ui";
import { Icon } from "./icons";
import type { StudioSettings } from "@/lib/types";
import AudioDiagnosticsModal from "./AudioDiagnosticsModal";

export interface Prefs {
  theme: "dark" | "light";
  fs: "md" | "lg" | "xl";
  contrast: boolean;
}

export default function SettingsModal({
  open,
  onClose,
  prefs,
  setPrefs,
  settings,
  setSettings,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  settings: StudioSettings;
  setSettings: (patch: Partial<StudioSettings>) => void;
  onToast: (tone: "ok" | "err" | "warn" | "info", text: string) => void;
}) {
  const [colabUrl, setColabUrl] = useState("");
  const [colabToken, setColabToken] = useState("");
  const [diagOpen, setDiagOpen] = useState(false);
  const [engineInfo, setEngineInfo] = useState<{
    engineUrl: string;
    token?: string;
    hasToken?: boolean;
    isColab: boolean;
    online: boolean;
    latencyMs: number | null;
    modelInfo: string;
    device?: string;
  } | null>(null);
  const [checkingEngine, setCheckingEngine] = useState(false);

  const fetchEngineStatus = async () => {
    try {
      const res = await fetch("/api/colab");
      if (res.ok) {
        const data = await res.json();
        setEngineInfo(data);
        if (data.isColab) {
          setColabUrl(data.engineUrl);
        }
        if (data.token) {
          setColabToken(data.token);
        }
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let active = true;
    if (open) {
      fetch("/api/colab")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!active || !data) return;
          setEngineInfo(data);
          if (data.isColab) {
            setColabUrl(data.engineUrl);
          }
          if (data.token) {
            setColabToken(data.token);
          }
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [open]);

  const saveColab = async (urlToSave: string, tokenToSave: string) => {
    setCheckingEngine(true);
    try {
      const res = await fetch("/api/colab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToSave, token: tokenToSave }),
      });
      if (res.ok) {
        await fetchEngineStatus();
        onToast("ok", urlToSave ? "Connected to Google Colab GPU backend!" : "Switched to local GPU backend.");
      } else {
        onToast("err", "Failed to update engine settings");
      }
    } catch (e) {
      onToast("err", e instanceof Error ? e.message : "Connection failed");
    } finally {
      setCheckingEngine(false);
    }
  };

  return (
    <>
    <Modal open={open} onClose={onClose} title="Settings & Engine" wide>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <SectionTitle icon="eye">Appearance & accessibility</SectionTitle>
          <div className="space-y-3">
            <Field label="Theme">
              <Select
                value={prefs.theme}
                onChange={(v) => setPrefs({ ...prefs, theme: v as Prefs["theme"] })}
                options={[
                  { value: "dark", label: "Dark (studio)" },
                  { value: "light", label: "Light" },
                ]}
              />
            </Field>
            <Field label="Interface font size">
              <Select
                value={prefs.fs}
                onChange={(v) => setPrefs({ ...prefs, fs: v as Prefs["fs"] })}
                options={[
                  { value: "md", label: "Default" },
                  { value: "lg", label: "Large" },
                  { value: "xl", label: "Extra large" },
                ]}
              />
            </Field>
            <Toggle
              checked={prefs.contrast}
              onChange={(v) => setPrefs({ ...prefs, contrast: v })}
              label="High contrast mode"
              hint="stronger borders and text for low-vision use"
            />
          </div>
        </div>

        <div>
          <SectionTitle icon="gear">Pipeline defaults</SectionTitle>
          <div className="space-y-3">
            <Field label="Profanity handling">
              <Select
                value={settings.profanityMode}
                onChange={(v) => setSettings({ profanityMode: v as StudioSettings["profanityMode"] })}
                options={[
                  { value: "preserve", label: "Preserve exactly (default)" },
                  { value: "censor", label: "Censor (****)" },
                  { value: "mild", label: "Replace with milder language" },
                ]}
              />
            </Field>
            <Field label={`Max subtitle duration: ${settings.maxDurationSec}s`}>
              <input
                type="range"
                min={4}
                max={12}
                step={1}
                value={settings.maxDurationSec}
                onChange={(e) => setSettings({ maxDurationSec: Number(e.target.value) })}
                className="w-full"
              />
            </Field>
            <Field label={`Reading speed limit: ${settings.cpsLimit} CPS`}>
              <input
                type="range"
                min={12}
                max={24}
                step={1}
                value={settings.cpsLimit}
                onChange={(e) => setSettings({ cpsLimit: Number(e.target.value) })}
                className="w-full"
              />
            </Field>
            <Toggle
              checked={settings.autoProcessNew}
              onChange={(v) => setSettings({ autoProcessNew: v })}
              label="Auto-process new files"
              hint="web equivalent of the watch-folder: new uploads start immediately"
            />
          </div>
        </div>

        {/* Google Colab Remote GPU Addon (Seamless & Non-breaking) */}
        <div className="sm:col-span-2">
          <SectionTitle icon="spark">Addon: Google Colab Remote GPU (Free Cloud Acceleration)</SectionTitle>
          <div className="panel-inset space-y-3 px-4 py-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                Run large models (e.g. Large-v3-Turbo) on a free Google Colab Tesla T4 GPU without using your laptop&apos;s VRAM.
              </span>
              <span
                className={`chip text-[0.7rem] ${
                  engineInfo?.online ? "border-emerald-500/40 text-emerald-400" : "border-rose-500/40 text-rose-400"
                }`}
              >
                ● {engineInfo?.online ? `Online (${engineInfo.modelInfo})` : "Local Engine (or Offline)"}
                {engineInfo?.latencyMs != null && ` · ${engineInfo.latencyMs}ms`}
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[0.7rem] font-medium text-neutral-400">Tunnel / Engine URL</label>
                <input
                  type="text"
                  placeholder="https://xxxx.trycloudflare.com (or leave blank for local)"
                  className="input w-full text-xs font-mono"
                  value={colabUrl}
                  onChange={(e) => setColabUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[0.7rem] font-medium text-neutral-400">API Secret Token (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. colab-t4-xxx"
                  className="input w-full text-xs font-mono"
                  value={colabToken}
                  onChange={(e) => setColabToken(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Btn
                size="sm"
                variant="primary"
                disabled={checkingEngine}
                onClick={() => void saveColab(colabUrl.trim(), colabToken.trim())}
              >
                {checkingEngine ? "Connecting..." : "Save & Verify Connection"}
              </Btn>
              {engineInfo?.isColab && (
                <Btn
                  size="sm"
                  disabled={checkingEngine}
                  onClick={() => {
                    setColabUrl("");
                    setColabToken("");
                    void saveColab("", "");
                  }}
                >
                  Reset to Local GPU
                </Btn>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between text-[0.72rem] text-neutral-400 pt-1 border-t border-neutral-800">
              <span>
                Notebook: <code className="text-teal-300 font-mono">colab_backend.ipynb</code> (supports Cloudflare Tunnel &amp; Ngrok)
              </span>
              <a
                href="https://colab.research.google.com/github/margacis2/ai-subtitle-studio/blob/main/colab_backend.ipynb"
                target="_blank"
                rel="noreferrer"
                className="text-teal-400 hover:underline flex items-center gap-1 font-semibold"
              >
                Open colab_backend.ipynb in Google Colab ↗
              </a>
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          <SectionTitle icon="wave">Audio & System Diagnostics</SectionTitle>
          <div className="panel-inset flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
            <div>
              <p className="font-semibold text-neutral-200">Audio Pipeline & System Verification</p>
              <p className="text-neutral-400">Validate FFmpeg, FFprobe, audio extraction, VAD, and local AI backend connectivity.</p>
            </div>
            <Btn
              size="sm"
              variant="primary"
              icon="zap"
              onClick={() => setDiagOpen(true)}
            >
              Test Audio Processing
            </Btn>
          </div>
        </div>

        <div className="sm:col-span-2">
          <SectionTitle icon="shield">Processing & privacy</SectionTitle>
          <div className="panel-inset space-y-2 px-4 py-3 text-[0.78rem] leading-relaxed" style={{ color: "var(--muted)" }}>
            <div className="flex items-center gap-2 font-bold" style={{ color: "var(--ok)" }}>
              <Icon name="shield" size={14} /> Local or Colab Tunnel Only
            </div>
            <p>
              By default, everything runs locally on your PC. When using the Google Colab addon, communication happens directly through your private Colab tunnel with zero third-party data tracking.
            </p>
            <div className="flex justify-end pt-1">
              <Btn size="sm" onClick={onClose}>Done</Btn>
            </div>
          </div>
        </div>
      </div>
    </Modal>
    <AudioDiagnosticsModal open={diagOpen} onClose={() => setDiagOpen(false)} />
    </>
  );
}
