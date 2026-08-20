import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { projects, chunks } from "@/db/schema";
import { toProject } from "@/lib/rows";
import { log } from "@/lib/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  await db
    .update(chunks)
    .set({ status: "CANCELLED" })
    .where(and(eq(chunks.projectId, id), inArray(chunks.status, ["WAITING", "PROCESSING"])));
  const [updated] = await db
    .update(projects)
    .set({ status: "cancelled", stage: "cancelled", updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();
  log(`project.cancelled id=${id} progress=${project.progress}`);
  return NextResponse.json(toProject(updated));
}
