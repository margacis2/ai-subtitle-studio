/** Server-side hardware probe (real values where available). */
import os from "node:os";
import { execFile } from "node:child_process";
import type { HardwareInfo } from "./types";

function run(cmd: string, args: string[], timeoutMs = 1600): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      if (err) resolve({ ok: false, out: "" });
      else resolve({ ok: true, out: stdout });
    });
  });
}

let cache: { at: number; data: HardwareInfo } | null = null;

export async function probeHardware(force = false): Promise<HardwareInfo> {
  const now = Date.now();
  if (cache && !force && now - cache.at < 5000) return cache.data;

  const cpus = os.cpus();
  const totalRam = os.totalmem();
  const freeRam = os.freemem();
  const load = os.loadavg()[0];

  let gpuName: string | null = null;
  let vramGb: number | null = null;
  let gpuUtil: number | null = null;
  let gpuMemUsedGb: number | null = null;
  let cudaAvailable = false;

  const gpu = await run("nvidia-smi", [
    "--query-gpu=name,memory.total,memory.used,utilization.gpu",
    "--format=csv,noheader,nounits",
  ]);
  if (gpu.ok && gpu.out.trim()) {
    const first = gpu.out.trim().split("\n")[0];
    const [name, memTotal, memUsed, util] = first.split(",").map((s) => s.trim());
    gpuName = name || null;
    vramGb = memTotal ? Math.round((Number(memTotal) / 1024) * 10) / 10 : null;
    gpuMemUsedGb = memUsed ? Math.round((Number(memUsed) / 1024) * 10) / 10 : null;
    gpuUtil = util !== undefined ? Math.max(0, Math.min(100, Number(util) || 0)) : null;
    cudaAvailable = !Number.isNaN(Number(util));
    if (Number.isNaN(Number(util))) gpuUtil = null;
  }

  const ff = await run("ffmpeg", ["-version"], 1600);
  const ffmpeg = ff.ok ? (ff.out.split("\n")[0] || "FFmpeg") : null;

  const data: HardwareInfo = {
    cpuModel: cpus[0]?.model?.replace(/\s+/g, " ").trim() || "Unknown CPU",
    cpuCores: cpus.length,
    ramGb: Math.round((totalRam / 1073741824) * 10) / 10,
    load1: Math.round(load * 10) / 10,
    usedRamGb: Math.round(((totalRam - freeRam) / 1073741824) * 10) / 10,
    freeRamGb: Math.round((freeRam / 1073741824) * 10) / 10,
    gpuName,
    vramGb,
    cudaAvailable,
    gpuUtil,
    gpuMemUsedGb,
    ffmpeg,
    nodeVersion: process.version,
  };
  cache = { at: now, data };
  return data;
}
