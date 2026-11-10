import { NextResponse } from "next/server";
import { db } from "@/db";
import { batchJobs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { newId, log } from "@/lib/server";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db.select().from(batchJobs).orderBy(desc(batchJobs.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { items, defaultModel = "small", sourceLang = "auto", targetLang = "en" } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items array is required" }, { status: 400 });
    }

    const created = [];
    for (const it of items) {
      const id = newId();
      const job = {
        id,
        name: it.name || "Untitled media",
        filePath: it.filePath || "",
        fileSize: Number(it.fileSize) || 0,
        durationSec: Number(it.durationSec) || 0,
        sourceLang: it.sourceLang || sourceLang,
        targetLang: it.targetLang || targetLang,
        asrModel: it.asrModel || defaultModel,
        status: "pending",
        progress: 0,
      };
      await db.insert(batchJobs).values(job);
      created.push(job);
    }

    log(`batch.queued items=${created.length}`);
    return NextResponse.json({ ok: true, jobs: created }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, status, progress, errorMsg, outputSrtPath } = body;
    if (!id) {
      return NextResponse.json({ error: "Job id required" }, { status: 400 });
    }

    const patch: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (status) patch.status = status;
    if (progress !== undefined) patch.progress = progress;
    if (errorMsg !== undefined) patch.errorMsg = errorMsg;
    if (outputSrtPath) patch.outputSrtPath = outputSrtPath;

    await db.update(batchJobs).set(patch).where(eq(batchJobs.id, id));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      // Clear all completed/failed
      await db.delete(batchJobs);
      return NextResponse.json({ ok: true, clearedAll: true });
    }
    await db.delete(batchJobs).where(eq(batchJobs.id, id));
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

