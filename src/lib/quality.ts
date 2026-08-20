import type { QualityCheck, QualityIssue, QualityReport, SubLine } from "./types";

export interface QualityOpts {
  maxDurationSec?: number;
  cpsLimit?: number;
  targetLang?: string;
}

const HALLU_RE =
  /(thank you for watching|like and subscribe|please subscribe|hit the like button|this is the end of the (video|podcast|movie)|\(silence\)\s*\(silence\))/i;

/**
 * Heuristic subtitle quality engine.
 * The score is an indicator of structural/timing issues, NOT a claim of
 * linguistic correctness.
 */
export function runQuality(lines: SubLine[], o: QualityOpts = {}): QualityReport {
  const maxDur = o.maxDurationSec ?? 7;
  const cpsLim = o.cpsLimit ?? 17;
  const target = o.targetLang ?? "en";
  const n = lines.length;

  const badTime: number[] = [];
  const overlap: number[] = [];
  const empty: number[] = [];
  const flash: number[] = [];
  const tooLong: number[] = [];
  const dup: number[] = [];
  const longLine: number[] = [];
  const cpsBad: number[] = [];
  const punct: number[] = [];
  const hallu: number[] = [];

  const counts = new Map<string, number[]>();

  for (let i = 0; i < n; i++) {
    const l = lines[i];
    const dur = l.endMs - l.startMs;
    const oTrim = l.original.trim();
    const tTrim = l.translation.trim();
    if (l.endMs <= l.startMs) badTime.push(i);
    if (i > 0 && l.startMs < lines[i - 1].endMs - 60) overlap.push(i);
    if (!oTrim && !tTrim) empty.push(i);
    if (dur < 1000 && l.kind === "speech") flash.push(i);
    if (dur > maxDur * 1000) tooLong.push(i);
    if (i > 0 && oTrim && oTrim === lines[i - 1].original.trim()) dup.push(i);
    const disp = target === "original" ? oTrim : tTrim || oTrim;
    if (disp.length > 52) longLine.push(i);
    if (l.kind === "speech" && dur > 0) {
      const cps = disp.length / (dur / 1000);
      if (cps > cpsLim) cpsBad.push(i);
    }
    if (target === "en") {
      const t = tTrim || oTrim;
      if (t && !/[.!?…।।।]$/.test(t)) punct.push(i);
    }
    if (HALLU_RE.test(oTrim + " " + tTrim)) hallu.push(i);
    if (oTrim && oTrim.length > 4) {
      const a = counts.get(oTrim) ?? [];
      a.push(i);
      counts.set(oTrim, a);
    }
  }

  const repeated = [...counts.values()].filter((a) => a.length >= 3).flat();

  const issues: QualityIssue[] = [];
  const push = (
    type: string,
    label: string,
    severity: "warn" | "error",
    indices: number[],
    weight: number,
  ) => {
    if (indices.length > 0) issues.push({ type, label, severity, count: indices.length, indices: indices.slice(0, 200), weight });
  };

  push("badtime", "Invalid timestamps (end ≤ start)", "error", badTime, 5);
  push("overlap", "Overlapping subtitles", "error", overlap, 2);
  push("empty", "Empty subtitles", "error", empty, 3);
  push("dup", "Duplicate consecutive subtitles", "warn", dup, 1.5);
  push("repeat", "Repeated phrases (3+ times)", "warn", repeated, 1);
  push("flash", "Flashes (< 1 second)", "warn", flash, 1);
  push("long", `Duration over ${maxDur}s`, "warn", tooLong, 1);
  push("longline", "Long lines (> 52 chars)", "warn", longLine, 1);
  push("cps", `Reading speed above ${cpsLim} CPS`, "warn", cpsBad, 0.5);
  push("punct", "Missing sentence punctuation", "warn", punct, 0.4);
  push("hallu", "Possible ASR hallucination patterns", "error", hallu, 4);

  const penalty = issues.reduce((s, i) => s + i.count * i.weight, 0);
  const score = Math.max(0, Math.round(100 - penalty));

  let totalChars = 0;
  for (const l of lines) totalChars += (target === "original" ? l.original : l.translation || l.original).length;
  const durationSec = n > 0 ? Math.max(lines[n - 1].endMs, 1000) / 1000 : 0;
  const charsPerSec = durationSec > 0 ? Math.round((totalChars / durationSec) * 10) / 10 : 0;

  const checks: QualityCheck[] = [
    { name: "Timestamps valid", pass: badTime.length === 0, detail: badTime.length ? `${badTime.length} invalid` : "none found" },
    { name: "No overlaps", pass: overlap.length === 0, detail: overlap.length ? `${overlap.length} overlaps` : "clean" },
    { name: "No empty subtitles", pass: empty.length === 0, detail: empty.length ? `${empty.length} empty` : "clean" },
    { name: "No consecutive duplicates", pass: dup.length === 0, detail: dup.length ? `${dup.length} duplicates` : "clean" },
    { name: "No repeated phrases", pass: repeated.length === 0, detail: repeated.length ? `${repeated.length} occurrences` : "clean" },
    { name: "No flashes", pass: flash.length === 0, detail: flash.length ? `${flash.length} under 1s` : "clean" },
    { name: `Max duration ${maxDur}s`, pass: tooLong.length === 0, detail: tooLong.length ? `${tooLong.length} too long` : "within limit" },
    { name: `Reading speed ≤ ${cpsLim} CPS`, pass: cpsBad.length === 0, detail: cpsBad.length ? `${cpsBad.length} too fast` : `avg ${charsPerSec} CPS` },
    { name: "Line length", pass: longLine.length === 0, detail: longLine.length ? `${longLine.length} long lines` : "within 52 chars" },
    { name: "Punctuation", pass: punct.length === 0, detail: punct.length ? `${punct.length} missing` : "complete" },
    { name: "Hallucination patterns", pass: hallu.length === 0, detail: hallu.length ? `${hallu.length} flagged` : "none detected" },
  ];

  return { score, total: n, durationSec, charsPerSec, issues, checks };
}
