import { NextResponse } from "next/server";
import { getLocalEngineUrl, isRemoteEngine, isBackendAlive, ensureBackendRunning, checkRemoteAccess } from "@/lib/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const engineUrl = getLocalEngineUrl();
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "asr";

  try {
    const endpoint = type === "translation" ? `${engineUrl}/models/translation` : `${engineUrl}/models`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let res: Response | null = null;
    try {
      res = await fetch(endpoint, { method: "GET", signal: controller.signal, cache: "no-store" });
    } catch {
      res = null;
    } finally {
      clearTimeout(timer);
    }

    if (!res || !res.ok) {
      if (type === "translation") {
        return NextResponse.json({
          online: false,
          error: "Local Python AI engine is offline on port 8001.",
          models: [
            {
              id: "opus-mt-ja-en",
              name: "OPUS-MT Japanese → English",
              source_lang: "ja",
              target_lang: "en",
              size_mb: 312,
              vram_gb: 0.8,
              ram_gb: 1.5,
              installed: false,
              status: "available",
              description: "High-accuracy neural translation for Japanese anime and dialogue to English.",
            },
          ],
        });
      }
      return NextResponse.json({
        online: false,
        error: "Local Python AI engine is offline on port 8001.",
        models: [
          {
            id: "small",
            name: "Faster-Whisper Small (Recommended)",
            size_mb: 460,
            vram_gb: 1.6,
            ram_gb: 3.0,
            installed: false,
            status: "available",
            description: "Recommended for 4 GB GPUs (RTX 3050) & CPU fallback.",
          },
        ],
      });
    }
    const data = await res.json();
    return NextResponse.json({ online: true, ...data });
  } catch (err: any) {
    return NextResponse.json({ online: false, error: err.message, models: [] });
  }
}

export async function POST(req: Request) {
  const engineUrl = getLocalEngineUrl();
  try {
    const auth = await checkRemoteAccess(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { modelId, action = "download", type = "asr" } = await req.json();
    if (!modelId) {
      return NextResponse.json({ error: "modelId required" }, { status: 400 });
    }

    if (action === "unload" && isRemoteEngine()) {
      return NextResponse.json({
        ok: true,
        message: "Remote Colab backend manages VRAM cleanup automatically.",
      });
    }

    if (!(await isBackendAlive(engineUrl))) {
      const started = await ensureBackendRunning(engineUrl);
      if (!started) {
        return NextResponse.json(
          { error: `Local AI backend is offline at ${engineUrl}. Please start it with start.bat.` },
          { status: 503 }
        );
      }
    }

    const safeId = encodeURIComponent(String(modelId));
    const basePath = type === "translation" ? `${engineUrl}/models/translation` : `${engineUrl}/models`;

    const controller = new AbortController();
    const timeoutMs = action === "test" ? 120000 : 30000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      if (action === "unload") {
        res = await fetch(`${engineUrl}/release-memory`, { method: "POST", signal: controller.signal });
      } else if (action === "delete") {
        res = await fetch(`${basePath}/${safeId}`, { method: "DELETE", signal: controller.signal });
      } else if (action === "test" && type !== "translation") {
        res = await fetch(`${basePath}/${safeId}/test`, { method: "POST", signal: controller.signal });
      } else {
        res = await fetch(`${basePath}/${safeId}/download`, { method: "POST", signal: controller.signal });
      }
    } finally {
      clearTimeout(timer);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errDetail =
        (typeof data?.detail === "object" ? data.detail?.error || data.detail?.message : data?.detail) ||
        data?.error ||
        `Backend error (${res.status})`;
      return NextResponse.json({ ok: false, ...data, error: errDetail }, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError";
    return NextResponse.json(
      { error: isTimeout ? "Model operation timed out" : err.message || "Model operation failed" },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
