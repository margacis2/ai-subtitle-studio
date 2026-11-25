import { NextResponse } from "next/server";
import { getLocalEngineUrl, ensureBackendRunning, isBackendAlive } from "@/lib/server";

export const runtime = "nodejs";

function extractClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "127.0.0.1"
  );
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function forwardJson(res: Response) {
  const data = await res.json().catch(() => ({ ok: false, error: `Invalid JSON response (${res.status})` }));
  if (!res.ok) {
    const errMsg = data?.detail || data?.error || `Request failed (${res.status})`;
    return NextResponse.json({ ok: false, ...data, error: errMsg }, { status: res.status });
  }
  return NextResponse.json(data, { status: res.status });
}

export async function GET(req: Request) {
  const engineUrl = getLocalEngineUrl();
  try {
    if (!(await isBackendAlive(engineUrl))) {
      await ensureBackendRunning(engineUrl);
    }
    const res = await fetchWithTimeout(`${engineUrl}/remote/status`, {
      method: "GET",
      headers: {
        "user-agent": req.headers.get("user-agent") || "",
        host: req.headers.get("host") || "",
      },
      cache: "no-store",
    });
    return forwardJson(res);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Engine unreachable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const engineUrl = getLocalEngineUrl();
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    const clientIp = extractClientIp(req);
    const userAgent = req.headers.get("user-agent") || "";
    const hostHeader = req.headers.get("host") || "";

    if (action === "tunnel_start") {
      const targetPort = Number(body.port || process.env.PORT || 3000);
      const res = await fetchWithTimeout(`${engineUrl}/remote/tunnel/start?port=${encodeURIComponent(String(targetPort))}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: targetPort }),
      }, 25000);
      return forwardJson(res);
    }

    if (action === "tunnel_stop") {
      const res = await fetchWithTimeout(`${engineUrl}/remote/tunnel/stop`, { method: "POST" });
      return forwardJson(res);
    }

    if (action === "heartbeat") {
      const res = await fetchWithTimeout(`${engineUrl}/remote/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "user-agent": userAgent,
          host: hostHeader,
          "x-forwarded-for": clientIp,
        },
        body: JSON.stringify({
          device_id: body.deviceId || "unknown",
          active_task: body.activeTask || "Idle",
        }),
      });
      return forwardJson(res);
    }

    if (action === "block_device") {
      if (!body.deviceId) return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
      const res = await fetchWithTimeout(`${engineUrl}/remote/devices/${encodeURIComponent(body.deviceId)}/block`, { method: "POST" });
      return forwardJson(res);
    }

    if (action === "unblock_device") {
      if (!body.deviceId) return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
      const res = await fetchWithTimeout(`${engineUrl}/remote/devices/${encodeURIComponent(body.deviceId)}/unblock`, { method: "POST" });
      return forwardJson(res);
    }

    if (action === "disconnect_device") {
      if (!body.deviceId) return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
      const res = await fetchWithTimeout(`${engineUrl}/remote/devices/${encodeURIComponent(body.deviceId)}/disconnect`, { method: "POST" });
      return forwardJson(res);
    }

    if (action === "verify_pin") {
      const res = await fetchWithTimeout(`${engineUrl}/remote/auth/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: String(body.pin ?? "") }),
      });
      return forwardJson(res);
    }

    if (action === "configure_pin") {
      const res = await fetchWithTimeout(`${engineUrl}/remote/auth/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ required: Boolean(body.required), pin: body.pin }),
      });
      return forwardJson(res);
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Remote management error" }, { status: 500 });
  }
}
