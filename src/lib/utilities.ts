import type { SubLine } from "./types";
import { parseTimeStr, fmtSrtTime, fmtVttTime, fmtAssTime, fmtMs } from "./time";
import { toSrt, toVtt, toAss, toTxt, toJson, DEFAULT_ASS_STYLE } from "./formats";

export interface ParsedSubtitleEntry {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

/** Parses raw SRT text into subtitle entries. */
export function parseSrt(content: string): ParsedSubtitleEntry[] {
  const blocks = content.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const entries: ParsedSubtitleEntry[] = [];

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;

    let timeLineIdx = 1;
    let idx = parseInt(lines[0].trim(), 10);
    if (isNaN(idx)) {
      // First line might be timecode directly
      timeLineIdx = 0;
      idx = entries.length + 1;
    }

    const timeLine = lines[timeLineIdx];
    if (!timeLine || !timeLine.includes("-->")) continue;

    const [startStr, endStr] = timeLine.split("-->").map((s) => s.trim());
    const startMs = parseTimeStr(startStr);
    const endMs = parseTimeStr(endStr);
    if (startMs === null || endMs === null) continue;
    const text = lines.slice(timeLineIdx + 1).join("\n").trim();

    if (text) {
      entries.push({
        index: idx,
        startMs,
        endMs,
        text,
      });
    }
  }

  return entries;
}

/** Parses raw VTT text into subtitle entries. */
export function parseVtt(content: string): ParsedSubtitleEntry[] {
  const clean = content.replace(/^WEBVTT[^\n]*\n+/i, "");
  return parseSrt(clean);
}

/** Convert parsed entries into standard SubLine format */
export function toSubLines(entries: ParsedSubtitleEntry[]): SubLine[] {
  return entries.map((e, i) => ({
    id: String(i + 1),
    seq: i + 1,
    startMs: e.startMs,
    endMs: e.endMs,
    original: e.text,
    translation: "",
    speaker: null,
    confidence: 1.0,
    kind: "speech" as const,
  }));
}

/** Utility: Subtitle Synchronizer (Shifts timestamps by offsetMs) */
export function shiftSubtitles(entries: ParsedSubtitleEntry[], offsetMs: number): ParsedSubtitleEntry[] {
  return entries.map((e) => ({
    ...e,
    startMs: Math.max(0, e.startMs + offsetMs),
    endMs: Math.max(0, e.endMs + offsetMs),
  }));
}

/** Utility: Subtitle Merger (Combines multiple files, sorts by time, re-indexes) */
export function mergeSubtitles(filesContent: string[]): ParsedSubtitleEntry[] {
  const all: ParsedSubtitleEntry[] = [];
  for (const content of filesContent) {
    const parsed = parseSrt(content);
    all.push(...parsed);
  }

  // Sort by startMs, then endMs
  all.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  // Re-index
  return all.map((item, idx) => ({
    ...item,
    index: idx + 1,
  }));
}

/** Utility: Subtitle Splitter (Splits into multiple parts by duration or entry count) */
export function splitSubtitlesByCount(entries: ParsedSubtitleEntry[], partsCount: number): ParsedSubtitleEntry[][] {
  if (partsCount <= 1 || entries.length === 0) return [entries];
  const chunkSize = Math.ceil(entries.length / partsCount);
  const parts: ParsedSubtitleEntry[][] = [];

  for (let i = 0; i < entries.length; i += chunkSize) {
    parts.push(entries.slice(i, i + chunkSize));
  }

  return parts;
}

export interface SubtitleValidationWarning {
  index: number;
  type: "overlap" | "negative_duration" | "zero_duration" | "high_reading_speed" | "line_too_long";
  message: string;
  startMs: number;
  endMs: number;
}

/** Utility: Subtitle Validator */
export function validateSubtitles(entries: ParsedSubtitleEntry[]): SubtitleValidationWarning[] {
  const warnings: SubtitleValidationWarning[] = [];

  for (let i = 0; i < entries.length; i++) {
    const cur = entries[i];
    const durSec = (cur.endMs - cur.startMs) / 1000;

    if (cur.endMs < cur.startMs) {
      warnings.push({
        index: cur.index,
        type: "negative_duration",
        message: `End time (${fmtSrtTime(cur.endMs)}) occurs before start time (${fmtSrtTime(cur.startMs)})`,
        startMs: cur.startMs,
        endMs: cur.endMs,
      });
    } else if (cur.endMs === cur.startMs) {
      warnings.push({
        index: cur.index,
        type: "zero_duration",
        message: `Subtitle has zero duration (0.00s)`,
        startMs: cur.startMs,
        endMs: cur.endMs,
      });
    }

    // Check overlap with next
    if (i < entries.length - 1) {
      const next = entries[i + 1];
      if (cur.endMs > next.startMs) {
        warnings.push({
          index: cur.index,
          type: "overlap",
          message: `Overlaps with subtitle #${next.index} by ${cur.endMs - next.startMs}ms`,
          startMs: cur.startMs,
          endMs: cur.endMs,
        });
      }
    }

    // Reading speed (Characters per second)
    const charCount = cur.text.replace(/\s+/g, "").length;
    if (durSec > 0) {
      const cps = charCount / durSec;
      if (cps > 23) {
        warnings.push({
          index: cur.index,
          type: "high_reading_speed",
          message: `Excessive reading speed: ${cps.toFixed(1)} chars/sec (recommend < 20)`,
          startMs: cur.startMs,
          endMs: cur.endMs,
        });
      }
    }

    // Line length check
    const lines = cur.text.split("\n");
    for (const line of lines) {
      if (line.length > 50) {
        warnings.push({
          index: cur.index,
          type: "line_too_long",
          message: `Line exceeds 50 characters (${line.length} chars)`,
          startMs: cur.startMs,
          endMs: cur.endMs,
        });
        break;
      }
    }
  }

  return warnings;
}
