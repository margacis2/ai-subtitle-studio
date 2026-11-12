"use client";

import React from "react";
import type { HardwareCompatibility } from "@/lib/types";
import { Btn } from "./ui";
import { Icon } from "./icons";

interface Props {
  compat: HardwareCompatibility;
  onSwitchModel?: (suggestedId: string) => void;
  onProceedAnyway?: () => void;
  className?: string;
}

export function HardwareWarningBanner({
  compat,
  onSwitchModel,
  onProceedAnyway,
  className = "",
}: Props) {
  if (compat.supported && compat.tier !== "warning" && compat.tier !== "unsupported") {
    return null;
  }

  const isSevere = compat.tier === "unsupported";

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 shadow-lg ${
        isSevere
          ? "border-red-500/50 bg-red-950/30 text-red-200"
          : "border-amber-500/50 bg-amber-950/30 text-amber-200"
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`rounded-lg p-2 shrink-0 ${
            isSevere ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
          }`}
        >
          <Icon name="alert" size={20} />
        </div>
        <div className="space-y-1 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold text-sm tracking-tight text-white">
              {compat.warningTitle || "Hardware Compatibility Notice"}
            </h4>
            <span
              className={`chip text-[0.68rem] font-bold ${
                isSevere
                  ? "border-red-500/40 bg-red-500/20 text-red-300"
                  : "border-amber-500/40 bg-amber-500/20 text-amber-300"
              }`}
            >
              {isSevere ? "❌ Insufficient VRAM" : "⚠️ High Memory Load"}
            </span>
          </div>
          <p className="text-xs text-neutral-300 leading-relaxed">
            {compat.warningDetail}
          </p>
        </div>
      </div>

      {/* Real-time Hardware Comparison Table */}
      <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/60 text-xs">
        <div className="grid grid-cols-4 border-b border-neutral-800 bg-neutral-900/60 p-2 font-mono font-semibold text-neutral-400 text-[0.7rem]">
          <div>Resource</div>
          <div>Detected System</div>
          <div>Model Required</div>
          <div className="text-right">Compatibility</div>
        </div>
        <div className="divide-y divide-neutral-850">
          <div className="grid grid-cols-4 p-2 items-center text-[0.75rem]">
            <div className="font-semibold text-neutral-200">GPU VRAM</div>
            <div className="font-mono text-cyan-300">
              {compat.detectedVramGb > 0 ? `${compat.detectedVramGb.toFixed(1)} GB` : "None (CPU)"}
              {compat.detectedGpu ? ` (${compat.detectedGpu.split(" ")[0]})` : ""}
            </div>
            <div className="font-mono text-neutral-300">~{compat.requiredVramGb.toFixed(1)} GB</div>
            <div className="text-right font-mono font-semibold">
              {compat.shortfallGb > 0 ? (
                <span className="text-red-400">-{compat.shortfallGb.toFixed(1)} GB</span>
              ) : (
                <span className="text-emerald-400">✓ Sufficient</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-4 p-2 items-center text-[0.75rem]">
            <div className="font-semibold text-neutral-200">System RAM</div>
            <div className="font-mono text-cyan-300">{compat.detectedRamGb.toFixed(1)} GB</div>
            <div className="font-mono text-neutral-300">~{compat.requiredRamGb.toFixed(1)} GB</div>
            <div className="text-right font-mono font-semibold">
              {compat.detectedRamGb >= compat.requiredRamGb ? (
                <span className="text-emerald-400">✓ Compatible</span>
              ) : (
                <span className="text-amber-400">⚠️ Tight</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-4 p-2 items-center text-[0.75rem]">
            <div className="font-semibold text-neutral-200">Acceleration</div>
            <div className="font-mono text-cyan-300">
              {compat.cudaAvailable ? "CUDA Active" : "CPU Threads"}
            </div>
            <div className="font-mono text-neutral-300">CUDA / CTranslate2</div>
            <div className="text-right font-mono font-semibold">
              {compat.cudaAvailable ? (
                <span className="text-emerald-400">✓ Ready</span>
              ) : (
                <span className="text-neutral-400">CPU Fallback</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actionable buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-800/80">
        <span className="text-[0.72rem] text-neutral-400 italic">
          {compat.recommendation}
        </span>
        <div className="flex items-center gap-2">
          {compat.suggestedModelId && onSwitchModel && (
            <Btn
              size="sm"
              variant="primary"
              icon="zap"
              onClick={() => onSwitchModel(compat.suggestedModelId!)}
            >
              Switch to Recommended Model
            </Btn>
          )}
          {onProceedAnyway && (
            <Btn size="sm" variant="ghost" onClick={onProceedAnyway}>
              Proceed with CPU Fallback
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

