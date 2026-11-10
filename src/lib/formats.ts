import type { SubLine } from "./types";
import { fmtAssTime, fmtSrtTime, fmtVttTime, fmtMs } from "./time";

export type ExportField = "translation" | "original";

export interface AssStyle {
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  outline: number;
  shadow: number;
  alignment: number; // ASS numpad alignment 1-9
  marginL: number;
  marginR: number;
  marginV: number;
}

export const DEFAULT_ASS_STYLE: AssStyle = {
  font: "Noto Sans",
  size: 44,
  bold: false,
  italic: false,
  outline: 2,
  shadow: 1,
  alignment: 2,
  marginL: 30,
  marginR: 30,
  marginV: 26,
};

export function pickExportField(targetLang: string): ExportField {
  return targetLang === "original" ? "original" : "translation";
}

function lineText(l: SubLine, field: ExportField, speakerOn: boolean): string {
  const body = (field === "translation" && l.translation ? l.translation : l.original).trim();
  const sp = speakerOn && l.speaker ? `${l.speaker}: ` : "";
  return sp + body;
}

export function toSrt(lines: SubLine[], field: ExportField, speakerOn: boolean): string {
  const out: string[] = [];
  lines.forEach((l, i) => {
    out.push(String(i + 1));
    out.push(`${fmtSrtTime(l.startMs)} --> ${fmtSrtTime(l.endMs)}`);
    out.push(lineText(l, field, speakerOn));
    out.push("");
  });
  return out.join("\n");
}

export function toVtt(lines: SubLine[], field: ExportField, speakerOn: boolean): string {
  const out: string[] = ["WEBVTT", ""];
  lines.forEach((l, i) => {
    const id = speakerOn && l.speaker ? `cue-${i + 1}-${l.speaker.replace(/\s+/g, "_")}` : `cue-${i + 1}`;
    out.push(id);
    out.push(`${fmtVttTime(l.startMs)} --> ${fmtVttTime(l.endMs)}`);
    out.push(lineText(l, field, speakerOn));
    out.push("");
  });
  return out.join("\n");
}

export function toAss(
  lines: SubLine[],
  field: ExportField,
  speakerOn: boolean,
  style: AssStyle,
): string {
  const head = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1920",
    "PlayResY: 1080",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${style.font},${style.size},&H00FFFFFF,&H000000FF,&H10000000,&H64000000,${style.bold ? -1 : 0},${style.italic ? -1 : 0},0,0,100,100,0,0,1,${style.outline},${style.shadow},${style.alignment},${style.marginL},${style.marginR},${style.marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const body = lines.map((l) => {
    const text = lineText(l, field, speakerOn).replace(/\n/g, "\\N");
    return `Dialogue: 0,${fmtAssTime(l.startMs)},${fmtAssTime(l.endMs)},Default,,0,0,0,,${text}`;
  });
  return [...head, ...body].join("\n") + "\n";
}

export function toTxt(
  lines: SubLine[],
  field: ExportField,
  speakerOn: boolean,
  withTimes: boolean,
): string {
  return lines
    .map((l) => {
      const t = lineText(l, field, speakerOn);
      return withTimes ? `[${fmtMs(l.startMs)} → ${fmtMs(l.endMs)}] ${t}` : t;
    })
    .join("\n") + "\n";
}

export function toJson(
  lines: SubLine[],
  field: ExportField,
  speakerOn: boolean,
): string {
  const data = lines.map((l, i) => ({
    index: i + 1,
    startMs: l.startMs,
    endMs: l.endMs,
    startTime: fmtSrtTime(l.startMs),
    endTime: fmtSrtTime(l.endMs),
    speaker: speakerOn ? l.speaker || null : null,
    text: lineText(l, field, speakerOn),
    original: l.original,
    translation: l.translation || null,
  }));
  return JSON.stringify(data, null, 2);
}

export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
