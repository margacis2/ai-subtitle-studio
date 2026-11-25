import { NextResponse } from "next/server";
import { getLocalEngineUrl, ensureBackendRunning, isBackendAlive, checkRemoteAccess } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await checkRemoteAccess(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const { model_id = "small", audio_path = null } = body;

    const engineUrl = getLocalEngineUrl();
    const alive = await isBackendAlive(engineUrl);
    if (!alive) {
      const started = await ensureBackendRunning(engineUrl);
      if (!started) {
        return NextResponse.json(
          { error: `Local AI backend is offline at ${engineUrl}. Please start it with start.bat.` },
          { status: 503 }
        );
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    let res: Response;
    try {
      res = await fetch(`${engineUrl}/benchmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id, audio_path }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json({ error: `Benchmark failed (${res.status}): ${errText}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError";
    return NextResponse.json(
      { error: isTimeout ? "Benchmark timed out after 3 minutes" : err.message || "Benchmark failed" },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
