import { NextResponse } from "next/server";
import { getEngineUrl } from "@/lib/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const engineUrl = getEngineUrl();
  try {
    const res = await fetch(`${engineUrl}/remote/status`, {
      method: "GET",
      headers: {
        "user-agent": req.headers.get("user-agent") || "",
        "host": req.headers.get("host") || "",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Backend status error ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Engine unreachable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const engineUrl = getEngineUrl();
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";
    const userAgent = req.headers.get("user-agent") || "";
    const hostHeader = req.headers.get("host") || "";

    if (action === "tunnel_start") {
      const res = await fetch(`${engineUrl}/remote/tunnel/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: body.port || 3000 }),
      });
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "tunnel_stop") {
      const res = await fetch(`${engineUrl}/remote/tunnel/stop`, {
        method: "POST",
      });
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "heartbeat") {
      const res = await fetch(`${engineUrl}/remote/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "user-agent": userAgent,
          "host": hostHeader,
          "x-forwarded-for": clientIp,
        },
        body: JSON.stringify({
          device_id: body.deviceId || "unknown",
          active_task: body.activeTask || "Idle",
        }),
      });
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "block_device") {
      const res = await fetch(`${engineUrl}/remote/devices/${body.deviceId}/block`, { method: "POST" });
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "unblock_device") {
      const res = await fetch(`${engineUrl}/remote/devices/${body.deviceId}/unblock`, { method: "POST" });
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "disconnect_device") {
      const res = await fetch(`${engineUrl}/remote/devices/${body.deviceId}/disconnect`, { method: "POST" });
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "verify_pin") {
      const res = await fetch(`${engineUrl}/remote/auth/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: body.pin }),
      });
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "configure_pin") {
      const res = await fetch(`${engineUrl}/remote/auth/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ required: body.required, pin: body.pin }),
      });
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

