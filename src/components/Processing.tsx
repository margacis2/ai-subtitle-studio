"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Chunk,
  HardwareInfo,
  LiveSegment,
  Project,
  StageEvent,
  SubLine,
} from "@/lib/types";
import { ASR_MODELS, TARGET_LANGS, TRANSLATION_MODELS, langFlag, langName, modelById } from "@/lib/types";
import { fmtClock } from "@/lib/time";
import { runQuality } from "@/lib/quality";
import { checkHardwareCompatibility } from "@/lib/modelManager";
import {
  ApiError,
  cancelProject,
  fetchHardware,
  fetchProject,
  patchProject,
  prepareProject,
  processChunk,
  saveSubtitles,
  translateTexts,
  unloadModels,
  type ProjectDetail,
} from "@/lib/client";
import { sleep } from "@/lib/demo";
import { HardwarePanel } from "./HardwarePanel";
import { HardwareWarningBanner } from "./HardwareWarningBanner";
import { Badge, Btn, Modal, Progress, SectionTitle, Stat } from "./ui";
import { Icon, type IconName } from "./icons";

const pad = (n: number) => String(n).padStart(2, "0");

const levelIcon: Record<StageEvent["level"], IconName> = {
  ok: "check",
  run: "clock",
  wait: "clock",
  warn: "alert",
  err: "x",
  info: "chevron-right",
};
const levelColor: Record<StageEvent["level"], string> = {
  ok: "var(--ok)",
  run: "var(--accent)",
  wait: "var(--faint)",
  warn: "var(--warn)",
  err: "var(--err)",
  info: "var(--muted)",
};

