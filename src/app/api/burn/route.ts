import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { hasFfmpeg, getFfmpegPath } from "@/lib/audio";
import { toSrt, toAss, type AssStyle, DEFAULT_ASS_STYLE, pickExportField } from "@/lib/formats";
import { projectUploadDir } from "@/lib/server";
import type { SubLine } from "@/lib/types";
import { execFile } from "node:child_process";
import { log } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as
    | {
        projectId?: string;
        format?: "srt" | "ass";
        lines?: SubLine[];
        field?: "translation" | "original";
        speakerOn?: boolean;
        style?: Partial<AssStyle>;
      }
    | null;
  if (!body?.projectId || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "projectId and lines are required" }, { status: 400 });
  }
  if (!hasFfmpeg()) {
    return NextResponse.json(
      {
        error: "FFmpeg was not found on the server, so burn-in is unavailable in this environment. Export the subtitle file instead and burn it locally: ffmpeg -i input.mp4 -vf subtitles=subs.srt -c:a copy output.mp4",
        code: "FFMPEG_MISSING",
      },
      { status: 503 },
    );
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, body.projectId));
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const dir = projectUploadDir(project.id);
  const input = path.join(dir, project.fileName);
  if (!fs.existsSync(input)) return NextResponse.json({ error: "Source media missing" }, { status: 404 });

  const field = body.field ?? pickExportField(project.targetLang);
  const style: AssStyle = { ...DEFAULT_ASS_STYLE, ...(body.style ?? {}) };
  const format = body.format ?? "ass";
  const stem = project.fileName.replace(/\.[^.]+$/, "");

  let outName = `${stem}_subtitled.mp4`;
  let n = 1;
  while (fs.existsSync(path.join(dir, outName))) outName = `${stem}_subtitled_${n++}.mp4`;

  let subPath: string;
  if (format === "ass") {
    subPath = path.join(dir, `${stem}_burn.ass`);
    fs.writeFileSync(subPath, toAss(body.lines, field, !!body.speakerOn, style), "utf8");
  } else {
    subPath = path.join(dir, `${stem}_burn.srt`);
    fs.writeFileSync(subPath, toSrt(body.lines, field, !!body.speakerOn), "utf8");
  }

  const outPath = path.join(dir, outName);

  // In FFmpeg filtergraphs on Windows, colons and backslashes must be escaped if absolute
  const escSubPath = subPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  const filter = `subtitles=filename='${escSubPath}'`;
  const ffmpegBin = getFfmpegPath();

  const runBurn = (audioCodec: string): Promise<{ ok: boolean; stderr: string }> => {
    return new Promise((resolve) => {
      const args = [
        "-y",
        "-nostdin",
        "-i", input,
        "-vf", filter,
        "-c:v", "libx264",
        "-crf", "20",
        "-preset", "veryfast",
        "-c:a", audioCodec,
        outPath,
      ];
      execFile(ffmpegBin, args, { cwd: dir, timeout: 30 * 60 * 1000, windowsHide: true }, (err, _stdout, stderr) => {
        resolve({ ok: !err && fs.existsSync(outPath) && fs.statSync(outPath).size > 1024, stderr: stderr || "" });
      });
    });
  };

  // Attempt 1: Copy audio stream for speed
  let res = await runBurn("copy");

  // Attempt 2: If copy failed (e.g. incompatible audio codec for MP4 container), re-encode to AAC
  if (!res.ok) {
    log(`burn.copy_failed project=${project.id} note="Retrying with AAC audio re-encode"`);
    res = await runBurn("aac");
  }

  if (!res.ok || !fs.existsSync(outPath)) {
    const rawLines = (res.stderr || "").split("\n").map((l) => l.trim());
    const cleanErr = rawLines
      .filter((l) => l && !l.startsWith("ffmpeg version") && !l.startsWith("configuration:"))
      .slice(-4)
      .join(" | ") || "FFmpeg burn-in process failed";
    log(`burn.failed project=${project.id} err="${cleanErr}"`);
    return NextResponse.json(
      {
        error: `FFmpeg subtitle burn-in failed: ${cleanErr}`,
        code: "BURN_FAILED",
        details: res.stderr.slice(-600),
      },
      { status: 500 }
    );
  }

  log(`burn.ok project=${project.id} out=${outName}`);
  return NextResponse.json({ ok: true, url: `/api/projects/${project.id}/media?f=${outName}`, name: outName });
}
