export interface LangOption {
  code: string;
  name: string;
  flag: string;
}

export const SOURCE_LANGS: LangOption[] = [
  { code: "auto", name: "Auto Detect", flag: "🌐" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "zh", name: "Chinese", flag: "🇨🇳" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "ta", name: "Tamil", flag: "🇮🇳" },
  { code: "te", name: "Telugu", flag: "🇮🇳" },
  { code: "ml", name: "Malayalam", flag: "🇮🇳" },
  { code: "kn", name: "Kannada", flag: "🇮🇳" },
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
  { code: "ru", name: "Russian", flag: "🇷🇺" },
  { code: "pt", name: "Portuguese", flag: "🇵🇹" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "nl", name: "Dutch", flag: "🇳🇱" },
  { code: "tr", name: "Turkish", flag: "🇹🇷" },
  { code: "vi", name: "Vietnamese", flag: "🇻🇳" },
  { code: "id", name: "Indonesian", flag: "🇮🇩" },
  { code: "pl", name: "Polish", flag: "🇵🇱" },
];

export const TARGET_LANGS: LangOption[] = [
  { code: "original", name: "Original (No translation)", flag: "🌐" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "zh", name: "Chinese", flag: "🇨🇳" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "ta", name: "Tamil", flag: "🇮🇳" },
  { code: "te", name: "Telugu", flag: "🇮🇳" },
  { code: "ml", name: "Malayalam", flag: "🇮🇳" },
  { code: "kn", name: "Kannada", flag: "🇮🇳" },
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
  { code: "ru", name: "Russian", flag: "🇷🇺" },
  { code: "pt", name: "Portuguese", flag: "🇵🇹" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "nl", name: "Dutch", flag: "🇳🇱" },
  { code: "tr", name: "Turkish", flag: "🇹🇷" },
  { code: "vi", name: "Vietnamese", flag: "🇻🇳" },
  { code: "id", name: "Indonesian", flag: "🇮🇩" },
  { code: "pl", name: "Polish", flag: "🇵🇱" },
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
  family: "whisper" | "nvidia" | "qwen" | "moonshine" | "phonon" | "sensevoice";
  vramGb: number;
  ramGb: number;
  /** relative throughput vs. the small model */
  speedFactor: number;
  accuracy: string;
  note: string;
  params: string;
  requiresWarning?: boolean;
}

export const ASR_MODELS: AsrModelOption[] = [
  {
    id: "tiny",
    name: "Faster-Whisper Tiny",
    family: "whisper",
    vramGb: 0.5,
    ramGb: 1.0,
    speedFactor: 4.5,
    accuracy: "Basic",
    note: "~0.5 GB VRAM · ultra lightweight, high speed",
    params: "39M",
  },
  {
    id: "base",
    name: "Faster-Whisper Base",
    family: "whisper",
    vramGb: 0.8,
    ramGb: 1.5,
    speedFactor: 3.0,
    accuracy: "Good",
    note: "~0.8 GB VRAM · fast turnaround for drafts",
    params: "74M",
  },
  {
    id: "small",
    name: "Faster-Whisper Small (Recommended)",
    family: "whisper",
    vramGb: 1.6,
    ramGb: 3.0,
    speedFactor: 1.0,
    accuracy: "High",
    note: "~1.6 GB VRAM · best match for 4 GB GPUs (e.g. RTX 3050)",
    params: "244M",
  },
  {
    id: "medium",
    name: "Faster-Whisper Medium",
    family: "whisper",
    vramGb: 3.2,
    ramGb: 5.0,
    speedFactor: 0.62,
    accuracy: "Very High",
    note: "~3.2 GB VRAM · great for Indian languages & accents",
    params: "769M",
  },
  {
    id: "turbo",
    name: "Faster-Whisper Large-v3-Turbo",
    family: "whisper",
    vramGb: 3.5,
    ramGb: 5.5,
    speedFactor: 0.92,
    accuracy: "State of the Art",
    note: "~3.5 GB VRAM · fast 809M architecture fitting in 4GB VRAM",
    params: "809M",
  },
  {
    id: "large-v3",
    name: "Whisper Large-v3",
    family: "whisper",
    vramGb: 5.0,
    ramGb: 6.5,
    speedFactor: 0.34,
    accuracy: "Maximum SOTA",
    note: "~5.0 GB VRAM · requires 6GB+ VRAM or CPU paging fallback",
    params: "1550M",
    requiresWarning: true,
  },
  {
    id: "canary",
    name: "NVIDIA Canary-1B",
    family: "nvidia",
    vramGb: 8.0,
    ramGb: 16.0,
    speedFactor: 0.5,
    accuracy: "NeMo SOTA",
    note: "~8.0 GB VRAM · FastConformer with inverse text normalization",
    params: "1B",
    requiresWarning: true,
  },
  {
    id: "parakeet",
    name: "NVIDIA Parakeet-CTC 1.1B",
    family: "nvidia",
    vramGb: 4.5,
    ramGb: 8.0,
    speedFactor: 1.4,
    accuracy: "Very High (CTC)",
    note: "~4.5 GB VRAM · low-latency streaming FastConformer",
    params: "1.1B",
    requiresWarning: true,
  },
  {
    id: "qwen-audio",
    name: "Qwen 3 ASR / Qwen2-Audio",
    family: "qwen",
    vramGb: 14.0,
    ramGb: 24.0,
    speedFactor: 0.25,
    accuracy: "Multimodal LLM",
    note: "~14.0 GB VRAM fp16 · Unified audio understanding & reasoning",
    params: "7B",
    requiresWarning: true,
  },
  {
    id: "moonshine",
    name: "Moonshine Base (Useful Sensors)",
    family: "moonshine",
    vramGb: 1.2,
    ramGb: 2.5,
    speedFactor: 2.2,
    accuracy: "High (Edge)",
    note: "~1.2 GB VRAM · low-latency edge speech recognition",
    params: "61M",
  },
  {
    id: "phonon-2",
    name: "Phonon 2 (Speech Sync)",
    family: "phonon",
    vramGb: 1.8,
    ramGb: 3.0,
    speedFactor: 1.8,
    accuracy: "High Sync",
    note: "~1.8 GB VRAM · phoneme-aligned audio transcriber",
    params: "150M",
  },
  {
    id: "sensevoice",
    name: "SenseVoice Small (FunASR)",
    family: "sensevoice",
    vramGb: 0.9,
    ramGb: 2.0,
    speedFactor: 2.8,
    accuracy: "Very Good",
    note: "~0.9 GB VRAM · ultra-fast multilingual & audio events",
    params: "120M",
  },
];

