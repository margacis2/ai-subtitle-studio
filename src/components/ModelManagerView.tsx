"use client";

import { useEffect, useState } from "react";
import { Btn, SectionTitle } from "./ui";
import { Icon } from "./icons";

export interface ModelItem {
  id: string;
  name: string;
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
}

export default function ModelManagerView({
  onToast,
}: {
  onToast: (tone: "ok" | "err" | "warn" | "info", text: string) => void;
}) {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [cacheDir, setCacheDir] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchModels = async () => {
    try {
      const res = await fetch("/api/models");
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
        if (data.cache_dir) setCacheDir(data.cache_dir);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchModels();
    const interval = setInterval(fetchModels, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleDownload = async (modelId: string) => {
    setActionInProgress(modelId);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, action: "download" }),
      });
      if (res.ok) {
        onToast("ok", `Download started for model: ${modelId}`);
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

  const handleDelete = async (modelId: string) => {
    if (!confirm(`Are you sure you want to delete model ${modelId} from local storage?`)) return;
    setActionInProgress(modelId);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, action: "delete" }),
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
          <h2 className="font-display text-xl font-bold tracking-tight">AI Model Manager</h2>
          <p className="text-xs text-neutral-400">
            Download and manage offline Faster-Whisper models stored locally on your device.
          </p>
        </div>
        <Btn size="sm" icon="gear" onClick={fetchModels}>
          Refresh Catalog
        </Btn>
      </div>

      {cacheDir && (
        <div className="panel-inset flex items-center justify-between p-3 text-xs">
          <span className="text-neutral-400">
            Storage Location: <code className="text-teal-300 font-mono">{cacheDir}</code>
          </span>
          <span className="chip border-emerald-500/30 text-emerald-400 text-[0.7rem]">
            Local Offline Storage
          </span>
        </div>
      )}

      {/* Model Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((m) => {
          const isInstalled = m.installed || m.status === "installed";
          const isDownloading = m.downloading || m.status === "downloading";
          const isBusy = actionInProgress === m.id;

          return (
            <div
              key={m.id}
              className="panel flex flex-col justify-between p-4 space-y-3 transition-all hover:border-neutral-700"
              style={{
                borderColor: isInstalled ? "color-mix(in srgb, var(--ok) 40%, transparent)" : undefined
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
                        ? "border-amber-500/40 text-amber-300 bg-amber-500/10 pulse"
                        : "border-neutral-700 text-neutral-400"
                    }`}
                  >
                    {isInstalled ? "✓ Installed" : isDownloading ? `Downloading ${m.progress || 0}%` : "Available"}
                  </span>
                </div>
                <p className="text-[0.75rem] text-neutral-400 leading-snug">{m.description}</p>
              </div>

              <div className="space-y-2.5 pt-2 border-t" style={{ borderColor: "var(--line)" }}>
                <div className="grid grid-cols-3 gap-1 text-center text-[0.7rem]">
                  <div className="rounded bg-neutral-900/60 p-1.5">
                    <span className="block text-neutral-400 text-[0.62rem]">Size</span>
                    <span className="font-mono font-semibold text-neutral-200">{m.size_mb} MB</span>
                  </div>
                  <div className="rounded bg-neutral-900/60 p-1.5">
                    <span className="block text-neutral-400 text-[0.62rem]">VRAM</span>
                    <span className="font-mono font-semibold text-neutral-200">~{m.vram_gb} GB</span>
                  </div>
                  <div className="rounded bg-neutral-900/60 p-1.5">
                    <span className="block text-neutral-400 text-[0.62rem]">RAM</span>
                    <span className="font-mono font-semibold text-neutral-200">~{m.ram_gb} GB</span>
                  </div>
                </div>

                {isDownloading && (
                  <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-400 transition-all duration-300"
                      style={{ width: `${m.progress || 10}%` }}
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  {!isInstalled && (
                    <Btn
                      size="sm"
                      variant="primary"
                      className="w-full"
                      disabled={isBusy || isDownloading}
                      onClick={() => handleDownload(m.id)}
                    >
                      {isDownloading ? "Downloading..." : isBusy ? "Starting..." : "Download Model"}
                    </Btn>
                  )}
                  {isInstalled && (
                    <Btn
                      size="sm"
                      variant="danger"
                      className="w-full"
                      disabled={isBusy}
                      onClick={() => handleDelete(m.id)}
                    >
                      Delete Model
                    </Btn>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

