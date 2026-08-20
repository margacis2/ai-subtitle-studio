import { NextResponse } from "next/server";
import { probeHardware } from "@/lib/hardware";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  const hw = await probeHardware(force);
  return NextResponse.json(hw);
}
