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

  for (const l of lines) {
    if (typeof l !== "object" || l === null || !Number.isFinite(Number(l.startMs)) || !Number.isFinite(Number(l.endMs))) {
      return NextResponse.json({ error: "Each line requires finite numeric startMs and endMs" }, { status: 400 });
    }
  }

  try {
    const sorted = [...lines].sort((a, b) => Number(a.startMs) - Number(b.startMs) || Number(a.endMs) - Number(b.endMs));
    db.transaction((tx) => {
      tx.delete(subtitles).where(eq(subtitles.projectId, id)).run();
      if (sorted.length > 0) {
        tx.insert(subtitles)
          .values(
            sorted.map((l, i) => {
              const startMs = Math.max(0, Math.round(Number(l.startMs)));
              const endMs = Math.max(startMs, Math.round(Number(l.endMs)));
              return {
                id: l.id || newId(),
                projectId: id,
                seq: i + 1,
                startMs,
                endMs,
                speaker: l.speaker ?? null,
                original: String(l.original ?? ""),
                translation: String(l.translation ?? ""),
                confidence: Number.isFinite(Number(l.confidence)) ? Number(l.confidence) : 0,
                kind: l.kind === "event" ? "event" : "speech",
              };
            }),
          )
          .run();
      }
      tx.update(projects)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(projects.id, id))
        .run();
    });
    log(`subtitles.saved project=${id} count=${sorted.length}`);
    return NextResponse.json({ ok: true, count: sorted.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save subtitles";
    log(`subtitles.save_error project=${id} err=${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await db.delete(subtitles).where(and(eq(subtitles.projectId, id)));
  return NextResponse.json({ ok: true });
}
