import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, chunks } from "@/db/schema";
import { buildChunkPlan } from "@/lib/time";
import { newId, safeBaseName, isAllowedMedia, projectUploadDir, humanBytes, log } from "@/lib/server";
import { toProject, toChunk } from "@/lib/rows";
import type { StudioSettings } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db.select().from(projects).orderBy(desc(projects.createdAt));
  return NextResponse.json(rows.map(toProject));
}

const MAX_UPLOAD = 400 * 1024 * 1024;

export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ error: "No form data" }, { status: 400 });

  const file = fd.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const name = safeBaseName(file.name || "media");
  if (!isAllowedMedia(name)) {
    return NextResponse.json(
      { error: `Unsupported file type "${name.split(".").pop()}". Allowed: video (mp4, mkv, mov, avi, webm...) or audio (mp3, wav, flac, m4a, ogg...).` },
      { status: 415 },
    );
  }

  if (file.size <= 0 || file.size > MAX_UPLOAD) {
    return NextResponse.json({ error: "File is empty or larger than 400 MB" }, { status: 413 });
  }

  let meta: { durationSec?: number } = {};
  let settings: Partial<StudioSettings> = {};
  try {
    meta = JSON.parse(String(fd.get("meta") || "{}"));
    settings = JSON.parse(String(fd.get("settings") || "{}"));
  } catch {
    /* non-fatal */
  }

  const durationSec = Math.max(1, Number(meta.durationSec) || 120);
  const id = newId();
  const dir = projectUploadDir(id);
  const dest = require("node:path").join(dir, name);
  await require("node:fs/promises").writeFile(dest, Buffer.from(await file.arrayBuffer()));

  const chunkSizeSec = Number(settings.chunkSizeSec) || 600;
  const overlapSec = Math.max(0, Math.min(Number(settings.overlapSec) || 3, 30));
  const plan = buildChunkPlan(durationSec, chunkSizeSec, overlapSec);

  const row = {
    id,
    name: name.replace(/\.[^.]+$/, ""),
    fileName: name,
    mimeType: file.type || "video/mp4",
    durationSec,
    sizeBytes: file.size,
    sourceLang: settings.sourceLang || "auto",
    targetLang: settings.targetLang || "original",
    asrModel: settings.asrModel || "auto",
    translationModel: settings.translationModel || "nllb",
    pauseBeforeTranslate: settings.pauseBeforeTranslate !== false,
    unloadAsrBeforeTranslate: settings.unloadAsrBeforeTranslate !== false,
    device: settings.device || "auto",
    computeType: settings.computeType || "auto",
    workers: Math.max(1, Number(settings.workers) || 1),
    chunkSizeSec,
    overlapSec,
    mode: settings.mode || "balanced",
    vadEnabled: settings.vadEnabled !== false,
    diarization: !!settings.diarization,
    nonSpeechEvents: !!settings.nonSpeechEvents,
    profanityMode: settings.profanityMode || "preserve",
    autoPunctuate: settings.autoPunctuate !== false,
    status: "pending" as const,
    stage: "idle",
    progress: 0,
    totalChunks: plan.length,
    completedChunks: 0,
  };

  await db.insert(projects).values(row);
  await db.insert(chunks).values(
    plan.map((p) => ({
      id: newId(),
      projectId: id,
      index: p.index,
      startSec: p.startSec,
      endSec: p.endSec,
      status: "WAITING" as const,
    })),
  );

  log(`project.created id=${id} file=${name} size=${humanBytes(file.size)} duration=${Math.round(durationSec)}s chunks=${plan.length}`);

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  const chunkRows = await db.select().from(chunks).where(eq(chunks.projectId, id));

  return NextResponse.json({ project: toProject(project), chunks: chunkRows.map(toChunk) }, { status: 201 });
}