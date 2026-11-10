"use client";

import { useEffect, useState } from "react";
import { Btn, SectionTitle } from "./ui";
import { Icon } from "./icons";

export interface BatchItem {
  id: string;
  name: string;
  filePath: string;
  fileSize: number;
  durationSec: number;
  sourceLang: string;
  targetLang: string;
  asrModel: string;
  status: "pending" | "processing" | "completed" | "failed" | "paused";
  progress: number;
  errorMsg?: string;
  outputSrtPath?: string;
}

export default function BatchQueueView({
  onToast,
}: {
  onToast: (tone: "ok" | "err" | "warn" | "info", text: string) => void;
}) {
  const [jobs, setJobs] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchJobs = async () => {
    try {
      const res = await fetch("/api/batch");
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectFiles = async () => {
    // If running inside desktop electron, use desktopApi
    const win = window as any;
    if (win.desktopApi && win.desktopApi.openFile) {
      const filePath = await win.desktopApi.openFile({
        filters: [{ name: "Media Files", extensions: ["mp4", "mkv", "mov", "avi", "webm", "mp3", "wav"] }]
      });
      if (filePath) {
        const fileName = filePath.split(/[/\\]/).pop() || "media";
        await addBatchJobs([{ name: fileName, filePath }]);
      }
    } else {
      // Browser input fallback
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = "video/*,audio/*";
      input.onchange = async () => {
        if (!input.files) return;
        const items = Array.from(input.files).map((f) => ({
          name: f.name,
          filePath: f.name,
          fileSize: f.size,
        }));
        await addBatchJobs(items);
      };
      input.click();
    }
  };

  const addBatchJobs = async (items: Array<{ name: string; filePath: string; fileSize?: number }>) => {
    try {
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, defaultModel: "small" }),
      });
      if (res.ok) {
        onToast("ok", `Added ${items.length} job(s) to queue`);
        await fetchJobs();
      }
    } catch (e: any) {
      onToast("err", e.message || "Failed to add items");
    }
  };

  const handleClearAll = async () => {
    try {
      const res = await fetch("/api/batch", { method: "DELETE" });
      if (res.ok) {
        onToast("ok", "Cleared batch queue");
        setJobs([]);
      }
    } catch (e: any) {
      onToast("err", e.message);
    }
  };

  const handleStartBatch = async () => {
    setIsProcessing(true);
    onToast("info", "Starting batch processing sequentially...");
    try {
      const res = await fetch("/api/batch/run", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        onToast("ok", `Batch processing finished: ${data.completed ?? 0} completed, ${data.failed ?? 0} failed`);
      } else {
        const err = await res.json();
        onToast("err", err.error || "Batch run failed");
      }
    } catch (e: any) {
      onToast("err", e.message || "Failed running batch");
    } finally {
      setIsProcessing(false);
      await fetchJobs();
    }
  };

  const hasPending = jobs.some((j) => j.status === "pending");

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--line)" }}>
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">Batch Processing Queue</h2>
          <p className="text-xs text-neutral-400">
            Enqueue multiple video or audio files for sequential automated transcription and export.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasPending && (
            <Btn
              size="sm"
              icon="zap"
              variant="primary"
              disabled={isProcessing}
              onClick={handleStartBatch}
            >
              {isProcessing ? "Processing Batch…" : "Start Batch Processing"}
            </Btn>
          )}
          <Btn size="sm" icon="plus" variant={hasPending ? undefined : "primary"} onClick={handleSelectFiles}>
            Add Files to Queue
          </Btn>
          {jobs.length > 0 && (
            <Btn size="sm" variant="danger" disabled={isProcessing} onClick={handleClearAll}>
              Clear Queue
            </Btn>
          )}
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center p-12 text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400">
            <Icon name="folder" size={24} />
          </div>
          <h3 className="font-semibold text-sm text-neutral-200">No jobs in batch queue</h3>
          <p className="text-xs text-neutral-400 max-w-sm">
            Add multiple videos or podcast episodes to process them sequentially in the background.
          </p>
          <Btn size="sm" variant="primary" icon="plus" onClick={handleSelectFiles}>
            Select Files
          </Btn>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job, idx) => (
            <div
              key={job.id}
              className="panel flex flex-wrap items-center justify-between gap-3 p-3.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="h-6 w-6 rounded bg-neutral-800 text-neutral-400 flex items-center justify-center text-xs font-mono font-bold">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <h4 className="font-semibold text-sm text-neutral-100 truncate">{job.name}</h4>
                  <div className="flex items-center gap-2 text-[0.7rem] text-neutral-400">
                    <span>Model: {job.asrModel}</span>
                    <span>•</span>
                    <span>Lang: {job.sourceLang.toUpperCase()} → {job.targetLang.toUpperCase()}</span>
                    {job.errorMsg && <span className="text-rose-400 font-semibold">• Error: {job.errorMsg}</span>}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`chip text-[0.7rem] ${
                    job.status === "completed"
                      ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                      : job.status === "processing"
                      ? "border-amber-500/40 text-amber-300 bg-amber-500/10 pulse"
                      : job.status === "failed"
                      ? "border-rose-500/40 text-rose-400 bg-rose-500/10"
                      : "border-neutral-700 text-neutral-400"
                  }`}
                >
                  {job.status === "processing" ? `${job.progress}%` : job.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
