/** Browser-side API client for the studio. */
import type { Chunk, GlossaryRow, HardwareInfo, Project, SubLine, StudioSettings, VadSummary } from "./types";

export class ApiError extends Error {
  status: number;
  code?: string;
  stage?: string;
  retryable?: boolean;

  constructor(status: number, message: string, code?: string, stage?: string, retryable?: boolean) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.stage = stage;
    this.retryable = retryable;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const ct = res.headers.get("content-type") || "";
  let body: unknown = null;

  if (ct.includes("application/json")) {
    body = await res.json().catch(() => null);
  } else {
    const raw = await res.text().catch(() => "");
    if (raw && raw.trim()) {
      if (raw.includes("<html") || raw.includes("<!DOCTYPE") || ct.includes("text/html")) {
        const titleMatch = raw.match(/<title>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
        body = { error: title || `Server returned ${res.status} (${res.statusText || "Error"})` };
      } else {
        body = { error: raw.trim().slice(0, 300) };
      }
    }
  }

  if (!res.ok) {
    const b = body as { error?: string; message?: string; code?: string; stage?: string; retryable?: boolean } | null;
    const errText = b?.error || b?.message || `Request failed (${res.status})`;
    throw new ApiError(res.status, errText, b?.code, b?.stage, b?.retryable);
  }
  return body as T;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  return parse<T>(res);
}

export const fetchProjects = () => api<Project[]>("/api/projects");

export interface ProjectDetail {
  project: Project;
  chunks: Chunk[];
  subtitles: SubLine[];
}

export const fetchProject = (id: string) => api<ProjectDetail>(`/api/projects/${id}`);

export const patchProject = (id: string, patch: Record<string, unknown>) =>
  api<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const deleteProject = (id: string) => api<{ ok: true }>(`/api/projects/${id}`, { method: "DELETE" });

export const cancelProject = (id: string) =>
  api<Project>(`/api/projects/${id}/cancel`, { method: "POST" });

export interface AudioOptimizationDetail {
  path: string;
  originalSize: number;
  optimizedSize: number;
  changePercent: number;
  changeType: "reduced" | "expanded" | "unchanged";
  format: "wav" | "mp3";
  sampleRate?: number;
  channels?: number;
  codec?: string;
  compressionRatio?: number;
}

export const prepareProject = (id: string) =>
  api<{
    vad: VadSummary;
    note: string;
    audioOptimization?: AudioOptimizationDetail | null;
  }>(`/api/projects/${id}/prepare`, { method: "POST" });

export interface ChunkResult {
  chunk: Chunk;
  segments: Array<{
    startMs: number;
    endMs: number;
    speaker: string | null;
    original: string;
    translation: string;
    confidence: number;
    kind: "speech" | "event";
    lang: string;
  }>;
  language: string;
  confidence: number;
  overlapRemoved: number;
  durationMs: number;
  note: string | null;
}

export const processChunk = (projectId: string, chunkId: string, modelSpeed: number) =>
  api<ChunkResult>(`/api/projects/${projectId}/chunks/${chunkId}`, {
    method: "POST",
    body: JSON.stringify({ modelSpeed }),
  });

export const saveSubtitles = (id: string, lines: SubLine[]) =>
  api<{ ok: true; count: number }>(`/api/projects/${id}/subtitles`, {
    method: "PUT",
    body: JSON.stringify({ lines }),
  });

export const fetchHardware = () => api<HardwareInfo>("/api/hardware");

export const fetchGlossary = () => api<GlossaryRow[]>("/api/glossary");
export const addGlossary = (term: string, translation: string) =>
  api<GlossaryRow>("/api/glossary", { method: "POST", body: JSON.stringify({ term, translation }) });
export const deleteGlossary = (id: string) => api<{ ok: true }>(`/api/glossary?id=${id}`, { method: "DELETE" });

export interface BurnResult {
  ok: boolean;
  url?: string;
  name?: string;
}

export const burnSubtitles = (
  projectId: string,
  payload: { format: "srt" | "ass"; lines: SubLine[]; field: "translation" | "original"; speakerOn: boolean; style?: object },
) => api<BurnResult>(`/api/burn`, { method: "POST", body: JSON.stringify({ projectId, ...payload }) });

/** Read media duration client-side with fast fallback to server FFprobe. */
export function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const isAudio = /\.(mp3|wav|flac|m4a|ogg|aac|opus|wma|amr|weba|caf)$/i.test(file.name);
      const el = document.createElement(isAudio ? "audio" : "video") as HTMLMediaElement;
      let done = false;
      const finish = (d: number) => {
        if (done) return;
        done = true;
        try { URL.revokeObjectURL(url); } catch {}
        resolve(isFinite(d) && d > 0 ? d : 0);
      };
      el.preload = "metadata";
      el.onloadedmetadata = () => finish(el.duration);
      el.onerror = () => finish(0);
      // Fast 600ms timeout: if mobile browser cannot probe metadata instantly,
      // resolve 0 and let server-side FFprobe probe it accurately upon upload
      setTimeout(() => finish(0), 600);
      el.src = url;
    } catch {
      resolve(0);
    }
  });
}

