import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { glossary } from "@/db/schema";
import { toGlossary } from "@/lib/rows";
import { log, newId } from "@/lib/server";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db.select().from(glossary).orderBy(asc(glossary.createdAt));
  return NextResponse.json(rows.map(toGlossary));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const term = String((body as { term?: string })?.term ?? "").trim();
  const translation = String((body as { translation?: string })?.translation ?? "").trim();
  if (!term || !translation) {
    return NextResponse.json({ error: "Both term and translation are required" }, { status: 400 });
  }
  const row = { id: newId(), term, translation };
  await db.insert(glossary).values(row);
  log(`glossary.add term="${term}"`);
  return NextResponse.json(toGlossary({ ...row, createdAt: new Date().toISOString() }), { status: 201 });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.delete(glossary).where(eq(glossary.id, id));
  return NextResponse.json({ ok: true });
}
