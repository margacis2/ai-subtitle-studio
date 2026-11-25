import { NextResponse } from "next/server";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "@/db";
import { projects, chunks, subtitles } from "@/db/schema";
import { toChunk } from "@/lib/rows";
import { extractAudioChunk, getFfmpegPath } from "@/lib/audio";
import {
  log,
  newId,
  projectUploadDir,
  projectWorkDir,
  getEngineUrl,
  getEngineToken,
  isRemoteEngine,
  ensureBackendRunning,
  isBackendAlive,
  checkRemoteAccess,
} from "@/lib/server";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string; chunkId: string }> };

export async function POST(req: Request, { params }: Params) {
  const auth = await checkRemoteAccess(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error, code: "UNAUTHORIZED" }, { status: auth.status });
  }
  const { id, chunkId } = await params;
  const startTime = Date.now();

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json(
      { error: "Project not found", code: "PROJECT_NOT_FOUND", stage: "transcription", retryable: false },
      { status: 404 }
    );
  }

  const [chunk] = await db
    .select()
    .from(chunks)
    .where(and(eq(chunks.id, chunkId), eq(chunks.projectId, id)));

  if (!chunk) {
    return NextResponse.json(
      {
        error: `Chunk ${chunkId} not found for project ${id}`,
        code: "CHUNK_NOT_FOUND",
        stage: "transcription",
        projectId: id,
        chunkId,
        retryable: false,
      },
      { status: 404 }
    );
  }

  const requestedModel = project.asrModel === "auto" ? "small" : project.asrModel || "small";
  log(
    `[CHUNK START] project=${id} chunk=${chunkId} index=${chunk.index}/${project.totalChunks} time=${chunk.startSec.toFixed(1)}s-${chunk.endSec.toFixed(1)}s attempt=${chunk.attempts + 1} model=${requestedModel} device=${project.device}`
  );

  await db
    .update(chunks)
    .set({ status: "PROCESSING", attempts: chunk.attempts + 1 })
    .where(eq(chunks.id, chunkId));

  const workDir = projectWorkDir(id);
  const chunkAudioPath = path.join(workDir, `chunk_${String(chunk.index).padStart(3, "0")}.wav`);
  let remoteUploadTempPath: string | null = null;

  try {
    const uploadDir = projectUploadDir(id);
    const origPath = path.join(uploadDir, project.fileName);

    // Prefer pre-optimized audio (WAV or MP3) if extracted, else fall back to original
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
      throw new Error(`Audio source file not found on server at: ${sendPath}`);
    }

    // 1. Ensure AI backend (local or remote Colab) is reachable
    const engineUrl = getEngineUrl();
    const remote = isRemoteEngine();
    const isAlive = await isBackendAlive(engineUrl);
    if (!isAlive) {
      if (remote) {
        throw new Error(
          `Google Colab backend is offline at ${engineUrl}. Verify Cell 3 is still running in Colab and the URL in Settings matches.`
        );
      }
      log(`[CHUNK] Launching backend: url=${engineUrl}`);
      const started = await ensureBackendRunning(engineUrl);
      if (!started) {
        throw new Error(
          `Python Faster-Whisper backend is offline at ${engineUrl}. Please start it using 'start.bat' or 'python -m backend.app.main'.`
        );
      }
    }

    // 2. Extract exact audio chunk for this window (e.g. 0 to 600s, 600 to 1200s, etc.)
    const durationSec = Math.max(0.1, chunk.endSec - chunk.startSec);
    await extractAudioChunk(sendPath, chunkAudioPath, chunk.startSec, durationSec, 90000);

    // Cloudflare quick tunnels enforce a 100 MB per-request body limit; compress oversized remote chunks to 64k MP3
    let uploadAudioPath = chunkAudioPath;
    if (remote && fs.existsSync(chunkAudioPath) && fs.statSync(chunkAudioPath).size > 85 * 1024 * 1024) {
      const mp3ChunkPath = chunkAudioPath.replace(/\.wav$/i, "_colab.mp3");
      await execFileAsync(
        getFfmpegPath(),
        ["-y", "-nostdin", "-i", chunkAudioPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", mp3ChunkPath],
        { timeout: 120000, windowsHide: true }
      );
      if (fs.existsSync(mp3ChunkPath) && fs.statSync(mp3ChunkPath).size > 1024) {
        uploadAudioPath = mp3ChunkPath;
        remoteUploadTempPath = mp3ChunkPath;
      }
    }

    // 3. Prepare multipart payload for Faster-Whisper
    const formData = new FormData();
    formData.append("source_lang", project.sourceLang || "auto");
    formData.append("model_id", requestedModel);
    formData.append("device", project.device || "auto");
    formData.append("compute_type", project.computeType || "auto");
    formData.append("workers", "1"); // single worker for GPU inference
    formData.append("vad_filter", String(project.vadEnabled));
    formData.append("word_timestamps", "true");

    if (!remote && fs.existsSync(chunkAudioPath)) {
      formData.append("file_path", chunkAudioPath);
    }
    const chunkBuffer = fs.readFileSync(uploadAudioPath);
    formData.append("file", new Blob([chunkBuffer]), path.basename(uploadAudioPath));

    const engineToken = getEngineToken();
    const headers: Record<string, string> = {};
    if (engineToken) {
      headers["Authorization"] = `Bearer ${engineToken}`;
    }

    // Allow up to 10 minutes on remote Colab (first run downloads multi-GB weights such as large-v3)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remote ? 600000 : 180000);

    let response: Response;
    try {
      response = await fetch(`${engineUrl}/transcribe`, {
        method: "POST",
        headers,
        body: formData,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let errDetail = "";
      try {
        const j = await response.json();
        errDetail = j.detail?.error || j.detail || j.error || j.message || "";
      } catch {
        errDetail = await response.text().catch(() => "");
      }
      throw new Error(
        `Faster-Whisper returned status ${response.status}${errDetail ? `: ${typeof errDetail === "object" ? JSON.stringify(errDetail) : errDetail}` : ""}`
      );
    }

    const data = await response.json();
    const primaryLang = data.language || project.sourceLang || "en";
    const rawSegments = data.segments || [];

    // 4. Map chunk-relative timestamps to absolute project timeline
    const chunkStartMs = Math.round(chunk.startSec * 1000);
    const chunkEndMs = Math.round(chunk.endSec * 1000);

    const mappedSegments = rawSegments.map((s: any) => ({
      startMs: chunkStartMs + s.startMs,
      endMs: chunkStartMs + s.endMs,
      speaker: s.speaker || null,
      original: (s.original || s.text || "").trim(),
      confidence: s.confidence || 90,
      kind: "speech",
    })).filter((s: any) => s.original.length > 0 && s.startMs < chunkEndMs);

    // 5. Clean up any existing subtitles for this chunk window (handles retries cleanly)
    await db
      .delete(subtitles)
      .where(
        and(
          eq(subtitles.projectId, id),
          gte(subtitles.startMs, chunkStartMs),
          lte(subtitles.startMs, chunkEndMs)
        )
      );

    // 6. Overlap deduplication: inspect prior segments around boundary
    const priorSubs = await db
      .select()
      .from(subtitles)
      .where(and(eq(subtitles.projectId, id), lte(subtitles.startMs, chunkStartMs + 1000)))
      .orderBy(desc(subtitles.startMs))
      .limit(5);

    let overlapRemoved = 0;
    const finalSegments = mappedSegments.filter((s: any) => {
      for (const p of priorSubs) {
        if (
          Math.abs(p.startMs - s.startMs) < 1500 &&
          p.original.toLowerCase().trim() === s.original.toLowerCase().trim()
        ) {
          overlapRemoved++;
          return false;
        }
        if (s.startMs >= p.startMs && s.endMs <= p.endMs && p.original.includes(s.original)) {
          overlapRemoved++;
          return false;
        }
      }
      return true;
    });

    // 7. Insert subtitles into database
    const maxSeq = await db
      .select()
      .from(subtitles)
      .where(eq(subtitles.projectId, id))
      .orderBy(desc(subtitles.seq))
      .limit(1);

    const nextSeq = (maxSeq[0]?.seq ?? 0) + 1;

    if (finalSegments.length > 0) {
      await db.insert(subtitles).values(
        finalSegments.map((s: any, i: number) => ({
          id: newId(),
          projectId: id,
          seq: nextSeq + i,
          startMs: s.startMs,
          endMs: s.endMs,
          speaker: s.speaker || null,
          original: s.original,
          translation: "", // Stage 1: pure original transcript
          confidence: s.confidence || 90,
          kind: "speech",
        }))
      );
    }

    // 8. Mark chunk as COMPLETED
    const [updatedChunk] = await db
      .update(chunks)
      .set({
        status: "COMPLETED",
        language: primaryLang,
        confidence: 95,
        overlapRemoved,
        durationMs: Math.round(durationSec * 1000),
      })
      .where(eq(chunks.id, chunkId))
      .returning();

    // 9. Update overall project progress
    const allChunks = await db.select().from(chunks).where(eq(chunks.projectId, id));
    const completed = allChunks.filter((c) => c.status === "COMPLETED").length;
    const total = allChunks.length || 1;
    const progress = Math.min(95, 8 + Math.round((87 * completed) / total));

    await db
      .update(projects)
      .set({
        completedChunks: completed,
        progress,
        stage: completed === total ? "merge" : "asr",
        status: "processing",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(projects.id, id));

    // 10. If final chunk finished, ensure sequential numbering across all subtitles
    if (completed === total) {
      const allSubs = await db
        .select()
        .from(subtitles)
        .where(eq(subtitles.projectId, id))
        .orderBy(asc(subtitles.startMs));

      for (let idx = 0; idx < allSubs.length; idx++) {
        if (allSubs[idx].seq !== idx + 1) {
          await db
            .update(subtitles)
            .set({ seq: idx + 1 })
            .where(eq(subtitles.id, allSubs[idx].id));
        }
      }
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    log(
      `[CHUNK OK] project=${id} chunk=${chunkId} index=${chunk.index} duration=${elapsedSec}s lines=${finalSegments.length} overlapRemoved=${overlapRemoved} lang=${primaryLang}`
    );

    return NextResponse.json({
      chunk: toChunk(updatedChunk),
      segments: finalSegments.map((s: any) => ({
        startMs: s.startMs,
        endMs: s.endMs,
        speaker: s.speaker || null,
        original: s.original,
        translation: "",
        confidence: s.confidence || 90,
        kind: "speech",
        lang: primaryLang,
      })),
      language: primaryLang,
      confidence: 95,
      overlapRemoved,
      durationMs: Math.round(durationSec * 1000),
      note: data.note || null,
    });
  } catch (e: any) {
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(chunks).set({ status: "FAILED" }).where(eq(chunks.id, chunkId));

    log(
      `[CHUNK FAIL] project=${id} chunk=${chunkId} index=${chunk.index} attempt=${chunk.attempts + 1} duration=${elapsedSec}s error="${msg}"\n${e.stack || ""}`
    );

    return NextResponse.json(
      {
        error: msg,
        code: msg.includes("offline") ? "BACKEND_UNAVAILABLE" : "CHUNK_FAILED",
        stage: "transcription",
        projectId: id,
        chunkId,
        retryable: !msg.includes("not found"),
      },
      { status: 500 }
    );
  } finally {
    // 11. Clean up temporary sliced audio files
    for (const p of [chunkAudioPath, remoteUploadTempPath]) {
      if (p && fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {
          // non-fatal cleanup
        }
      }
    }
  }
}
