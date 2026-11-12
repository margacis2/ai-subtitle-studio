import { NextResponse } from "next/server";
import { getEngineUrl } from "@/lib/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const engineUrl = getEngineUrl();
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "asr";

  try {
    const endpoint = type === "translation" ? `${engineUrl}/models/translation` : `${engineUrl}/models`;
    const res = await fetch(endpoint, { method: "GET" }).catch(() => null);
    if (!res || !res.ok) {
      if (type === "translation") {
        return NextResponse.json({
          online: false,
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
              description: "High-accuracy neural translation for Japanese anime and dialogue to English."
            }
          ]
        });
      }
      return NextResponse.json({
        online: false,
        models: [
          {
            id: "small",
            name: "Faster-Whisper Small (Recommended)",
            size_mb: 460,
            vram_gb: 1.6,
            ram_gb: 3.0,
            installed: true,
            status: "installed",
            description: "Recommended for 4 GB GPUs (RTX 3050) & CPU fallback."
          }
        ]
      });
    }
    const data = await res.json();
    return NextResponse.json({ online: true, ...data });
  } catch (err: any) {
    return NextResponse.json({ online: false, error: err.message });
  }
}

export async function POST(req: Request) {
  const engineUrl = getEngineUrl();
  try {
    const { modelId, action = "download", type = "asr" } = await req.json();
    if (!modelId) {
      return NextResponse.json({ error: "modelId required" }, { status: 400 });
    }

    const basePath = type === "translation" ? `${engineUrl}/models/translation` : `${engineUrl}/models`;

    if (action === "unload") {
      const res = await fetch(`${engineUrl}/release-memory`, { method: "POST" });
      const data = await res.json();
      return NextResponse.json(data);
    } else if (action === "delete") {
      const res = await fetch(`${basePath}/${modelId}`, { method: "DELETE" });
      const data = await res.json();
      return NextResponse.json(data);
    } else if (action === "test" && type !== "translation") {
      const res = await fetch(`${basePath}/${modelId}/test`, { method: "POST" });
      const data = await res.json();
      return NextResponse.json(data);
    } else {
      const res = await fetch(`${basePath}/${modelId}/download`, { method: "POST" });
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

