import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { hasFfmpeg } from "@/lib/audio";
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
  const filter = `subtitles=${subPath.split("\\").join("/")}`;
  const args = ["-y", "-nostdin", "-i", input, "-vf", filter, "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-c:a", "copy", outPath];

  const ok = await new Promise<boolean>((resolve) => {
    execFile("ffmpeg", args, { timeout: 30 * 60 * 1000, windowsHide: true }, (err) => resolve(!err));
  });
  if (!ok || !fs.existsSync(outPath)) {
    log(`burn.failed project=${project.id}`);
    return NextResponse.json({ error: "FFmpeg burn-in failed. The container or codec may not be supported by this FFmpeg build." }, { status: 500 });
  }
  log(`burn.ok project=${project.id} out=${outName}`);
  return NextResponse.json({ ok: true, url: `/api/projects/${project.id}/media?f=${outName}`, name: outName });
}
