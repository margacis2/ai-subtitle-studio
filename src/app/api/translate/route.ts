import { NextResponse } from "next/server";
import { getEngineUrl, getEngineToken } from "@/lib/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { texts, source_lang = "ja", target_lang = "en" } = body;

    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json({ error: "texts array required" }, { status: 400 });
    }

    const engineUrl = getEngineUrl();
    const engineToken = getEngineToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (engineToken) {
      headers["Authorization"] = `Bearer ${engineToken}`;
    }

    const response = await fetch(`${engineUrl}/translate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        texts,
        source_lang,
        target_lang,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Translation server error: ${err}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to connect to local translation engine";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

