import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  parseSrt,
  parseVtt,
  toSubLines,
  shiftSubtitles,
  mergeSubtitles,
  splitSubtitlesByCount,
  validateSubtitles,
} from "@/lib/utilities";
import { toSrt, toVtt, toAss, toTxt, toJson, DEFAULT_ASS_STYLE } from "@/lib/formats";
import { probeMedia, extractWav, extractOptimizedAudio, hasFfmpeg, hasFfprobe } from "@/lib/audio";
import { WORK_DIR, ensureDirs } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    // 1. CONVERT
    if (action === "convert") {
      const { content, targetFormat = "srt", style } = body;
      if (!content) return NextResponse.json({ error: "Content is required" }, { status: 400 });

      const parsed = content.trim().startsWith("WEBVTT") ? parseVtt(content) : parseSrt(content);
      const subLines = toSubLines(parsed);

      let converted = "";
      let ext = targetFormat;
      switch (targetFormat) {
        case "vtt":
          converted = toVtt(subLines, "original", false);
          break;
        case "ass":
        case "ssa":
          converted = toAss(subLines, "original", false, style || DEFAULT_ASS_STYLE);
          ext = "ass";
          break;
        case "txt":
          converted = toTxt(subLines, "original", false, true);
          break;
        case "json":
          converted = toJson(subLines, "original", false);
          break;
        default:
          converted = toSrt(subLines, "original", false);
          ext = "srt";
          break;
      }

      return NextResponse.json({ ok: true, output: converted, format: ext, count: subLines.length });
    }

    // 2. SYNCHRONIZE / SHIFT
    if (action === "sync") {
      const { content, offsetMs = 0 } = body;
      if (!content) return NextResponse.json({ error: "Content is required" }, { status: 400 });
      const parsed = parseSrt(content);
      const shifted = shiftSubtitles(parsed, Number(offsetMs) || 0);
      const subLines = toSubLines(shifted);
      const output = toSrt(subLines, "original", false);
      return NextResponse.json({ ok: true, output, shiftedCount: shifted.length });
    }

    // 3. MERGE
    if (action === "merge") {
      const { filesContent } = body;
      if (!Array.isArray(filesContent) || filesContent.length < 2) {
        return NextResponse.json({ error: "filesContent array with at least 2 files required" }, { status: 400 });
      }
      const merged = mergeSubtitles(filesContent);
      const subLines = toSubLines(merged);
      const output = toSrt(subLines, "original", false);
      return NextResponse.json({ ok: true, output, totalCount: merged.length });
    }

    // 4. SPLIT
    if (action === "split") {
      const { content, parts = 2 } = body;
      if (!content) return NextResponse.json({ error: "Content is required" }, { status: 400 });
      const parsed = parseSrt(content);
      const splitParts = splitSubtitlesByCount(parsed, Number(parts) || 2);
      const outputs = splitParts.map((p) => toSrt(toSubLines(p), "original", false));
      return NextResponse.json({ ok: true, parts: outputs, count: splitParts.length });
    }

    // 5. VALIDATE
    if (action === "validate") {
      const { content } = body;
      if (!content) return NextResponse.json({ error: "Content is required" }, { status: 400 });
      const parsed = parseSrt(content);
      const warnings = validateSubtitles(parsed);
      return NextResponse.json({ ok: true, totalEntries: parsed.length, warningCount: warnings.length, warnings });
    }

    // 6. MEDIA INFO
    if (action === "mediaInfo") {
      const { filePath } = body;
      if (!filePath || !fs.existsSync(filePath)) {
        return NextResponse.json({ error: "Valid filePath is required" }, { status: 400 });
      }
      const probe = probeMedia(filePath);
      const stat = fs.statSync(filePath);

      // Detailed ffprobe json
      let streamDetails: any[] = [];
      try {
        const out = execFileSync("ffprobe", [
          "-v", "error",
          "-show_streams",
          "-print_format", "json",
          filePath
        ], { encoding: "utf-8", timeout: 10000 });
        streamDetails = JSON.parse(out).streams || [];
      } catch {
        /* ignore */
      }

      return NextResponse.json({
        ok: true,
        fileName: path.basename(filePath),
        sizeBytes: stat.size,
        durationSec: probe.durationSec,
        hasAudio: probe.hasAudio,
        hasVideo: probe.hasVideo,
        format: probe.format,
        streams: streamDetails.map((s) => ({
          type: s.codec_type,
          codec: s.codec_name,
          channels: s.channels,
          sampleRate: s.sample_rate,
          width: s.width,
          height: s.height,
          bitrate: s.bit_rate,
        })),
      });
    }

    // 7. EXTRACT AUDIO
    if (action === "extractAudio") {
      const { filePath, targetFormat = "wav" } = body;
      if (!filePath || !fs.existsSync(filePath)) {
        return NextResponse.json({ error: "Valid filePath is required" }, { status: 400 });
      }

      ensureDirs();
      const baseOut = path.join(WORK_DIR, `extracted_${Date.now()}`);
      if (targetFormat === "mp3") {
        const mp3Out = `${baseOut}.mp3`;
        execFileSync("ffmpeg", [
          "-y", "-nostdin",
          "-i", filePath,
          "-vn",
          "-c:a", "libmp3lame",
          "-b:a", "192k",
          mp3Out,
        ], { timeout: 120000 });
        const stat = fs.statSync(mp3Out);
        return NextResponse.json({ ok: true, outputPath: mp3Out, format: "mp3", size: stat.size });
      } else {
        const wavOut = `${baseOut}.wav`;
        await extractWav(filePath, wavOut);
        const stat = fs.statSync(wavOut);
        return NextResponse.json({ ok: true, outputPath: wavOut, format: "wav", size: stat.size });
      }
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Utility execution error" }, { status: 500 });
  }
}

