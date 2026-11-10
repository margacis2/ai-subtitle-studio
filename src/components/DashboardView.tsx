"use client";

import { useMemo } from "react";
import type { Project, HardwareInfo } from "@/lib/types";
import { fmtClock, fmtDate } from "@/lib/time";
import { langFlag, langName } from "@/lib/types";
import { Btn, Badge, Stat, SectionTitle } from "./ui";
import { Icon } from "./icons";

export default function DashboardView({
  projects,
  hardware,
  onNavigate,
  onOpenProject,
  onDeleteProject,
  onToast,
}: {
  projects: Project[];
  hardware: HardwareInfo | null;
  onNavigate: (view: string) => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onToast: (tone: "ok" | "err" | "warn" | "info", text: string) => void;
}) {
  const stats = useMemo(() => {
    const total = projects.length;
    const completed = projects.filter((p) => p.status === "completed").length;
    const failed = projects.filter((p) => p.status === "failed").length;
    const processing = projects.filter((p) => p.status === "processing").length;
    const totalSec = projects.reduce((acc, p) => acc + (p.durationSec || 0), 0);
    const avgScore =
      completed > 0
        ? Math.round(
            projects
              .filter((p) => p.status === "completed" && p.qualityScore)
              .reduce((acc, p) => acc + (p.qualityScore || 0), 0) / Math.max(1, completed)
          )
        : 100;

    return {
      total,
      completed,
      failed,
      processing,
      totalDurationFormatted: fmtClock(totalSec),
      avgScore,
    };
  }, [projects]);

  const recentProjects = useMemo(() => {
    return [...projects]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [projects]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Header Banner */}
      <div className="panel relative overflow-hidden p-6 border-l-4 border-l-cyan-400">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[0.7rem] uppercase tracking-wider font-bold text-cyan-400">
                Desktop Subtitle Workstation
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-neutral-100">
              Welcome to AI Subtitle Studio
            </h1>
            <p className="text-xs text-neutral-400 max-w-xl">
              100% offline, GPU-accelerated speech recognition and subtitle editing. Process long-form media locally with Faster-Whisper, VAD filtering, and instant multi-format export.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Btn
              variant="primary"
              icon="plus"
              onClick={() => onNavigate("transcribe")}
            >
              New Transcription
            </Btn>
            <Btn
              icon="folder"
              onClick={() => onNavigate("batch")}
            >
              Batch Queue
            </Btn>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="panel p-3.5 space-y-1">
          <span className="lbl text-[0.68rem] text-neutral-400 block">Total Projects</span>
          <div className="text-xl font-bold font-mono text-neutral-100">{stats.total}</div>
          <span className="text-[0.68rem] text-neutral-500">In local SQLite DB</span>
        </div>
        <div className="panel p-3.5 space-y-1">
          <span className="lbl text-[0.68rem] text-neutral-400 block">Completed</span>
          <div className="text-xl font-bold font-mono text-emerald-400">{stats.completed}</div>
          <span className="text-[0.68rem] text-emerald-500/80">Ready to export</span>
        </div>
        <div className="panel p-3.5 space-y-1">
          <span className="lbl text-[0.68rem] text-neutral-400 block">In Progress</span>
          <div className="text-xl font-bold font-mono text-cyan-400">{stats.processing}</div>
          <span className="text-[0.68rem] text-neutral-500">Active worker tasks</span>
        </div>
        <div className="panel p-3.5 space-y-1">
          <span className="lbl text-[0.68rem] text-neutral-400 block">Failed / Retry</span>
          <div className="text-xl font-bold font-mono text-rose-400">{stats.failed}</div>
          <span className="text-[0.68rem] text-neutral-500">Require attention</span>
        </div>
        <div className="panel p-3.5 space-y-1">
          <span className="lbl text-[0.68rem] text-neutral-400 block">Media Processed</span>
          <div className="text-xl font-bold font-mono text-neutral-200">{stats.totalDurationFormatted}</div>
          <span className="text-[0.68rem] text-neutral-500">Audio/video runtime</span>
        </div>
        <div className="panel p-3.5 space-y-1">
          <span className="lbl text-[0.68rem] text-neutral-400 block">Hardware Engine</span>
          <div className="text-sm font-bold font-mono text-amber-300 truncate">
            {hardware?.gpuName ? hardware.gpuName.split(" ")[0] : "CPU int8"}
          </div>
          <span className="text-[0.68rem] text-neutral-500">
            {hardware?.cudaAvailable ? "CUDA 12 Ready" : "CPU Fallback"}
          </span>
        </div>
      </div>

      {/* Quick Action Hub */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          onClick={() => onNavigate("transcribe")}
          className="panel group text-left p-4 hover:border-cyan-500/50 transition-all flex items-start gap-3.5"
        >
          <div className="h-10 w-10 shrink-0 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Icon name="wave" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-neutral-200 group-hover:text-cyan-400 transition-colors">
              New Transcription
            </h3>
            <p className="text-[0.72rem] text-neutral-400 mt-0.5">
              Drop audio/video files for instant VAD analysis and Whisper speech recognition.
            </p>
          </div>
        </button>

        <button
          onClick={() => onNavigate("batch")}
          className="panel group text-left p-4 hover:border-blue-500/50 transition-all flex items-start gap-3.5"
        >
          <div className="h-10 w-10 shrink-0 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Icon name="folder" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-neutral-200 group-hover:text-blue-400 transition-colors">
              Batch Queue
            </h3>
            <p className="text-[0.72rem] text-neutral-400 mt-0.5">
              Enqueue multiple videos, podcast episodes, or folders for sequential processing.
            </p>
          </div>
        </button>

        <button
          onClick={() => onNavigate("tools")}
          className="panel group text-left p-4 hover:border-violet-500/50 transition-all flex items-start gap-3.5"
        >
          <div className="h-10 w-10 shrink-0 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Icon name="tools" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-neutral-200 group-hover:text-violet-400 transition-colors">
              Subtitle Utilities
            </h3>
            <p className="text-[0.72rem] text-neutral-400 mt-0.5">
              Convert, synchronize, merge, split, validate, and extract audio with FFmpeg.
            </p>
          </div>
        </button>

        <button
          onClick={() => onNavigate("models")}
          className="panel group text-left p-4 hover:border-emerald-500/50 transition-all flex items-start gap-3.5"
        >
          <div className="h-10 w-10 shrink-0 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Icon name="cpu" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-neutral-200 group-hover:text-emerald-400 transition-colors">
              Model Manager
            </h3>
            <p className="text-[0.72rem] text-neutral-400 mt-0.5">
              Inspect Faster-Whisper models, download weights, and monitor VRAM allocation.
            </p>
          </div>
        </button>
      </div>

      {/* Recent Projects Table */}
      <div className="panel p-5 space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle icon="history">Recent Subtitle Projects</SectionTitle>
          <Btn size="sm" icon="library" onClick={() => onNavigate("library")}>
            View All in Library ({projects.length})
          </Btn>
        </div>

        {recentProjects.length === 0 ? (
          <div className="p-8 text-center panel-inset space-y-2">
            <p className="font-semibold text-neutral-300 text-sm">No subtitle projects yet</p>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Start by transcribing a video or audio file. Your project history will appear here.
            </p>
            <div className="pt-2">
              <Btn size="sm" variant="primary" icon="plus" onClick={() => onNavigate("transcribe")}>
                Start First Project
              </Btn>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 font-semibold">
                  <th className="pb-2.5">Project Name</th>
                  <th className="pb-2.5">Status</th>
                  <th className="pb-2.5">Language</th>
                  <th className="pb-2.5">Duration</th>
                  <th className="pb-2.5">Model</th>
                  <th className="pb-2.5">Created</th>
                  <th className="pb-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {recentProjects.map((p) => (
                  <tr key={p.id} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="py-3 font-semibold text-neutral-200 max-w-[240px] truncate">
                      {p.name}
                    </td>
                    <td className="py-3">
                      <Badge
                        tone={
                          p.status === "completed"
                            ? "ok"
                            : p.status === "processing"
                            ? "accent"
                            : p.status === "failed"
                            ? "err"
                            : "neutral"
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-neutral-300">
                      <span>{langFlag(p.sourceLang)} {langName(p.sourceLang)}</span>
                      {p.targetLang !== "original" && (
                        <span className="text-neutral-500"> → {langFlag(p.targetLang)} {langName(p.targetLang)}</span>
                      )}
                    </td>
                    <td className="py-3 font-mono text-neutral-400">
                      {fmtClock(p.durationSec)}
                    </td>
                    <td className="py-3 font-mono text-neutral-400">
                      {p.asrModel}
                    </td>
                    <td className="py-3 text-neutral-500">
                      {fmtDate(p.createdAt)}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Btn
                          size="sm"
                          icon="scissors"
                          onClick={() => onOpenProject(p.id)}
                        >
                          Editor
                        </Btn>
                        <button
                          className="p-1 rounded text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 transition-colors"
                          title="Delete project"
                          onClick={() => onDeleteProject(p.id)}
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
