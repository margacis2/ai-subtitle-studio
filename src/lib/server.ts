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
  return base.length > 160 ? base.slice(0, 160) : base;
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

export function getEngineUrl(): string {
  const custom = process.env.COLAB_URL || process.env.REMOTE_ASR_URL;
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, "");
  }
  return "http://127.0.0.1:8001";
}

export function getEngineToken(): string {
  return (process.env.COLAB_API_TOKEN || process.env.COLAB_TOKEN || "").trim();
}

export async function isBackendAlive(url = getEngineUrl()): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

let startingBackendPromise: Promise<boolean> | null = null;

export async function ensureBackendRunning(): Promise<boolean> {
  const url = getEngineUrl();
  if (await isBackendAlive(url)) {
    return true;
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
        const userVenv = path.join(process.env.USERPROFILE || "", "venv", "Scripts", "python.exe");
        const localVenv = path.join(rootDir, "venv", "Scripts", "python.exe");
        const sysPy = "C:\\Python314\\python.exe";
        if (fs.existsSync(userVenv)) {
          pythonExecutable = userVenv;
        } else if (fs.existsSync(localVenv)) {
          pythonExecutable = localVenv;
        } else if (fs.existsSync(sysPy)) {
          pythonExecutable = sysPy;
        }
      }
      const env = {
        ...process.env,
        STUDIO_PORT: "8001",
        PATH: rootDir + path.delimiter + (process.env.PATH || ""),
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


