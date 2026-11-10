"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GlossaryRow, Project, QualityReport, SubLine, StudioSettings } from "@/lib/types";
import { langFlag, langName, modelById } from "@/lib/types";
import { fmtClock, fmtMs, parseTimeStr } from "@/lib/time";
import { runQuality } from "@/lib/quality";
import {
  DEFAULT_ASS_STYLE,
  downloadText,
  toAss,
  toJson,
  toSrt,
  toTxt,
  toVtt,
  type AssStyle,
  type ExportField,
} from "@/lib/formats";
import { applyGlossary } from "@/lib/demo";
import {
  addGlossary,
  burnSubtitles,
  deleteGlossary,
  fetchGlossary,
  fetchProject,
  mediaUrl,
  saveSubtitles,
  translateTexts,
  type ProjectDetail,
} from "@/lib/client";
import PreviewPlayer, { activeLine } from "./PreviewPlayer";
import { Badge, Btn, Field, Kbd, Modal, SectionTitle, Select, Stat, Toggle } from "./ui";
import { Icon } from "./icons";

/* ---------- editable cell ---------- */
function Cell({
  value,
  onCommit,
  mono,
  placeholder,
  className = "",
  style,
}: {
  value: string;
  onCommit: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const v = draft ?? value;
  return (
    <input
      className={`input !px-1.5 !py-1 !text-[0.78rem] ${mono ? "mono" : ""} ${className}`}
      style={style}
      value={v}
      placeholder={placeholder}
      onFocus={() => setDraft(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setDraft(null);
        if (v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function splitNearMiddle(text: string): [string, string] {
  const t = text.trim();
  const mid = Math.floor(t.length / 2);
  let idx = t.lastIndexOf(" ", mid);
  if (idx < 6) idx = t.indexOf(" ", mid);
  if (idx <= 0 || idx >= t.length - 1) idx = mid;
  return [t.slice(0, idx + 1).trim(), t.slice(idx + 1).trim()];
}

/* ---------- main ---------- */
export default function Editor({
  project,
  settings,
  onBack,
  onProject,
  onToast,
}: {
  project: Project;
  settings: StudioSettings;
  onBack: () => void;
  onProject: (p: Project) => void;
  onToast: (tone: "ok" | "err" | "warn" | "info", text: string) => void;
}) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [lines, setLines] = useState<SubLine[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [past, setPast] = useState<SubLine[][]>([]);
  const [future, setFuture] = useState<SubLine[][]>([]);
  const [qRep, setQRep] = useState<QualityReport | null>(null);
  const [glossary, setGlossary] = useState<GlossaryRow[]>([]);
  const [gTerm, setGTerm] = useState("");
  const [gTrans, setGTrans] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [qText, setQText] = useState("");
  const [rText, setRText] = useState("");
  const [replaceCount, setReplaceCount] = useState<number | null>(null);
  const [shiftSec, setShiftSec] = useState("0.5");
  const [exp, setExp] = useState<{ format: "srt" | "vtt" | "ass" | "txt" | "json"; field: ExportField; speakerOn: boolean; withTimes: boolean; style: AssStyle }>({
    format: "srt",
    field: project.targetLang === "original" ? "original" : "translation",
    speakerOn: project.diarization,
    withTimes: false,
    style: DEFAULT_ASS_STYLE,
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [playerTime, setPlayerTime] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving">("saved");
  const [burning, setBurning] = useState(false);
  const [translatingWithOpus, setTranslatingWithOpus] = useState(false);
  const [burnUrl, setBurnUrl] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const firstSave = useRef(true);

  const p = detail?.project ?? project;
  const isVideo = !p.mimeType.startsWith("audio");

  /* load */
  useEffect(() => {
    (async () => {
      try {
        const d = await fetchProject(project.id);
        setDetail(d);
        setLines(d.subtitles);
        onProject(d.project);
        const g = await fetchGlossary();
        setGlossary(g);
      } catch (e) {
        onToast("err", e instanceof Error ? e.message : "Failed to load project");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const save = useCallback(async () => {
    setSaveState("saving");
    try {
      const reseq = lines.map((l, i) => ({ ...l, seq: i + 1 }));
      await saveSubtitles(p.id, reseq);
      setSaveState("saved");
    } catch (e) {
      setSaveState("dirty");
      onToast("err", e instanceof Error ? e.message : "Save failed");
    }
  }, [lines, p.id, onToast]);

  /* autosave (debounced) */
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    setSaveState("dirty");
    const t = setTimeout(() => {
      void save();
    }, 1400);
    return () => clearTimeout(t);
  }, [lines, save]);

  /* history */
  const mutate = useCallback(
    (fn: (ls: SubLine[]) => SubLine[], clearSel = true) => {
      setPast((h) => [...h.slice(-59), lines]);
      setFuture([]);
      setLines((ls) => fn(ls));
      if (clearSel) {
        setSel(new Set());
        setAnchor(null);
      }
    },
    [lines],
  );

  const undo = useCallback(() => {
    setPast((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [lines, ...f].slice(0, 60));
      setLines(prev);
      setSel(new Set());
      return h.slice(0, -1);
    });
  }, [lines]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((h) => [...h, lines].slice(-60));
      setLines(next);
      setSel(new Set());
      return f.slice(1);
    });
  }, [lines]);

  /* structural ops */
  const updateRow = (i: number, patch: Partial<SubLine>) =>
    mutate((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const addRow = (afterIdx: number | null) =>
    mutate((ls) => {
      const at = afterIdx == null ? ls.length : afterIdx + 1;
      const prev = ls[Math.min(at, ls.length - 1)];
      const start = prev ? prev.endMs : 0;
      const row: SubLine = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        seq: at + 1,
        startMs: start,
        endMs: start + 3000,
        speaker: p.diarization ? "Speaker 1" : null,
        original: "",
        translation: "",
        confidence: 0,
        kind: "speech",
      };
      const copy = [...ls];
      copy.splice(at, 0, row);
      return copy;
    });

  const splitRow = (i: number) =>
    mutate((ls) => {
      const l = ls[i];
      if (!l) return ls;
      const mid = l.startMs + (l.endMs - l.startMs) / 2;
      const [a1, a2] = splitNearMiddle(l.original);
      const [b1, b2] = splitNearMiddle(l.translation);
      const half: SubLine = {
        ...l,
        id: `local-${Date.now()}-b`,
        startMs: Math.round(mid),
        original: a2 || l.original.slice(0, 6),
        translation: b2 || l.translation.slice(0, 6),
      };
      const copy = [...ls];
      copy.splice(i, 1, { ...l, endMs: Math.round(mid), original: a1 || l.original.slice(0, 6), translation: b1 || l.translation.slice(0, 6) }, half);
      return copy;
    });

  const mergeRow = (i: number) =>
    mutate((ls) => {
      if (i + 1 >= ls.length) return ls;
      const a = ls[i];
      const b = ls[i + 1];
      const merged: SubLine = {
        ...a,
        endMs: b.endMs,
        original: [a.original, b.original].filter(Boolean).join(" "),
        translation: [a.translation, b.translation].filter(Boolean).join(" "),
      };
      const copy = [...ls];
      copy.splice(i, 2, merged);
      return copy;
    });

  const deleteSel = () => {
    if (sel.size === 0) return;
    mutate((ls) => ls.filter((_, j) => !sel.has(j)));
  };

  const shiftSel = (deltaSec: number) => {
    if (sel.size === 0) return;
    const d = Math.round(deltaSec * 1000);
    mutate((ls) =>
      ls.map((l, j) => {
        if (!sel.has(j)) return l;
        const s = Math.max(0, l.startMs + d);
        const e = Math.max(s + 100, l.endMs + d);
        return { ...l, startMs: s, endMs: e };
      }),
    );
  };

  const doReplaceAll = () => {
    if (!qText.trim()) return;
    const re = new RegExp(qText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    let count = 0;
    mutate((ls) =>
      ls.map((l) => {
        const o = l.original.replace(re, () => {
          count++;
          return rText;
        });
        const t = l.translation.replace(re, () => {
          count++;
          return rText;
        });
        return { ...l, original: o, translation: t };
      }),
    );
    setReplaceCount(count);
    onToast(count > 0 ? "ok" : "warn", count > 0 ? `Replaced ${count} occurrence${count > 1 ? "s" : ""}` : "No matches found");
  };

  const renameSpeakers = () => {
    if (!renameFrom.trim() || !renameTo.trim()) return;
    mutate((ls) => ls.map((l) => (l.speaker === renameFrom ? { ...l, speaker: renameTo } : l)));
    onToast("ok", `Renamed ${renameFrom} → ${renameTo}`);
    setRenameOpen(false);
    setRenameFrom("");
    setRenameTo("");
  };

  const applyGlossaryNow = () => {
    const g = glossary.filter((x) => x.term && x.translation);
    if (g.length === 0) {
      onToast("warn", "Glossary is empty — add terms first");
      return;
    }
    mutate((ls) =>
      ls.map((l) => ({
        ...l,
        original: p.targetLang === "original" ? applyGlossary(l.original, g) : l.original,
        translation: applyGlossary(l.translation, g),
      })),
    );
    onToast("ok", `Glossary applied (${g.length} terms)`);
  };

  const speakers = useMemo(() => [...new Set(lines.map((l) => l.speaker).filter((s): s is string => !!s))], [lines]);

  /* quality */
  const runQ = useCallback(() => {
    const rep = runQuality(lines, {
      maxDurationSec: settings.maxDurationSec,
      cpsLimit: settings.cpsLimit,
      targetLang: p.targetLang,
    });
    setQRep(rep);
  }, [lines, settings.maxDurationSec, settings.cpsLimit, p.targetLang]);

  const jumpTo = (i: number) => {
    setSel(new Set([i]));
    setAnchor(i);
    document.getElementById(`sub-${i}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setSeekTo(lines[i]?.startMs ?? null);
  };

  /* keyboard */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (typing) return;
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        if (typing) return;
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        onToast("ok", "Subtitles saved");
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      } else if (!typing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const tMs = playerTime;
        const cur = activeLine(lines, tMs);
        if (e.key === "ArrowRight") {
          const next = lines.find((l) => l.startMs >= tMs + 1);
          if (next) setSeekTo(next.startMs + 10);
        } else {
          const idx = cur ? lines.findIndex((l) => l.id === cur.id) : -1;
          const prev = idx > 0 ? lines[idx - 1] : null;
          if (prev) setSeekTo(prev.startMs + 10);
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [lines, playerTime, redo, save, undo, onToast]);

  /* export */
  const buildExport = (): { content: string; ext: string; mime: string } => {
    const sp = exp.speakerOn;
    switch (exp.format) {
      case "vtt":
        return { content: toVtt(lines, exp.field, sp), ext: "vtt", mime: "text/vtt" };
      case "ass":
        return { content: toAss(lines, exp.field, sp, exp.style), ext: "ass", mime: "text/x-ssa" };
      case "txt":
        return { content: toTxt(lines, exp.field, sp, exp.withTimes), ext: "txt", mime: "text/plain" };
      case "json":
        return { content: toJson(lines, exp.field, sp), ext: "json", mime: "application/json" };
      default:
        return { content: toSrt(lines, exp.field, sp), ext: "srt", mime: "application/x-subrip" };
    }
  };
  const doExport = (copy = false) => {
    if (lines.length === 0) {
      onToast("warn", "Nothing to export yet");
      return;
    }
    const { content, ext, mime } = buildExport();
    if (copy) {
      void navigator.clipboard.writeText(content).then(
        () => onToast("ok", "Copied to clipboard"),
        () => onToast("err", "Clipboard unavailable"),
      );
      return;
    }
    downloadText(`${p.name}_${p.targetLang}.${ext}`, content, mime);
    onToast("ok", `Exported ${lines.length} subtitles as .${ext}`);
  };

  const translateAllWithOpus = async () => {
    if (lines.length === 0) return;
    setTranslatingWithOpus(true);
    try {
      const srcTexts = lines.map((l) => l.original || l.translation);
      const effectiveLang = p.sourceLang === "auto" ? (langs[0] || "ja") : p.sourceLang;
      const translations = await translateTexts(srcTexts, effectiveLang, "en");
      mutate((ls) =>
        ls.map((l, idx) => ({
          ...l,
          translation: translations[idx] || l.translation,
        }))
      );
      onToast("ok", "Re-translated all lines with local OPUS-MT model!");
    } catch (e) {
      onToast("err", e instanceof Error ? e.message : "Translation error");
    } finally {
      setTranslatingWithOpus(false);
    }
  };

  const doBurn = async () => {
    if (!isVideo) {
      onToast("warn", "Burn-in needs a video source");
      return;
    }
    setBurning(true);
    try {
      const res = await burnSubtitles(p.id, {
        format: "ass",
        lines: lines.map((l, i) => ({ ...l, seq: i + 1 })),
        field: exp.field,
        speakerOn: exp.speakerOn,
        style: exp.style,
      });
      setBurnUrl(res.url ?? null);
      onToast("ok", `Burned video ready: ${res.name}`);
    } catch (e) {
      onToast("err", e instanceof Error ? e.message : "Burn-in failed");
    } finally {
      setBurning(false);
    }
  };

  if (!detail) {
    return (
      <div className="flex h-[60vh] items-center justify-center" style={{ color: "var(--faint)" }}>
        <span className="pulse">Loading project…</span>
      </div>
    );
  }

  const langs = [...new Set(detail.chunks.map((c) => c.language).filter((x): x is string => !!x))];
  const halluIdx = new Set(qRep?.issues.find((i) => i.type === "hallu")?.indices ?? []);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4">
      {/* final dashboard */}
      <div className="panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Icon name="check" size={18} style={{ color: "var(--ok)" }} />
          <h1 className="font-display text-[1.05rem] font-bold">Processing complete — {p.name}</h1>
          <Badge tone="teal" icon="shield">Local processing</Badge>
          <Badge tone="neutral" icon="save">
            {saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved changes" : "Autosaved"}
          </Badge>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Btn size="sm" icon="chevron-right" onClick={onBack}>Queue</Btn>
            <Btn size="sm" icon="video" onClick={() => setPreviewOpen((v) => !v)} disabled={!isVideo}>
              Preview
            </Btn>
            <Btn size="sm" icon="gear" onClick={doBurn} disabled={burning}>
              {burning ? "Burning…" : "Burn into video"}
            </Btn>
            {burnUrl && (
              <a href={burnUrl} download>
                <Btn size="sm" variant="primary" icon="download">Download burned video</Btn>
              </a>
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Duration" value={fmtClock(p.durationSec)} />
          <Stat label="Subtitles" value={lines.length} />
          <Stat label="Source languages" value={langs.length > 0 ? langs.map((l) => langFlag(l)).join(" ") : "—"} sub={langs.map(langName).join(", ")} tone="accent" />
          <Stat label="Target" value={langName(p.targetLang)} tone="teal" />
          <Stat label="ASR" value={modelById(p.asrModel === "auto" ? "small" : p.asrModel).name.split(" ").slice(0, 2).join(" ")} sub={`${p.device.toUpperCase()} · ${p.mode}`} />
          <Stat label="Processing time" value={p.processingTimeSec ? fmtClock(p.processingTimeSec) : "—"} />
          <Stat
            label="Quality"
            value={`${p.qualityScore ?? "—"}/100`}
            sub={qRep ? `avg ${qRep.charsPerSec} CPS` : "heuristic check"}
            tone={(p.qualityScore ?? 0) >= 85 ? "ok" : "warn"}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn variant="primary" icon="download" onClick={() => doExport()}>Open subtitle (SRT)</Btn>
          <Btn icon="save" onClick={() => void save()}>Save</Btn>
          <Btn icon="spark" onClick={translateAllWithOpus} disabled={translatingWithOpus}>
            {translatingWithOpus ? "Translating with OPUS..." : "Re-translate with Local OPUS"}
          </Btn>
          <Btn icon="gauge" onClick={runQ}>Run quality check</Btn>
          <span className="ml-auto hidden items-center gap-1.5 text-[0.68rem] sm:flex" style={{ color: "var(--faint)" }}>
            <Kbd>Ctrl Z</Kbd> undo · <Kbd>Ctrl F</Kbd> search · <Kbd>←</Kbd><Kbd>→</Kbd> prev/next in preview
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        {/* main column */}
        <div className="space-y-3">
          {previewOpen && isVideo && (
            <PreviewPlayer
              src={mediaUrl(p.id)}
              lines={lines}
              field={exp.field}
              speakerOn={exp.speakerOn}
              seekTo={seekTo}
              onTime={setPlayerTime}
            />
          )}

          {/* toolbar */}
          <div className="panel flex flex-wrap items-center gap-1.5 p-2.5">
            <Btn size="sm" icon="undo" onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)" />
            <Btn size="sm" icon="redo" onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Y)" />
            <span className="mx-1 h-5 w-px" style={{ background: "var(--line)" }} />
            <Btn size="sm" icon="plus" onClick={() => addRow(sel.size ? Math.max(...[...sel]) : null)} title="Add subtitle after selection">Add</Btn>
            <Btn size="sm" icon="scissors" disabled={sel.size !== 1} onClick={() => sel.size === 1 && splitRow([...sel][0])} title="Split at midpoint">Split</Btn>
            <Btn size="sm" icon="merge" disabled={sel.size !== 1} onClick={() => sel.size === 1 && mergeRow([...sel][0])} title="Merge with next">Merge</Btn>
            <Btn size="sm" variant="danger" icon="trash" disabled={sel.size === 0} onClick={deleteSel} title="Delete selected">{sel.size > 0 ? `Delete (${sel.size})` : "Delete"}</Btn>
            <span className="mx-1 h-5 w-px" style={{ background: "var(--line)" }} />
            <span className="text-[0.72rem] font-bold" style={{ color: "var(--muted)" }}>Shift</span>
            <Btn size="sm" onClick={() => shiftSel(-Number(shiftSec) || 0)} disabled={sel.size === 0} title="Shift earlier">−</Btn>
            <input
              className="input !w-16 !py-1 text-center text-[0.72rem]"
              value={shiftSec}
              onChange={(e) => setShiftSec(e.target.value)}
              aria-label="Shift seconds"
            />
            <Btn size="sm" onClick={() => shiftSel(Number(shiftSec) || 0)} disabled={sel.size === 0} title="Shift later">+</Btn>
            <span className="mx-1 h-5 w-px" style={{ background: "var(--line)" }} />
            <Btn size="sm" icon="search" onClick={() => {
              setSearchOpen((v) => !v);
              if (!searchOpen) setTimeout(() => searchRef.current?.focus(), 50);
            }}>{searchOpen ? "Close search" : "Search / Replace"}</Btn>
            {p.diarization && speakers.length > 0 && (
              <Btn size="sm" icon="user" onClick={() => { setRenameFrom(speakers[0]); setRenameOpen(true); }} title="Rename speaker">
                Rename speaker
              </Btn>
            )}
            <span className="ml-auto text-[0.68rem]" style={{ color: "var(--faint)" }}>
              {lines.length} lines · {sel.size} selected
            </span>
          </div>

          {searchOpen && (
            <div className="panel flex flex-wrap items-center gap-2 p-2.5">
              <div className="flex items-center gap-1.5">
                <Icon name="search" size={14} style={{ color: "var(--muted)" }} />
                <input ref={searchRef} className="input !w-52 !py-1.5" placeholder="Search (e.g. Chennai)" value={qText} onChange={(e) => { setQText(e.target.value); setReplaceCount(null); }} />
              </div>
              <span style={{ color: "var(--faint)" }}>→</span>
              <input className="input !w-52 !py-1.5" placeholder="Replace with (e.g. Madras)" value={rText} onChange={(e) => setRText(e.target.value)} />
              <Btn size="sm" variant="primary" onClick={doReplaceAll} disabled={!qText.trim()}>Replace all</Btn>
              {replaceCount != null && <span className="text-[0.72rem]" style={{ color: "var(--muted)" }}>{replaceCount} replaced</span>}
            </div>
          )}

          {/* table */}
          {lines.length === 0 ? (
            <div className="panel flex flex-col items-center gap-2 p-10 text-center" style={{ color: "var(--faint)" }}>
              <Icon name="film" size={26} />
              No subtitle lines yet.
            </div>
          ) : (
            <div className="panel overflow-hidden">
              <div className="max-h-[560px] overflow-auto">
                <table className="w-full border-collapse text-[0.78rem]" style={{ tableLayout: "fixed" }}>
                  <thead className="sticky top-0 z-10" style={{ background: "var(--bg3)" }}>
                    <tr className="lbl">
                      <th className="w-8 px-2 py-2" />
                      <th className="w-10 px-1 text-left">#</th>
                      <th className="w-24 px-1">Start</th>
                      <th className="w-24 px-1">End</th>
                      {p.diarization && <th className="w-24 px-1">Speaker</th>}
                      <th className="px-2 text-left">Original</th>
                      <th className="px-2 text-left">Translation</th>
                      <th className="w-14 px-1">Conf</th>
                      <th className="w-8 px-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const selected = sel.has(i);
                      const isHallu = halluIdx.has(i);
                      return (
                        <tr
                          key={l.id}
                          id={`sub-${i}`}
                          onClick={(e) => {
                            if (e.shiftKey && anchor != null) {
                              const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
                              const ns = new Set<number>();
                              for (let k = a; k <= b; k++) ns.add(k);
                              setSel(ns);
                            } else {
                              setSel(new Set([i]));
                              setAnchor(i);
                            }
                          }}
                          className="cursor-pointer transition-colors"
                          style={{
                            background: selected ? "var(--sel)" : i % 2 ? "var(--bg2)" : "transparent",
                            borderTop: "1px solid var(--line)",
                            outline: isHallu ? "1px dashed color-mix(in srgb, var(--err) 60%, transparent)" : undefined,
                          }}
                        >
                          <td className="px-2 text-center">
                            <input type="checkbox" checked={selected} className="accent-[var(--accent)]" readOnly aria-label={`Select line ${i + 1}`} />
                          </td>
                          <td className="mono px-1 py-1 text-right" style={{ color: "var(--faint)" }}>{String(l.seq).padStart(3, "0")}</td>
                          <td className="px-0.5 py-0.5">
                            <Cell mono value={fmtMs(l.startMs)} onCommit={(v) => {
                              const ms = parseTimeStr(v);
                              if (ms == null) { onToast("warn", "Invalid time — use hh:mm:ss.mmm"); return; }
                              updateRow(i, { startMs: ms });
                            }} />
                          </td>
                          <td className="px-0.5 py-0.5">
                            <Cell mono value={fmtMs(l.endMs)} onCommit={(v) => {
                              const ms = parseTimeStr(v);
                              if (ms == null) { onToast("warn", "Invalid time — use hh:mm:ss.mmm"); return; }
                              updateRow(i, { endMs: Math.max(ms, l.startMs + 100) });
                            }} />
                          </td>
                          {p.diarization && (
                            <td className="px-0.5 py-0.5">
                              <Cell value={l.speaker ?? ""} placeholder="Speaker" onCommit={(v) => updateRow(i, { speaker: v.trim() || null })} style={{ fontSize: "0.72rem" }} />
                            </td>
                          )}
                          <td className="px-1 py-0.5">
                            {l.kind === "event" ? (
                              <span className="italic" style={{ color: "var(--teal)" }}>{l.original}</span>
                            ) : (
                              <Cell value={l.original} placeholder="Original text…" onCommit={(v) => updateRow(i, { original: v })} style={{ color: "var(--accent)" }} />
                            )}
                          </td>
                          <td className="px-1 py-0.5">
                            {l.kind === "event" ? (
                              <span style={{ color: "var(--faint)" }}>—</span>
                            ) : (
                              <Cell value={l.translation} placeholder="Translation…" onCommit={(v) => updateRow(i, { translation: v })} style={{ color: "var(--teal)" }} />
                            )}
                          </td>
                          <td className="mono px-1 text-center text-[0.68rem]" style={{ color: l.confidence >= 90 ? "var(--ok)" : l.confidence >= 75 ? "var(--muted)" : "var(--warn)" }}>
                            {l.kind === "event" ? "—" : `${l.confidence}%`}
                          </td>
                          <td className="px-1 text-center">
                            {isHallu ? (
                              <Btn size="sm" variant="danger" icon="x" title="Remove hallucinated segment" onClick={() => mutate((ls) => ls.filter((_, j) => j !== i))}>✕</Btn>
                            ) : (
                              isVideo && (
                                <button
                                  className="rounded p-1 transition-colors hover:bg-[var(--bg4)]"
                                  style={{ color: "var(--muted)" }}
                                  title="Preview at this time"
                                  onClick={(e) => { e.stopPropagation(); setPreviewOpen(true); setSeekTo(l.startMs + 10); }}
                                >
                                  <Icon name="play" size={13} />
                                </button>
                              )
                            )}
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

        {/* right column */}
        <div className="space-y-4">
          {/* quality report */}
          <div className="panel p-4">
            <SectionTitle icon="gauge" right={
              <Btn size="sm" icon="refresh" onClick={runQ} disabled={lines.length === 0}>Run check</Btn>
            }>
              Quality report
            </SectionTitle>
            {!qRep ? (
              <p className="text-[0.75rem] leading-relaxed" style={{ color: "var(--faint)" }}>
                Structural validation: overlaps, duplicates, timing, flashes, reading speed, line length,
                punctuation and hallucination patterns. Heuristic score — not a linguistic judgment.
              </p>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-end justify-between">
                  <div className="font-display text-[1.7rem] font-bold leading-none" style={{ color: qRep.score >= 85 ? "var(--ok)" : qRep.score >= 65 ? "var(--warn)" : "var(--err)" }}>
                    {qRep.score}<span className="text-[0.9rem]" style={{ color: "var(--faint)" }}> / 100</span>
                  </div>
                  <div className="text-right text-[0.7rem]" style={{ color: "var(--muted)" }}>
                    {qRep.total} subtitles · {fmtClock(qRep.durationSec)}<br />avg {qRep.charsPerSec} CPS (limit {settings.cpsLimit})
                  </div>
                </div>
                <div className="space-y-1">
                  {qRep.checks.map((c) => (
                    <div key={c.name} className="flex items-center gap-2 text-[0.74rem]">
                      <Icon name={c.pass ? "check" : "alert"} size={12} style={{ color: c.pass ? "var(--ok)" : "var(--warn)" }} />
                      <span style={{ color: "var(--muted)" }}>{c.name}</span>
                      <span className="ml-auto mono text-[0.65rem]" style={{ color: "var(--faint)" }}>{c.detail}</span>
                    </div>
                  ))}
                </div>
                {qRep.issues.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {qRep.issues.map((iss) => (
                      <button
                        key={iss.type}
                        onClick={() => jumpTo(iss.indices[0])}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.72rem] transition-colors hover:bg-[var(--bg3)]"
                        style={{ color: iss.severity === "error" ? "var(--err)" : "var(--warn)" }}
                      >
                        <Icon name="alert" size={12} />
                        <span className="font-semibold">{iss.label}</span>
                        <span className="ml-auto mono text-[0.65rem]" style={{ color: "var(--faint)" }}>{iss.count} · jump</span>
                      </button>
                    ))}
                  </div>
                )}
                {qRep.issues.length === 0 && (
                  <div className="flex items-center gap-2 text-[0.74rem]" style={{ color: "var(--ok)" }}>
                    <Icon name="check" size={13} /> All checks passed
                  </div>
                )}
              </div>
            )}
          </div>

          {/* export */}
          <div className="panel p-4">
            <SectionTitle icon="download">Export</SectionTitle>
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Format">
                  <Select
                    value={exp.format}
                    onChange={(v) => setExp((e) => ({ ...e, format: v as typeof e.format }))}
                    options={[
                      { value: "srt", label: "SRT" },
                      { value: "vtt", label: "VTT" },
                      { value: "ass", label: "ASS (styled)" },
                      { value: "txt", label: "TXT" },
                      { value: "json", label: "JSON" },
                    ]}
                  />
                </Field>
                <Field label="Content">
                  <Select
                    value={exp.field}
                    onChange={(v) => setExp((e) => ({ ...e, field: v as ExportField }))}
                    options={[
                      { value: "translation", label: `Translation (${langName(p.targetLang)})` },
                      { value: "original", label: "Original" },
                    ]}
                  />
                </Field>
              </div>
              <Toggle checked={exp.speakerOn} onChange={(v) => setExp((e) => ({ ...e, speakerOn: v }))} label="Include speaker labels" hint="prefixes “Speaker 1: ” when diarization is on" />
              {exp.format === "txt" && (
                <Toggle checked={exp.withTimes} onChange={(v) => setExp((e) => ({ ...e, withTimes: v }))} label="Include timestamps" />
              )}
              {exp.format === "ass" && (
                <div className="panel-inset grid grid-cols-3 gap-2 p-2.5">
                  <Field label="Font" className="col-span-3">
                    <input className="input !py-1 text-[0.74rem]" value={exp.style.font} onChange={(e) => setExp((s) => ({ ...s, style: { ...s.style, font: e.target.value } }))} />
                  </Field>
                  <Field label={`Size ${exp.style.size}`}>
                    <input type="range" min={24} max={72} value={exp.style.size} onChange={(e) => setExp((s) => ({ ...s, style: { ...s.style, size: Number(e.target.value) } }))} className="w-full" />
                  </Field>
                  <Field label={`Outline ${exp.style.outline}`}>
                    <input type="range" min={0} max={6} value={exp.style.outline} onChange={(e) => setExp((s) => ({ ...s, style: { ...s.style, outline: Number(e.target.value) } }))} className="w-full" />
                  </Field>
                  <Field label="Alignment">
                    <Select value={String(exp.style.alignment)} onChange={(v) => setExp((s) => ({ ...s, style: { ...s.style, alignment: Number(v) } }))}
                      options={[{ value: "2", label: "Bottom" }, { value: "8", label: "Top" }]} />
                  </Field>
                  <div className="flex gap-2">
                    <label className="flex-1 text-[0.7rem]" style={{ color: "var(--muted)" }}>
                      <span className="lbl mb-1 block">Bold</span>
                      <input type="checkbox" checked={exp.style.bold} className="mt-1.5 accent-[var(--accent)]" onChange={(e) => setExp((s) => ({ ...s, style: { ...s.style, bold: e.target.checked } }))} />
                    </label>
                    <label className="flex-1 text-[0.7rem]" style={{ color: "var(--muted)" }}>
                      <span className="lbl mb-1 block">Italic</span>
                      <input type="checkbox" checked={exp.style.italic} className="mt-1.5 accent-[var(--accent)]" onChange={(e) => setExp((s) => ({ ...s, style: { ...s.style, italic: e.target.checked } }))} />
                    </label>
                    <label className="flex-1 text-[0.7rem]" style={{ color: "var(--muted)" }}>
                      <span className="lbl mb-1 block">Margin {exp.style.marginV}</span>
                      <input type="range" min={0} max={120} value={exp.style.marginV} className="mt-1.5 w-full" onChange={(e) => setExp((s) => ({ ...s, style: { ...s.style, marginV: Number(e.target.value) } }))} />
                    </label>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Btn variant="primary" icon="download" className="flex-1" onClick={() => doExport(false)}>
                  Download .{exp.format}
                </Btn>
                <Btn icon="copy" onClick={() => doExport(true)}>Copy</Btn>
              </div>
            </div>
          </div>

          {/* glossary */}
          <div className="panel p-4">
            <SectionTitle icon="globe" right={<Badge tone="neutral">{glossary.length} terms</Badge>}>
              Glossary / translation memory
            </SectionTitle>
            <div className="space-y-1.5">
              {glossary.map((g) => (
                <div key={g.id} className="flex items-center gap-2 text-[0.76rem]">
                  <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: "var(--accent)" }}>{g.term}</span>
                  <Icon name="chevron-right" size={11} style={{ color: "var(--faint)" }} />
                  <span className="min-w-0 flex-1 truncate" style={{ color: "var(--teal)" }}>{g.translation}</span>
                  <button className="rounded p-1 hover:bg-[var(--bg4)]" style={{ color: "var(--faint)" }} title="Remove term"
                    onClick={async () => {
                      await deleteGlossary(g.id);
                      setGlossary((gs) => gs.filter((x) => x.id !== g.id));
                    }}>
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ))}
              {glossary.length === 0 && (
                <p className="text-[0.72rem]" style={{ color: "var(--faint)" }}>
                  Add names and recurring terms (e.g. சென்னை → Chennai) so translation stays consistent.
                </p>
              )}
            </div>
            <div className="mt-2.5 flex gap-1.5">
              <input className="input !py-1.5 text-[0.74rem]" placeholder="Source term" value={gTerm} onChange={(e) => setGTerm(e.target.value)} />
              <input className="input !py-1.5 text-[0.74rem]" placeholder="Preferred translation" value={gTrans} onChange={(e) => setGTrans(e.target.value)} />
              <Btn size="sm" icon="plus" onClick={async () => {
                if (!gTerm.trim() || !gTrans.trim()) return;
                const row = await addGlossary(gTerm.trim(), gTrans.trim());
                setGlossary((gs) => [...gs, row]);
                setGTerm("");
                setGTrans("");
              }} />
            </div>
            <Btn size="sm" icon="spark" className="mt-2 w-full" onClick={applyGlossaryNow}>Apply glossary to subtitles</Btn>
          </div>
        </div>
      </div>

      <Modal open={renameOpen} onClose={() => setRenameOpen(false)} title="Rename speaker">
        <div className="space-y-3">
          <Field label="Current name">
            <Select value={renameFrom} onChange={setRenameFrom} options={speakers.map((s) => ({ value: s, label: s }))} />
          </Field>
          <Field label="New name" hint="e.g. John, Sarah…">
            <input className="input" value={renameTo} onChange={(e) => setRenameTo(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setRenameOpen(false)}>Cancel</Btn>
            <Btn variant="primary" icon="check" onClick={renameSpeakers} disabled={!renameTo.trim()}>Rename</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
