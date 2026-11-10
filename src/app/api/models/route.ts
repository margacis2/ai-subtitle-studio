import { NextResponse } from "next/server";
import { getEngineUrl } from "@/lib/server";

export const runtime = "nodejs";

export async function GET() {
  const engineUrl = getEngineUrl();
  try {
    const res = await fetch(`${engineUrl}/models`, { method: "GET" }).catch(() => null);
    if (!res || !res.ok) {
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
    const { modelId, action = "download" } = await req.json();
    if (!modelId) {
      return NextResponse.json({ error: "modelId required" }, { status: 400 });
    }

    if (action === "delete") {
      const res = await fetch(`${engineUrl}/models/${modelId}`, { method: "DELETE" });
      const data = await res.json();
      return NextResponse.json(data);
    } else {
      const res = await fetch(`${engineUrl}/models/${modelId}/download`, { method: "POST" });
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

