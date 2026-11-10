"use client";

import { useCallback, useEffect, useState } from "react";
import type { BenchmarkRow, HardwareInfo, Project, StudioSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { fetchHardware, fetchProjects } from "@/lib/client";
import { Preset } from "@/lib/presets";
import Home from "@/components/Home";
import Processing from "@/components/Processing";
import Editor from "@/components/Editor";
import SettingsModal, { Prefs } from "@/components/SettingsModal";
import TutorialModal from "@/components/TutorialModal";
import TranslationView from "@/components/TranslationView";
import ModelManagerView from "@/components/ModelManagerView";
import BatchQueueView from "@/components/BatchQueueView";
import { Btn } from "@/components/ui";
import { Icon } from "@/components/icons";

type View = "home" | "process" | "editor" | "translate" | "models" | "batch";
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
  const [view, setView] = useState<View>("home");
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [settings, setSettingsState] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [prefs, setPrefsState] = useState<Prefs>({ theme: "dark", fs: "md", contrast: false });
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [benchmarks, setBenchmarksState] = useState<BenchmarkRow[]>([]);
  const [customPresets, setCustomPresetsState] = useState<Preset[]>([]);

  /* hydrate localStorage values on client */
  useEffect(() => {
    const s = load("ass:settings", DEFAULT_SETTINGS);
    const p = load<Prefs>("ass:prefs", { theme: "dark", fs: "md", contrast: false });
    const b = loadArr<BenchmarkRow>("ass:bench", []);
    const cp = loadArr<Preset>("ass:presets", []);
    const t = setTimeout(() => {
      setSettingsState(s);
      setPrefsState(p);
      setBenchmarksState(b);
      setCustomPresetsState(cp);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  /* persist + apply prefs */
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = prefs.theme;
    el.dataset.fs = prefs.fs;
    if (prefs.contrast) el.setAttribute("data-contrast", "high");
    else el.removeAttribute("data-contrast");
    save("ass:prefs", prefs);
  }, [prefs]);

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
    let active = true;
    fetchProjects()
      .then((data) => {
        if (active) setProjects(data);
      })
      .catch(() => undefined);
    fetchHardware()
      .then((data) => {
        if (active) setHw(data);
      })
      .catch(() => {
        if (active) setHw(null);
      });
    const iv = setInterval(() => void fetchHardware().then(setHw).catch(() => undefined), 30000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, []);

  // shortcut: Ctrl+O opens the file dialog (home view)
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
            setView("process");
          }
        });
        return;
      }
      setActive(p);
      setView("process");
    },
    [projects, refresh],
  );

  return (
    <div className="min-h-screen">
      {/* header */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", backdropFilter: "blur(10px)", borderColor: "var(--line)" }}
      >
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-2.5">
          <button
            className="flex items-center gap-2.5"
            onClick={() => {
              setView("home");
              void refresh();
            }}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              <Icon name="logo" size={19} />
            </span>
            <span className="font-display text-[1rem] font-bold tracking-tight">
              AI Subtitle Studio
            </span>
          </button>
          <span className="chip hidden sm:inline-flex" style={{ background: "var(--ok-soft)", color: "var(--ok)", borderColor: "transparent" }}>
            <Icon name="shield" size={11} />
            Local processing
          </span>
          <span className="chip hidden md:inline-flex" style={{ background: "var(--teal-soft)", color: "var(--teal)", borderColor: "transparent" }}>
            <Icon name="wave" size={11} />
            Offline engine · EN/JA/TA/HI corpus
          </span>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Btn
              size="sm"
              icon="wave"
              variant={view === "home" || view === "process" ? "primary" : undefined}
              onClick={() => {
                setView("home");
                void refresh();
              }}
            >
              Transcribe
            </Btn>
            <Btn
              size="sm"
              icon="scissors"
              variant={view === "editor" ? "primary" : undefined}
              onClick={() => {
                if (active) {
                  setView("editor");
                } else if (projects.length > 0) {
                  setActive(projects[0]);
                  setView("editor");
                } else {
                  toast("info", "Create or open a project first to use the Subtitle Editor");
                  setView("home");
                }
              }}
            >
              Editor
            </Btn>
            <Btn
              size="sm"
              icon="folder"
              variant={view === "batch" ? "primary" : undefined}
              onClick={() => setView("batch")}
            >
              Batch Queue
            </Btn>
            <Btn
              size="sm"
              icon="cpu"
              variant={view === "models" ? "primary" : undefined}
              onClick={() => setView("models")}
            >
              Models
            </Btn>
            <Btn
              size="sm"
              icon="spark"
              variant={view === "translate" ? "primary" : undefined}
              onClick={() => setView((v) => (v === "translate" ? "home" : "translate"))}
            >
              Translate
            </Btn>
            <Btn
              size="sm"
              icon="film"
              variant={tutorialOpen ? "primary" : undefined}
              onClick={() => setTutorialOpen(true)}
            >
              Guide
            </Btn>
            {hw && (
              <span className="chip hidden xl:inline-flex">
                <Icon name="gpu" size={11} />
                {hw.gpuName ? `${hw.gpuName} · CUDA` : "CPU only"}
              </span>
            )}
            <Btn size="sm" icon="gear" onClick={() => setSettingsOpen(true)}>Settings</Btn>
          </div>
        </div>
      </header>

      {/* views */}
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
          onEdit={(id) => {
            const p = projects.find((x) => x.id === id);
            if (p) setActive(p);
            setView("editor");
          }}
          onToast={toast}
          onRefresh={refresh} // <--- ADD THIS LINE
        />
      )}
      {view === "process" && active && (
        <Processing
          key={`${active.id}-${active.status === "completed" ? "done" : "run"}`}
          project={active}
          onProject={setActive}
          onDone={() => setView("editor")}
          onExit={() => {
            setView("home");
            void refresh();
          }}
          onToast={toast}
        />
      )}
      {view === "batch" && (
        <BatchQueueView onToast={toast} />
      )}
      {view === "models" && (
        <ModelManagerView onToast={toast} />
      )}
      {view === "translate" && (
        <TranslationView
          onToast={toast}
          onBack={() => {
            setView("home");
            void refresh();
          }}
        />
      )}
      {view === "editor" && active && (
        <Editor
          key={active.id}
          project={active}
          settings={settings}
          onBack={() => {
            setView("home");
            void refresh();
          }}
          onProject={setActive}
          onToast={toast}
        />
      )}

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

      {/* toasts */}
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
