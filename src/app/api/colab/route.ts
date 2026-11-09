import { NextResponse } from "next/server";
import { getEngineUrl } from "@/lib/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const currentUrl = getEngineUrl();
  const isColab = !currentUrl.includes("127.0.0.1") && !currentUrl.includes("localhost");

  // Ping the engine
  let online = false;
  let latencyMs: number | null = null;
  let modelInfo = "Unknown";
  try {
    const t0 = Date.now();
    const res = await fetch(`${currentUrl}/health`, { method: "GET" }).catch(() => null);
    latencyMs = Date.now() - t0;
    if (res && res.ok) {
      online = true;
      const data = await res.json().catch(() => ({}));
      modelInfo = data.whisper_model || "Connected";
    }
  } catch {
    online = false;
  }

  return NextResponse.json({
    engineUrl: currentUrl,
    isColab,
    online,
    latencyMs,
    modelInfo,
  });
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const clean = typeof url === "string" ? url.trim().replace(/\/+$/, "") : "";

    // Update in-memory process.env
    if (clean) {
      process.env.COLAB_URL = clean;
    } else {
      delete process.env.COLAB_URL;
    }

    // Persist to .env file so it survives restarts
    const envPath = path.join(process.cwd(), ".env");
    let content = "";
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf-8");
    }

    const lines = content.split("\n").filter((l) => !l.startsWith("COLAB_URL="));
    if (clean) {
      lines.push(`COLAB_URL=${clean}`);
    }
    fs.writeFileSync(envPath, lines.join("\n").trim() + "\n", "utf-8");

    return NextResponse.json({
      ok: true,
      engineUrl: clean || "http://127.0.0.1:8001",
      isColab: Boolean(clean),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update engine URL";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

