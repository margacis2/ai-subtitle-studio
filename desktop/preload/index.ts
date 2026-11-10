import { contextBridge, ipcRenderer } from "electron";

export interface DesktopApi {
  openFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<string | null>;
  openFolder: () => Promise<string | null>;
  saveFile: (options?: any) => Promise<string | null>;
  openPath: (path: string) => Promise<string>;
  getPaths: () => Promise<{ userData: string; downloads: string; home: string }>;
  isDesktop: boolean;
}

const desktopApi: DesktopApi = {
  openFile: (options) => ipcRenderer.invoke("dialog:openFile", options),
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  saveFile: (options) => ipcRenderer.invoke("dialog:saveFile", options),
  openPath: (path) => ipcRenderer.invoke("shell:openPath", path),
  getPaths: () => ipcRenderer.invoke("app:getPaths"),
  isDesktop: true,
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);

