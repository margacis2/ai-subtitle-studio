import { NextResponse } from "next/server";
import { db } from "@/db";
import { batchJobs, projects, subtitles } from "@/db/schema";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { toSrt } from "@/lib/formats";
import { newId, getEngineUrl, getEngineToken, isRemoteEngine, isBackendAlive, ensureBackendRunning, checkRemoteAccess, projectUploadDir } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await checkRemoteAccess(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const pendingJobs = await db
      .select()
      .from(batchJobs)
      .where(eq(batchJobs.status, "pending"));

    if (pendingJobs.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, completed: 0, failed: 0, message: "No pending jobs found" });
    }

    const engineUrl = getEngineUrl();
    const remote = isRemoteEngine();
    if (!(await isBackendAlive(engineUrl))) {
      const started = remote ? false : await ensureBackendRunning(engineUrl);
      if (!started) {
        return NextResponse.json(
          {
            error: remote
              ? `Google Colab backend is offline at ${engineUrl}. Verify Cell 3 is running.`
              : `Local AI backend is offline at ${engineUrl}. Please start it with start.bat.`,
          },
          { status: 503 }
        );
      }
    }

    const token = getEngineToken();
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

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
        if (remote) {
          const stat = fs.statSync(absPath);
          if (stat.size > 95 * 1024 * 1024) {
            throw new Error(`Batch remote upload exceeds 95 MB Cloudflare limit (${Math.round(stat.size / 1048576)} MB). Use Transcribe workflow for large files—it extracts and chunks audio automatically.`);
          }
          form.append("file", new Blob([fs.readFileSync(absPath)]), path.basename(absPath));
        } else {
          form.append("file_path", absPath);
        }
        form.append("source_lang", job.sourceLang || "auto");
        form.append("model_id", job.asrModel || "small");
        form.append("word_timestamps", "true");
        form.append("vad_filter", "true");

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 300000);
        let res: Response;
        try {
          res = await fetch(`${engineUrl}/transcribe`, {
            method: "POST",
            headers: authHeaders,
            body: form,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        if (!res.ok) {
          const errDetail = await res.text().catch(() => "");
          throw new Error(`ASR engine error (${res.status}): ${errDetail}`);
        }

        const data = await res.json();
        const segments = data.segments || [];
        const detectedLang = data.language || job.sourceLang || "en";
        const durationSec = Number(data.duration) || 0;

        // Format into SubLine array (backend returns 0..100 confidence)
        const subLines = segments.map((s: any, idx: number) => {
          const rawConf = Number(s.confidence ?? 95);
          const conf = rawConf > 1 ? Math.round(rawConf) : Math.round(rawConf * 100);
          return {
            id: String(idx + 1),
            seq: idx + 1,
            startMs: typeof s.startMs === "number" ? s.startMs : Math.round((s.start || 0) * 1000),
            endMs: typeof s.endMs === "number" ? s.endMs : Math.round((s.end || 0) * 1000),
            original: s.original || s.text || "",
            translation: "",
            speaker: s.speaker || null,
            confidence: conf,
            kind: "speech" as const,
          };
        });

        // Optional Stage 2 translation in batch
        const targetLang = job.targetLang || "original";
        if (targetLang !== "original" && targetLang !== detectedLang && subLines.length > 0) {
          // Unload ASR before translation to preserve 4GB VRAM on local host
          if (!remote) {
            await fetch(`${engineUrl}/release-memory`, { method: "POST" }).catch(() => null);
          }
          const transRes = await fetch(`${engineUrl}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              texts: subLines.map((l: any) => l.original),
              source_lang: detectedLang,
              target_lang: targetLang,
              engine: "nllb",
            }),
          });
          if (transRes.ok) {
            const tData = await transRes.json();
            const translated: string[] = tData.translations || [];
            subLines.forEach((l: any, i: number) => {
              l.translation = translated[i] || l.original;
            });
          }
        }

        const exportField = targetLang !== "original" && targetLang !== detectedLang ? "translation" : "original";
        const srtContent = toSrt(subLines, exportField, false);

        // Save SRT file next to the media
        let outPath = "";
        try {
          const dir = path.dirname(absPath);
          const ext = path.extname(absPath);
          const base = path.basename(absPath, ext);
          outPath = path.join(dir, `${base}.srt`);
          fs.writeFileSync(outPath, srtContent, "utf-8");
        } catch {
          outPath = path.join(process.cwd(), "data", "work", `batch_${job.id}.srt`);
          fs.writeFileSync(outPath, srtContent, "utf-8");
        }

        // Register project in local database so user can open it in the Subtitle Editor & stream media
        const projectId = newId();
        const stat = fs.statSync(absPath);
        const fileName = path.basename(absPath);
        const isVideo = !fileName.match(/\.(mp3|wav|flac|m4a|ogg|aac|opus|wma)$/i);

        const uploadDestDir = projectUploadDir(projectId);
        const mediaDest = path.join(uploadDestDir, fileName);
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
          targetLang,
          asrModel: job.asrModel || "small",
          status: "completed",
          stage: "done",
          progress: 100,
          qualityScore: 98,
        });

        if (subLines.length > 0) {
          await db.insert(subtitles).values(
            subLines.map((sl: any, i: number) => ({
              id: newId(),
              projectId,
              seq: i + 1,
              startMs: sl.startMs,
              endMs: sl.endMs,
              speaker: sl.speaker,
              original: sl.original,
              translation: sl.translation,
              confidence: sl.confidence,
              kind: "speech",
            }))
          );
        }

        await db
          .update(batchJobs)
          .set({
            status: "completed",
            progress: 100,
            durationSec: Math.round(durationSec),
            projectId,
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
