import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { projectUploadDir, projectWorkDir } from "@/lib/server";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
  ".m4v": "video/mp4",
  ".mpg": "video/mpeg",
  ".mpeg": "video/mpeg",
  ".ts": "video/mp2t",
  ".wmv": "video/x-ms-wmv",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
  ".opus": "audio/opus",
  ".wma": "audio/x-ms-wma",
  ".srt": "application/x-subrip",
  ".ass": "text/x-ssa",
  ".vtt": "text/vtt",
};

type Params = { params: Promise<{ id: string }> };

/**
 * Stream the uploaded media (or a generated output like *_subtitled.mp4)
 * with HTTP Range support so video seeking works in the preview player.
 */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const f = url.searchParams.get("f");
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return new Response("Not found", { status: 404 });

  let filePath: string;
  let base: string;
  if (!f) {
    base = project.fileName;
    filePath = path.join(projectUploadDir(id), base);
  } else if (/^[a-zA-Z0-9._-]{1,160}$/.test(f) && /_subtitled(_\d+)?\.mp4$/i.test(f)) {
    base = f;
    filePath = path.join(projectUploadDir(id), f);
  } else {
    return new Response("Forbidden file", { status: 403 });
  }
  void projectWorkDir; // work dir reserved for temp files only

  if (!fs.existsSync(filePath)) return new Response("Not found", { status: 404 });
  const stat = fs.statSync(filePath);
  const mime = MIME[path.extname(base).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.get("range");

  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
      if (start >= stat.size || end < start) {
        return new Response("Range not satisfiable", { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
      }
      const buf = Buffer.alloc(end - start + 1);
      const fh = fs.openSync(filePath, "r");
      try {
        fs.readSync(fh, buf, 0, end - start + 1, start);
      } finally {
        fs.closeSync(fh);
      }
      return new Response(new Uint8Array(buf), {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
          "Content-Type": mime,
        },
      });
    }
  }
  const buf = fs.readFileSync(filePath);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(stat.size),
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(base)}"`,
    },
  });
}
