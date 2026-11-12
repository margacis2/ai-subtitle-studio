"use client";

import { useEffect, useState } from "react";
import type { HardwareInfo, TranslationModelOption } from "@/lib/types";
import { checkHardwareCompatibility } from "@/lib/modelManager";
import { fetchHardware } from "@/lib/client";
import { Btn } from "./ui";
import { Icon } from "./icons";

export interface ModelItem {
  id: string;
  name: string;
  family?: string;
  size_mb: number;
  vram_gb: number;
  ram_gb: number;
  speed?: string;
  accuracy?: string;
  description: string;
  installed?: boolean;
  downloading?: boolean;
  progress?: number;
  status?: string;
  bytes_downloaded?: number;
  total_bytes?: number;
  speed_mbps?: number;
  installed_size_mb?: number;
}

export default function ModelManagerView({
  onToast,
}: {
  onToast: (tone: "ok" | "err" | "warn" | "info", text: string) => void;
}) {
  const [tab, setTab] = useState<"asr" | "translation">("asr");
  const [asrModels, setAsrModels] = useState<ModelItem[]>([]);
  const [transModels, setTransModels] = useState<TranslationModelOption[]>([]);
  const [cacheDir, setCacheDir] = useState<string>("");
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [testingModel, setTestingModel] = useState<string | null>(null);

  const fetchModels = async () => {
    try {
      // 1. Fetch ASR models
      const resAsr = await fetch("/api/models?type=asr");
      if (resAsr.ok) {
        const data = await resAsr.json();
        setAsrModels(data.models || []);
        if (data.cache_dir) setCacheDir(data.cache_dir);
      }
      // 2. Fetch Translation models
      const resTrans = await fetch("/api/models?type=translation");
      if (resTrans.ok) {
        const data = await resTrans.json();
        setTransModels(data.models || []);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchModels();
    fetchHardware().then(setHw).catch(() => null);
  }, []);

  // Polling for active downloads
  useEffect(() => {
    const hasActiveDl =
      asrModels.some((m) => m.downloading || m.status === "downloading" || m.status === "starting" || m.status === "verifying") ||
      transModels.some((m) => m.downloading || m.status === "downloading" || m.status === "starting" || m.status === "verifying");
    const intervalTime = hasActiveDl ? 1000 : 4000;
    const interval = setInterval(fetchModels, intervalTime);
    return () => clearInterval(interval);
  }, [asrModels, transModels]);

  const handleDownload = async (modelId: string, type: "asr" | "translation" = "asr") => {
    setActionInProgress(modelId);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, action: "download", type }),
      });
      if (res.ok) {
        onToast("ok", `Download started for ${type === "translation" ? "translation" : "transcription"} model: ${modelId}`);
        await fetchModels();
      } else {
        const err = await res.json();
        onToast("err", err.error || "Failed to start download");
      }
    } catch (e: any) {
      onToast("err", e.message || "Network error");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleTestLoad = async (modelId: string) => {
    setTestingModel(modelId);
    onToast("info", `Testing ${modelId} hardware loading into memory...`);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, action: "test", type: "asr" }),
      });
      if (res.ok) {
        const data = await res.json();
        onToast("ok", `✓ ${modelId} successfully loaded on ${data.device} in ${data.load_time_ms ?? data.load_time_sec ?? "0.8"}s`);
      } else {
        const err = await res.json();
        onToast("err", err.error?.message || err.detail?.message || err.error || "Failed loading model");
      }
    } catch (e: any) {
      onToast("err", e.message || "Hardware test failed");
    } finally {
      setTestingModel(null);
    }
  };

  const handleDelete = async (modelId: string, type: "asr" | "translation" = "asr") => {
    if (!confirm(`Are you sure you want to delete ${modelId} from local storage?`)) return;
    setActionInProgress(modelId);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, action: "delete", type }),
      });
      if (res.ok) {
        onToast("ok", `Model ${modelId} removed from disk.`);
        await fetchModels();
      }
    } catch (e: any) {
      onToast("err", e.message || "Failed to delete");
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--line)" }}>
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">AI Model Hub & Manager</h2>
          <p className="text-xs text-neutral-400">
            Download and manage offline speech recognition (ASR) and neural translation (MT) models with real hardware checks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hw && hw.gpuName && (
            <span className="chip border-teal-500/30 text-teal-300 text-[0.7rem] hidden sm:inline-flex">
              {hw.gpuName} · {hw.vramGb} GB VRAM
            </span>
          )}
          <Btn
            size="sm"
            icon="spark"
            title="Unload all cached models and flush PyTorch CUDA cache"
            onClick={async () => {
              try {
                const res = await fetch("/api/models", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ modelId: "all", action: "unload" }),
                });
                if (res.ok) {
                  onToast("ok", "VRAM Cleared: All ASR and Translation models unloaded from GPU/RAM");
                }
              } catch {
                onToast("err", "Failed to release models");
              }
            }}
          >
            Free VRAM
          </Btn>
          <Btn size="sm" icon="gear" onClick={fetchModels}>
            Refresh
          </Btn>
        </div>
      </div>

      {cacheDir && (
        <div className="panel-inset flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
          <span className="text-neutral-400">
            Storage Location: <code className="text-teal-300 font-mono">{cacheDir}</code>
          </span>
          <span className="chip border-emerald-500/30 text-emerald-400 text-[0.7rem]">
            100% Offline Local Engine
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
        <button
          onClick={() => setTab("asr")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            tab === "asr"
              ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          }`}
        >
          <Icon name="wave" size={14} />
          Speech Recognition Models (ASR)
          <span className="ml-1 rounded-full bg-neutral-800 px-1.5 py-0.2 text-[0.65rem] font-mono">
            {asrModels.length}
          </span>
        </button>

        <button
          onClick={() => setTab("translation")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            tab === "translation"
              ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          }`}
        >
          <Icon name="globe" size={14} />
          Offline Translation Models (Neural MT)
          <span className="ml-1 rounded-full bg-neutral-800 px-1.5 py-0.2 text-[0.65rem] font-mono">
            {transModels.length}
          </span>
        </button>
      </div>

      {/* TAB 1: SPEECH RECOGNITION (ASR) */}
      {tab === "asr" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {asrModels.map((m) => {
            const isInstalled = m.installed || m.status === "installed";
            const isDownloading = m.downloading || m.status === "downloading" || m.status === "starting" || m.status === "verifying";
            const isBusy = actionInProgress === m.id;
            const compat = hw ? checkHardwareCompatibility(m.id, hw) : null;

            return (
              <div
                key={m.id}
                className="panel flex flex-col justify-between p-4 space-y-3 transition-all hover:border-neutral-700"
                style={{
                  borderColor: isInstalled
                    ? "color-mix(in srgb, var(--ok) 40%, transparent)"
                    : isDownloading
                    ? "color-mix(in srgb, var(--accent) 45%, transparent)"
                    : undefined,
                }}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm leading-tight text-neutral-100">{m.name}</h3>
                    <span
                      className={`chip text-[0.68rem] shrink-0 ${
                        isInstalled
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                          : isDownloading
                          ? "border-amber-500/40 text-amber-300 bg-amber-500/10 animate-pulse"
                          : "border-neutral-700 text-neutral-400"
                      }`}
                    >
                      {isInstalled
                        ? "✓ Installed"
                        : isDownloading
                        ? `Downloading ${m.progress || 0}%`
                        : "Available"}
                    </span>
                  </div>
                  <p className="text-[0.75rem] text-neutral-400 leading-snug">{m.description}</p>
                </div>

                <div className="space-y-2.5 pt-2 border-t" style={{ borderColor: "var(--line)" }}>
                  {/* Hardware Support Pill */}
                  {compat && (
                    <div className="flex items-center justify-between text-[0.68rem] px-2 py-1 rounded bg-neutral-900/80 border border-neutral-800">
                      <span className="text-neutral-400">Hardware fit:</span>
                      {compat.shortfallGb > 0 ? (
                        <span className="text-amber-400 font-semibold flex items-center gap-1">
                          <Icon name="alert" size={11} />
                          Exceeds VRAM (-{compat.shortfallGb} GB)
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <Icon name="check" size={11} />
                          Fits GPU ({compat.detectedVramGb} GB)
                        </span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-1 text-center text-[0.7rem]">
                    <div className="rounded bg-neutral-900/60 p-1.5">
                      <span className="block text-neutral-400 text-[0.62rem]">Size</span>
                      <span className="font-mono font-semibold text-neutral-200">
                        {isInstalled && m.installed_size_mb ? `${m.installed_size_mb} MB` : `${m.size_mb} MB`}
                      </span>
                    </div>
                    <div className="rounded bg-neutral-900/60 p-1.5">
                      <span className="block text-neutral-400 text-[0.62rem]">VRAM</span>
                      <span className="font-mono font-semibold text-neutral-200">~{m.vram_gb} GB</span>
                    </div>
                    <div className="rounded bg-neutral-900/60 p-1.5">
                      <span className="block text-neutral-400 text-[0.62rem]">Speed</span>
                      <span className="font-mono font-semibold text-teal-300">{m.speed?.split(" ")[0] || "1.0x"}</span>
                    </div>
                  </div>

                  {isDownloading && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[0.68rem] text-neutral-400">
                        <span>{m.status || "Downloading"}...</span>
                        <span className="font-mono text-cyan-300 font-bold">
                          {m.progress || 0}%
                          {m.speed_mbps ? ` · ${m.speed_mbps} MB/s` : ""}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-teal-400 to-cyan-400 transition-all duration-300"
                          style={{ width: `${Math.max(3, m.progress || 0)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    {!isInstalled && (
                      <Btn
                        size="sm"
                        variant="primary"
                        className="w-full"
                        disabled={isBusy || isDownloading}
                        onClick={() => handleDownload(m.id, "asr")}
                      >
                        {isDownloading ? `Downloading (${m.progress || 0}%)` : isBusy ? "Starting..." : "Download Model"}
                      </Btn>
                    )}
                    {isInstalled && (
                      <div className="flex w-full items-center gap-1.5">
                        <Btn
                          size="sm"
                          variant="ghost"
                          className="flex-1"
                          icon="cpu"
                          disabled={isBusy || testingModel === m.id}
                          onClick={() => handleTestLoad(m.id)}
                          title="Test loading weights into GPU/CPU memory"
                        >
                          {testingModel === m.id ? "Testing..." : "Test Load"}
                        </Btn>
                        <Btn
                          size="sm"
                          variant="danger"
                          className="shrink-0"
                          icon="trash"
                          disabled={isBusy || isDownloading}
                          onClick={() => handleDelete(m.id, "asr")}
                          title="Delete model from disk"
                        >
                          Delete
                        </Btn>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: NEURAL TRANSLATION (MT) */}
      {tab === "translation" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {transModels.map((m) => {
            const isInstalled = m.installed || m.status === "installed";
            const isDownloading = m.downloading || m.status === "downloading" || m.status === "starting";
            const isBusy = actionInProgress === m.id;

            return (
              <div
                key={m.id}
                className="panel flex flex-col justify-between p-4 space-y-3 transition-all hover:border-neutral-700"
                style={{
                  borderColor: isInstalled
                    ? "color-mix(in srgb, var(--ok) 40%, transparent)"
                    : isDownloading
                    ? "color-mix(in srgb, var(--accent) 45%, transparent)"
                    : undefined,
                }}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm leading-tight text-neutral-100">{m.name}</h3>
                    <span
                      className={`chip text-[0.68rem] shrink-0 ${
                        isInstalled
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                          : isDownloading
                          ? "border-amber-500/40 text-amber-300 bg-amber-500/10 animate-pulse"
                          : "border-neutral-700 text-neutral-400"
                      }`}
                    >
                      {isInstalled
                        ? "✓ Installed"
                        : isDownloading
                        ? `Downloading ${m.progress || 0}%`
                        : "Available"}
                    </span>
                  </div>
                  <p className="text-[0.75rem] text-neutral-400 leading-snug">{m.description}</p>
                </div>

                <div className="space-y-2.5 pt-2 border-t" style={{ borderColor: "var(--line)" }}>
                  <div className="flex items-center justify-between text-[0.7rem] px-2 py-1 rounded bg-neutral-900/60">
                    <span className="text-neutral-400">Language Pair:</span>
                    <span className="font-mono text-teal-300 font-bold uppercase">
                      {m.source_lang} → {m.target_lang}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-center text-[0.7rem]">
                    <div className="rounded bg-neutral-900/60 p-1.5">
                      <span className="block text-neutral-400 text-[0.62rem]">Size</span>
                      <span className="font-mono font-semibold text-neutral-200">
                        {isInstalled && m.installed_size_mb ? `${m.installed_size_mb} MB` : `${m.size_mb} MB`}
                      </span>
                    </div>
                    <div className="rounded bg-neutral-900/60 p-1.5">
                      <span className="block text-neutral-400 text-[0.62rem]">VRAM</span>
                      <span className="font-mono font-semibold text-neutral-200">~{m.vram_gb} GB</span>
                    </div>
                    <div className="rounded bg-neutral-900/60 p-1.5">
                      <span className="block text-neutral-400 text-[0.62rem]">Engine</span>
                      <span className="font-mono font-semibold text-neutral-200">MarianMT</span>
                    </div>
                  </div>

                  {isDownloading && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[0.68rem] text-neutral-400">
                        <span>{m.status || "Downloading"}...</span>
                        <span className="font-mono text-cyan-300 font-bold">
                          {m.progress || 0}%
                          {m.speed_mbps ? ` · ${m.speed_mbps} MB/s` : ""}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-teal-400 to-cyan-400 transition-all duration-300"
                          style={{ width: `${Math.max(3, m.progress || 0)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    {!isInstalled && (
                      <Btn
                        size="sm"
                        variant="primary"
                        className="w-full"
                        disabled={isBusy || isDownloading}
                        onClick={() => handleDownload(m.id, "translation")}
                      >
                        {isDownloading ? `Downloading (${m.progress || 0}%)` : isBusy ? "Starting..." : "Download Translation Model"}
                      </Btn>
                    )}
                    {isInstalled && (
                      <div className="flex w-full items-center gap-1.5">
                        <span className="flex-1 text-center text-xs text-emerald-400 font-semibold py-1">
                          ✓ Ready for Subtitles
                        </span>
                        <Btn
                          size="sm"
                          variant="danger"
                          className="shrink-0"
                          icon="trash"
                          disabled={isBusy || isDownloading}
                          onClick={() => handleDelete(m.id, "translation")}
                          title="Delete translation model from disk"
                        >
                          Delete
                        </Btn>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
