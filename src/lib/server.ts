/** Server-only helpers: paths, logging, file safety. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();

export const DATA_DIR = path.join(ROOT, "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const WORK_DIR = path.join(DATA_DIR, "work");
export const LOG_DIR = path.join(ROOT, "logs");

export function ensureDirs() {
  for (const d of [DATA_DIR, UPLOAD_DIR, WORK_DIR, LOG_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export function projectUploadDir(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = path.join(UPLOAD_DIR, safe);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function projectWorkDir(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = path.join(WORK_DIR, safe);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function safeBaseName(name: string): string {
  const base = path.basename(name).replace(/[/\\]/g, "");
  if (base.length <= 160) return base;
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  return stem.slice(0, Math.max(1, 160 - ext.length)) + ext;
}

const ALLOWED_EXT = new Set([
  ".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4v", ".mpg", ".mpeg", ".ts", ".wmv",
  ".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".opus", ".wma",
  ".3gp", ".3gpp", ".amr", ".m4b", ".weba", ".caf", ".ogv", ".oga", ".asf",
]);

export function isAllowedMedia(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return ALLOWED_EXT.has(ext) || !ext; // Allow if extension matches or empty (will be auto-probed)
}

export function log(msg: string) {
  try {
    ensureDirs();
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(path.join(LOG_DIR, "application.log"), line, "utf8");
  } catch {
    // logging must never break the pipeline
  }
}

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export function getLocalEngineUrl(): string {
  const port = (process.env.STUDIO_PORT || "8001").trim() || "8001";
  return `http://127.0.0.1:${port}`;
}

export function isRemoteEngine(): boolean {
  return Boolean((process.env.COLAB_URL || process.env.REMOTE_ASR_URL || "").trim());
}

export function getEngineUrl(): string {
  const custom = process.env.COLAB_URL || process.env.REMOTE_ASR_URL;
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, "");
  }
  return getLocalEngineUrl();
}

export function getEngineToken(): string {
  return (process.env.COLAB_API_TOKEN || process.env.COLAB_TOKEN || "").trim();
}

export async function isBackendAlive(url = getEngineUrl()): Promise<boolean> {
  try {
    const isRemote = !url.includes("127.0.0.1") && !url.includes("localhost");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), isRemote ? 5000 : 1500);
    const res = await fetch(`${url}/health`, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

let startingBackendPromise: Promise<boolean> | null = null;

export async function ensureBackendRunning(targetUrl = getEngineUrl()): Promise<boolean> {
  const url = targetUrl;
  const isRemote = !url.includes("127.0.0.1") && !url.includes("localhost");
  if (await isBackendAlive(url)) {
    return true;
  }
  // Never spawn local python when probing a remote Colab / WAN engine URL
  if (isRemote) {
    return false;
  }

  // If already launching, await existing startup
  if (startingBackendPromise) {
    return startingBackendPromise;
  }

  startingBackendPromise = (async () => {
    try {
      const { spawn } = await import("node:child_process");
      const rootDir = process.cwd();
      let pythonExecutable = process.platform === "win32" ? "python" : "python3";
      if (process.platform === "win32") {
        const candidates = [
          path.join(/*turbopackIgnore: true*/ rootDir, ".venv", "Scripts", "python.exe"),
          path.join(/*turbopackIgnore: true*/ rootDir, "venv", "Scripts", "python.exe"),
          path.join(/*turbopackIgnore: true*/ process.env.USERPROFILE || "", "venv", "Scripts", "python.exe"),
          "C:\\Python314\\python.exe",
        ];
        for (const cand of candidates) {
          if (fs.existsSync(cand)) {
            pythonExecutable = cand;
            break;
          }
        }
      } else {
        const candidates = [
          path.join(/*turbopackIgnore: true*/ rootDir, ".venv", "bin", "python"),
          path.join(/*turbopackIgnore: true*/ rootDir, "venv", "bin", "python"),
        ];
        for (const cand of candidates) {
          if (fs.existsSync(cand)) {
            pythonExecutable = cand;
            break;
          }
        }
      }
      const extraPaths = [
        rootDir,
        ...(process.platform === "win32" ? ["C:\\ffmpeg", "C:\\ffmpeg\\bin"] : []),
      ];
      const env = {
        ...process.env,
        STUDIO_PORT: "8001",
        PATH: extraPaths.join(path.delimiter) + path.delimiter + (process.env.PATH || ""),
      };

      log("backend.auto_spawning command=python -m backend.app.main");
      const proc = spawn(pythonExecutable, ["-m", "backend.app.main"], {
        cwd: rootDir,
        env,
        stdio: "ignore",
        windowsHide: true,
      });
      proc.unref();

      // Poll up to 8 seconds for backend to become ready
      for (let i = 0; i < 16; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isBackendAlive(url)) {
          log("backend.auto_spawned status=online");
          return true;
        }
      }
      return false;
    } catch (err: any) {
      log(`backend.spawn_error err=${err.message}`);
      return false;
    } finally {
      startingBackendPromise = null;
    }
  })();

  return startingBackendPromise;
}

/**
 * Verify remote device access (PIN protection & device blocklist) via FastAPI backend.
 * Fails open only if backend is unreachable on local loopback requests.
 */
export async function checkRemoteAccess(req: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const token = req.headers.get("x-studio-token") || "";
  const deviceId = req.headers.get("x-device-id") || "";
  // Remote device PIN / blocklist state lives ONLY on the local host Python backend, never on Colab.
  const localUrl = getLocalEngineUrl();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${localUrl}/remote/auth/validate`, {
      method: "GET",
      headers: {
        ...(token ? { "x-studio-token": token } : {}),
        ...(deviceId ? { "x-device-id": deviceId } : {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);

    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    return {
      ok: false,
      status: res.status,
      error: body?.detail || body?.error || (res.status === 403 ? "Device blocked by host" : "Security PIN required"),
    };
  } catch {
    return { ok: true };
  }
}



