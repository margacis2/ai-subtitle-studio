"use client";

import { useMemo, useState } from "react";
import type { Project } from "@/lib/types";
import { fmtClock, fmtDate } from "@/lib/time";
import { langFlag, langName } from "@/lib/types";
import { Btn, SectionTitle } from "./ui";
import { Icon } from "./icons";

export default function MediaLibraryView({
  projects,
  onOpenProject,
  onDeleteProject,
  onNewTranscription,
  onToast,
}: {
  projects: Project[];
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onNewTranscription: () => void;
  onToast: (tone: "ok" | "err" | "warn" | "info", text: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name" | "duration">("newest");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = projects.filter((p) => {
      const matchSearch =
        !search.trim() ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.fileName.toLowerCase().includes(search.toLowerCase()) ||
        p.sourceLang.toLowerCase().includes(search.toLowerCase()) ||
        p.targetLang.toLowerCase().includes(search.toLowerCase());

      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "completed" && p.status === "completed") ||
        (statusFilter === "processing" && (p.status === "processing" || p.status === "ready")) ||
        (statusFilter === "failed" && p.status === "failed");

      return matchSearch && matchStatus;
    });

    list.sort((a, b) => {
      if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "duration") return (b.durationSec || 0) - (a.durationSec || 0);
      return 0;
    });

    return list;
  }, [projects, search, statusFilter, sortBy]);

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "—";
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${mb.toFixed(1)} MB`;
  };

  const handleExportQuick = async (e: React.MouseEvent, p: Project, format: "srt" | "vtt" | "txt") => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/projects/${p.id}/export?format=${format}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${p.name.replace(/\.[^/.]+$/, "")}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      onToast("ok", `Exported ${format.toUpperCase()} successfully`);
    } catch (err: any) {
      onToast("err", err.message || "Failed to export");
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4" style={{ borderColor: "var(--line)" }}>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold tracking-tight">Media Library</h1>
            <span className="chip" style={{ background: "var(--panel)", color: "var(--cyan)" }}>
              {projects.length} project{projects.length !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Manage your local transcription projects, access generated subtitles, and export to production formats.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="primary" icon="plus" size="sm" onClick={onNewTranscription}>
            New Transcription
          </Btn>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="panel p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-md">
          <div className="relative w-full">
            <span className="absolute left-3 top-2.5 text-neutral-400 pointer-events-none">
              <Icon name="search" size={14} />
            </span>
            <input
              type="text"
              placeholder="Search by title, filename, or language…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md bg-neutral-900 border border-neutral-700/60 focus:border-cyan-500 focus:outline-none text-neutral-200 placeholder-neutral-500"
            />
          </div>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-xs text-neutral-400 hover:text-neutral-200 px-1"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Status Tabs */}
          <div className="flex items-center rounded-md bg-neutral-900 p-0.5 border border-neutral-700/60">
            {(["all", "completed", "processing", "failed"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-xs capitalize transition-colors ${
                  statusFilter === st
                    ? "bg-cyan-500/20 text-cyan-300 font-semibold"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-neutral-900 border border-neutral-700/60 text-neutral-300 px-2.5 py-1.5 rounded-md text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name">Name (A-Z)</option>
            <option value="duration">Duration (Longest)</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-md bg-neutral-900 p-0.5 border border-neutral-700/60">
            <button
              onClick={() => setViewMode("grid")}
              title="Grid View"
              className={`p-1 rounded ${viewMode === "grid" ? "bg-neutral-800 text-cyan-400" : "text-neutral-400 hover:text-neutral-200"}`}
            >
              <Icon name="dashboard" size={14} />
            </button>
            <button
              onClick={() => setViewMode("table")}
              title="List View"
              className={`p-1 rounded ${viewMode === "table" ? "bg-neutral-800 text-cyan-400" : "text-neutral-400 hover:text-neutral-200"}`}
            >
              <Icon name="menu" size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Projects Listing */}
      {filtered.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center p-12 text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400">
            <Icon name="library" size={24} />
          </div>
          <h3 className="font-semibold text-sm text-neutral-200">
            {search || statusFilter !== "all" ? "No matching projects found" : "Your media library is empty"}
          </h3>
          <p className="text-xs text-neutral-400 max-w-sm">
            {search || statusFilter !== "all"
              ? "Try adjusting your search terms or filter selection to view existing projects."
              : "Import an audio or video file to start genuine local AI speech recognition."}
          </p>
          {(search || statusFilter !== "all") ? (
            <Btn size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
              Reset Filters
            </Btn>
          ) : (
            <Btn size="sm" variant="primary" icon="plus" onClick={onNewTranscription}>
              Create First Transcription
            </Btn>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const isCompleted = p.status === "completed";
            const isProcessing = p.status === "processing" || p.status === "ready";
            const isFailed = p.status === "failed";

            return (
              <div
                key={p.id}
                onClick={() => onOpenProject(p.id)}
                className="panel group cursor-pointer hover:border-cyan-500/50 transition-all p-4 flex flex-col justify-between space-y-4 hover:shadow-lg relative overflow-hidden"
              >
                {/* Accent top stripe */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1 ${
                    isCompleted
                      ? "bg-emerald-500"
                      : isProcessing
                      ? "bg-amber-500"
                      : isFailed
                      ? "bg-rose-500"
                      : "bg-cyan-500"
                  }`}
                />

                <div className="space-y-2 pt-1">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: isCompleted ? "rgba(16, 185, 129, 0.12)" : "rgba(6, 182, 212, 0.12)",
                        color: isCompleted ? "var(--ok)" : "var(--cyan)",
                      }}
                    >
                      <Icon name={p.mimeType?.startsWith("audio") ? "music" : "film"} size={16} />
                    </span>

                    <span
                      className={`chip text-[0.65rem] font-semibold uppercase tracking-wider ${
                        isCompleted
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                          : isProcessing
                          ? "border-amber-500/40 text-amber-300 bg-amber-500/10 pulse"
                          : isFailed
                          ? "border-rose-500/40 text-rose-400 bg-rose-500/10"
                          : "border-neutral-700 text-neutral-400"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm text-neutral-100 group-hover:text-cyan-300 transition-colors line-clamp-1">
                      {p.name}
                    </h3>
                    <p className="text-[0.7rem] text-neutral-400 truncate mt-0.5">
                      {p.fileName}
                    </p>
                  </div>
                </div>

                {/* Metadata tags */}
                <div className="grid grid-cols-2 gap-2 text-[0.75rem] py-2 border-y border-neutral-800/80">
                  <div className="flex items-center gap-1.5 text-neutral-300">
                    <Icon name="clock" size={13} className="text-neutral-500" />
                    <span>{fmtClock(p.durationSec || 0)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-neutral-300">
                    <Icon name="globe" size={13} className="text-neutral-500" />
                    <span>
                      {langFlag(p.sourceLang)} {langName(p.sourceLang)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-neutral-300">
                    <Icon name="cpu" size={13} className="text-neutral-500" />
                    <span className="capitalize">{p.asrModel || "auto"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-neutral-300">
                    <Icon name="hard-drive" size={13} className="text-neutral-500" />
                    <span>{formatBytes(p.sizeBytes)}</span>
                  </div>
                </div>

                {/* Footer and Actions */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[0.7rem] text-neutral-500">
                    {fmtDate(p.createdAt)}
                  </span>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {isCompleted && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleExportQuick(e, p, "srt")}
                          title="Export SRT"
                          className="px-2 py-1 text-[0.7rem] font-mono rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                        >
                          SRT
                        </button>
                        <button
                          onClick={(e) => handleExportQuick(e, p, "vtt")}
                          title="Export VTT"
                          className="px-2 py-1 text-[0.7rem] font-mono rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                        >
                          VTT
                        </button>
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(p.id);
                      }}
                      title="Delete project"
                      className="p-1.5 rounded text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table Mode */
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/60 text-neutral-400 font-semibold">
                  <th className="py-2.5 px-4">Name</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Language</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3">Created</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => onOpenProject(p.id)}
                    className="hover:bg-neutral-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-neutral-200">
                      <div className="flex items-center gap-2">
                        <Icon name={p.mimeType?.startsWith("audio") ? "music" : "film"} size={14} className="text-cyan-400" />
                        <span className="truncate max-w-xs">{p.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`chip text-[0.65rem] capitalize ${
                          p.status === "completed"
                            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                            : p.status === "processing"
                            ? "text-amber-300 bg-amber-500/10 border-amber-500/30"
                            : p.status === "failed"
                            ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
                            : "text-neutral-400"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-neutral-300 font-mono">{fmtClock(p.durationSec || 0)}</td>
                    <td className="py-3 px-3 text-neutral-300">
                      {langFlag(p.sourceLang)} {p.sourceLang.toUpperCase()}
                    </td>
                    <td className="py-3 px-3 text-neutral-400 capitalize">{p.asrModel}</td>
                    <td className="py-3 px-3 text-neutral-400">{formatBytes(p.sizeBytes)}</td>
                    <td className="py-3 px-3 text-neutral-500">{fmtDate(p.createdAt)}</td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Btn size="sm" onClick={() => onOpenProject(p.id)}>Open</Btn>
                        <button
                          onClick={() => setDeleteConfirmId(p.id)}
                          className="p-1.5 text-neutral-500 hover:text-rose-400 transition-colors"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="panel max-w-md w-full p-6 space-y-4 shadow-2xl border-rose-500/40">
            <div className="flex items-center gap-3 text-rose-400">
              <span className="p-2 rounded-full bg-rose-500/10">
                <Icon name="trash" size={20} />
              </span>
              <h3 className="font-display text-lg font-bold">Delete Project?</h3>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Are you sure you want to delete this project and its subtitles from your local database? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Btn size="sm" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </Btn>
              <Btn
                size="sm"
                variant="danger"
                onClick={() => {
                  onDeleteProject(deleteConfirmId);
                  setDeleteConfirmId(null);
                  onToast("ok", "Project deleted");
                }}
              >
                Delete Project
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
