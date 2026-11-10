import { NextResponse } from "next/server";
import { db } from "@/db";
import { batchJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { toSrt } from "@/lib/formats";

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

        const form = new FormData();
        form.append("source_lang", job.sourceLang || "auto");
        form.append("target_lang", job.targetLang || "original");
        form.append("model_id", job.asrModel || "small");
        form.append("word_timestamps", "false");

        if (job.filePath && fs.existsSync(job.filePath)) {
          form.append("file_path", job.filePath);
        } else {
          throw new Error(`File not found on disk: ${job.filePath}`);
        }

        const res = await fetch(`${BACKEND_URL}/transcribe`, {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          const errDetail = await res.text();
          throw new Error(`Transcription failed: ${errDetail}`);
        }

        const data = await res.json();
        const segments = data.segments || [];

        // Format into SubLine array for toSrt
        const subLines = segments.map((s: any, idx: number) => ({
          id: idx + 1,
          startMs: Math.round(s.start * 1000),
          endMs: Math.round(s.end * 1000),
          original: s.original || s.text || "",
          translation: s.translation || "",
          speaker: s.speaker || "",
        }));

        const srtContent = toSrt(subLines, job.targetLang === "original" ? "original" : "translation", false);

        // Save SRT file next to the original media or in an exports folder
        let outPath = "";
        try {
          const dir = path.dirname(job.filePath);
          const ext = path.extname(job.filePath);
          const base = path.basename(job.filePath, ext);
          outPath = path.join(dir, `${base}_${job.targetLang}.srt`);
          fs.writeFileSync(outPath, srtContent, "utf-8");
        } catch {
          outPath = path.join(process.cwd(), `batch_${job.id}_${job.targetLang}.srt`);
          fs.writeFileSync(outPath, srtContent, "utf-8");
        }

        await db
          .update(batchJobs)
          .set({
            status: "completed",
            progress: 100,
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

