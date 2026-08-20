export interface LangOption {
  code: string;
  name: string;
  flag: string;
}

export const SOURCE_LANGS: LangOption[] = [
  { code: "auto", name: "Auto Detect", flag: "🌐" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "ta", name: "Tamil", flag: "🇮🇳" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "te", name: "Telugu", flag: "🇮" },
  { code: "ml", name: "Malayalam", flag: "🇮🇳" },
  { code: "kn", name: "Kannada", flag: "🇮" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "zh", name: "Chinese", flag: "🇨🇳" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
];

export const TARGET_LANGS: LangOption[] = [
  { code: "original", name: "Original", flag: "" },
  { code: "en", name: "English", flag: "🇬" },
  { code: "ta", name: "Tamil", flag: "🇮🇳" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "te", name: "Telugu", flag: "🇮🇳" },
  { code: "ml", name: "Malayalam", flag: "🇮🇳" },
  { code: "kn", name: "Kannada", flag: "🇮🇳" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
];

/** Languages with a built-in sample corpus in the demo engine. */
export const DEMO_CORPUS_LANGS = ["en", "ja", "ta", "hi"];

export function langName(code: string): string {
  if (code === "original") return "Original";
  const all = [...SOURCE_LANGS, ...TARGET_LANGS];
  return all.find((l) => l.code === code)?.name ?? code.toUpperCase();
}

export function langFlag(code: string): string {
  const all = [...SOURCE_LANGS, ...TARGET_LANGS];
  return all.find((l) => l.code === code)?.flag ?? "🌐";
}

export interface AsrModelOption {
  id: string;
  name: string;
  vramGb: number;
  /** relative throughput vs. the small model */
  speedFactor: number;
  accuracy: string;
  note: string;
}

export const ASR_MODELS: AsrModelOption[] = [
  {
    id: "small",
    name: "Faster-Whisper Small",
    vramGb: 1.6,
    speedFactor: 1.0,
    accuracy: "Very Good",
    note: "~1.6 GB VRAM · recommended for 4 GB GPUs",
  },
  {
    id: "medium",
    name: "Faster-Whisper Medium",
    vramGb: 3.2,
    speedFactor: 0.62,
    accuracy: "Excellent",
    note: "~3.2 GB VRAM",
  },
  {
    id: "large-v3",
    name: "Whisper Large-v3",
    vramGb: 5.0,
    speedFactor: 0.34,
    accuracy: "Excellent+",
    note: "~5 GB VRAM",
  },
  {
    id: "sensevoice",
    name: "SenseVoice",
    vramGb: 0.9,
    speedFactor: 1.9,
    accuracy: "Very Good",
    note: "~0.9 GB VRAM · fastest multilingual option",
  },
];

export function modelById(id: string): AsrModelOption {
  return ASR_MODELS.find((m) => m.id === id) ?? ASR_MODELS[0];
}

export const COMPUTE_TYPES = ["auto", "float16", "int8_float16", "int8", "float32"];
export const DEVICES = ["auto", "cuda", "cpu"];
export const PROFILES = ["fast", "balanced", "high", "custom"] as const;
export type Profile = (typeof PROFILES)[number];

export interface StudioSettings {
  sourceLang: string;
  targetLang: string;
  asrModel: string; // 'auto' | model id
  device: string;
  computeType: string;
  workers: number; // 0 = auto
  chunkSizeSec: number; // 0 = custom handled by chunkCustomSec
  chunkCustomSec: number;
  overlapSec: number;
  mode: Profile;
  vadEnabled: boolean;
  diarization: boolean;
  nonSpeechEvents: boolean;
  profanityMode: "preserve" | "censor" | "mild";
  autoPunctuate: boolean;
  maxDurationSec: number;
  cpsLimit: number;
  autoProcessNew: boolean;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  sourceLang: "auto",
  targetLang: "en",
  asrModel: "auto",
  device: "auto",
  computeType: "auto",
  workers: 0,
  chunkSizeSec: 600,
  chunkCustomSec: 420,
  overlapSec: 3,
  mode: "balanced",
  vadEnabled: true,
  diarization: false,
  nonSpeechEvents: false,
  profanityMode: "preserve",
  autoPunctuate: true,
  maxDurationSec: 7,
  cpsLimit: 17,
  autoProcessNew: false,
};

export type ProjectStatus =
  | "pending"
  | "ready"
  | "processing"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface Project {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  durationSec: number;
  sizeBytes: number;
  sourceLang: string;
  targetLang: string;
  asrModel: string;
  device: string;
  computeType: string;
  workers: number;
  chunkSizeSec: number;
  overlapSec: number;
  mode: string;
  vadEnabled: boolean;
  diarization: boolean;
  nonSpeechEvents: boolean;
  profanityMode: string;
  autoPunctuate: boolean;
  status: ProjectStatus;
  stage: string;
  progress: number;
  totalChunks: number;
  completedChunks: number;
  qualityScore: number | null;
  processingTimeSec: number | null;
  vadJson: string | null;
  engineNote: string | null;
  startedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ChunkStatus =
  | "WAITING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface Chunk {
  id: string;
  projectId: string;
  index: number;
  startSec: number;
  endSec: number;
  status: ChunkStatus;
  attempts: number;
  language: string | null;
  confidence: number | null;
  overlapRemoved: number;
  durationMs: number | null;
}

export interface SubLine {
  id: string;
  seq: number;
  startMs: number;
  endMs: number;
  speaker: string | null;
  original: string;
  translation: string;
  confidence: number;
  kind: "speech" | "event";
}

export interface GlossaryRow {
  id: string;
  term: string;
  translation: string;
}

export interface HardwareInfo {
  cpuModel: string;
  cpuCores: number;
  ramGb: number;
  load1: number;
  usedRamGb: number;
  freeRamGb: number;
  gpuName: string | null;
  vramGb: number | null;
  cudaAvailable: boolean;
  gpuUtil: number | null;
  gpuMemUsedGb: number | null;
  ffmpeg: string | null;
  nodeVersion: string;
}

export interface StageEvent {
  t: number;
  level: "ok" | "run" | "wait" | "warn" | "err" | "info";
  text: string;
}

export interface LiveSegment {
  chunkIndex: number;
  startMs: number;
  lang: string;
  original: string;
  translation: string;
  confidence: number;
  event?: boolean;
}

export interface QualityIssue {
  type: string;
  label: string;
  severity: "warn" | "error";
  count: number;
  indices: number[];
  weight: number;
}

export interface QualityCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface QualityReport {
  score: number;
  total: number;
  durationSec: number;
  charsPerSec: number;
  issues: QualityIssue[];
  checks: QualityCheck[];
}

export interface VadSummary {
  real: boolean;
  speechRatio: number;
  speechSec: number;
  intervals: number;
  events: number;
}

export interface BenchmarkRow {
  model: string;
  speed: number;
  accuracy: string;
  vram: string;
  wallSec: number;
}
