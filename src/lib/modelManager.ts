import { ASR_MODELS, HardwareInfo, modelById } from "./types";

export interface Recommendation {
  modelId: string;
  modelName: string;
  device: "cpu" | "cuda";
  computeType: string;
  gpuWorkers: number;
  cpuWorkers: number;
  reason: string;
}

/**
 * Resource-aware model recommendation.
 * Inspects VRAM / RAM / cores and picks the largest model that fits with
 * a 15% headroom so we never deliberately walk into CUDA OOM.
 */
export function recommend(
  hw: HardwareInfo | null,
  mode: string,
  durationSec: number,
): Recommendation {
  const cores = hw?.cpuCores || 4;
  const ram = hw?.ramGb || 8;
  const vram = hw?.vramGb || 0;
  const cuda = !!hw?.cudaAvailable && vram > 0;
  const gpu = hw?.gpuName;

  const cpuWorkers = Math.max(1, Math.min(4, Math.ceil(cores / 4)));
  let gpuWorkers = 0;

  const candidates = [...ASR_MODELS].sort((a, b) => b.vramGb - a.vramGb);
  const fitsOnGpu = (m: (typeof ASR_MODELS)[number]) => m.vramGb * 1.15 <= vram;

  let model: (typeof ASR_MODELS)[number] | null = null;
  let device: "cpu" | "cuda" = "cpu";
  let computeType = "int8";
  let reason: string;

  if (mode === "fast") {
    const fast = ASR_MODELS.filter((m) => m.id === "sensevoice" || m.id === "small");
    model = fast.find((m) => (cuda ? fitsOnGpu(m) : true)) ?? ASR_MODELS[0];
  } else if (mode === "high") {
    model = (cuda ? candidates.find(fitsOnGpu) : null) ?? null;
  } else {
    // balanced: best model that fits
    model = (cuda ? candidates.find(fitsOnGpu) : null) ?? null;
  }
  if (!model) {
    model = cuda ? (candidates.find((m) => m.vramGb <= 2) ?? ASR_MODELS[0]) : ASR_MODELS[0];
  }

  if (cuda && fitsOnGpu(model)) {
    device = "cuda";
    computeType = vram >= 8 ? "float16" : vram >= 4 ? "int8_float16" : "int8";
    gpuWorkers = vram >= 12 && model.vramGb * 2 * 1.2 <= vram ? 2 : 1;
  } else if (cuda) {
    // GPU exists but the preferred model does not fit — stay on GPU with a smaller model
    const smaller = [...candidates].reverse().find(fitsOnGpu);
    if (smaller) {
      model = smaller;
      device = "cuda";
      computeType = vram >= 4 ? "int8_float16" : "int8";
      gpuWorkers = 1;
    } else {
      device = "cpu";
      model = modelById("small");
    }
  } else {
    device = "cpu";
    computeType = "int8";
  }

  if (device === "cpu") gpuWorkers = 0;

  if (!hw) {
    reason = "Hardware probe unavailable — conservative CPU/int8 configuration.";
  } else if (device === "cuda" && gpu) {
    reason =
      `${gpu} with ${vram.toFixed(0)} GB VRAM: best balance of accuracy, speed and VRAM usage. ` +
      `Model ${model.vramGb.toFixed(1)} GB fits with 15% headroom.`;
  } else if (cuda && !fitsOnGpu(modelById("large-v3"))) {
    reason = `CUDA is available but ${vram.toFixed(0)} GB VRAM limits model size — ${model.name} selected to avoid OOM.`;
  } else {
    reason = `No NVIDIA CUDA device detected — CPU inference with int8 quantization (${cpuWorkers} worker${cpuWorkers > 1 ? "s" : ""}).`;
  }

  const longNote = durationSec > 3600 ? " Long video: 10-minute chunks + overlap dedupe recommended." : "";

  return {
    modelId: model.id,
    modelName: model.name,
    device,
    computeType,
    gpuWorkers,
    cpuWorkers,
    reason: reason + longNote,
  };
}

export function vramWarning(
  modelId: string,
  hw: HardwareInfo | null,
): { warn: string | null; suggested: string | null } {
  if (modelId === "auto" || !hw) return { warn: null, suggested: null };
  const model = modelById(modelId);
  const vram = hw.vramGb || 0;
  const hasCuda = !!hw.cudaAvailable && vram > 0;
  if (!hasCuda) return { warn: null, suggested: null };
  if (model.vramGb * 1.15 <= vram) return { warn: null, suggested: null };
  const fits = [...ASR_MODELS]
    .filter((m) => m.vramGb * 1.15 <= vram)
    .sort((a, b) => b.vramGb - a.vramGb)[0];
  return {
    warn:
      `This model may need ~${model.vramGb.toFixed(1)} GB VRAM but only ${vram.toFixed(0)} GB is available. ` +
      (fits ? `Suggested: ${fits.name}.` : "Suggested: CPU inference."),
    suggested: fits?.name ?? null,
  };
}
