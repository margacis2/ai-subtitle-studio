import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { LOG_DIR, ensureDirs } from "@/lib/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    ensureDirs();
    const logFile = path.join(LOG_DIR, "application.log");
    if (!fs.existsSync(logFile)) {
      return NextResponse.json({ lines: [] });
    }
    const content = fs.readFileSync(logFile, "utf8");
    const allLines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    // Return the last 300 lines
    const recent = allLines.slice(-300);
    return NextResponse.json({ lines: recent, total: allLines.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    ensureDirs();
    const logFile = path.join(LOG_DIR, "application.log");
    if (fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, `[${new Date().toISOString()}] Logs cleared by user\n`, "utf8");
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

