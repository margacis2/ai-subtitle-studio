import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "node:path";
import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;
const BACKEND_PORT = 8001;

function startPythonBackend() {
  const rootDir = path.resolve(__dirname, "../../");
  const pythonExecutable = process.platform === "win32" ? "python" : "python3";

  // Set local DLL path on Windows
  const env = {
    ...process.env,
    STUDIO_PORT: String(BACKEND_PORT),
    PATH: rootDir + path.delimiter + (process.env.PATH || ""),
  };

  try {
    pythonProcess = spawn(
      pythonExecutable,
      ["-m", "backend.app.main"],
      {
        cwd: rootDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
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
    });
  } catch (err) {
    console.error("Failed to spawn Python backend:", err);
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

  const isDev = process.env.NODE_ENV !== "production";
  const startUrl = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../../out/index.html")}`;

  mainWindow.loadURL(startUrl).catch(() => {
    // If dev server takes a second, retry
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

app.whenReady().then(() => {
  startPythonBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
});

