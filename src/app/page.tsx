"use client";

import { useCallback, useEffect, useState } from "react";
import type { BenchmarkRow, HardwareInfo, Project, StudioSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { deleteProject, fetchHardware, fetchProjects } from "@/lib/client";
import { Preset } from "@/lib/presets";
import Home from "@/components/Home";
import Processing from "@/components/Processing";
import Editor from "@/components/Editor";
import SettingsModal, { Prefs } from "@/components/SettingsModal";
import TutorialModal from "@/components/TutorialModal";
import TranslationView from "@/components/TranslationView";
import ModelManagerView from "@/components/ModelManagerView";
import BatchQueueView from "@/components/BatchQueueView";
import DashboardView from "@/components/DashboardView";
import MediaLibraryView from "@/components/MediaLibraryView";
import ToolsUtilitiesView from "@/components/ToolsUtilitiesView";
import ProcessingHistoryView from "@/components/ProcessingHistoryView";
import AboutView from "@/components/AboutView";
import AudioDiagnosticsModal from "@/components/AudioDiagnosticsModal";
import { Btn } from "@/components/ui";
import { Icon, IconName } from "@/components/icons";

export type View =
  | "dashboard"
  | "home"
  | "library"
  | "editor"
  | "batch"
  | "translate"
  | "models"
  | "tools"
  | "history"
  | "about"
  | "process";

interface Toast {
  id: number;
  tone: "ok" | "err" | "warn" | "info";
  text: string;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function loadArr<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

const toneColor: Record<Toast["tone"], string> = {
  ok: "var(--ok)",
  err: "var(--err)",
  warn: "var(--warn)",
  info: "var(--teal)",
};
const toneIcon = { ok: "check", err: "x", warn: "alert", info: "chevron-right" } as const;

export default function Page() {
  const [view, setViewInternal] = useState<View>("dashboard");
  const [navHistory, setNavHistory] = useState<View[]>(["dashboard"]);
  const [navIndex, setNavIndex] = useState<number>(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [settings, setSettingsState] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [prefs, setPrefsState] = useState<Prefs>({ theme: "dark", fs: "md", contrast: false });
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [benchmarks, setBenchmarksState] = useState<BenchmarkRow[]>([]);
  const [customPresets, setCustomPresetsState] = useState<Preset[]>([]);

  /* Navigation History handlers */
  const navigateTo = useCallback((newView: View | string) => {
    const resolvedView: View = newView === "transcribe" ? "home" : (newView as View);
    setViewInternal(resolvedView);
    setNavHistory((prev) => {
      const next = prev.slice(0, navIndex + 1);
      next.push(resolvedView);
      return next;
    });
    setNavIndex((prev) => prev + 1);
  }, [navIndex]);

  const navigateBack = useCallback(() => {
    if (navIndex > 0) {
      const prevIdx = navIndex - 1;
      setNavIndex(prevIdx);
      setViewInternal(navHistory[prevIdx]);
    }
  }, [navIndex, navHistory]);

  const navigateForward = useCallback(() => {
    if (navIndex < navHistory.length - 1) {
      const nextIdx = navIndex + 1;
      setNavIndex(nextIdx);
      setViewInternal(navHistory[nextIdx]);
    }
  }, [navIndex, navHistory]);

  /* Hydrate localStorage values on client */
  useEffect(() => {
    const s = load("ass:settings", DEFAULT_SETTINGS);
    const p = load<Prefs>("ass:prefs", { theme: "dark", fs: "md", contrast: false });
    const b = loadArr<BenchmarkRow>("ass:bench", []);
    const cp = loadArr<Preset>("ass:presets", []);
    const side = localStorage.getItem("ass:sidebar_collapsed") === "true";
    const t = setTimeout(() => {
      setSettingsState(s);
      setPrefsState(p);
      setBenchmarksState(b);
      setCustomPresetsState(cp);
      setSidebarCollapsed(side);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  /* Persist + apply prefs */
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = prefs.theme;
    el.dataset.fs = prefs.fs;
    if (prefs.contrast) el.setAttribute("data-contrast", "high");
    else el.removeAttribute("data-contrast");
    save("ass:prefs", prefs);
  }, [prefs]);

  const toggleTheme = () => {
    setPrefsState((p) => ({ ...p, theme: p.theme === "dark" ? "light" : "dark" }));
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("ass:sidebar_collapsed", String(next));
      return next;
    });
  };

  const setSettings = useCallback((patch: Partial<StudioSettings>) => {
    setSettingsState((s) => {
      const n = { ...s, ...patch };
      save("ass:settings", n);
      return n;
    });
  }, []);

  const setBenchmarks = useCallback((rows: BenchmarkRow[]) => {
    setBenchmarksState(rows);
    save("ass:bench", rows);
  }, []);

  const setCustomPresets = useCallback((p: Preset[]) => {
    setCustomPresetsState(p);
    save("ass:presets", p);
  }, []);

  const toast = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }].slice(-4));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setProjects(await fetchProjects());
    } catch {
      /* server not ready yet */
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchProjects()
      .then((data) => {
        if (mounted) setProjects(data);
      })
      .catch(() => undefined);
    fetchHardware()
      .then((data) => {
        if (mounted) setHw(data);
      })
      .catch(() => {
        if (mounted) setHw(null);
      });
    const iv = setInterval(() => void fetchHardware().then(setHw).catch(() => undefined), 30000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  // Shortcut: Ctrl+O opens the file dialog (when in home view)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o" && view === "home") {
        e.preventDefault();
        window.dispatchEvent(new Event("ass:openfile"));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [view]);

  const startProject = useCallback(
    (id: string) => {
      const p = projects.find((x) => x.id === id);
      if (!p) {
        void refresh().then(() => {
          const p2 = projects.find((x) => x.id === id);
          if (p2) {
            setActive(p2);
            navigateTo("process");
          }
        });
        return;
      }
      setActive(p);
      navigateTo("process");
    },
    [projects, refresh, navigateTo],
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      try {
        await deleteProject(id);
        setProjects((prev) => prev.filter((p) => p.id !== id));
        if (active?.id === id) setActive(null);
        toast("ok", "Project deleted successfully");
      } catch (err: any) {
        toast("err", err.message || "Failed to delete project");
      }
    },
    [active, toast],
  );

  const openInEditor = useCallback(
    (id: string) => {
      const p = projects.find((x) => x.id === id);
      if (p) {
        setActive(p);
        navigateTo("editor");
      } else {
        toast("err", "Project not found");
      }
    },
    [projects, navigateTo, toast],
  );

  /* View metadata for top header */
  const viewTitles: Record<View, { title: string; subtitle: string; icon: IconName }> = {
    dashboard: { title: "Dashboard", subtitle: "Project metrics & system overview", icon: "dashboard" },
    home: { title: "New Transcription", subtitle: "Audio extraction & speech recognition", icon: "wave" },
    library: { title: "Media Library", subtitle: "Saved projects & subtitles", icon: "library" },
    editor: { title: "Subtitle Editor", subtitle: "Synchronized playback & timing adjustment", icon: "scissors" },
    batch: { title: "Batch Queue", subtitle: "Sequential background transcription", icon: "folder" },
    translate: { title: "Translation Studio", subtitle: "Offline OPUS-MT neural machine translation", icon: "spark" },
    models: { title: "Model Manager", subtitle: "Faster-Whisper catalog & VRAM tuning", icon: "cpu" },
    tools: { title: "Tools & Utilities", subtitle: "Converter, synchronizer, merger, & splitter", icon: "tools" },
    history: { title: "Processing History", subtitle: "Execution timelines & live server logs", icon: "history" },
    about: { title: "About & Hardware Specs", subtitle: "System architecture, GPU, & credits", icon: "about" },
    process: { title: "Active Pipeline", subtitle: "Real-time speech-to-text processing", icon: "zap" },
  };

  const navSections = [
    {
      label: "WORKSPACE",
      items: [
        { id: "dashboard" as View, label: "Dashboard", icon: "dashboard" as IconName },
        { id: "home" as View, label: "Transcribe", icon: "wave" as IconName },
        { id: "library" as View, label: "Media Library", icon: "library" as IconName, badge: projects.length },
        { id: "editor" as View, label: "Subtitle Editor", icon: "scissors" as IconName },
      ],
    },
    {
      label: "AI PIPELINE",
      items: [
        { id: "batch" as View, label: "Batch Queue", icon: "folder" as IconName },
        { id: "translate" as View, label: "Translation", icon: "spark" as IconName },
        { id: "models" as View, label: "Models & VRAM", icon: "cpu" as IconName },
      ],
    },
    {
      label: "UTILITIES",
      items: [
        { id: "tools" as View, label: "Subtitle Tools", icon: "tools" as IconName },
        { id: "history" as View, label: "History & Logs", icon: "history" as IconName },
      ],
    },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      {/* Collapsible Left Sidebar */}
      <aside
        className={`flex flex-col border-r transition-all duration-200 select-none shrink-0 z-30 ${
          sidebarCollapsed ? "w-16" : "w-64"
        }`}
        style={{
          background: "color-mix(in srgb, var(--panel) 92%, black)",
          borderColor: "var(--line)",
        }}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b px-3.5" style={{ borderColor: "var(--line)" }}>
          <button
            className="flex items-center gap-2.5 overflow-hidden text-left focus:outline-none"
            onClick={() => {
              navigateTo("dashboard");
              void refresh();
            }}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 shadow-md"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              <Icon name="logo" size={18} />
            </span>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="font-display text-[0.875rem] font-bold tracking-tight truncate leading-tight">
                  AI Subtitle Studio
                </div>
                <div className="text-[0.65rem] text-cyan-400 font-mono tracking-wider">
                  DESKTOP PRO
                </div>
              </div>
            )}
          </button>

          <button
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="p-1 rounded text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <Icon name={sidebarCollapsed ? "arrow-right" : "arrow-left"} size={14} />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {navSections.map((sec) => (
            <div key={sec.label} className="space-y-1">
              {!sidebarCollapsed && (
                <div className="px-2.5 py-1 text-[0.65rem] font-bold text-neutral-400 tracking-wider">
                  {sec.label}
                </div>
              )}
              {sec.items.map((item) => {
                const isActive = view === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === "editor" && !active && projects.length > 0) {
                        setActive(projects[0]);
                      }
                      navigateTo(item.id);
                    }}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-semibold transition-all ${
                      isActive
                        ? "bg-cyan-500/15 text-cyan-300 shadow-sm border border-cyan-500/30"
                        : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40"
                    } ${sidebarCollapsed ? "justify-center" : ""}`}
                  >
                    <Icon
                      name={item.icon}
                      size={16}
                      className={isActive ? "text-cyan-400" : "text-neutral-400"}
                    />
                    {!sidebarCollapsed && (
                      <span className="flex-1 text-left truncate">{item.label}</span>
                    )}
                    {!sidebarCollapsed && item.badge !== undefined && item.badge > 0 && (
                      <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[0.65rem] font-mono font-bold text-neutral-300">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Bottom Sidebar: System & Specs */}
        <div className="border-t p-2 space-y-1" style={{ borderColor: "var(--line)" }}>
          <button
            onClick={() => setSettingsOpen(true)}
            title={sidebarCollapsed ? "Settings" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-semibold text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40 transition-colors ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
          >
            <Icon name="gear" size={16} />
            {!sidebarCollapsed && <span>Settings</span>}
          </button>

          <button
            onClick={() => setDiagOpen(true)}
            title={sidebarCollapsed ? "Audio Diagnostics" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-semibold text-neutral-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
          >
            <Icon name="shield" size={16} className="text-cyan-400" />
            {!sidebarCollapsed && <span>Audio Diagnostics</span>}
          </button>

          <button
            onClick={() => navigateTo("about")}
            title={sidebarCollapsed ? "About & Specs" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-xs font-semibold ${
              view === "about"
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40"
            } ${sidebarCollapsed ? "justify-center" : ""}`}
          >
            <Icon name="about" size={16} />
            {!sidebarCollapsed && <span>About & Specs</span>}
          </button>

          {!sidebarCollapsed && hw && (
            <div className="mt-2 rounded-md bg-neutral-900/80 p-2 text-[0.65rem] text-neutral-400 border border-neutral-800">
              <div className="flex items-center gap-1.5 font-semibold text-neutral-300 truncate">
                <Icon name="gpu" size={12} className="text-emerald-400 shrink-0" />
                <span className="truncate">{hw.gpuName || "CUDA GPU"}</span>
              </div>
              <div className="flex items-center justify-between text-neutral-400 mt-0.5">
                <span>CUDA Ready</span>
                <span className="font-mono text-cyan-400">fp16</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Desktop Application Bar */}
        <header
          className="flex h-14 items-center justify-between border-b px-4 shrink-0 z-20"
          style={{
            background: "color-mix(in srgb, var(--bg) 92%, transparent)",
            backdropFilter: "blur(12px)",
            borderColor: "var(--line)",
          }}
        >
          {/* History Nav & Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                disabled={navIndex <= 0}
                onClick={navigateBack}
                title="Go back"
                className="p-1.5 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Icon name="arrow-left" size={15} />
              </button>
              <button
                disabled={navIndex >= navHistory.length - 1}
                onClick={navigateForward}
                title="Go forward"
                className="p-1.5 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Icon name="arrow-right" size={15} />
              </button>
            </div>

            <div className="h-4 w-px bg-neutral-800 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-cyan-400">
                <Icon name={viewTitles[view]?.icon || "wave"} size={16} />
              </span>
              <div>
                <h2 className="font-display text-sm font-bold tracking-tight text-neutral-200 leading-none">
                  {viewTitles[view]?.title || "AI Subtitle Studio"}
                </h2>
                <span className="text-[0.65rem] text-neutral-400 hidden md:inline">
                  {viewTitles[view]?.subtitle}
                </span>
              </div>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            <span
              onClick={() => setDiagOpen(true)}
              className="chip cursor-pointer hover:border-emerald-500/50 transition-colors hidden lg:inline-flex"
              style={{ background: "rgba(16, 185, 129, 0.12)", color: "var(--ok)", borderColor: "transparent" }}
              title="Click to run 9-step audio processing diagnostics"
            >
              <Icon name="shield" size={11} />
              NVIDIA RTX 3050 · CUDA Active
            </span>

            <Btn size="sm" icon="shield" onClick={() => setDiagOpen(true)}>
              Audio Check
            </Btn>

            <Btn size="sm" icon="film" onClick={() => setTutorialOpen(true)}>
              Guide
            </Btn>

            <button
              onClick={toggleTheme}
              title={`Switch to ${prefs.theme === "dark" ? "light" : "dark"} mode`}
              className="p-2 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700 transition-colors"
            >
              <Icon name={prefs.theme === "dark" ? "sun" : "moon"} size={15} />
            </button>

            <button
              onClick={() => setSettingsOpen(true)}
              title="Settings"
              className="p-2 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700 transition-colors"
            >
              <Icon name="gear" size={15} />
            </button>
          </div>
        </header>

        {/* View Container with Scrolling */}
        <main className="flex-1 overflow-y-auto">
          {view === "dashboard" && (
            <DashboardView
              projects={projects}
              hardware={hw}
              onNavigate={(v) => navigateTo(v as View)}
              onOpenProject={openInEditor}
              onDeleteProject={handleDeleteProject}
              onToast={toast}
            />
          )}

          {view === "home" && (
            <Home
              projects={projects}
              settings={settings}
              setSettings={setSettings}
              hardware={hw}
              benchmarks={benchmarks}
              setBenchmarks={setBenchmarks}
              customPresets={customPresets}
              setCustomPresets={setCustomPresets}
              onStart={startProject}
              onEdit={openInEditor}
              onToast={toast}
              onRefresh={refresh}
            />
          )}

          {view === "library" && (
            <MediaLibraryView
              projects={projects}
              onOpenProject={openInEditor}
              onDeleteProject={handleDeleteProject}
              onNewTranscription={() => navigateTo("home")}
              onToast={toast}
            />
          )}

          {view === "process" && active && (
            <Processing
              key={`${active.id}-${active.status === "completed" ? "done" : "run"}`}
              project={active}
              onProject={setActive}
              onDone={() => navigateTo("editor")}
              onExit={() => {
                navigateTo("library");
                void refresh();
              }}
              onToast={toast}
            />
          )}

          {view === "editor" && (
            active ? (
              <Editor
                key={active.id}
                project={active}
                settings={settings}
                onBack={() => {
                  navigateTo("library");
                  void refresh();
                }}
                onProject={setActive}
                onToast={toast}
              />
            ) : projects.length > 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400">
                  <Icon name="scissors" size={24} />
                </div>
                <h3 className="font-semibold text-sm text-neutral-200">No project selected in editor</h3>
                <p className="text-xs text-neutral-400 max-w-sm">
                  Select a project from your media library to view and edit its synchronized subtitles.
                </p>
                <Btn size="sm" variant="primary" onClick={() => navigateTo("library")}>
                  Open Media Library
                </Btn>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400">
                  <Icon name="wave" size={24} />
                </div>
                <h3 className="font-semibold text-sm text-neutral-200">No projects yet</h3>
                <p className="text-xs text-neutral-400 max-w-sm">
                  Transcribe your first video or audio file to open the interactive subtitle editor.
                </p>
                <Btn size="sm" variant="primary" icon="plus" onClick={() => navigateTo("home")}>
                  New Transcription
                </Btn>
              </div>
            )
          )}

          {view === "batch" && (
            <BatchQueueView onToast={toast} onNavigate={(v) => navigateTo(v as View)} />
          )}

          {view === "translate" && (
            <TranslationView
              onToast={toast}
              onBack={() => {
                navigateTo("dashboard");
                void refresh();
              }}
            />
          )}

          {view === "models" && (
            <ModelManagerView onToast={toast} />
          )}

          {view === "tools" && (
            <ToolsUtilitiesView onToast={toast} />
          )}

          {view === "history" && (
            <ProcessingHistoryView
              projects={projects}
              onOpenProject={openInEditor}
              onToast={toast}
            />
          )}

          {view === "about" && (
            <AboutView
              hardware={hw}
              onOpenDiagnostics={() => setDiagOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        setPrefs={setPrefsState}
        settings={settings}
        setSettings={setSettings}
        onToast={toast}
      />

      <TutorialModal
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <AudioDiagnosticsModal
        open={diagOpen}
        onClose={() => setDiagOpen(false)}
      />

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="panel slide-in pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 text-[0.8rem] font-semibold shadow-lg"
            style={{ borderLeft: `3px solid ${toneColor[t.tone]}` }}
          >
            <Icon name={toneIcon[t.tone]} size={14} className="mt-0.5 shrink-0" style={{ color: toneColor[t.tone] }} />
            <span className="leading-snug">{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
