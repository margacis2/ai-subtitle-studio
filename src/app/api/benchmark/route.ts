import { NextResponse } from "next/server";
import { getEngineUrl, ensureBackendRunning, isBackendAlive } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { model_id = "small", audio_path = null } = body;

    const engineUrl = getEngineUrl();
    const alive = await isBackendAlive(engineUrl);
    if (!alive) {
      await ensureBackendRunning();
    }

    const res = await fetch(`${engineUrl}/benchmark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id, audio_path }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Benchmark failed: ${errText}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Benchmark failed" }, { status: 500 });
  }
}

