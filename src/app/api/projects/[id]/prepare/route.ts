import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { extractWav, energyVad, hasFfmpeg } from "@/lib/audio";
import { hashSeed } from "@/lib/demo";
import { log, projectUploadDir, projectWorkDir } from "@/lib/server";
import type { VadSummary } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let vad: VadSummary | null = null;
  let note = "";
  const mediaPath = path.join(projectUploadDir(id), project.fileName);

  if (project.vadEnabled) {
    const useFfmpeg = hasFfmpeg() && fs.existsSync(mediaPath);
    if (useFfmpeg) {
      const wavPath = path.join(projectWorkDir(id), "audio_full.wav");
      const t0 = Date.now();
      const ok = await extractWav(mediaPath, wavPath);
      if (ok) {
        const er = energyVad(ok);
        if (er) {
          vad = {
            real: true,
            speechRatio: er.speechRatio,
            speechSec: er.speechSec,
            intervals: er.intervals,
            events: project.nonSpeechEvents ? Math.max(1, Math.round(project.durationSec * 0.004)) : 0,
          };
          note = `Audio extracted (${((Date.now() - t0) / 1000).toFixed(1)}s), energy VAD on real PCM.`;
          log(`prepare.real id=${id} vadSpeechRatio=${vad.speechRatio}`);
        }
      }
    }
    if (!vad) {
      const r = hashSeed(id + ":vad");
      const ratio = 0.4 + ((r % 1000) / 1000) * 0.25;
      vad = {
        real: false,
        speechRatio: Math.round(ratio * 100) / 100,
        speechSec: Math.round(project.durationSec * ratio),
        intervals: Math.max(2, Math.round(project.durationSec * ratio * 0.08)),
        events: project.nonSpeechEvents ? Math.max(1, Math.round(project.durationSec * 0.004)) : 0,
      };
      note = "Using fallback signal model.";
      log(`prepare.fallback id=${id} ratio=${vad.speechRatio}`);
    }
  } else {
    vad = { real: false, speechRatio: 0, speechSec: 0, intervals: 0, events: 0 };
    note = "VAD disabled by user.";
  }

  const patch: Record<string, unknown> = {
    vadJson: JSON.stringify(vad),
    stage: "asr",
    progress: Math.max(8, project.progress),
    updatedAt: new Date(),
  };

  if (!project.startedAt) patch.startedAt = new Date();
  if (project.status === "pending" || project.status === "ready") patch.status = "processing";

  const [updated] = await db.update(projects).set(patch).where(eq(projects.id, id)).returning();
  if (!updated) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  return NextResponse.json({ vad: vad!, note, status: updated.status });
}