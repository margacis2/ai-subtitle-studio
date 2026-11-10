import { NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/db";
import { projects, chunks, subtitles } from "@/db/schema";
import { toChunk } from "@/lib/rows";
import { log, newId, projectUploadDir, projectWorkDir, getEngineUrl, getEngineToken } from "@/lib/server";

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
    const workDir = projectWorkDir(id);
    const origPath = path.join(uploadDir, project.fileName);

    // Prefer pre-optimized audio under 100MB (WAV or MP3) if extracted, else fall back to original
    let sendPath = origPath;
    const optWav = path.join(workDir, "audio_optimized.wav");
    const optMp3 = path.join(workDir, "audio_optimized_opt.mp3");
    const fullWav = path.join(workDir, "audio_full.wav");

    if (fs.existsSync(optMp3)) {
      sendPath = optMp3;
    } else if (fs.existsSync(optWav)) {
      sendPath = optWav;
    } else if (fs.existsSync(fullWav)) {
      sendPath = fullWav;
    }

    if (!fs.existsSync(sendPath)) {
      throw new Error("Source media or converted audio not found on server");
    }

    const cachePath = path.join(workDir, "transcription_cache.json");
    let data: any = null;

    if (fs.existsSync(cachePath)) {
      try {
        data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      } catch {
        data = null;
      }
    }

    if (!data) {
      // Prepare media file payload for Python Whisper backend
      const fileBuffer = fs.readFileSync(sendPath);
      const sendName = path.basename(sendPath);
      const blob = new Blob([fileBuffer]);
      const formData = new FormData();
      formData.append("file", blob, sendName);
      formData.append("source_lang", project.sourceLang);
      formData.append("target_lang", project.targetLang);

      const engineUrl = getEngineUrl();
      const engineToken = getEngineToken();
      const headers: Record<string, string> = {};
      if (engineToken) {
        headers["Authorization"] = `Bearer ${engineToken}`;
      }

      const response = await fetch(`${engineUrl}/transcribe`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errDetail = await response.text().catch(() => "");
        throw new Error(
          `Whisper backend returned status ${response.status}${errDetail ? `: ${errDetail.slice(0, 150)}` : ""}`
        );
      }

      data = await response.json();
      try {
        fs.writeFileSync(cachePath, JSON.stringify(data), "utf-8");
      } catch {
        // non-fatal cache write failure
      }
    }
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