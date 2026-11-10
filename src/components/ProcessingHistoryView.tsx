"use client";

import { useEffect, useMemo, useState } from "react";
import type { Project } from "@/lib/types";
import { fmtClock, fmtDate } from "@/lib/time";
import { Btn, SectionTitle } from "./ui";
import { Icon } from "./icons";

export default function ProcessingHistoryView({
  projects,
  onOpenProject,
  onToast,
}: {
  projects: Project[];
  onOpenProject: (id: string) => void;
  onToast: (tone: "ok" | "err" | "warn" | "info", text: string) => void;
}) {
  const [logs, setLogs] = useState<string[]>([]);
  const [logFilter, setLogFilter] = useState<string>("all");
  const [logSearch, setLogSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.lines || []);
      }
    } catch {
      /* ignore */
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    if (!autoRefresh) return;
    const iv = setInterval(fetchLogs, 4000);
    return () => clearInterval(iv);
  }, [autoRefresh]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      const matchSearch = !logSearch || l.toLowerCase().includes(logSearch.toLowerCase());
      if (!matchSearch) return false;
      if (logFilter === "all") return true;
      if (logFilter === "error") return l.toLowerCase().includes("err") || l.toLowerCase().includes("fail");
      if (logFilter === "warn") return l.toLowerCase().includes("warn");
      if (logFilter === "info") return !l.toLowerCase().includes("err") && !l.toLowerCase().includes("warn");
      return true;
    });
  }, [logs, logSearch, logFilter]);

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join("\n"));
    onToast("ok", `Copied ${logs.length} log lines to clipboard`);
  };

  const handleDownloadLogs = () => {
    const blob = new Blob([logs.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subtitle-studio-logs-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
    onToast("ok", "Downloaded diagnostic log file");
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch("/api/logs", { method: "DELETE" });
      if (res.ok) {
        setLogs([]);
        onToast("ok", "Cleared server logs");
      }
    } catch (e: any) {
      onToast("err", e.message || "Failed to clear logs");
    }
  };

  const completedProjects = useMemo(() => {
    return [...projects]
      .filter((p) => p.status === "completed" || p.status === "failed")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [projects]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4" style={{ borderColor: "var(--line)" }}>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold tracking-tight">Processing History & Logs</h1>
            <span className="chip" style={{ background: "var(--panel)", color: "var(--cyan)" }}>
              Diagnostic Console
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Detailed execution metrics, RTF benchmarking, stage breakdowns, and live server logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Btn size="sm" icon="copy" onClick={handleCopyLogs}>
            Copy Logs
          </Btn>
          <Btn size="sm" icon="download" onClick={handleDownloadLogs}>
            Export Log File
          </Btn>
        </div>
      </div>

      {/* Pipeline Stage Architecture Overview */}
      <div className="panel p-4 space-y-3">
        <h3 className="font-semibold text-xs text-neutral-300 uppercase tracking-wider flex items-center gap-2">
          <Icon name="zap" size={14} className="text-cyan-400" />
          Local AI Processing Architecture
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          {[
            { step: "1", title: "Media Ingest", desc: "FFprobe verification & metadata check" },
            { step: "2", title: "Audio Extract", desc: "FFmpeg 16 kHz Mono PCM WAV" },
            { step: "3", title: "VAD Split", desc: "Energy & Silero voice activity chunks" },
            { step: "4", title: "Faster-Whisper", desc: "CTranslate2 CUDA fp16 / CPU int8" },
            { step: "5", title: "Alignment", desc: "Phoneme & word-level timestamps" },
            { step: "6", title: "Translation & Out", desc: "OPUS-MT offline & SRT/VTT/ASS" },
          ].map((st) => (
            <div key={st.step} className="rounded-md bg-neutral-900/80 p-2.5 border border-neutral-800">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold mb-1">
                <span className="h-4 w-4 rounded-full bg-cyan-500/20 flex items-center justify-center text-[0.65rem]">
                  {st.step}
                </span>
                <span className="text-[0.75rem] text-neutral-200">{st.title}</span>
              </div>
              <p className="text-[0.65rem] text-neutral-400 leading-tight">{st.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Historical Runs Grid */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-neutral-200">Execution History & Benchmark Runs</h3>
        {completedProjects.length === 0 ? (
          <div className="panel p-6 text-center text-xs text-neutral-400">
            No completed or past runs found. Start a transcription to view execution stats.
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-900/60 text-neutral-400 font-semibold">
                    <th className="py-2.5 px-4">Project</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Audio Duration</th>
                    <th className="py-2.5 px-3">Processing Time</th>
                    <th className="py-2.5 px-3">Speed (RTF)</th>
                    <th className="py-2.5 px-3">Model</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {completedProjects.map((p) => {
                    const dur = p.durationSec || 0;
                    const proc = p.processingTimeSec || 0;
                    const rtf = proc > 0 && dur > 0 ? (dur / proc).toFixed(1) : null;
                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-neutral-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-semibold text-neutral-200">
                          <span className="truncate block max-w-xs">{p.name}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`chip text-[0.65rem] ${
                              p.status === "completed"
                                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                                : "text-rose-400 bg-rose-500/10 border-rose-500/30"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-neutral-300">{fmtClock(dur)}</td>
                        <td className="py-3 px-3 font-mono text-neutral-300">
                          {proc > 0 ? `${proc.toFixed(1)}s` : "—"}
                        </td>
                        <td className="py-3 px-3">
                          {rtf ? (
                            <span className="text-cyan-400 font-semibold font-mono">{rtf}x realtime</span>
                          ) : (
                            <span className="text-neutral-500">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-neutral-400 capitalize">{p.asrModel}</td>
                        <td className="py-3 px-3 text-neutral-500">{fmtDate(p.createdAt)}</td>
                        <td className="py-3 px-4 text-right">
                          <Btn size="sm" onClick={() => onOpenProject(p.id)}>
                            View Project
                          </Btn>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Live System Log Console */}
      <div className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-neutral-200">Live Application Logs</h3>
            <span className="chip text-[0.65rem]" style={{ background: "var(--panel)", color: "var(--cyan)" }}>
              {filteredLogs.length} entries
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              placeholder="Search logs…"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              className="bg-neutral-900 border border-neutral-700/60 text-neutral-300 px-2.5 py-1 rounded text-xs focus:outline-none focus:border-cyan-500"
            />

            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              className="bg-neutral-900 border border-neutral-700/60 text-neutral-300 px-2.5 py-1 rounded text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="all">All Logs</option>
              <option value="info">Info Only</option>
              <option value="warn">Warnings</option>
              <option value="error">Errors</option>
            </select>

            <label className="flex items-center gap-1.5 text-neutral-400 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded bg-neutral-900 border-neutral-700 text-cyan-500 focus:ring-0"
              />
              Auto-refresh
            </label>

            <button
              onClick={fetchLogs}
              title="Refresh logs now"
              className="p-1 rounded text-neutral-400 hover:text-neutral-200"
            >
              <Icon name="rotate" size={13} className={isLoading ? "animate-spin" : ""} />
            </button>

            <button
              onClick={handleClearLogs}
              title="Clear log file"
              className="p-1 rounded text-neutral-500 hover:text-rose-400"
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
        </div>

        {/* Log Window */}
        <div className="h-80 w-full overflow-y-auto rounded-md bg-neutral-950 p-3 font-mono text-[0.7rem] text-neutral-300 border border-neutral-800 space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-neutral-500 text-center py-10">No log entries found.</div>
          ) : (
            filteredLogs.map((line, idx) => {
              const isErr = line.toLowerCase().includes("err") || line.toLowerCase().includes("fail");
              const isWarn = line.toLowerCase().includes("warn");
              return (
                <div
                  key={idx}
                  className={`leading-relaxed break-all ${
                    isErr ? "text-rose-400" : isWarn ? "text-amber-300" : "text-neutral-300"
                  }`}
                >
                  {line}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
