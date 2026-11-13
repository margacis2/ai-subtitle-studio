import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, chunks, subtitles } from "@/db/schema";
import { toProject, toChunk, toSub } from "@/lib/rows";
import { log, projectUploadDir, projectWorkDir } from "@/lib/server";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 });

    const chunkRows = await db.select().from(chunks).where(eq(chunks.projectId, id)).orderBy(asc(chunks.index));
    const subRows = await db.select().from(subtitles).where(eq(subtitles.projectId, id)).orderBy(asc(subtitles.seq));

    return NextResponse.json({ project: toProject(project), chunks: chunkRows.map(toChunk), subtitles: subRows.map(toSub) });
  } catch (err: any) {
    log(`project.get_error id=${(await params).id} err="${err.message}"\n${err.stack || ""}`);
    return NextResponse.json(
      { error: err.message || "Failed to load project", code: "GET_PROJECT_FAILED", details: err.stack },
      { status: 500 }
    );
  }
}

const PATCHABLE = [
  "status", "stage", "progress", "qualityScore", "processingTimeSec",
  "asrTimeSec", "translationTimeSec", "asrModel", "targetLang", "sourceLang",
  "engineNote", "vadJson", "startedAt", "workers", "device", "computeType",
  "completedChunks",
] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body", code: "INVALID_BODY" }, { status: 400 });
    }

    const [existing] = await db.select().from(projects).where(eq(projects.id, id));
    if (!existing) return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 });

    const patch: Record<string, unknown> = {};
    for (const k of PATCHABLE) {
      if (k in body) patch[k] = body[k];
    }
    patch.updatedAt = new Date().toISOString();

    const shouldReset = Boolean(
      body.resetChunks ||
      (body.asrModel && body.asrModel !== existing.asrModel)
    );

    if (shouldReset) {
      await db.update(chunks).set({ status: "WAITING", attempts: 0 }).where(eq(chunks.projectId, id));
      await db.delete(subtitles).where(eq(subtitles.projectId, id));
      patch.status = "pending";
      patch.stage = "idle";
      patch.progress = 0;
      patch.completedChunks = 0;
      patch.asrTimeSec = null;
      patch.translationTimeSec = null;
      patch.processingTimeSec = null;

      // Invalidate transcription cache for this model so it re-runs fresh on GPU
      const workDir = projectWorkDir(id);
      const targetModel = String(body.asrModel || existing.asrModel || "small");
      const cachePath = path.join(workDir, `transcription_cache_${targetModel}.json`);
      if (fs.existsSync(cachePath)) {
        try { fs.unlinkSync(cachePath); } catch {}
      }
    }

    const [project] = await db.update(projects).set(patch as any).where(eq(projects.id, id)).returning();
    if (!project) return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 });

    log(`project.updated id=${id} fields=${Object.keys(patch).join(",")}`);
    return NextResponse.json(toProject(project));
  } catch (err: any) {
    log(`project.patch_error id=${id} err="${err.message}"\n${err.stack || ""}`);
    return NextResponse.json(
      { error: err.message || "Failed to update project", code: "PATCH_FAILED", details: err.stack },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return NextResponse.json({ error: "Project not found", code: "NOT_FOUND" }, { status: 404 });

    await db.delete(projects).where(eq(projects.id, id));
    for (const d of [projectUploadDir(id), projectWorkDir(id)]) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    log(`project.deleted id=${id}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    log(`project.delete_error id=${id} err="${err.message}"`);
    return NextResponse.json(
      { error: err.message || "Failed to delete project", code: "DELETE_FAILED" },
      { status: 500 }
    );
  }
}