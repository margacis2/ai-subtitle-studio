/** Time formatting + chunk planning utilities (pure, isomorphic). */

const p2 = (n: number) => String(n).padStart(2, "0");

export function fmtClock(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${p2(m)}:${p2(s)}` : `${m}:${p2(s)}`;
}

function parts(ms: number): { h: number; m: number; s: number; ms: number } {
  const t = Math.max(0, Math.round(ms));
  return {
    h: Math.floor(t / 3600000),
    m: Math.floor((t % 3600000) / 60000),
    s: Math.floor((t % 60000) / 1000),
    ms: t % 1000,
  };
}

/** 00:01:32.120 */
export function fmtMs(ms: number): string {
  const { h, m, s, ms: r } = parts(ms);
  return `${p2(h)}:${p2(m)}:${p2(s)}.${String(r).padStart(3, "0")}`;
}

/** 00:01:32,120 (SRT) */
export function fmtSrtTime(ms: number): string {
  const { h, m, s, ms: r } = parts(ms);
  return `${p2(h)}:${p2(m)}:${p2(s)},${String(r).padStart(3, "0")}`;
}

/** 00:01:32.120 (VTT) */
export function fmtVttTime(ms: number): string {
  return fmtMs(ms);
}

/** 0:00:01.20 (ASS centiseconds) */
export function fmtAssTime(ms: number): string {
  const { h, m, s, ms: r } = parts(ms);
  return `${h}:${p2(m)}:${p2(s)}.${String(Math.round(r / 10)).padStart(2, "0")}`;
}

/** Parse "h:mm:ss.mmm", "mm:ss.mmm" or "ss.mmm" into ms. Null if invalid. */
export function parseTimeStr(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d)([.,]\d{1,3})?)?$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (m[3] !== undefined) {
      const c = Number(m[3]);
      const frac = m[4] ? Number(m[4].replace(",", "").slice(1)) : 0;
      return a * 3600000 + b * 60000 + c * 1000 + Math.min(999, Math.max(0, Math.round(frac)));
    }
    const frac = m[4] ? Number(m[4].replace(",", "").slice(1)) : 0;
    return a * 60000 + b * 1000 + Math.min(999, Math.max(0, Math.round(frac)));
  }
  const single = raw.match(/^(\d+)([.,](\d{1,3}))?$/);
  if (single) {
    return Number(single[1]) * 1000 + (single[3] ? Math.min(999, Number(single[3])) : 0);
  }
  return null;
}

export interface ChunkPlanEntry {
  index: number;
  startSec: number;
  endSec: number;
}

/**
 * Build a chunk plan with trailing overlap so words crossing boundaries
 * are captured by at least one chunk. The final chunk always ends at
 * exactly `durationSec`.
 */
export function buildChunkPlan(
  durationSec: number,
  chunkSizeSec: number,
  overlapSec: number,
): ChunkPlanEntry[] {
  const dur = Math.max(1, durationSec || 1);
  const size = Math.max(30, Math.floor(chunkSizeSec || 600));
  const ov = Math.max(0, Math.min(Math.floor(overlapSec || 0), Math.floor(size / 4)));
  const plan: ChunkPlanEntry[] = [];
  let start = 0;
  let i = 0;
  while (start < dur - 0.25) {
    const end = Math.min(start + size, dur);
    plan.push({ index: i + 1, startSec: Math.round(start * 1000) / 1000, endSec: Math.round(end * 1000) / 1000 });
    if (end >= dur) break;
    start = end - ov;
    i++;
    if (i > 10000) break;
  }
  if (plan.length === 0) plan.push({ index: 1, startSec: 0, endSec: dur });
  return plan;
}

/** Characters per second for a segment. */
export function charsPerSec(chars: number, durMs: number): number {
  if (durMs <= 0) return 0;
  return chars / (durMs / 1000);
}

export function wordsPerSec(text: string, durMs: number): number {
  const w = text.trim() ? text.trim().split(/\s+/).length : 0;
  if (durMs <= 0) return 0;
  return w / (durMs / 1000);
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function fmtDurSec(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0 ? `${h}h ${p2(m)}m` : m > 0 ? `${m}m ${p2(s)}s` : `${s}s`;
}
