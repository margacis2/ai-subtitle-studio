import { NextResponse } from "next/server";
import { db } from "@/db";
import { batchJobs, projects, subtitles } from "@/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { toSrt } from "@/lib/formats";
import { newId } from "@/lib/server";

export const runtime = "nodejs";

const BACKEND_URL = process.env.LOCAL_AI_BACKEND_URL || "http://127.0.0.1:8001";

export async function POST() {
  try {
    const pendingJobs = await db
      .select()
      .from(batchJobs)
      .where(eq(batchJobs.status, "pending"));

    if (pendingJobs.length === 0) {
      return NextResponse.json({ message: "No pending jobs found" });
    }

    // Process sequentially to conserve GPU/RAM
    let completedCount = 0;
    let failedCount = 0;

    for (const job of pendingJobs) {
      try {
        await db
          .update(batchJobs)
          .set({ status: "processing", progress: 15, updatedAt: new Date().toISOString() })
          .where(eq(batchJobs.id, job.id));

        const absPath = path.resolve(job.filePath);
        if (!fs.existsSync(absPath)) {
          throw new Error(`File not found on disk: ${absPath}`);
        }

        const form = new FormData();
        form.append("file_path", absPath);
        form.append("source_lang", job.sourceLang || "auto");
        form.append("model_id", job.asrModel || "small");
        form.append("word_timestamps", "true");
        form.append("vad_filter", "true");

        const res = await fetch(`${BACKEND_URL}/transcribe`, {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          const errDetail = await res.text();
          throw new Error(`ASR engine error: ${errDetail}`);
        }

        const data = await res.json();
        const segments = data.segments || [];
        const detectedLang = data.language || job.sourceLang || "en";
        const durationSec = Number(data.duration) || 0;

        // Format into SubLine array
        const subLines = segments.map((s: any, idx: number) => ({
          id: idx + 1,
          startMs: Math.round((s.start || 0) * 1000),
          endMs: Math.round((s.end || 0) * 1000),
          original: s.text || s.original || "",
          translation: "",
          speaker: s.speaker || null,
          confidence: Math.round((s.confidence || 0.95) * 100),
        }));

        const srtContent = toSrt(subLines, "original", false);

        // Save SRT file next to the media
        let outPath = "";
        try {
          const dir = path.dirname(absPath);
          const ext = path.extname(absPath);
          const base = path.basename(absPath, ext);
          outPath = path.join(dir, `${base}.srt`);
          fs.writeFileSync(outPath, srtContent, "utf-8");
        } catch {
          outPath = path.join(process.cwd(), `batch_${job.id}.srt`);
          fs.writeFileSync(outPath, srtContent, "utf-8");
        }

        // Register project in local database so user can open it in the Subtitle Editor
        const projectId = newId();
        const stat = fs.statSync(absPath);
        const fileName = path.basename(absPath);
        const isVideo = !fileName.match(/\.(mp3|wav|flac|m4a|ogg|aac)$/i);

        // Copy media into project workspace so media preview and editing work seamlessly
        const pDir = path.join(process.cwd(), "data", "work", projectId);
        fs.mkdirSync(pDir, { recursive: true });
        const mediaDest = path.join(pDir, fileName);
        if (!fs.existsSync(mediaDest)) {
          fs.copyFileSync(absPath, mediaDest);
        }

        await db.insert(projects).values({
          id: projectId,
          name: job.name || fileName.replace(/\.[^.]+$/, ""),
          fileName: fileName,
          mimeType: isVideo ? "video/mp4" : "audio/wav",
          durationSec: durationSec > 0 ? durationSec : 60,
          sizeBytes: stat.size,
          sourceLang: detectedLang,
          targetLang: job.targetLang || "original",
          asrModel: job.asrModel || "small",
          status: "completed",
          stage: "done",
          progress: 100,
          qualityScore: 98,
        });

        // Insert subtitles
        for (let i = 0; i < subLines.length; i++) {
          const sl = subLines[i];
          await db.insert(subtitles).values({
            id: newId(),
            projectId: projectId,
            seq: i + 1,
            startMs: sl.startMs,
            endMs: sl.endMs,
            speaker: sl.speaker,
            original: sl.original,
            translation: "",
            confidence: sl.confidence,
          });
        }

        await db
          .update(batchJobs)
          .set({
            status: "completed",
            progress: 100,
            durationSec: Math.round(durationSec),
            outputSrtPath: outPath,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(batchJobs.id, job.id));

        completedCount++;
      } catch (jobErr: any) {
        await db
          .update(batchJobs)
          .set({
            status: "failed",
            errorMsg: jobErr.message || "Failed processing media",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(batchJobs.id, job.id));

        failedCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      processed: pendingJobs.length,
      completed: completedCount,
      failed: failedCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

