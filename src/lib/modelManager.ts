import { ASR_MODELS, HardwareInfo, HardwareCompatibility, modelById } from "./types";

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
    const fast = ASR_MODELS.filter((m) => m.id === "sensevoice" || m.id === "tiny" || m.id === "small");
    model = fast.find((m) => (cuda ? fitsOnGpu(m) : true)) ?? ASR_MODELS[2];
  } else if (mode === "high") {
    model = (cuda ? candidates.find(fitsOnGpu) : null) ?? null;
  } else {
    // balanced: best model that fits
    model = (cuda ? candidates.find(fitsOnGpu) : null) ?? null;
  }
  if (!model) {
    model = cuda ? (candidates.find((m) => m.vramGb <= 2) ?? ASR_MODELS[2]) : ASR_MODELS[2];
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
  const compat = checkHardwareCompatibility(modelId, hw);
  if (compat.supported && compat.tier !== "warning") return { warn: null, suggested: null };
  return {
    warn: compat.warningDetail ?? null,
    suggested: compat.suggestedModelId ? modelById(compat.suggestedModelId).name : null,
  };
}

export function checkHardwareCompatibility(
  modelId: string,
  hw: HardwareInfo | null,
): HardwareCompatibility {
  const model = modelById(modelId);
  const detectedGpu = hw?.gpuName || null;
  const detectedVram = hw?.vramGb || 0;
  const detectedRam = hw?.ramGb || 8;
  const cuda = !!hw?.cudaAvailable && detectedVram > 0;
  const reqVram = model.vramGb;
  const reqRam = model.ramGb;
  const shortfall = Math.max(0, Math.round((reqVram - detectedVram) * 10) / 10);

  if (modelId === "auto") {
    return {
      supported: true,
      tier: "optimal",
      modelName: "Auto / Recommended",
      detectedGpu,
      detectedVramGb: detectedVram,
      requiredVramGb: 1.6,
      shortfallGb: 0,
      detectedRamGb: detectedRam,
      requiredRamGb: 3.0,
      cudaAvailable: cuda,
    };
  }

  // Find best alternative that fits with 5% headroom
  const fittingModel = [...ASR_MODELS]
    .filter((m) => cuda ? m.vramGb * 1.05 <= detectedVram : m.ramGb <= detectedRam)
    .sort((a, b) => b.vramGb - a.vramGb)[0] || ASR_MODELS[2];

  if (!cuda) {
    if (detectedRam < reqRam) {
      return {
        supported: false,
        tier: "warning",
        modelName: model.name,
        detectedGpu: "CPU Only (No CUDA GPU)",
        detectedVramGb: 0,
        requiredVramGb: reqVram,
        shortfallGb: reqVram,
        detectedRamGb: detectedRam,
        requiredRamGb: reqRam,
        cudaAvailable: false,
        warningTitle: `Low System RAM for CPU Inference`,
        warningDetail: `Model ${model.name} recommends ~${reqRam} GB RAM for CPU execution, but your system reports ${detectedRam.toFixed(1)} GB. Processing may experience high swapping or system lag.`,
        recommendation: `Recommended: Use Faster-Whisper Small or Tiny for smooth CPU performance.`,
        suggestedModelId: "small",
      };
    }
    return {
      supported: true,
      tier: "compatible",
      modelName: model.name,
      detectedGpu: "CPU Only",
      detectedVramGb: 0,
      requiredVramGb: reqVram,
      shortfallGb: 0,
      detectedRamGb: detectedRam,
      requiredRamGb: reqRam,
      cudaAvailable: false,
      recommendation: `Running on CPU with ${hw?.cpuCores || 4} threads. Int8 quantization recommended.`,
      suggestedModelId: "small",
    };
  }

  if (shortfall === 0) {
    const isOptimal = reqVram * 1.15 <= detectedVram;
    return {
      supported: true,
      tier: isOptimal ? "optimal" : "compatible",
      modelName: model.name,
      detectedGpu,
      detectedVramGb: detectedVram,
      requiredVramGb: reqVram,
      shortfallGb: 0,
      detectedRamGb: detectedRam,
      requiredRamGb: reqRam,
      cudaAvailable: true,
      recommendation: isOptimal
        ? `Fully supported! Model fits within ${detectedVram.toFixed(1)} GB VRAM with safety margin.`
        : `Model fits in VRAM (${reqVram.toFixed(1)} GB of ${detectedVram.toFixed(1)} GB). Monitor VRAM during long chunks.`,
    };
  }

  const isSevere = shortfall >= 3.0 || reqVram > detectedVram * 1.8;
  return {
    supported: false,
    tier: isSevere ? "unsupported" : "warning",
    modelName: model.name,
    detectedGpu,
    detectedVramGb: detectedVram,
    requiredVramGb: reqVram,
    shortfallGb: shortfall,
    detectedRamGb: detectedRam,
    requiredRamGb: reqRam,
    cudaAvailable: true,
    warningTitle: `VRAM Shortfall: ${shortfall.toFixed(1)} GB Shortage Detected`,
    warningDetail: `The selected model (${model.name}) requires ~${reqVram.toFixed(1)} GB VRAM, but your GPU (${detectedGpu || "NVIDIA GPU"}) only has ${detectedVram.toFixed(1)} GB VRAM. Running on GPU will cause CUDA Out-of-Memory (OOM) errors or heavy memory paging into CPU RAM (~8x-12x slower).`,
    recommendation: `Recommended: Switch to ${fittingModel.name} which fits perfectly into your ${detectedVram.toFixed(0)} GB VRAM.`,
    suggestedModelId: fittingModel.id,
  };
}

