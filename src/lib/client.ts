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
      body = { error: raw.trim() };
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
  compressionRatio: number;
  format: "wav" | "mp3";
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

/** Read media duration client-side without downloading anything. */
export function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const isAudio = /\.(mp3|wav|flac|m4a|ogg|aac|opus|wma)$/i.test(file.name);
    const el = document.createElement(isAudio ? "audio" : "video") as HTMLMediaElement;
    let done = false;
    const finish = (d: number) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(isFinite(d) && d > 0 ? d : 0);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => finish(el.duration);
    el.onerror = () => finish(0);
    setTimeout(() => finish(0), 12000);
    el.src = url;
  });
}

export interface UploadResult {
  project: Project;
}

export async function uploadProject(file: File, meta: { durationSec: number }, settings: StudioSettings): Promise<Project> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("meta", JSON.stringify(meta));
  fd.append("settings", JSON.stringify(settings));
  return api<UploadResult>("/api/projects", { method: "POST", body: fd }).then((r) => r.project);
}

export const mediaUrl = (id: string, f?: string) =>
  `/api/projects/${id}/media${f ? `?f=${encodeURIComponent(f)}` : ""}`;

export interface TranslateBatchResult {
  source_lang: string;
  target_lang: string;
  translations: string[];
}

export async function translateTexts(texts: string[], sourceLang: string, targetLang: string = "en"): Promise<string[]> {
  const res = await api<TranslateBatchResult>("/api/translate", {
    method: "POST",
    body: JSON.stringify({ texts, source_lang: sourceLang, target_lang: targetLang }),
  });
  return res.translations;
}

