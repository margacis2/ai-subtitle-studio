"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ASR_MODELS,
  BenchmarkRow,
  HardwareInfo,
  Project,
  SOURCE_LANGS,
  StudioSettings,
  TARGET_LANGS,
  TRANSLATION_MODELS,
  langFlag,
  langName,
  modelById,
} from "@/lib/types";
import { fmtBytes, fmtClock } from "@/lib/time";
import { recommend, vramWarning, checkHardwareCompatibility } from "@/lib/modelManager";
import { BUILTIN_PRESETS, Preset } from "@/lib/presets";
import { sleep, simulatedWorkMs, transcribeChunk } from "@/lib/demo";
import { probeDuration, uploadProject, deleteProject, patchProject, unloadModels } from "@/lib/client";
import { HardwarePanel } from "./HardwarePanel";
import { HardwareWarningBanner } from "./HardwareWarningBanner";
import { Badge, Btn, Field, Kbd, Progress, SectionTitle, Select, Toggle } from "./ui";
import { Icon } from "./icons";

const MEDIA_RE = /\.(mp4|mkv|mov|avi|webm|m4v|mpg|mpeg|ts|wmv|mp3|wav|flac|m4a|ogg|aac|opus|wma)$/i;

const CHUNK_OPTS = [
  { value: "120", label: "2 minutes" },
  { value: "300", label: "5 minutes" },
  { value: "600", label: "10 minutes" },
  { value: "900", label: "15 minutes" },
  { value: "1800", label: "30 minutes" },
  { value: "custom", label: "Custom…" },
];

function statusChip(p: Project) {
  switch (p.status) {
    case "processing":
      return <Badge tone="accent" icon="clock" pulse>{`Processing ${p.progress}%`}</Badge>;
    case "completed":
      return <Badge tone="ok" icon="check">Completed</Badge>;
    case "paused":
      return <Badge tone="warn" icon="clock">Paused</Badge>;
    case "cancelled":
      return <Badge tone="neutral" icon="x">Cancelled</Badge>;
    case "failed":
      return <Badge tone="err" icon="alert">Failed</Badge>;
    default:
      return <Badge tone="neutral" icon="clock">Queued</Badge>;
  }
}

