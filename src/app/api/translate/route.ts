import { NextResponse } from "next/server";
import { getEngineUrl, getEngineToken, isBackendAlive, ensureBackendRunning, checkRemoteAccess, isRemoteEngine } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await checkRemoteAccess(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.texts) || body.texts.length === 0) {
      return NextResponse.json({ error: "texts array required" }, { status: 400 });
    }
    const { texts, source_lang = "ja", target_lang = "en", engine = "nllb" } = body;

    const engineUrl = getEngineUrl();
    const remote = isRemoteEngine();
    if (!(await isBackendAlive(engineUrl))) {
      const started = remote ? false : await ensureBackendRunning(engineUrl);
      if (!started) {
        return NextResponse.json(
          {
            error: remote
              ? `Google Colab backend is offline at ${engineUrl}. Verify Cell 3 is still running in Colab.`
              : `Local AI backend is offline at ${engineUrl}. Please start it with start.bat.`,
          },
          { status: 503 }
        );
      }
    }

    const engineToken = getEngineToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (engineToken) {
      headers["Authorization"] = `Bearer ${engineToken}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    let response: Response;
    try {
      response = await fetch(`${engineUrl}/translate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ texts, source_lang, target_lang, engine }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `Translation server error (${response.status}): ${err || "Unknown error"}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "AbortError";
    const msg = isTimeout
      ? "Translation request timed out after 3 minutes."
      : e instanceof Error
      ? e.message
      : "Failed to connect to local translation engine";
    return NextResponse.json({ error: msg }, { status: isTimeout ? 504 : 500 });
  }
}
