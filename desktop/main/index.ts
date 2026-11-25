import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "node:path";
import http from "node:http";
import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;
let nextProcess: ChildProcess | null = null;
const BACKEND_PORT = 8001;
const FRONTEND_PORT = 3000;

function checkHttpAlive(url: string, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function resolveRootDir(): string {
  const devRoot = path.resolve(__dirname, "../../");
  if (fs.existsSync(path.join(devRoot, "package.json"))) {
    return devRoot;
  }
  return app.isPackaged ? process.resourcesPath : devRoot;
}

function resolvePythonExecutable(rootDir: string): string {
  if (process.platform === "win32") {
    const candidates = [
      path.join(rootDir, ".venv", "Scripts", "python.exe"),
      path.join(rootDir, "venv", "Scripts", "python.exe"),
      path.join(process.env.USERPROFILE || "", "venv", "Scripts", "python.exe"),
      "C:\\Python314\\python.exe",
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return "python";
  }
  const unixCandidates = [
    path.join(rootDir, ".venv", "bin", "python"),
    path.join(rootDir, "venv", "bin", "python"),
  ];
  for (const c of unixCandidates) {
    if (fs.existsSync(c)) return c;
  }
  return "python3";
}

function buildRuntimeEnv(rootDir: string): NodeJS.ProcessEnv {
  const extraPaths = [rootDir];
  if (process.platform === "win32") {
    if (fs.existsSync("C:\\ffmpeg\\ffmpeg.exe")) extraPaths.push("C:\\ffmpeg");
    if (fs.existsSync("C:\\ffmpeg\\bin\\ffmpeg.exe")) extraPaths.push("C:\\ffmpeg\\bin");
  }
  return {
    ...process.env,
    STUDIO_PORT: String(BACKEND_PORT),
    PORT: String(FRONTEND_PORT),
    PATH: extraPaths.join(path.delimiter) + path.delimiter + (process.env.PATH || ""),
  };
}

async function startPythonBackend() {
  const alive = await checkHttpAlive(`http://127.0.0.1:${BACKEND_PORT}/health`);
  if (alive) {
    console.log("[Python Backend] Already running on port 8001, reusing instance.");
    return;
  }

  const rootDir = resolveRootDir();
  const pythonExecutable = resolvePythonExecutable(rootDir);
  const env = buildRuntimeEnv(rootDir);

  try {
    pythonProcess = spawn(
      pythonExecutable,
      ["-m", "backend.app.main"],
      {
        cwd: rootDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }
    );

    pythonProcess.stdout?.on("data", (data) => {
      console.log(`[Python Backend] ${data.toString().trim()}`);
    });

    pythonProcess.stderr?.on("data", (data) => {
      console.error(`[Python Backend ERR] ${data.toString().trim()}`);
    });

    pythonProcess.on("exit", (code) => {
      console.log(`Python backend exited with code ${code}`);
      pythonProcess = null;
    });
  } catch (err) {
    console.error("Failed to spawn Python backend:", err);
  }
}

async function ensureNextServer() {
  const alive = await checkHttpAlive(`http://127.0.0.1:${FRONTEND_PORT}/api/health`);
  if (alive) return;

  const rootDir = resolveRootDir();
  const nextBin = path.join(rootDir, "node_modules", "next", "dist", "bin", "next");
  const hasBuild = fs.existsSync(path.join(rootDir, ".next", "BUILD_ID"));
  const args = hasBuild
    ? [nextBin, "start", "-H", "0.0.0.0", "-p", String(FRONTEND_PORT)]
    : [nextBin, "dev", "-H", "0.0.0.0", "-p", String(FRONTEND_PORT)];

  if (!fs.existsSync(nextBin)) return;

  nextProcess = spawn(process.execPath, args, {
    cwd: rootDir,
    env: { ...buildRuntimeEnv(rootDir), ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  nextProcess.stdout?.on("data", (d) => console.log(`[Next.js] ${d.toString().trim()}`));
  nextProcess.stderr?.on("data", (d) => console.error(`[Next.js ERR] ${d.toString().trim()}`));
  nextProcess.on("exit", () => {
    nextProcess = null;
  });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await checkHttpAlive(`http://127.0.0.1:${FRONTEND_PORT}/api/health`)) break;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1024,
    minHeight: 700,
    title: "AI Subtitle Studio",
    backgroundColor: "#090d14",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const startUrl = `http://localhost:${FRONTEND_PORT}`;

  mainWindow.loadURL(startUrl).catch(() => {
    setTimeout(() => {
      mainWindow?.loadURL(startUrl);
    }, 1500);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle("dialog:openFile", async (_event, options) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: options?.filters || [
      { name: "Media Files", extensions: ["mp4", "mkv", "mov", "avi", "webm", "mp3", "wav", "m4a", "flac"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  return result.filePaths[0] || null;
});

ipcMain.handle("dialog:openFolder", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"]
  });
  return result.filePaths[0] || null;
});

ipcMain.handle("dialog:saveFile", async (_event, options) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, options || {});
  return result.filePath || null;
});

ipcMain.handle("shell:openPath", async (_event, targetPath: string) => {
  return await shell.openPath(targetPath);
});

ipcMain.handle("app:getPaths", () => {
  return {
    userData: app.getPath("userData"),
    downloads: app.getPath("downloads"),
    home: app.getPath("home"),
  };
});

function cleanupChildren() {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
}

app.whenReady().then(async () => {
  await startPythonBackend();
  await ensureNextServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  cleanupChildren();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  cleanupChildren();
});
