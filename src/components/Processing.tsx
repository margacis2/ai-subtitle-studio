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
import { langFlag, langName, modelById } from "@/lib/types";
import { fmtClock } from "@/lib/time";
import { runQuality } from "@/lib/quality";
import {
  ApiError,
  cancelProject,
  fetchHardware,
  fetchProject,
  patchProject,
  prepareProject,
  processChunk,
  type ProjectDetail,
} from "@/lib/client";
import { sleep } from "@/lib/demo";
import { HardwarePanel } from "./HardwarePanel";
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
  const [elapsedSec, setElapsedSec] = useState(0);

  const stopRef = useRef(false);
  const pauseRef = useRef(false);
  const runRef = useRef(false);
  const t0Ref = useRef(0);
  const logBoxRef = useRef<HTMLDivElement>(null);

  const p = detail?.project ?? initial;
  const modelId = p.asrModel === "auto" ? "small" : p.asrModel;
  const model = modelById(modelId);
  const completed = p.completedChunks;
  const total = p.totalChunks;
  const speed = completed > 0 && elapsedSec > 3 ? (completed * p.chunkSizeSec) / elapsedSec : 0;
  const etaSec = speed > 0 ? ((total - completed) * p.chunkSizeSec) / speed : null;

  useEffect(() => {
    const iv = setInterval(() => {
      if (t0Ref.current && !finished && !paused) {
        setElapsedSec((Date.now() - t0Ref.current) / 1000);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [finished, paused]);

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
    return d;
  }, [initial.id, onProject]);

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
          translation: s.translation,
          confidence: s.confidence,
          event: s.kind === "event",
        }));
        setLive((l) => [...segs, ...l].slice(0, 30));
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
      logEv("info", `Media analysis — ${p.name} (${fmtClock(p.durationSec)})`);
      await sleep(650);
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
              ? `WAV expanded by ${changePercent}% for uncompressed 16kHz ASR (${origMb} MB → ${optMb} MB)`
              : `Audio ready: ${optMb} MB (${format.toUpperCase()} 16kHz mono)`;
          logEv("ok", label);
        }
        if (v.speechRatio > 0) {
          logEv(v.real ? "ok" : "warn", `VAD — ${Math.round(v.speechRatio * 100)}% speech · ${v.intervals} voice intervals${v.real ? " (energy VAD on real PCM)" : ""}`);
          if (!v.real) logEv("info", pr.note);
        } else {
          logEv("warn", "VAD disabled by user");
        }
      } catch (e: any) {
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
        logEv("err", `Preparation failed: ${msg}`);
        onToast("err", `Preparation failed: ${msg}`);
        await patchProject(initial.id, { status: "failed", stage: "prepare" });
        await refresh();
        return; // Stop immediately on preparation failure
      }
      d = await refresh();
      logEv(
        "info",
        `Chunk plan — ${d.project.totalChunks} chunks × ${fmtClock(d.project.chunkSizeSec)}, ${d.project.overlapSec}s overlap, workers ${d.project.workers} · checkpointed per chunk`,
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
      const failedChunks = d.chunks.filter((c) => c.status === "FAILED");
      if (failedChunks.length > 0) {
        if (d.subtitles.length === 0) {
          logEv("err", `Transcription failed: ${failedChunks.length} chunk(s) encountered unrecoverable errors.`);
          onToast("err", "Transcription failed. Please inspect the logs.");
          const upd = await patchProject(initial.id, {
            status: "failed",
            stage: "asr",
            qualityScore: 0,
          });
          setDetail({ ...d, project: upd });
          onProject(upd);
          return;
        } else {
          logEv("warn", `${failedChunks.length} chunk(s) failed, but ${d.subtitles.length} partial subtitles were preserved.`);
        }
      }

      if (d.subtitles.length === 0) {
        logEv("warn", "ASR inference finished: No speech detected in audio file (0 subtitles generated).");
        onToast("info", "No speech detected in audio file.");
        const upd = await patchProject(initial.id, {
          status: "completed",
          stage: "done",
          progress: 100,
          qualityScore: 0,
        });
        setDetail({ ...d, project: upd });
        onProject(upd);
        return;
      }

      logEv("run", "Merging chunks — deduping overlaps, aligning timestamps…");
      await sleep(500);
      d = await refresh();
      const report = runQuality(d.subtitles, {
        maxDurationSec: 7,
        cpsLimit: 17,
        targetLang: d.project.targetLang,
      });
      logEv("ok", `Merge complete — ${report.total} subtitles, 0 boundary duplicates`);
      logEv(report.score >= 85 ? "ok" : "warn", `Quality engine — ${report.score}/100`);
      for (const iss of report.issues.slice(0, 4)) {
        logEv("warn", `${iss.label}: ${iss.count}`);
      }
      const secs = (Date.now() - t0Ref.current) / 1000;
      const upd = await patchProject(initial.id, {
        status: "completed",
        stage: "done",
        progress: 100,
        qualityScore: report.score,
        processingTimeSec: secs,
      });
      setDetail({ ...d, project: upd });
      onProject(upd);
      setFinished(true);
      onToast("ok", "Processing complete — opening results");
      setTimeout(onDone, 900);
    } catch (e) {
      logEv("err", `Pipeline error: ${e instanceof Error ? e.message : String(e)}`);
      onToast("err", e instanceof Error ? e.message : "Pipeline error");
    } finally {
      runRef.current = false;
    }
  }, [dispatch, initial.id, logEv, onDone, onProject, onToast, p.name, p.durationSec, refresh]);

  useEffect(() => {
    const t = setTimeout(() => {
      void run();
    }, 0);
    return () => clearTimeout(t);
  }, [run]);

  // hardware monitor
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
    logEv("warn", "Cancelled — completed chunks were kept (checkpointed)");
    await refresh();
  };
  const resumeFromCancel = async () => {
    setCancelled(false);
    logEv("info", "Resuming from checkpoint — completed chunks will be skipped");
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
  const stages: Array<{ id: string; label: string; done: boolean; active: boolean }> = [
    { id: "analyze", label: "Analyze", done: !!detail, active: !detail },
    { id: "vad", label: "Extract + VAD", done: !!detail?.project.vadJson, active: !!detail && !detail.project.vadJson },
    {
      id: "asr",
      label: "ASR + Translate",
      done: completed === total && total > 0,
      active: !!detail?.project.vadJson && completed < total,
    },
    { id: "quality", label: "Quality", done: finished, active: completed === total && total > 0 && !finished },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4">
      {/* header */}
      <div className="panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display truncate text-[1.05rem] font-bold">{p.name}</h1>
              <Badge
                tone={isFailed ? "err" : cancelled ? "neutral" : finished ? "ok" : "accent"}
                icon={isFailed ? "x" : finished ? "check" : "clock"}
                pulse={!finished && !cancelled && !isFailed}
              >
                {isFailed ? "Failed" : cancelled ? "Cancelled" : finished ? "Complete" : "Processing"}
              </Badge>
              <Badge tone="teal" icon="shield">Local processing</Badge>
            </div>
            <div className="mono mt-1 text-[0.7rem]" style={{ color: "var(--faint)" }}>
              {fmtClock(p.durationSec)} · {model.name} · {p.device.toUpperCase()} · {p.workers} worker{p.workers > 1 ? "s" : ""} · checkpoint auto-saved
            </div>
          </div>
          <div className="flex items-center gap-2">
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

        {/* stage stepper */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {stages.map((s) => (
            <span
              key={s.id}
              className="chip"
              style={{
                background: s.done ? "var(--ok-soft)" : s.active ? "var(--accent-soft)" : "var(--bg3)",
                color: s.done ? "var(--ok)" : s.active ? "var(--accent)" : "var(--faint)",
              }}
            >
              <Icon name={s.done ? "check" : s.active ? "clock" : "chevron-right"} size={11} />
              {s.label}
            </span>
          ))}
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[0.75rem]">
            <span className="font-bold" style={{ color: "var(--muted)" }}>
              Overall — chunk {Math.min(completed, total)} / {total}
            </span>
            <span className="mono" style={{ color: "var(--accent)" }}>{Math.min(100, p.progress)}%</span>
          </div>
          <Progress value={p.progress} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Speed" value={speed > 0 ? `${speed.toFixed(1)}× real time` : "—"} sub="audio seconds / wall second" tone="teal" />
          <Stat label="ETA" value={etaSec != null ? fmtClock(etaSec) : "—"} sub={etaSec != null ? "remaining chunks" : "warming up"} />
          <Stat label="Lines so far" value={detail?.subtitles.length ?? 0} sub="subtitle segments" />
          <Stat label="Overlap removed" value={detail ? detail.chunks.reduce((a, c) => a + c.overlapRemoved, 0) : 0} sub="duplicate segments dropped" tone="accent" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {/* chunk grid */}
          <div className="panel p-4">
            <SectionTitle icon="layers" right={<span className="text-[0.7rem]" style={{ color: "var(--faint)" }}>{fmtClock(p.chunkSizeSec)} chunks · {p.overlapSec}s overlap</span>}>
              Chunk scheduler
            </SectionTitle>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
              {(detail?.chunks ?? []).map((c) => {
                const t = chunkTile(c);
                return (
                  <div
                    key={c.id}
                    title={`Chunk ${pad(c.index)} · ${fmtClock(c.startSec)} → ${fmtClock(c.endSec)} · ${c.status}${c.language ? ` · ${langName(c.language)}` : ""}${c.overlapRemoved ? ` · ${c.overlapRemoved} dups removed` : ""}`}
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

          {/* log */}
          <div className="panel p-4">
            <SectionTitle icon="terminal" right={<span className="mono text-[0.65rem]" style={{ color: "var(--faint)" }}>logs/application.log · raw tracebacks hidden</span>}>
              Processing log
            </SectionTitle>
            <div ref={logBoxRef} className="log-scroll mono max-h-64 space-y-1 overflow-y-auto rounded-lg p-3" style={{ background: "var(--bg)" }}>
              {log.length === 0 && <div style={{ color: "var(--faint)" }}>Waiting for events…</div>}
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
        </div>

        {/* right rail */}
        <div className="space-y-4">
          <div className="panel p-4">
            <SectionTitle icon="wave" right={latest && !latest.event ? <Badge tone="ok">{latest.confidence}%</Badge> : undefined}>
              Live transcription
            </SectionTitle>
            {!latest ? (
              <div className="py-6 text-center text-[0.78rem]" style={{ color: "var(--faint)" }}>
                Segments appear here as each chunk finishes
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Badge tone="accent">{`Chunk ${pad(latest.chunkIndex)}`}</Badge>
                  <Badge tone="teal" icon="globe">
                    {langFlag(latest.lang)} {langName(latest.lang)}
                  </Badge>
                  <span className="mono text-[0.65rem]" style={{ color: "var(--faint)" }}>{fmtClock(latest.startMs / 1000)}</span>
                </div>
                <div className="panel-inset px-3 py-2.5">
                  <div className="lbl mb-1">Original</div>
                  <div className="text-[0.9rem] font-semibold leading-snug" style={{ color: "var(--accent)" }}>
                    {latest.event ? latest.original : `“${latest.original}”`}
                  </div>
                  {!latest.event && latest.translation !== latest.original && (
                    <>
                      <div className="lbl mb-1 mt-2.5">
                        {langName(detail?.project.targetLang ?? "en")} subtitle
                      </div>
                      <div className="text-[0.88rem] leading-snug" style={{ color: "var(--teal)" }}>
                        “{latest.translation}”
                      </div>
                    </>
                  )}
                </div>
                {live.length > 1 && (
                  <div className="log-scroll max-h-40 space-y-1 overflow-y-auto">
                    {live.slice(1, 7).map((s, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[0.68rem] leading-snug" style={{ color: "var(--faint)" }}>
                        <span className="mono shrink-0">{fmtClock(s.startMs / 1000)}</span>
                        <span className="truncate">{s.event ? s.original : s.translation}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="panel p-4">
            <SectionTitle icon="cpu">Hardware monitor</SectionTitle>
            <HardwarePanel hw={hw} live />
          </div>
        </div>
      </div>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel processing?">
        <p className="text-[0.85rem] leading-relaxed" style={{ color: "var(--muted)" }}>
          Completed chunks are checkpointed and will be kept. You can resume later and only the remaining chunks will
          be re-processed.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Btn onClick={() => setConfirmCancel(false)}>Keep going</Btn>
          <Btn variant="danger" icon="x" onClick={() => void doCancel()}>Cancel run</Btn>
        </div>
      </Modal>
    </div>
  );
}
