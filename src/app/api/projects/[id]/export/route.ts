import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, subtitles } from "@/db/schema";
import { toSub } from "@/lib/rows";
import {
  DEFAULT_ASS_STYLE,
  pickExportField,
  toAss,
  toJson,
  toSrt,
  toTxt,
  toVtt,
} from "@/lib/formats";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") || "srt").toLowerCase();
  const fieldParam = url.searchParams.get("field");
  const speakerOn = url.searchParams.get("speaker") === "1";

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const subRows = await db
    .select()
    .from(subtitles)
    .where(eq(subtitles.projectId, id))
    .orderBy(asc(subtitles.seq));

  const lines = subRows.map(toSub);
  const field =
    fieldParam === "original" || fieldParam === "translation"
      ? fieldParam
      : pickExportField(project.targetLang);

  let content: string;
  let ext: string;
  let mime: string;

  switch (format) {
    case "vtt":
      content = toVtt(lines, field, speakerOn);
      ext = "vtt";
      mime = "text/vtt; charset=utf-8";
      break;
    case "ass":
      content = toAss(lines, field, speakerOn, DEFAULT_ASS_STYLE);
      ext = "ass";
      mime = "text/x-ssa; charset=utf-8";
      break;
    case "txt":
      content = toTxt(lines, field, speakerOn, false);
      ext = "txt";
      mime = "text/plain; charset=utf-8";
      break;
    case "json":
      content = toJson(lines, field, speakerOn);
      ext = "json";
      mime = "application/json; charset=utf-8";
      break;
    default:
      content = toSrt(lines, field, speakerOn);
      ext = "srt";
      mime = "application/x-subrip; charset=utf-8";
      break;
  }

  const safeName = project.name.replace(/[/\\?%*:|"<>]/g, "_");
  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}.${ext}`)}`,
      "Cache-Control": "no-store",
    },
  });
}