export default function Home({
  projects,
  settings,
  setSettings,
  hardware,
  benchmarks,
  setBenchmarks,
  customPresets,
  setCustomPresets,
  onStart,
  onEdit,
  onToast,
  onRefresh,
}: {
  projects: Project[];
  settings: StudioSettings;
  setSettings: (patch: Partial<StudioSettings>) => void;
  hardware: HardwareInfo | null;
  benchmarks: BenchmarkRow[];
  setBenchmarks: (rows: BenchmarkRow[]) => void;
  customPresets: Preset[];
  setCustomPresets: (p: Preset[]) => void;
  onStart: (id: string) => void;
  onEdit: (id: string) => void;
  onToast: (tone: "ok" | "err" | "warn" | "info", text: string) => void;
  onRefresh: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [benchRunning, setBenchRunning] = useState<null | string>(null);
  const [presetName, setPresetName] = useState("");
  const [savePreset, setSavePreset] = useState(false);

  useEffect(() => {
    const h = () => fileRef.current?.click();
    window.addEventListener("ass:openfile", h);
    return () => window.removeEventListener("ass:openfile", h);
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      setBusy(true);
      const created: Project[] = [];
      for (const file of arr) {
        if (!MEDIA_RE.test(file.name)) {
          onToast("err", `Unsupported file type: ${file.name}`);
          continue;
        }
        onToast("info", `Reading ${file.name}…`);
        const dur = await probeDuration(file);
        if (!dur) onToast("warn", `Could not read duration of ${file.name} — assuming 2 minutes.`);
        try {
          const p = await uploadProject(file, { durationSec: dur || 120 }, settings);
          created.push(p);
        } catch (e) {
          onToast("err", `Upload failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      setBusy(false);
      if (created.length > 0) {
        onToast("ok", `${created.length} file${created.length > 1 ? "s" : ""} added to the queue`);
        onRefresh(); // <--- ADD THIS LINE to instantly show uploads
      }
    },
    [settings, onToast, onRefresh], // <--- Add onRefresh to dependencies
  );

  const rec = recommend(hardware, settings.mode, 0);
  const vr = settings.asrModel !== "auto" ? vramWarning(settings.asrModel, hardware) : { warn: null, suggested: null };
  const chunkSec = settings.chunkSizeSec === 0 ? settings.chunkCustomSec : settings.chunkSizeSec;

  const applyPreset = (p: Preset) => {
    setSettings(p.settings);
    onToast("info", `Preset “${p.name}” applied`);
  };

  const runBenchmark = async () => {
    const rows: BenchmarkRow[] = [];
    const targetModels = ["tiny", "base", "small"];
    setBenchRunning("Initializing benchmark...");
    try {
      for (const mId of targetModels) {
        const mMeta = ASR_MODELS.find((x) => x.id === mId) || { name: mId, accuracy: "High", vramGb: 1.6 };
        setBenchRunning(mMeta.name);
        const res = await fetch("/api/benchmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model_id: mId }),
        });
        if (res.ok) {
          const data = await res.json();
          const speedFactor = parseFloat((data.audio_duration_sec / Math.max(0.01, data.transcribe_time_sec)).toFixed(1));
          rows.push({
            model: `${mMeta.name} (${data.device === "cuda" ? "CUDA" : "CPU"})`,
            speed: speedFactor,
            accuracy: mMeta.accuracy,
            vram: data.peak_vram_mb > 0 ? `${(data.peak_vram_mb / 1024).toFixed(1)} GB` : `${mMeta.vramGb} GB`,
            wallSec: data.transcribe_time_sec,
          });
        }
      }
      if (rows.length > 0) {
        setBenchmarks(rows);
        onToast("ok", "Hardware benchmark finished — real RTF and inference speeds measured");
      } else {
        onToast("warn", "Benchmark completed with no results");
      }
    } catch (e: any) {
      onToast("err", e.message || "Benchmark run failed");
    } finally {
      setBenchRunning(null);
    }
  };

  const start = (id: string) => onStart(id);

  const allPresets = [...BUILTIN_PRESETS, ...customPresets];

  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        {/* dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(e.dataTransfer.files); }}
          className="panel flex flex-col items-center gap-3 px-6 py-10 text-center transition-colors"
          style={{ borderColor: drag ? "var(--accent)" : "var(--line)", background: drag ? "var(--accent-soft)" : "var(--bg2)" }}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            <Icon name="upload" size={26} />
          </span>
          <div>
            <div className="font-display text-[1.15rem] font-bold">Drop video or audio here</div>
            <div className="mt-1 text-[0.8rem]" style={{ color: "var(--muted)" }}>
              MP4 · MKV · MOV · WEBM · MP3 · WAV · FLAC — up to 400 MB each
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Btn variant="primary" icon="folder" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? "Reading file…" : "Select files"}
            </Btn>
            <Kbd>Ctrl + O</Kbd>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[0.72rem]" style={{ color: "var(--ok)" }}>
            <Icon name="shield" size={13} />
            Local processing — media never leaves this machine
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,audio/*,.mkv,.ts,.m4a,.opus"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* job settings */}
        <div className="panel p-4">
          <SectionTitle
            icon="gear"
            right={
              <Badge tone="teal" icon="zap">
                {rec.modelName} · {rec.device.toUpperCase()}
              </Badge>
            }
          >
            Job settings
          </SectionTitle>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="Source language">
              <Select
                value={settings.sourceLang}
                onChange={(v) => setSettings({ sourceLang: v })}
                options={SOURCE_LANGS.map((l) => ({ value: l.code, label: `${l.flag} ${l.name}` }))}
              />
            </Field>
            <Field label="Subtitle language">
              <Select
                value={settings.targetLang}
                onChange={(v) => setSettings({ targetLang: v })}
                options={TARGET_LANGS.map((l) => ({ value: l.code, label: l.code === "original" ? "Original (no translation)" : `${l.flag} ${l.name}` }))}
              />
            </Field>
            <Field label="ASR model">
              <Select
                value={settings.asrModel}
                onChange={(v) => setSettings({ asrModel: v })}
                options={[
                  { value: "auto", label: `Auto / Recommended` },
                  ...ASR_MODELS.map((m) => ({ value: m.id, label: m.name })),
                ]}
              />
            </Field>
            <Field label="Translation model" hint="Multilingual 200+ or language-pair">
              <Select
                value={settings.translationModel || "nllb"}
                onChange={(v) => setSettings({ translationModel: v })}
                options={TRANSLATION_MODELS.map((m) => ({
                  value: m.id,
                  label: `${m.name}${m.recommended ? " ★" : ""}`,
                }))}
              />
            </Field>
            <Field label="Processing mode">
              <Select
                value={settings.mode}
                onChange={(v) => setSettings({ mode: v as StudioSettings["mode"] })}
                options={[
                  { value: "fast", label: "Fast" },
                  { value: "balanced", label: "Balanced" },
                  { value: "high", label: "High Accuracy" },
                  { value: "custom", label: "Custom (all options below)" },
                ]}
              />
            </Field>
            <Field label="Device">
              <Select
                value={settings.device}
                onChange={(v) => setSettings({ device: v })}
                options={[
                  { value: "auto", label: "Auto" },
                  { value: "cuda", label: "CUDA GPU" },
                  { value: "cpu", label: "CPU" },
                ]}
              />
            </Field>
            <Field label="Chunk size">
              <div className="flex gap-2">
                <Select
                  value={String(settings.chunkSizeSec === 0 ? "custom" : settings.chunkSizeSec)}
                  onChange={(v) => setSettings(v === "custom" ? { chunkSizeSec: 0 } : { chunkSizeSec: Number(v) })}
                  options={CHUNK_OPTS}
                />
                {settings.chunkSizeSec === 0 && (
                  <input
                    type="number"
                    className="input !w-20"
                    min={60}
                    max={7200}
                    step={30}
                    value={settings.chunkCustomSec}
                    onChange={(e) => setSettings({ chunkCustomSec: Number(e.target.value) || 420 })}
                    aria-label="Custom chunk seconds"
                  />
                )}
              </div>
            </Field>
            <Field label="Overlap" hint="prevents words at boundaries being lost">
              <Select
                value={String(settings.overlapSec)}
                onChange={(v) => setSettings({ overlapSec: Number(v) })}
                options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} s` }))}
              />
            </Field>
            <Field label="Workers" hint="0 = auto from VRAM / cores">
              <Select
                value={String(settings.workers)}
                onChange={(v) => setSettings({ workers: Number(v) })}
                options={[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: n === 0 ? "Auto" : String(n) }))}
              />
            </Field>
            <div className="md:col-span-2">
              <details className="panel-inset px-3 py-2">
                <summary className="cursor-pointer text-[0.78rem] font-bold" style={{ color: "var(--muted)" }}>
                  Advanced — VAD, diarization, profanity, limits
                </summary>
                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Field label="Compute type">
                    <Select
                      value={settings.computeType}
                      onChange={(v) => setSettings({ computeType: v })}
                      options={["auto", "float16", "int8_float16", "int8", "float32"].map((c) => ({
                        value: c,
                        label: c === "auto" ? "Auto" : c,
                      }))}
                    />
                  </Field>
                  <Field label="Profanity">
                    <Select
                      value={settings.profanityMode}
                      onChange={(v) => setSettings({ profanityMode: v as StudioSettings["profanityMode"] })}
                      options={[
                        { value: "preserve", label: "Preserve exactly" },
                        { value: "censor", label: "Censor (****)" },
                        { value: "mild", label: "Replace with milder language" },
                      ]}
                    />
                  </Field>
                  <Toggle checked={settings.vadEnabled} onChange={(v) => setSettings({ vadEnabled: v })} label="Voice activity detection" hint="keeps music under dialogue; tuned for movie mode" />
                  <Toggle checked={settings.diarization} onChange={(v) => setSettings({ diarization: v })} label="Detect speakers" hint="labels Speaker 1 / Speaker 2 — rename later in the editor" />
                  <Toggle checked={settings.nonSpeechEvents} onChange={(v) => setSettings({ nonSpeechEvents: v })} label="Include non-speech events" hint="[music] [laughter] [applause] when confident" />
                  <Toggle checked={settings.autoPunctuate} onChange={(v) => setSettings({ autoPunctuate: v })} label="Auto punctuation" hint="capitalization + sentence ends, no meaning changes" />
                  <Toggle
                    checked={settings.pauseBeforeTranslate ?? true}
                    onChange={(v) => setSettings({ pauseBeforeTranslate: v })}
                    label="Interactive translation prompt"
                    hint="Pause after transcription to select translation model and target language"
                  />
                  <Toggle
                    checked={settings.unloadAsrBeforeTranslate ?? true}
                    onChange={(v) => setSettings({ unloadAsrBeforeTranslate: v })}
                    label="Unload ASR before translation"
                    hint="Release Whisper from GPU memory to provide full VRAM for translation model"
                  />
                  <Field label={`Max subtitle duration: ${settings.maxDurationSec}s`}>
                    <input type="range" min={4} max={12} step={1} value={settings.maxDurationSec} className="w-full"
                      onChange={(e) => setSettings({ maxDurationSec: Number(e.target.value) })} />
                  </Field>
                  <Field label={`Reading speed limit: ${settings.cpsLimit} CPS`}>
                    <input type="range" min={12} max={24} step={1} value={settings.cpsLimit} className="w-full"
                      onChange={(e) => setSettings({ cpsLimit: Number(e.target.value) })} />
                  </Field>
                </div>
              </details>
            </div>
          </div>

          {/* recommendation */}
          <div className="panel-inset mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-2.5">
            <span className="flex items-center gap-1.5 text-[0.78rem] font-bold" style={{ color: "var(--accent)" }}>
              <Icon name="spark" size={14} />
              Recommended
            </span>
            <span className="text-[0.78rem]" style={{ color: "var(--muted)" }}>
              {rec.modelName} · {rec.device.toUpperCase()}
              {rec.computeType !== "auto" ? ` · ${rec.computeType}` : ""} · {rec.gpuWorkers > 0 ? `${rec.gpuWorkers} GPU` : `${rec.cpuWorkers} CPU`} worker{rec.gpuWorkers === 0 && rec.cpuWorkers > 1 ? "s" : ""}
            </span>
            <span className="text-[0.72rem]" style={{ color: "var(--faint)" }}>{rec.reason}</span>
          </div>
          {/* Real-time Hardware Compatibility Check */}
          {settings.asrModel !== "auto" && hardware && (
            <div className="mt-3">
              <HardwareWarningBanner
                compat={checkHardwareCompatibility(settings.asrModel, hardware)}
                onSwitchModel={(id) => setSettings({ asrModel: id })}
              />
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Btn variant="primary" size="lg" icon="zap" onClick={() => {
              const first = projects.find((p) => p.status === "pending" || p.status === "ready" || p.status === "paused");
              if (!first) onToast("warn", "Add a file to the queue first.");
              else start(first.id);
            }}>
              Generate
            </Btn>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {allPresets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  title={p.desc}
                  className="chip cursor-pointer transition-colors hover:brightness-125"
                >
                  {p.name}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <button className="chip cursor-pointer hover:brightness-125" onClick={() => setSavePreset((v) => !v)}>+ Save current</button>
                {savePreset && (
                  <>
                    <input
                      className="input !w-28 !py-1 text-[0.72rem]"
                      placeholder="Preset name"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                    />
                    <Btn size="sm" icon="check" onClick={() => {
                      if (!presetName.trim()) return;
                      const p: Preset = { id: `custom-${Date.now()}`, name: presetName.trim(), desc: "Custom preset", settings: { ...settings }, custom: true };
                      setCustomPresets([...customPresets, p]);
                      setPresetName("");
                      setSavePreset(false);
                      onToast("ok", `Preset “${p.name}” saved`);
                    }} />
                    {customPresets.length > 0 && (
                      <Btn size="sm" icon="trash" onClick={() => setCustomPresets([])} title="Remove custom presets" />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* batch queue */}
        <div className="panel p-4">
          <SectionTitle icon="layers" right={<span className="text-[0.72rem]" style={{ color: "var(--faint)" }}>{projects.length} project{projects.length === 1 ? "" : "s"} · checkpointed in database</span>}>
            Batch queue
          </SectionTitle>
          {projects.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center" style={{ color: "var(--faint)" }}>
              <Icon name="film" size={28} />
              <div className="text-[0.85rem] font-semibold" style={{ color: "var(--muted)" }}>No media yet</div>
              <div className="max-w-sm text-[0.75rem]">
                Add one or more files. Each project is chunked (with overlap), processed by a resource-aware worker pool,
                and checkpointed per chunk — you can close the tab and resume any time.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <div key={p.id} className="panel-inset flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                  <Icon name={p.mimeType.startsWith("audio") ? "music" : "film"} size={18} style={{ color: "var(--muted)" }} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[0.85rem] font-bold">{p.name}</span>
                      {statusChip(p)}
                      {p.qualityScore != null && <Badge tone={p.qualityScore >= 85 ? "ok" : "warn"}>{`Quality ${p.qualityScore}/100`}</Badge>}
                    </div>
                    <div className="mono mt-0.5 text-[0.68rem]" style={{ color: "var(--faint)" }}>
                      {fmtClock(p.durationSec)} · {fmtBytes(p.sizeBytes)} · {p.totalChunks} chunks × {fmtClock(p.chunkSizeSec)} · {langFlag(p.sourceLang === "auto" ? (p.completedChunks ? "" : "") : p.sourceLang) }{langName(p.sourceLang)} → {langName(p.targetLang)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[0.72rem]">
                      <span className="text-neutral-400">ASR Model:</span>
                      {p.status !== "processing" ? (
                        <select
                          className="bg-neutral-900 border border-neutral-700 text-teal-300 rounded px-2 py-0.5 text-[0.72rem] font-mono focus:outline-none focus:border-teal-500"
                          value={p.asrModel || "small"}
                          onChange={async (e) => {
                            const newModel = e.target.value;
                            try {
                              await patchProject(p.id, { asrModel: newModel });
                              onToast("ok", `Updated ${p.name} ASR model to ${modelById(newModel).name}`);
                              onRefresh();
                            } catch (err: any) {
                              onToast("err", `Failed updating model: ${err.message}`);
                            }
                          }}
                          title="Change ASR transcription model for this project"
                        >
                          <option value="auto">Auto ({rec.modelName})</option>
                          {ASR_MODELS.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} (~{m.vramGb} GB VRAM)
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge tone="teal">{modelById(p.asrModel).name}</Badge>
                      )}
                      {p.asrTimeSec != null && (
                        <span className="text-neutral-400">
                          · ASR: <span className="font-mono text-neutral-200">{p.asrTimeSec.toFixed(1)}s</span>
                        </span>
                      )}
                      {p.translationTimeSec != null && (
                        <span className="text-neutral-400">
                          · Translation: <span className="font-mono text-neutral-200">{p.translationTimeSec.toFixed(1)}s</span>
                        </span>
                      )}
                    </div>
                    {p.status === "processing" && (
                      <div className="mt-1.5 max-w-xs">
                        <Progress value={p.progress} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {p.status === "pending" || p.status === "ready" ? (
                      <Btn size="sm" variant="primary" icon="play" onClick={() => start(p.id)}>Generate</Btn>
                    ) : null}
                    {p.status === "processing" && (
                      <Btn size="sm" variant="primary" icon="eye" onClick={() => start(p.id)}>View</Btn>
                    )}
                    {p.status === "paused" && <Btn size="sm" variant="primary" icon="play" onClick={() => start(p.id)}>Resume</Btn>}
                    {p.status === "cancelled" && <Btn size="sm" variant="primary" icon="refresh" onClick={() => start(p.id)}>Resume</Btn>}
                    {p.status === "completed" && <Btn size="sm" variant="primary" icon="gear" onClick={() => onEdit(p.id)}>Edit</Btn>}
                    {p.status === "completed" && <Btn size="sm" icon="refresh" title="Re-run (skips completed chunks)" onClick={() => start(p.id)} />}
                    {p.status !== "processing" ? (
                      confirmDel === p.id ? (
                        <>
                          <Btn size="sm" icon="trash" onClick={async () => {
                            try { 
                              await deleteProject(p.id); 
                              onToast("ok", `Deleted ${p.name}`); 
                              onRefresh(); // <--- ADD THIS LINE to instantly hide deleted files
                            } catch (e) { 
                              onToast("err", String(e)); 
                            }
                            setConfirmDel(null);
                          }}>Confirm</Btn>
                          <Btn size="sm" onClick={() => setConfirmDel(null)}>No</Btn>
                        </>
                      ) : (
                        <Btn size="sm" icon="trash" onClick={() => setConfirmDel(p.id)} title="Delete project" />
                      )
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* right rail */}
      <div className="space-y-4">
        <div className="panel p-4">
          <SectionTitle icon="cpu" right={<Kbd>live</Kbd>}>Hardware</SectionTitle>
          <HardwarePanel hw={hardware} />
        </div>

        <div className="panel p-4">
          <SectionTitle icon="gauge" right={
            <Btn size="sm" icon="zap" onClick={() => void runBenchmark()} disabled={!!benchRunning}>
              {benchRunning ? "Running…" : "Benchmark models"}
            </Btn>
          }>
            Model benchmark
          </SectionTitle>
          {benchRunning ? (
            <div className="panel-inset px-3 py-3 text-[0.78rem]" style={{ color: "var(--muted)" }}>
              <span className="pulse">●</span> Testing {benchRunning} on a 120 s sample…
            </div>
          ) : benchmarks.length === 0 ? (
            <p className="text-[0.75rem] leading-relaxed" style={{ color: "var(--faint)" }}>
              Runs every ASR model against a 120-second sample and measures speed on this server.
              Accuracy labels are empirical, benchmark-relative — not absolute quality claims.
            </p>
          ) : (
            <table className="w-full text-left text-[0.74rem]">
              <thead>
                <tr className="lbl">
                  <th className="pb-1.5 font-bold">Model</th>
                  <th className="pb-1.5 font-bold">Speed</th>
                  <th className="pb-1.5 font-bold">Accuracy*</th>
                  <th className="pb-1.5 text-right font-bold">VRAM</th>
                </tr>
              </thead>
              <tbody className="mono">
                {benchmarks.map((b) => (
                  <tr key={b.model} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="py-1.5 font-sans font-semibold" style={{ color: "var(--text)" }}>{b.model}</td>
                    <td className="py-1.5" style={{ color: "var(--teal)" }}>{b.speed}×</td>
                    <td className="py-1.5 font-sans" style={{ color: "var(--muted)" }}>{b.accuracy}</td>
                    <td className="py-1.5 text-right" style={{ color: "var(--muted)" }}>{b.vram}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-[0.65rem] leading-snug" style={{ color: "var(--faint)" }}>
            * Measured wall time of the offline engine on this server. Speed is relative (120 s audio ÷ wall time).
          </p>
        </div>

        <div className="panel p-4">
          <SectionTitle icon="shield">Privacy</SectionTitle>
          <div className="flex flex-col gap-2 text-[0.78rem] leading-relaxed" style={{ color: "var(--muted)" }}>
            <span className="flex items-center gap-2 font-bold" style={{ color: "var(--ok)" }}>
              <Icon name="shield" size={15} /> 100% local processing
            </span>
            <span>
              Media, transcripts and subtitles stay on this machine. The offline engine ships with a deterministic
              sample corpus (EN / JA / TA / HI, including code-switched lines) so every pipeline stage — VAD, chunking,
              overlap dedupe, translation, glossary, quality checks — runs end-to-end without external services.
            </span>
            <span className="text-[0.7rem]" style={{ color: "var(--faint)" }}>
              Cloud ASR adapters (OpenAI / Google / Azure) plug into the same engine interface and are disabled in this
              build until a provider key + FFmpeg extraction are configured.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
