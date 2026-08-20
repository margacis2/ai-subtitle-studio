import { Badge, Bar } from "./ui";
import { Icon } from "./icons";
import type { HardwareInfo } from "@/lib/types";

export function HardwarePanel({ hw, live }: { hw: HardwareInfo | null; live?: boolean }) {
  if (!hw) {
    return (
      <div className="panel-inset flex items-center gap-3 px-4 py-3 text-[0.8rem]" style={{ color: "var(--muted)" }}>
        <Icon name="cpu" size={16} />
        Probing hardware…
      </div>
    );
  }
  const ramPct = hw.ramGb > 0 ? (hw.usedRamGb / hw.ramGb) * 100 : 0;
  const vramUsedPct = hw.vramGb && hw.gpuMemUsedGb ? (hw.gpuMemUsedGb / hw.vramGb) * 100 : null;
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={hw.cudaAvailable ? "ok" : "neutral"} icon="gpu">
          {hw.gpuName ? hw.gpuName : "No NVIDIA GPU"}
        </Badge>
        <Badge tone={hw.cudaAvailable ? "ok" : "warn"} icon="zap">
          CUDA {hw.cudaAvailable ? "available" : "unavailable"}
        </Badge>
        <Badge tone={hw.ffmpeg ? "ok" : "warn"} icon="film">
          {hw.ffmpeg ? "FFmpeg ready" : "FFmpeg not found"}
        </Badge>
      </div>
      <div className="panel-inset space-y-2 px-3.5 py-3">
        <div className="flex items-center justify-between gap-2 text-[0.78rem]">
          <span className="flex min-w-0 items-center gap-1.5 font-semibold" style={{ color: "var(--muted)" }}>
            <Icon name="cpu" size={13} className="shrink-0" />
            <span className="truncate">{hw.cpuModel}</span>
          </span>
          <span className="mono text-[0.7rem]" style={{ color: "var(--faint)" }}>
            {hw.cpuCores} cores
          </span>
        </div>
        {live && (
          <Bar
            label="CPU"
            value={Math.min(100, (hw.load1 / Math.max(1, hw.cpuCores)) * 100)}
            display={`${hw.load1.toFixed(1)} load`}
            tone="teal"
          />
        )}
        <Bar label="RAM" value={ramPct} display={`${hw.usedRamGb} / ${hw.ramGb} GB`} tone="accent" />
        {hw.gpuName && (
          <>
            {live && hw.gpuUtil !== null && (
              <Bar label="GPU" value={hw.gpuUtil} display={`${Math.round(hw.gpuUtil)}% util`} tone="ok" />
            )}
            {live && vramUsedPct !== null && hw.vramGb && (
              <Bar
                label="VRAM"
                value={vramUsedPct}
                display={`${hw.gpuMemUsedGb?.toFixed(1)} / ${hw.vramGb} GB`}
                tone="warn"
              />
            )}
          </>
        )}
      </div>
      <div className="mono flex items-center gap-2 text-[0.65rem]" style={{ color: "var(--faint)" }}>
        <Icon name="terminal" size={11} />
        studio server · {hw.nodeVersion} · {hw.ffmpeg ?? "ffmpeg missing"}
      </div>
    </div>
  );
}
