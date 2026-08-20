import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, subtitles } from "@/db/schema";
import { log, newId } from "@/lib/server";
import type { SubLine } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Bulk-save the edited subtitle list (editor autosave / explicit save). */
export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const lines = (body as { lines?: SubLine[] })?.lines;
  if (!Array.isArray(lines)) {
    return NextResponse.json({ error: "Expected { lines: [] }" }, { status: 400 });
  }
  if (lines.length > 20000) {
    return NextResponse.json({ error: "Too many lines" }, { status: 413 });
  }

  const sorted = [...lines].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  await db.delete(subtitles).where(eq(subtitles.projectId, id));
  if (sorted.length > 0) {
    await db.insert(subtitles).values(
      sorted.map((l, i) => ({
        id: l.id || newId(),
        projectId: id,
        seq: i + 1,
        startMs: Math.max(0, Math.round(l.startMs)),
        endMs: Math.max(0, Math.round(l.endMs)),
        speaker: l.speaker ?? null,
        original: l.original ?? "",
        translation: l.translation ?? "",
        confidence: l.confidence ?? 0,
        kind: l.kind === "event" ? "event" : "speech",
      })),
    );
  }
  const [updated] = await db
    .update(projects)
    .set({ updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();
  void updated;
  log(`subtitles.saved project=${id} count=${sorted.length}`);
  return NextResponse.json({ ok: true, count: sorted.length });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await db.delete(subtitles).where(and(eq(subtitles.projectId, id)));
  return NextResponse.json({ ok: true });
}