export function modelById(id: string): AsrModelOption {
  if (id === "turbo" || id === "large-v3-turbo") {
    return ASR_MODELS.find((m) => m.id === "turbo") ?? ASR_MODELS[2];
  }
  if (id === "large") {
    return ASR_MODELS.find((m) => m.id === "large-v3") ?? ASR_MODELS[2];
  }
  return ASR_MODELS.find((m) => m.id === id) ?? ASR_MODELS[2];
}

export const COMPUTE_TYPES = ["auto", "float16", "int8_float16", "int8", "float32"];
export const DEVICES = ["auto", "cuda", "cpu"];
export const PROFILES = ["fast", "balanced", "high", "custom"] as const;
export type Profile = (typeof PROFILES)[number];

export interface TranslationModelChoice {
  id: string;
  name: string;
  engine: "nllb" | "opus" | "argos";
  description: string;
  vramGb: number;
  multilingual: boolean;
  recommended?: boolean;
}

export const TRANSLATION_MODELS: TranslationModelChoice[] = [
  {
    id: "nllb",
    name: "Meta NLLB-200 (Universal 200+ Languages)",
    engine: "nllb",
    description: "Meta No Language Left Behind — State of the art neural translation across 200 languages (Asian, Indic, European, Arabic, etc.).",
    vramGb: 2.4,
    multilingual: true,
    recommended: true,
  },
  {
    id: "opus",
    name: "Helsinki-NLP MarianMT (Fast & Lightweight)",
    engine: "opus",
    description: "High-speed language-pair neural models (JA, ZH, ES, FR, DE, HI, TA to EN). Low memory footprint.",
    vramGb: 0.8,
    multilingual: false,
  },
  {
    id: "argos",
    name: "Argos Translate (Offline Modular)",
    engine: "argos",
    description: "Open-source offline neural machine translation packages for local execution.",
    vramGb: 0.6,
    multilingual: true,
  },
];

export interface StudioSettings {
  sourceLang: string;
  targetLang: string;
  asrModel: string; // 'auto' | model id
  translationModel: string; // 'nllb' | 'opus' | 'argos'
  pauseBeforeTranslate: boolean; // wait for user input after ASR to select model & target language
  unloadAsrBeforeTranslate: boolean; // release Whisper ASR from VRAM before loading translation model
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
  targetLang: "original",
  asrModel: "auto",
  translationModel: "nllb",
  pauseBeforeTranslate: true,
  unloadAsrBeforeTranslate: true,
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
  translationModel?: string;
  pauseBeforeTranslate?: boolean;
  unloadAsrBeforeTranslate?: boolean;
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
  asrTimeSec: number | null;
  translationTimeSec: number | null;
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

export interface HardwareCompatibility {
  supported: boolean;
  tier: "optimal" | "compatible" | "warning" | "unsupported";
  modelName: string;
  detectedGpu: string | null;
  detectedVramGb: number;
  requiredVramGb: number;
  shortfallGb: number;
  detectedRamGb: number;
  requiredRamGb: number;
  cudaAvailable: boolean;
  warningTitle?: string;
  warningDetail?: string;
  recommendation?: string;
  suggestedModelId?: string;
}

export interface TranslationModelOption {
  id: string;
  name: string;
  repo_id: string;
  source_lang: string;
  target_lang: string;
  size_mb: number;
  vram_gb: number;
  ram_gb: number;
  speed?: string;
  accuracy?: string;
  description: string;
  installed?: boolean;
  downloading?: boolean;
  progress?: number;
  status?: string;
  bytes_downloaded?: number;
  total_bytes?: number;
  speed_mbps?: number;
  installed_size_mb?: number;
}

