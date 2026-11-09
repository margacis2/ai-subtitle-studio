import { NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/db";
import { projects, chunks, subtitles } from "@/db/schema";
import { toChunk } from "@/lib/rows";
import { log, newId, projectUploadDir, getEngineUrl } from "@/lib/server";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string; chunkId: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id, chunkId } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const [chunk] = await db.select().from(chunks).where(eq(chunks.id, chunkId));
  if (!chunk) return NextResponse.json({ error: "Chunk not found" }, { status: 404 });

  await db.update(chunks).set({ status: "PROCESSING", attempts: chunk.attempts + 1 }).where(eq(chunks.id, chunkId));

  try {
    const uploadDir = projectUploadDir(id);
    const mediaPath = path.join(uploadDir, project.fileName);

    if (!fs.existsSync(mediaPath)) {
      throw new Error("Source media not found on server");
    }

    // Prepare media file payload for Python Whisper backend
    const fileBuffer = fs.readFileSync(mediaPath);
    const blob = new Blob([fileBuffer]);
    const formData = new FormData();
    formData.append("file", blob, project.fileName);
    formData.append("source_lang", project.sourceLang);
    formData.append("target_lang", project.targetLang);

    const engineUrl = getEngineUrl();
    const response = await fetch(`${engineUrl}/transcribe`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Whisper backend returned status ${response.status}`);
    }

    const data = await response.json();
    const primaryLang = data.language || "ja";
    const rawSegments = data.segments || [];

    // Filter segments belonging to this chunk window
    const chunkStartMs = Math.floor(chunk.startSec * 1000);
    const chunkEndMs = Math.ceil(chunk.endSec * 1000);

    const segments = rawSegments.filter(
      (s: any) => s.startMs >= chunkStartMs - 1000 && s.startMs < chunkEndMs
    );

    const maxSeq = await db
      .select()
      .from(subtitles)
      .where(eq(subtitles.projectId, id))
      .orderBy(desc(subtitles.seq))
      .limit(1);

    const nextSeq = (maxSeq[0]?.seq ?? 0) + 1;

    if (segments.length > 0) {
      await db.insert(subtitles).values(
        segments.map((s: any, i: number) => ({
          id: newId(),
          projectId: id,
          seq: nextSeq + i,
          startMs: s.startMs,
          endMs: s.endMs,
          speaker: null,
          original: s.original || s.text,
          translation: s.translation || s.text,
          confidence: s.confidence || 90,
          kind: "speech",
        }))
      );
    }

    const [updatedChunk] = await db
      .update(chunks)
      .set({
        status: "COMPLETED",
        language: primaryLang,
        confidence: 95,
        overlapRemoved: 0,
        durationMs: 1000,
      })
      .where(eq(chunks.id, chunkId))
      .returning();

    const doneRows = await db
      .select()
      .from(chunks)
      .where(and(eq(chunks.projectId, id), eq(chunks.status, "COMPLETED")));

    const completed = doneRows.length;
    const total = project.totalChunks || 1;
    const progress = Math.min(92, 8 + Math.round((84 * completed) / total));

    await db
      .update(projects)
      .set({
        completedChunks: completed,
        progress,
        stage: completed === total ? "merge" : "asr",
        status: "processing",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    return NextResponse.json({
      chunk: toChunk(updatedChunk),
      segments: segments.map((s: any) => ({
        startMs: s.startMs,
        endMs: s.endMs,
        speaker: null,
        original: s.original || s.text,
        translation: s.translation || s.text,
        confidence: s.confidence,
        kind: "speech",
        lang: primaryLang,
      })),
      language: primaryLang,
      confidence: 95,
      overlapRemoved: 0,
      durationMs: 1000,
      note: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await db.update(chunks).set({ status: "FAILED" }).where(eq(chunks.id, chunkId));
    log(`chunk.failed project=${id} err=${msg}`);
    return NextResponse.json({ error: msg, code: "CHUNK_FAILED" }, { status: 500 });
  }
}