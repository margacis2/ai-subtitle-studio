import { NextResponse } from "next/server";
import { getEngineUrl, getEngineToken } from "@/lib/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const currentUrl = getEngineUrl();
  const currentToken = getEngineToken();
  const isColab = !currentUrl.includes("127.0.0.1") && !currentUrl.includes("localhost");

  // Ping the engine
  let online = false;
  let latencyMs: number | null = null;
  let modelInfo = "Unknown";
  let device = "unknown";
  try {
    const t0 = Date.now();
    const headers: Record<string, string> = {};
    if (currentToken) {
      headers["Authorization"] = `Bearer ${currentToken}`;
    }
    const res = await fetch(`${currentUrl}/health`, { method: "GET", headers }).catch(() => null);
    latencyMs = Date.now() - t0;
    if (res && res.ok) {
      online = true;
      const data = await res.json().catch(() => ({}));
      modelInfo = data.whisper_model || "Connected";
      device = data.device || "unknown";
    }
  } catch {
    online = false;
  }

  return NextResponse.json({
    engineUrl: currentUrl,
    hasToken: Boolean(currentToken),
    isColab,
    online,
    latencyMs,
    modelInfo,
    device,
  });
}

export async function POST(req: Request) {
  try {
    const { url, token } = await req.json();
    const cleanUrl = typeof url === "string" ? url.trim().replace(/\/+$/, "") : "";
    const cleanToken = typeof token === "string" ? token.trim() : "";

    // Update in-memory process.env
    if (cleanUrl) {
      process.env.COLAB_URL = cleanUrl;
    } else {
      delete process.env.COLAB_URL;
    }

    if (cleanToken) {
      process.env.COLAB_API_TOKEN = cleanToken;
    } else if (token !== undefined) {
      delete process.env.COLAB_API_TOKEN;
    }

    // Persist to .env file so it survives restarts
    const envPath = path.join(process.cwd(), ".env");
    let content = "";
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf-8");
    }

    const lines = content.split("\n").filter((l) => !l.startsWith("COLAB_URL=") && !l.startsWith("COLAB_API_TOKEN="));
    if (cleanUrl) {
      lines.push(`COLAB_URL=${cleanUrl}`);
    }
    if (cleanToken) {
      lines.push(`COLAB_API_TOKEN=${cleanToken}`);
    }
    fs.writeFileSync(envPath, lines.join("\n").trim() + "\n", "utf-8");

    return NextResponse.json({
      ok: true,
      engineUrl: cleanUrl || "http://127.0.0.1:8001",
      hasToken: Boolean(cleanToken),
      isColab: Boolean(cleanUrl),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update engine URL";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