export interface UploadProgress {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  speedBytesPerSec: number;
}

export interface UploadResult {
  project: Project;
}

export function uploadProjectWithProgress(
  file: File,
  meta: { durationSec: number },
  settings: StudioSettings,
  onProgress?: (progress: UploadProgress) => void,
  abortSignal?: AbortSignal,
): Promise<Project> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("meta", JSON.stringify(meta));
    fd.append("settings", JSON.stringify(settings));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/projects");

    const startTime = Date.now();

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
          const speed = Math.round(e.loaded / elapsedSec);
          const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));
          onProgress({
            percent,
            loadedBytes: e.loaded,
            totalBytes: e.total,
            speedBytesPerSec: speed,
          });
        }
      };
    }

    xhr.onload = () => {
      try {
        const ct = xhr.getResponseHeader("content-type") || "";
        let body: any = null;
        if (ct.includes("application/json")) {
          body = JSON.parse(xhr.responseText);
        } else {
          body = { error: xhr.responseText.slice(0, 300) };
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body.project);
        } else {
          reject(new ApiError(xhr.status, body?.error || body?.message || `Upload failed (${xhr.status})`));
        }
      } catch (err: any) {
        reject(new ApiError(xhr.status || 500, err.message || "Failed to parse upload response"));
      }
    };

    xhr.onerror = () => {
      reject(new ApiError(0, "Network connection error during file upload. Check Wi-Fi or Internet access."));
    };

    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        xhr.abort();
        reject(new ApiError(0, "Upload cancelled by user."));
      });
    }

    xhr.send(fd);
  });
}

export async function uploadProject(file: File, meta: { durationSec: number }, settings: StudioSettings): Promise<Project> {
  return uploadProjectWithProgress(file, meta, settings);
}

export const mediaUrl = (id: string, f?: string) =>
  `/api/projects/${id}/media${f ? `?f=${encodeURIComponent(f)}` : ""}`;

export interface TranslateBatchResult {
  source_lang: string;
  target_lang: string;
  translations: string[];
}

export async function translateTexts(
  texts: string[],
  sourceLang: string,
  targetLang: string = "en",
  engine: string = "nllb"
): Promise<string[]> {
  const res = await api<TranslateBatchResult>("/api/translate", {
    method: "POST",
    body: JSON.stringify({ texts, source_lang: sourceLang, target_lang: targetLang, engine }),
  });
  return res.translations;
}

export async function unloadModels(): Promise<{ ok: boolean; message: string }> {
  try {
    return await api<{ ok: boolean; message: string }>("/api/models", {
      method: "POST",
      body: JSON.stringify({ modelId: "all", action: "unload" }),
    });
  } catch (err: any) {
    console.warn("Failed to unload models:", err);
    return { ok: false, message: err.message || "Failed to unload models" };
  }
}