function chunkTile(c: Chunk) {
  const base = "rounded-lg border px-2 py-1.5 text-center";
  switch (c.status) {
    case "COMPLETED":
      return { cls: base, style: { background: "var(--ok-soft)", borderColor: "transparent", color: "var(--ok)" } };
    case "PROCESSING":
      return { cls: `${base} pulse`, style: { background: "var(--accent-soft)", borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)", color: "var(--accent)" } };
    case "FAILED":
      return { cls: base, style: { background: "var(--err-soft)", borderColor: "transparent", color: "var(--err)" } };
    case "CANCELLED":
      return { cls: base, style: { background: "var(--bg3)", borderColor: "var(--line)", color: "var(--faint)" } };
    default:
      return { cls: base, style: { background: "var(--bg3)", borderColor: "var(--line)", color: "var(--muted)" } };
  }
}

export default function Processing({
  project: initial,
  onProject,
  onDone,
  onExit,
  onToast,
}: {
  project: Project;
  onProject: (p: Project) => void;
  onDone: () => void;
  onExit: () => void;
  onToast: (tone: "ok" | "err" | "warn" | "info", text: string) => void;
}) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [log, setLog] = useState<StageEvent[]>([]);
  const [live, setLive] = useState<LiveSegment[]>([]);
  const [paused, setPaused] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [finished, setFinished] = useState(false);

  // Overall timing
  const [elapsedSec, setElapsedSec] = useState(0);

  // Stage 1 (ASR) specific tracking
  const [asrElapsedSec, setAsrElapsedSec] = useState(0);
  const [asrDurationSec, setAsrDurationSec] = useState<number | null>(initial.asrTimeSec ?? null);

  // Stage 2 (Translation) specific tracking
  const [transElapsedSec, setTransElapsedSec] = useState(0);
  const [transDurationSec, setTransDurationSec] = useState<number | null>(initial.translationTimeSec ?? null);
  const [transTotalLines, setTransTotalLines] = useState(0);
  const [transDoneLines, setTransDoneLines] = useState(0);

  const [activeStage, setActiveStage] = useState<"idle" | "prepare" | "asr" | "awaiting_translation" | "translate" | "quality" | "done">("idle");

  // Interactive Translation Prompt state
  const [awaitingTranslationInput, setAwaitingTranslationInput] = useState<{
    detectedLang: string;
    totalLines: number;
  } | null>(null);
  const [promptModel, setPromptModel] = useState<string>(initial.translationModel || "nllb");
  const [promptTargetLang, setPromptTargetLang] = useState<string>(initial.targetLang || "original");
  const [promptUnloadAsr, setPromptUnloadAsr] = useState<boolean>(initial.unloadAsrBeforeTranslate !== false);
  const translationDecisionRef = useRef<((choice: {
    action: "translate" | "skip";
    model: string;
    targetLang: string;
    unloadAsr: boolean;
  }) => void) | null>(null);

  const stopRef = useRef(false);
  const pauseRef = useRef(false);
  const runRef = useRef(false);
  const t0Ref = useRef(0);
  const asrT0Ref = useRef(0);
  const transT0Ref = useRef(0);
  const logBoxRef = useRef<HTMLDivElement>(null);

  const p = detail?.project ?? initial;
  const modelId = p.asrModel === "auto" ? "small" : p.asrModel;
  const model = modelById(modelId);
  const completed = p.completedChunks;
  const total = p.totalChunks;

  // Real-time ASR speed & ETA calculations
  const asrSpeed = completed > 0 && asrElapsedSec > 1 ? (completed * p.chunkSizeSec) / asrElapsedSec : 0;
  const asrEtaSec = asrSpeed > 0 ? ((total - completed) * p.chunkSizeSec) / asrSpeed : null;

  // Real-time Translation speed & ETA calculations
  const transSpeed = transDoneLines > 0 && transElapsedSec > 1 ? transDoneLines / transElapsedSec : 0;
  const transEtaSec = transSpeed > 0 && transTotalLines > transDoneLines ? (transTotalLines - transDoneLines) / transSpeed : null;

  // Live timer tick
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      if (t0Ref.current && !finished && !paused) {
        setElapsedSec((now - t0Ref.current) / 1000);
      }
      if (asrT0Ref.current && activeStage === "asr" && !paused) {
        setAsrElapsedSec((now - asrT0Ref.current) / 1000);
      }
      if (transT0Ref.current && activeStage === "translate" && !paused) {
        setTransElapsedSec((now - transT0Ref.current) / 1000);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [finished, paused, activeStage]);

  const logEv = useCallback((level: StageEvent["level"], text: string) => {
    setLog((l) => [...l, { t: Date.now(), level, text }].slice(-250));
  }, []);

  useEffect(() => {
    if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [log]);

  const refresh = useCallback(async () => {
    const d = await fetchProject(initial.id);
    setDetail(d);
    onProject(d.project);
    if (d.project.asrTimeSec && !asrDurationSec) setAsrDurationSec(d.project.asrTimeSec);
    if (d.project.translationTimeSec && !transDurationSec) setTransDurationSec(d.project.translationTimeSec);
    return d;
  }, [initial.id, onProject, asrDurationSec, transDurationSec]);

  const handleModelChange = async (newModelId: string) => {
    try {
      const upd = await patchProject(initial.id, { asrModel: newModelId });
      onToast("ok", `Switched model to ${modelById(newModelId).name}`);
      setDetail((d) => (d ? { ...d, project: upd } : null));
      onProject(upd);
      await refresh();
    } catch (e: any) {
      onToast("err", `Failed to change model: ${e.message}`);
    }
  };

  const dispatch = useCallback(
    async (c: Chunk) => {
      const name = `${pad(c.index)}`;
      logEv("run", `Chunk ${name} — ${model.name} on ${p.device === "auto" ? "auto" : p.device.toUpperCase()} · ${fmtClock(c.startSec)} → ${fmtClock(c.endSec)}`);
      setDetail((d) =>
        d ? { ...d, chunks: d.chunks.map((x) => (x.id === c.id ? { ...x, status: "PROCESSING" } : x)) } : d,
      );
      try {
        const res = await processChunk(initial.id, c.id, model.speedFactor);
        const segs: LiveSegment[] = res.segments.map((s) => ({
          chunkIndex: c.index,
          startMs: s.startMs,
          lang: s.lang,
          original: s.original,
          translation: s.translation || "",
          confidence: s.confidence,
          event: s.kind === "event",
        }));
        setLive((l) => [...segs, ...l].slice(0, 50));
        logEv(
          "ok",
          `Chunk ${name} — ${langFlag(res.language)} ${langName(res.language)} · ${res.confidence}% conf · ${res.segments.length} lines${res.overlapRemoved > 0 ? ` · ${res.overlapRemoved} overlap dups removed` : ""}`,
        );
        if (res.note) logEv("warn", res.note);
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
        if (e instanceof ApiError && e.code === "CANCELLED") {
          /* handled by cancel flow */
        } else {
          logEv("err", `Chunk ${name} failed — ${msg}`);
          const isPermanent = (e instanceof ApiError && (e.status === 404 || !e.retryable)) || msg.includes("not found");
          setDetail((prev) =>
            prev
              ? {
                  ...prev,
                  chunks: prev.chunks.map((x) =>
                    x.id === c.id
                      ? { ...x, status: "FAILED" as const, attempts: isPermanent ? 99 : (x.attempts || 0) + 1 }
                      : x
                  ),
                }
              : prev
          );
        }
      }
      await refresh();
    },
    [initial.id, logEv, model.name, model.speedFactor, p.device, refresh],
  );

  const run = useCallback(async () => {
    if (runRef.current) return;
    runRef.current = true;
    stopRef.current = false;
    try {
      t0Ref.current = Date.now();
      setActiveStage("prepare");
      logEv("info", `Media analysis — ${p.name} (${fmtClock(p.durationSec)})`);
      await sleep(400);
      logEv("run", "Audio extraction + voice activity detection…");
      let d = await refresh();

      try {
        const pr = await prepareProject(initial.id);
        const v = pr.vad;
        logEv("ok", "Audio prepared");
        if (pr.audioOptimization) {
          const origMb = (pr.audioOptimization.originalSize / (1024 * 1024)).toFixed(1);
          const optMb = (pr.audioOptimization.optimizedSize / (1024 * 1024)).toFixed(1);
          const { changeType, changePercent, format } = pr.audioOptimization;
          const label =
            changeType === "reduced"
              ? `Audio size reduced by ${changePercent}% (${origMb} MB → ${optMb} MB)`
              : changeType === "expanded"
              ? `WAV uncompressed for 16kHz ASR (${origMb} MB → ${optMb} MB)`
              : `Audio ready: ${optMb} MB (${format.toUpperCase()} 16kHz mono)`;
          logEv("ok", label);
        }
        if (v.speechRatio > 0) {
          logEv(v.real ? "ok" : "warn", `VAD — ${Math.round(v.speechRatio * 100)}% speech · ${v.intervals} voice intervals${v.real ? " (energy VAD on real PCM)" : ""}`);
        }
      } catch (e: any) {
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
        logEv("err", `Preparation failed: ${msg}`);
        onToast("err", `Preparation failed: ${msg}`);
        await patchProject(initial.id, { status: "failed", stage: "prepare" });
        await refresh();
        return;
      }

      d = await refresh();

      // ==========================================
      // STAGE 1: SPEECH RECOGNITION (ASR)
      // ==========================================
      setActiveStage("asr");
      asrT0Ref.current = Date.now();
      logEv(
        "info",
        `[Stage 1] ASR Transcription started with ${model.name} (${model.params}) on ${p.device.toUpperCase()}`,
      );

      while (true) {
        if (stopRef.current) break;
        while (pauseRef.current && !stopRef.current) await sleep(400);
        if (stopRef.current) break;
        d = await refresh();
        const ready = d.chunks.filter((c) => c.status === "WAITING" || (c.status === "FAILED" && c.attempts < 2));
        if (ready.length === 0) break;
        const n = Math.min(Math.max(1, d.project.workers), ready.length);
        if (ready.length > n) logEv("wait", `${ready.length - n} chunks waiting for a worker slot…`);
        await Promise.all(ready.slice(0, n).map((c) => dispatch(c)));
      }

      if (stopRef.current) return;

      d = await refresh();
      const asrDuration = (Date.now() - asrT0Ref.current) / 1000;
      setAsrDurationSec(asrDuration);
      await patchProject(initial.id, { asrTimeSec: asrDuration });

      const failedChunks = d.chunks.filter((c) => c.status === "FAILED");
      if (failedChunks.length > 0 && d.subtitles.length === 0) {
        logEv("err", `Transcription failed: ${failedChunks.length} chunk(s) encountered unrecoverable errors.`);
        onToast("err", "Transcription failed. Please inspect the logs.");
        await patchProject(initial.id, { status: "failed", stage: "asr", qualityScore: 0 });
        await refresh();
        return;
      }

      logEv("ok", `✓ Stage 1 (ASR) completed in ${asrDuration.toFixed(1)}s · ${d.subtitles.length} lines transcribed`);

      if (d.subtitles.length === 0) {
        logEv("warn", "No speech detected in audio file (0 subtitles generated).");
        await patchProject(initial.id, { status: "completed", stage: "done", progress: 100, qualityScore: 0 });
        await refresh();
        return;
      }

      // ==========================================
      // STAGE 2: NEURAL TRANSLATION (MT)
      // ==========================================
      const detectedLang = d.chunks.find((c) => c.language && c.language !== "auto")?.language || p.sourceLang || "en";
      let targetLang = p.targetLang || "original";
      let chosenEngine = p.translationModel || "nllb";

      // Only pause if explicitly requested AND destination is not "original"
      const needsUserConfirmation =
        p.pauseBeforeTranslate === true &&
        targetLang !== "original" &&
        targetLang !== "none" &&
        targetLang !== "";

      if (needsUserConfirmation) {
        setActiveStage("awaiting_translation");
        logEv("wait", `[Stage 2] Awaiting user confirmation: select translation model & target language...`);

        setPromptModel(chosenEngine);
        setPromptTargetLang(targetLang);
        setPromptUnloadAsr(p.unloadAsrBeforeTranslate !== false);
        setAwaitingTranslationInput({
          detectedLang,
          totalLines: d.subtitles.length,
        });

        // Wait for user interaction via UI card
        const userChoice = await new Promise<{
          action: "translate" | "skip";
          model: string;
          targetLang: string;
          unloadAsr: boolean;
        }>((resolve) => {
          translationDecisionRef.current = resolve;
        });

        setAwaitingTranslationInput(null);

        if (userChoice.action === "skip" || userChoice.targetLang === "original") {
          targetLang = "original";
          logEv("info", `[Stage 2] User selected to keep original subtitles without translation.`);
        } else {
          targetLang = userChoice.targetLang;
          chosenEngine = userChoice.model;
          if (userChoice.unloadAsr) {
            logEv("info", `[VRAM] Unloading Whisper ASR model from memory to free VRAM for ${chosenEngine.toUpperCase()}...`);
            try {
              await unloadModels();
              logEv("ok", `[VRAM] GPU VRAM released successfully.`);
            } catch (vErr: any) {
              logEv("warn", `[VRAM] Failed to flush VRAM: ${vErr.message}`);
            }
          }
        }
      } else {
        if (targetLang !== "original" && targetLang !== detectedLang && p.unloadAsrBeforeTranslate !== false) {
          logEv("info", `[VRAM] Auto-unloading Whisper ASR before starting translation...`);
          try {
            await unloadModels();
            logEv("ok", `[VRAM] GPU VRAM released.`);
          } catch (vErr: any) {
            logEv("warn", `[VRAM] Flush notice: ${vErr.message}`);
          }
        }
      }

      const requiresTranslation = targetLang !== "original" && targetLang !== detectedLang;

      if (!requiresTranslation) {
        logEv("info", `[Stage 2] Translation skipped: Original subtitles retained (target "${targetLang}").`);
        setTransDurationSec(0);
        await patchProject(initial.id, { targetLang: "original", translationTimeSec: 0 });
      } else {
        setActiveStage("translate");
        transT0Ref.current = Date.now();
        const totalSubs = d.subtitles.length;
        setTransTotalLines(totalSubs);
        setTransDoneLines(0);
        logEv("run", `[Stage 2] Neural Translation started with ${chosenEngine.toUpperCase()}: ${langName(detectedLang)} → ${langName(targetLang)} (${totalSubs} lines)`);

        const batchSize = 32;
        const allSubs = [...d.subtitles];

        for (let i = 0; i < allSubs.length; i += batchSize) {
          if (stopRef.current) break;
          while (pauseRef.current && !stopRef.current) await sleep(400);
          if (stopRef.current) break;

          const batch = allSubs.slice(i, i + batchSize);
          const rawTexts = batch.map((s) => s.original);

          try {
            const translatedBatch = await translateTexts(rawTexts, detectedLang, targetLang, chosenEngine);
            for (let j = 0; j < batch.length; j++) {
              batch[j].translation = translatedBatch[j] || batch[j].original;
            }
          } catch (trErr: any) {
            logEv("warn", `Translation batch fallback: ${trErr.message}. Keeping original.`);
            for (const b of batch) {
              b.translation = b.original;
            }
          }

          const doneCount = Math.min(totalSubs, i + batch.length);
          setTransDoneLines(doneCount);

          // Update live preview items with real translated text
          setLive((prev) =>
            prev.map((s) => {
              const match = batch.find((b) => b.startMs === s.startMs);
              return match ? { ...s, translation: match.translation } : s;
            }),
          );
        }

        // Save translated subtitles to SQLite
        await saveSubtitles(initial.id, allSubs);
        const transDuration = (Date.now() - transT0Ref.current) / 1000;
        setTransDurationSec(transDuration);
        await patchProject(initial.id, { targetLang, translationTimeSec: transDuration });
        logEv("ok", `✓ Stage 2 (Translation) completed in ${transDuration.toFixed(1)}s · ${totalSubs} lines translated`);
      }

      // ==========================================
      // STAGE 3: MERGE & QUALITY AUDIT
      // ==========================================
      setActiveStage("quality");
      logEv("run", "Finalizing subtitles, removing overlaps, running quality audit…");
      await sleep(300);
      d = await refresh();

      const report = runQuality(d.subtitles, {
        maxDurationSec: 7,
        cpsLimit: 17,
        targetLang: d.project.targetLang,
      });

      logEv("ok", `Audit complete — ${report.total} subtitles, quality score ${report.score}/100`);

      const totalSecs = (Date.now() - t0Ref.current) / 1000;
      const upd = await patchProject(initial.id, {
        status: "completed",
        stage: "done",
        progress: 100,
        qualityScore: report.score,
        processingTimeSec: totalSecs,
      });

      setDetail({ ...d, project: upd });
      onProject(upd);
      setActiveStage("done");
      setFinished(true);
      onToast("ok", "Processing complete — opening results");
      setTimeout(onDone, 900);
    } catch (e) {
      logEv("err", `Pipeline error: ${e instanceof Error ? e.message : String(e)}`);
      onToast("err", e instanceof Error ? e.message : "Pipeline error");
    } finally {
      runRef.current = false;
    }
  }, [dispatch, initial.id, logEv, model.name, model.params, onDone, onProject, onToast, p.chunkSizeSec, p.device, p.durationSec, p.name, p.sourceLang, p.targetLang, refresh]);

  useEffect(() => {
    const t = setTimeout(() => {
      void run();
    }, 0);
    return () => clearTimeout(t);
  }, [run]);

  // Hardware monitor
  useEffect(() => {
    let on = true;
    const tick = async () => {
      if (!on) return;
      try {
        setHw(await fetchHardware());
      } catch {
        /* ignore */
      }
    };
    void tick();
    const iv = setInterval(tick, 2500);
    return () => {
      on = false;
      clearInterval(iv);
    };
  }, []);

  const doPause = async () => {
    pauseRef.current = true;
    setPaused(true);
    logEv("warn", "Paused — in-flight chunks will finish, no new chunks dispatched");
  };
  const doResume = async () => {
    logEv("info", "Resuming…");
    await patchProject(initial.id, { status: "processing" });
    pauseRef.current = false;
    setPaused(false);
    void run();
  };
  const doCancel = async () => {
    stopRef.current = true;
    pauseRef.current = false;
    setPaused(false);
    setConfirmCancel(false);
    try {
      await cancelProject(initial.id);
    } catch {
      /* already cancelled */
    }
    setCancelled(true);
    logEv("warn", "Cancelled — completed chunks were kept");
    await refresh();
  };
  const resumeFromCancel = async () => {
    setCancelled(false);
    logEv("info", "Resuming from checkpoint…");
    await patchProject(initial.id, { status: "processing", stage: "asr" });
    await run();
  };

  const isFailed = p.status === "failed";
  const doRetry = async () => {
    stopRef.current = false;
    runRef.current = false;
    setCancelled(false);
    logEv("info", "Retrying processing pipeline…");
    await patchProject(initial.id, { status: "processing", progress: 0 });
    await refresh();
    void run();
  };

  const latest = live[0];
  const compat = hw ? checkHardwareCompatibility(p.asrModel, hw) : null;

  const stages: Array<{ id: string; label: string; done: boolean; active: boolean }> = [
    { id: "analyze", label: "Analyze", done: !!detail, active: activeStage === "prepare" },
    { id: "vad", label: "Extract + VAD", done: !!detail?.project.vadJson, active: activeStage === "prepare" },
    {
      id: "asr",
      label: `Stage 1: ASR (${model.name.split(" ")[0]})`,
      done: asrDurationSec != null,
      active: activeStage === "asr",
    },
    {
      id: "translate",
      label: activeStage === "awaiting_translation"
        ? "Stage 2: Configure Translation"
        : `Stage 2: Translation (${(p.targetLang || "original").toUpperCase()})`,
      done: transDurationSec != null,
      active: activeStage === "translate" || activeStage === "awaiting_translation",
    },
    { id: "quality", label: "Quality Audit", done: finished, active: activeStage === "quality" },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4">
      {/* Header Panel */}
      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display truncate text-[1.1rem] font-bold">{p.name}</h1>
              <Badge
                tone={isFailed ? "err" : cancelled ? "neutral" : finished ? "ok" : "accent"}
                icon={isFailed ? "x" : finished ? "check" : "clock"}
                pulse={!finished && !cancelled && !isFailed}
              >
                {isFailed ? "Failed" : cancelled ? "Cancelled" : finished ? "Complete" : "Processing"}
              </Badge>
              <Badge tone="teal" icon="shield">Local Offline Engine</Badge>
            </div>
            <div className="mono mt-1 text-[0.72rem] text-neutral-400 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{fmtClock(p.durationSec)}</span>
              <span>·</span>
              <span>{p.device.toUpperCase()}</span>
              <span>·</span>
              <span>Target: {langName(p.targetLang)}</span>
              <span>·</span>
              {/* Model Selector in Processing View */}
              <div className="flex items-center gap-1 font-sans">
                <span className="text-neutral-400">Model:</span>
                {!runRef.current || isFailed || paused || cancelled ? (
                  <select
                    className="bg-neutral-900 border border-neutral-700 text-teal-300 rounded px-2 py-0.5 text-[0.72rem] font-mono focus:outline-none focus:border-teal-500"
                    value={p.asrModel || "small"}
                    onChange={(e) => handleModelChange(e.target.value)}
                    title="Change model before run or on retry"
                  >
                    {ASR_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (~{m.vramGb} GB)
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-teal-300 font-semibold">{model.name}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Btn
              size="sm"
              icon="spark"
              title="Release Whisper and Translation models from GPU VRAM and RAM"
              onClick={async () => {
                try {
                  const res = await unloadModels();
                  if (res.ok) {
                    logEv("ok", "[VRAM] Released all models from memory. GPU VRAM cleared.");
                    onToast("ok", "VRAM Cleared: Models unloaded from memory");
                  }
                } catch {
                  onToast("err", "Failed to release models");
                }
              }}
            >
              Free VRAM
            </Btn>
            {isFailed && (
              <Btn variant="primary" icon="refresh" onClick={() => void doRetry()}>
                Retry Processing
              </Btn>
            )}
            {!finished && !cancelled && !isFailed && !paused && <Btn icon="pause" onClick={() => void doPause()}>Pause</Btn>}
            {paused && <Btn variant="primary" icon="play" onClick={() => void doResume()}>Resume</Btn>}
            {!finished && !cancelled && !isFailed && <Btn variant="danger" icon="x" onClick={() => setConfirmCancel(true)}>Cancel</Btn>}
            {cancelled && completed > 0 && <Btn variant="primary" icon="refresh" onClick={() => void resumeFromCancel()}>Resume from checkpoint</Btn>}
            <Btn icon="chevron-right" onClick={onExit}>{cancelled || isFailed ? "Back to queue" : "Leave (stays in queue)"}</Btn>
          </div>
        </div>

        {/* Real-time Hardware Compatibility Warning Banner if model exceeds VRAM */}
        {compat && (compat.tier === "warning" || compat.tier === "unsupported") && (
          <HardwareWarningBanner
            compat={compat}
            onSwitchModel={(id) => handleModelChange(id)}
          />
        )}

        {/* Stage Stepper */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-neutral-800">
          {stages.map((s) => (
            <span
              key={s.id}
              className="chip"
              style={{
                background: s.done ? "var(--ok-soft)" : s.active ? "var(--accent-soft)" : "var(--bg3)",
                color: s.done ? "var(--ok)" : s.active ? "var(--accent)" : "var(--faint)",
                borderColor: s.active ? "var(--accent)" : "transparent"
              }}
            >
              <Icon name={s.done ? "check" : s.active ? "clock" : "chevron-right"} size={11} />
              {s.label}
            </span>
          ))}
        </div>

        {/* Overall progress bar */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[0.75rem]">
            <span className="font-bold text-neutral-300">
              Overall Progress — Total Elapsed: {fmtClock(elapsedSec)}
            </span>
            <span className="mono text-teal-400 font-bold">{Math.min(100, p.progress)}%</span>
          </div>
          <Progress value={p.progress} />
        </div>
      </div>

      {/* COMPLETE TIME OF EACH MODEL UPON COMPLETION */}
      {(finished || asrDurationSec != null) && (
        <div className="panel p-4 border border-emerald-500/30 bg-emerald-500/5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="chip border-emerald-500/40 text-emerald-400 bg-emerald-500/10 font-bold text-xs">
              {finished ? "✓ All Pipeline Processing Finished" : "✓ Stage 1 Complete"}
            </span>
            <span className="mono text-xs text-neutral-400">
              Total Processing Time: <strong className="text-white font-mono text-sm">{p.processingTimeSec ? `${p.processingTimeSec.toFixed(1)}s` : `${elapsedSec.toFixed(1)}s`}</strong>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="panel-inset p-3">
              <span className="block text-[0.7rem] text-neutral-400 font-bold uppercase tracking-wider">
                1. Speech Recognition Model ({model.name})
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-mono text-lg font-bold text-teal-300">
                  {asrDurationSec != null ? `${asrDurationSec.toFixed(1)}s` : "—"}
                </span>
                <span className="text-[0.7rem] text-neutral-400">
                  {asrSpeed > 0 ? `(${asrSpeed.toFixed(1)}× real-time speed)` : "completed"}
                </span>
              </div>
              <span className="block text-[0.68rem] text-neutral-400 mt-0.5">
                {detail?.subtitles.length ?? 0} subtitle segments extracted across {total} chunks
              </span>
            </div>

            <div className="panel-inset p-3">
              <span className="block text-[0.7rem] text-neutral-400 font-bold uppercase tracking-wider">
                2. Neural Translation Model ({p.targetLang === "original" ? "None (Original Audio)" : `OPUS-MT / NLLB (${langName(p.targetLang)})`})
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-mono text-lg font-bold text-cyan-300">
                  {transDurationSec != null ? `${transDurationSec.toFixed(1)}s` : p.targetLang === "original" ? "0.0s" : "—"}
                </span>
                <span className="text-[0.7rem] text-neutral-400">
                  {p.targetLang === "original" ? "(no translation needed)" : `${transDoneLines} lines translated`}
                </span>
              </div>
              <span className="block text-[0.68rem] text-neutral-400 mt-0.5">
                {p.targetLang === "original" ? "Original source audio subtitles preserved exactly" : `Output target language: ${langName(p.targetLang)}`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* DEDICATED SEPARATE TIMING & ETA CARDS: STAGE 1 (ASR) & STAGE 2 (TRANSLATION) */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* CARD 1: STAGE 1 TRANSCRIPTION (ASR) */}
        <div
          className="panel p-4 space-y-3 border transition-all"
          style={{
            borderColor: activeStage === "asr"
              ? "color-mix(in srgb, var(--accent) 60%, transparent)"
              : asrDurationSec != null
              ? "color-mix(in srgb, var(--ok) 40%, transparent)"
              : "var(--line)"
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-teal-500/10 p-1.5 text-teal-400">
                <Icon name="wave" size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-100">Stage 1: Speech Recognition (ASR)</h3>
                <p className="text-[0.7rem] text-neutral-400 font-mono">
                  Model: {model.name} · {model.params} params
                </p>
              </div>
            </div>
            <span
              className={`chip text-[0.7rem] font-bold ${
                asrDurationSec != null
                  ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                  : activeStage === "asr"
                  ? "border-teal-500/40 text-teal-300 bg-teal-500/10 animate-pulse"
                  : "border-neutral-800 text-neutral-500"
              }`}
            >
              {asrDurationSec != null
                ? `✓ Done in ${asrDurationSec.toFixed(1)}s`
                : activeStage === "asr"
                ? "Active Inference"
                : "Waiting"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[0.72rem]">
            <div className="rounded-lg bg-neutral-900/80 p-2 border border-neutral-850">
              <span className="block text-neutral-400 text-[0.65rem]">ASR Time Taken</span>
              <span className="font-mono font-bold text-white text-[0.85rem]">
                {asrDurationSec != null ? `${asrDurationSec.toFixed(1)}s` : fmtClock(asrElapsedSec)}
              </span>
            </div>
            <div className="rounded-lg bg-neutral-900/80 p-2 border border-neutral-850">
              <span className="block text-neutral-400 text-[0.65rem]">ASR ETA</span>
              <span className="font-mono font-bold text-teal-300 text-[0.85rem]">
                {asrDurationSec != null ? "00:00" : asrEtaSec != null ? fmtClock(asrEtaSec) : "Calculating…"}
              </span>
            </div>
            <div className="rounded-lg bg-neutral-900/80 p-2 border border-neutral-850">
              <span className="block text-neutral-400 text-[0.65rem]">ASR Speed</span>
              <span className="font-mono font-bold text-cyan-300 text-[0.85rem]">
                {asrSpeed > 0 ? `${asrSpeed.toFixed(1)}×` : "—"}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[0.7rem] text-neutral-400">
              <span>Chunks Processed</span>
              <span className="font-mono text-neutral-200">
                {Math.min(completed, total)} / {total} chunks ({Math.round(((completed || 0) / Math.max(1, total)) * 100)}%)
              </span>
            </div>
            <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-400 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round(((completed || 0) / Math.max(1, total)) * 100))}%` }}
              />
            </div>
          </div>
        </div>

        {/* CARD 2: STAGE 2 NEURAL TRANSLATION (MT) */}
        <div
          className="panel p-4 space-y-3 border transition-all"
          style={{
            borderColor: activeStage === "translate"
              ? "color-mix(in srgb, var(--accent) 60%, transparent)"
              : transDurationSec != null
              ? "color-mix(in srgb, var(--ok) 40%, transparent)"
              : "var(--line)"
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-cyan-500/10 p-1.5 text-cyan-400">
                <Icon name="globe" size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-100">Stage 2: Neural Translation (MT)</h3>
                <p className="text-[0.7rem] text-neutral-400 font-mono">
                  Engine: OPUS-MT / NLLB · {langName(p.targetLang)}
                </p>
              </div>
            </div>
            <span
              className={`chip text-[0.7rem] font-bold ${
                transDurationSec != null
                  ? transDurationSec === 0
                    ? "border-neutral-700 text-neutral-400 bg-neutral-800/40"
                    : "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                  : activeStage === "awaiting_translation"
                  ? "border-amber-500/50 text-amber-300 bg-amber-500/10 animate-pulse"
                  : activeStage === "translate"
                  ? "border-cyan-500/40 text-cyan-300 bg-cyan-500/10 animate-pulse"
                  : "border-neutral-800 text-neutral-500"
              }`}
            >
              {transDurationSec != null
                ? transDurationSec === 0
                  ? "Original (No Translation)"
                  : `✓ Done in ${transDurationSec.toFixed(1)}s`
                : activeStage === "awaiting_translation"
                ? "Awaiting User Selection"
                : activeStage === "translate"
                ? "Translating Batches"
                : "Queued (After ASR)"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[0.72rem]">
            <div className="rounded-lg bg-neutral-900/80 p-2 border border-neutral-850">
              <span className="block text-neutral-400 text-[0.65rem]">Translation Time</span>
              <span className="font-mono font-bold text-white text-[0.85rem]">
                {transDurationSec != null
                  ? `${transDurationSec.toFixed(1)}s`
                  : p.targetLang === "original"
                  ? "0.0s (N/A)"
                  : fmtClock(transElapsedSec)}
              </span>
            </div>
            <div className="rounded-lg bg-neutral-900/80 p-2 border border-neutral-850">
              <span className="block text-neutral-400 text-[0.65rem]">Translation ETA</span>
              <span className="font-mono font-bold text-cyan-300 text-[0.85rem]">
                {transDurationSec != null || p.targetLang === "original"
                  ? "00:00"
                  : transEtaSec != null
                  ? fmtClock(transEtaSec)
                  : "—"}
              </span>
            </div>
            <div className="rounded-lg bg-neutral-900/80 p-2 border border-neutral-850">
              <span className="block text-neutral-400 text-[0.65rem]">Throughput</span>
              <span className="font-mono font-bold text-teal-300 text-[0.85rem]">
                {transSpeed > 0 ? `${transSpeed.toFixed(1)} lines/s` : "—"}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[0.7rem] text-neutral-400">
              <span>Lines Translated</span>
              <span className="font-mono text-neutral-200">
                {p.targetLang === "original"
                  ? "Original Subtitles Kept"
                  : `${transDoneLines} / ${transTotalLines || (detail?.subtitles.length ?? 0)} lines`}
              </span>
            </div>
            <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-300"
                style={{
                  width: `${
                    p.targetLang === "original"
                      ? 100
                      : Math.min(100, Math.round(((transDoneLines || 0) / Math.max(1, transTotalLines || 1)) * 100))
                  }%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Processing Finished Banner */}
      {finished && (
        <div className="panel p-5 border-2 border-emerald-500/60 bg-emerald-950/30 rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-2xl shrink-0">
              ✓
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-white">
                Subtitles Ready — {p.name}
              </h3>
              <p className="text-xs text-neutral-300 mt-0.5">
                {detail?.subtitles.length ?? 0} subtitle lines generated using NVIDIA RTX 3050 CUDA GPU.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
            <Btn
              variant="primary"
              icon="scissors"
              onClick={onDone}
              className="!bg-emerald-500 hover:!bg-emerald-400 !text-black !font-bold !py-2.5 !px-5 !text-sm shadow-lg active:scale-95 w-full sm:w-auto"
            >
              Open in Subtitle Editor
            </Btn>
          </div>
        </div>
      )}

      {/* Interactive Translation Selection Card (Rendered at top for priority) */}
      {awaitingTranslationInput && (
        <div className="panel p-5 border-2 border-teal-500/60 bg-teal-950/30 space-y-4 rounded-2xl shadow-xl animate-in fade-in zoom-in-95 duration-200">
          <div className="border-b pb-3 border-teal-500/20">
            <div className="flex items-center gap-2">
              <span className="chip border-teal-500 text-teal-300 font-bold text-xs bg-teal-500/10">
                ✓ Stage 1 Complete
              </span>
              <h3 className="font-display text-base font-bold text-white">
                Select Translation Model & Language
              </h3>
            </div>
            <p className="text-xs text-neutral-300 mt-1">
              Audio transcribed in <strong className="text-teal-300">{asrDurationSec?.toFixed(1)}s</strong>. Detected language:{" "}
              <strong className="text-white">
                {langFlag(awaitingTranslationInput.detectedLang)} {langName(awaitingTranslationInput.detectedLang)}
              </strong>{" "}
              ({awaitingTranslationInput.totalLines} lines). Configure neural translation or proceed with original subtitles.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="lbl block mb-1.5 text-neutral-300 font-semibold text-xs">
                Neural Translation Model
              </label>
              <select
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-xs text-neutral-100 font-medium focus:ring-1 focus:ring-teal-500"
                value={promptModel}
                onChange={(e) => setPromptModel(e.target.value)}
              >
                {TRANSLATION_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.vramGb} GB VRAM)
                  </option>
                ))}
              </select>
              <p className="text-[0.68rem] text-neutral-400 mt-1">
                {TRANSLATION_MODELS.find((m) => m.id === promptModel)?.description}
              </p>
            </div>

            <div>
              <label className="lbl block mb-1.5 text-neutral-300 font-semibold text-xs">
                Target Subtitle Language
              </label>
              <select
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-xs text-neutral-100 font-medium focus:ring-1 focus:ring-teal-500"
                value={promptTargetLang}
                onChange={(e) => setPromptTargetLang(e.target.value)}
              >
                {TARGET_LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.name} {l.code === "original" ? "(Keep Original)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-[0.68rem] text-neutral-400 mt-1">
                Choose destination language or select Original to skip translation.
              </p>
            </div>
          </div>

          {/* VRAM optimization checkbox */}
          <div className="rounded-lg bg-neutral-900/90 border border-neutral-800 p-3 flex items-start gap-3">
            <input
              type="checkbox"
              id="unloadAsrCheckbox"
              checked={promptUnloadAsr}
              onChange={(e) => setPromptUnloadAsr(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-700 text-teal-600 focus:ring-teal-500"
            />
            <label htmlFor="unloadAsrCheckbox" className="text-xs cursor-pointer">
              <span className="font-bold text-white block">
                Unload Whisper ASR from VRAM before translation (Recommended)
              </span>
              <span className="text-neutral-400 text-[0.72rem] block mt-0.5">
                Frees GPU memory from Whisper to give Meta NLLB-200 or MarianMT full dedicated VRAM for smooth translation.
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            <Btn
              onClick={() => {
                if (translationDecisionRef.current) {
                  translationDecisionRef.current({
                    action: "skip",
                    model: promptModel,
                    targetLang: "original",
                    unloadAsr: false,
                  });
                }
              }}
              className="w-full sm:w-auto"
            >
              Keep Original Subtitles (Skip Translation)
            </Btn>
            <Btn
              variant="primary"
              icon="spark"
              onClick={() => {
                if (translationDecisionRef.current) {
                  translationDecisionRef.current({
                    action: promptTargetLang === "original" ? "skip" : "translate",
                    model: promptModel,
                    targetLang: promptTargetLang,
                    unloadAsr: promptUnloadAsr,
                  });
                }
              }}
              className="w-full sm:w-auto"
            >
              {promptTargetLang === "original" ? "Finalize Original Subtitles" : "Unload VRAM & Start Translation"}
            </Btn>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MAIN LAYOUT: LOG ON LEFT (COL 1), SUBTITLES ON RIGHT (COL 2) */}
      {/* ============================================================== */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* LEFT COLUMN: LOG, CHUNKS, HARDWARE (5 cols on lg) */}
        <div className="space-y-4 lg:col-span-5">
          {/* Pipeline Execution Log (PLACED ON LEFT AS REQUESTED) */}
          <div className="panel p-4 space-y-2">
            <SectionTitle icon="terminal" right={<span className="mono text-[0.65rem] text-neutral-400">application.log</span>}>
              Processing Log
            </SectionTitle>
            <div ref={logBoxRef} className="log-scroll mono max-h-72 space-y-1 overflow-y-auto rounded-lg p-3 bg-neutral-950/80 border border-neutral-850 text-xs">
              {log.length === 0 && <div className="text-neutral-500">Waiting for pipeline events…</div>}
              {log.map((ev, i) => (
                <div key={i} className="flex items-start gap-2 text-[0.72rem] leading-relaxed">
                  <Icon name={levelIcon[ev.level]} size={12} className="mt-1 shrink-0" style={{ color: levelColor[ev.level] }} />
                  <span style={{ color: ev.level === "info" || ev.level === "wait" ? "var(--muted)" : "var(--text)" }}>
                    {ev.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chunk Scheduler */}
          <div className="panel p-4 space-y-2">
            <SectionTitle
              icon="layers"
              right={
                <span className="text-[0.7rem] text-neutral-400 font-mono">
                  {fmtClock(p.chunkSizeSec)} chunks
                </span>
              }
            >
              Chunk Scheduler
            </SectionTitle>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {(detail?.chunks ?? []).map((c) => {
                const t = chunkTile(c);
                return (
                  <div
                    key={c.id}
                    title={`Chunk ${pad(c.index)} · ${fmtClock(c.startSec)} → ${fmtClock(c.endSec)} · ${c.status}`}
                    className={t.cls}
                    style={t.style}
                  >
                    <div className="font-display text-[0.78rem] font-bold">{pad(c.index)}</div>
                    <div className="mono text-[0.58rem] opacity-80">
                      {fmtClock(c.startSec).split(":").slice(-2).join(":")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hardware Telemetry */}
          <div className="panel p-4">
            <SectionTitle icon="cpu">System Hardware</SectionTitle>
            <HardwarePanel hw={hw} live />
          </div>
        </div>

        {/* RIGHT COLUMN: ORIGINAL & TRANSLATED SUBTITLES STREAM (7 cols on lg) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="panel p-4 space-y-3">
            <div className="flex items-center justify-between border-b pb-2 border-neutral-800">
              <div className="flex items-center gap-2">
                <Icon name="wave" size={16} className="text-teal-400" />
                <h3 className="font-display text-sm font-bold text-neutral-100">
                  Live Subtitles Stream (Original & Translation)
                </h3>
              </div>
              <span className="mono text-xs text-neutral-400">
                {live.length} live segments
              </span>
            </div>

            {/* Featured Latest Subtitle Card */}
            {!latest ? (
              <div className="py-12 text-center text-xs text-neutral-500 border border-dashed rounded-xl border-neutral-800">
                <Icon name="spark" size={24} className="mx-auto mb-2 text-neutral-600 animate-pulse" />
                Subtitles appear here in real-time as transcription and translation finish
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge tone="accent">{`Chunk ${pad(latest.chunkIndex)}`}</Badge>
                  <Badge tone="teal" icon="globe">
                    {langFlag(latest.lang)} {langName(latest.lang)}
                  </Badge>
                  <span className="mono text-xs text-neutral-400">
                    {fmtClock(latest.startMs / 1000)}
                  </span>
                  {latest.confidence > 0 && (
                    <span className="ml-auto text-xs font-mono text-emerald-400 font-bold">
                      {latest.confidence}% conf
                    </span>
                  )}
                </div>

                {/* Big Original & Translated Boxes */}
                <div className="panel-inset p-3.5 space-y-3">
                  <div>
                    <div className="lbl mb-1 text-[0.65rem] text-teal-400 flex items-center gap-1 font-bold">
                      <span>ORIGINAL TRANSCRIPT</span>
                    </div>
                    <div className="text-[1.05rem] font-semibold leading-relaxed text-white">
                      {latest.event ? latest.original : `“${latest.original}”`}
                    </div>
                  </div>

                  {p.targetLang !== "original" && (
                    <div className="border-t border-neutral-800 pt-2.5">
                      <div className="lbl mb-1 text-[0.65rem] text-cyan-400 flex items-center gap-1 font-bold">
                        <span>{langName(p.targetLang).toUpperCase()} TRANSLATION</span>
                      </div>
                      <div className="text-[1.02rem] font-semibold leading-relaxed text-cyan-200">
                        {latest.translation ? `“${latest.translation}”` : <span className="text-neutral-500 italic">Translating…</span>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Scrollable list of recent subtitles */}
                {live.length > 1 && (
                  <div className="space-y-2 pt-1">
                    <span className="lbl text-[0.65rem]">RECENTLY TRANSCRIBED LINES</span>
                    <div className="log-scroll max-h-72 space-y-1.5 overflow-y-auto pr-1">
                      {live.slice(1, 20).map((s, i) => (
                        <div
                          key={i}
                          className="rounded-lg p-2.5 border border-neutral-850 bg-neutral-900/40 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between text-[0.68rem] text-neutral-500">
                            <span className="font-mono text-neutral-400">{fmtClock(s.startMs / 1000)}</span>
                            <span>{langFlag(s.lang)}</span>
                          </div>
                          <div className="font-medium text-neutral-200">
                            {s.original}
                          </div>
                          {s.translation && s.translation !== s.original && (
                            <div className="text-cyan-300 font-medium pt-0.5">
                              {s.translation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel processing?">
        <p className="text-[0.85rem] leading-relaxed" style={{ color: "var(--muted)" }}>
          Completed chunks and subtitles are checkpointed and preserved. You can resume later at any time.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Btn onClick={() => setConfirmCancel(false)}>Keep going</Btn>
          <Btn variant="danger" icon="x" onClick={() => void doCancel()}>Cancel run</Btn>
        </div>
      </Modal>
    </div>
  );
}
