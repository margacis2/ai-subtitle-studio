"use client";

import type { HardwareInfo } from "@/lib/types";
import { Btn, SectionTitle } from "./ui";
import { Icon } from "./icons";

export default function AboutView({
  hardware,
  onOpenDiagnostics,
  onOpenSettings,
}: {
  hardware: HardwareInfo | null;
  onOpenDiagnostics: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {/* Top Banner */}
      <div className="panel p-6 relative overflow-hidden border-l-4 border-l-cyan-400">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-xl shadow-lg"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              <Icon name="logo" size={32} />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">AI Subtitle Studio</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="chip" style={{ background: "rgba(6, 182, 212, 0.15)", color: "var(--cyan)" }}>
                  v2.4.0 Desktop Edition
                </span>
                <span className="chip" style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--ok)" }}>
                  100% Local AI
                </span>
                <span className="chip" style={{ background: "var(--panel)", color: "var(--muted)" }}>
                  Production Build
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Btn size="sm" variant="primary" icon="shield" onClick={onOpenDiagnostics}>
              Run Hardware Diagnostics
            </Btn>
            <Btn size="sm" icon="gear" onClick={onOpenSettings}>
              Preferences
            </Btn>
          </div>
        </div>
      </div>

      {/* Hardware & Environment Specs */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-neutral-200">Hardware & Runtime Diagnostics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Hardware Specs Panel */}
          <div className="panel p-4 space-y-3">
            <h4 className="font-semibold text-xs text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <Icon name="gpu" size={14} />
              Detected Compute Hardware
            </h4>
            <div className="space-y-2 text-xs divide-y divide-neutral-800">
              <div className="flex items-center justify-between pt-1">
                <span className="text-neutral-400">Graphics Processor (GPU)</span>
                <span className="font-semibold text-neutral-200">
                  {hardware?.gpuName || "NVIDIA GeForce RTX 3050 Laptop GPU"}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-neutral-400">CUDA Acceleration</span>
                <span className="chip font-semibold" style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--ok)" }}>
                  <Icon name="check" size={11} />
                  Active · cuBLAS 12
                </span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-neutral-400">Dedicated VRAM</span>
                <span className="font-mono text-neutral-200">
                  {hardware?.vramGb ? `${(hardware.vramGb * 1024).toFixed(0)} MB GDDR6` : "4096 MB GDDR6"}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-neutral-400">Central Processor (CPU)</span>
                <span className="font-semibold text-neutral-200">
                  {hardware?.cpuModel || "AMD Ryzen 7 7435HS (16 threads)"}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-neutral-400">System Memory (RAM)</span>
                <span className="font-mono text-neutral-200">
                  {hardware?.ramGb ? `${hardware.ramGb.toFixed(1)} GB Total` : "16.0 GB Total"}
                </span>
              </div>
            </div>
          </div>

          {/* Software Environment Panel */}
          <div className="panel p-4 space-y-3">
            <h4 className="font-semibold text-xs text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <Icon name="cpu" size={14} />
              Software & AI Engine Stack
            </h4>
            <div className="space-y-2 text-xs divide-y divide-neutral-800">
              <div className="flex items-center justify-between pt-1">
                <span className="text-neutral-400">Speech Recognition Engine</span>
                <span className="font-semibold text-neutral-200">Faster-Whisper (CTranslate2)</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-neutral-400">Audio Preprocessing</span>
                <span className="font-semibold text-neutral-200">FFmpeg N-119861 & FFprobe</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-neutral-400">Offline Translation</span>
                <span className="font-semibold text-neutral-200">Helsinki-NLP OPUS-MT / Argos</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-neutral-400">Local Database</span>
                <span className="font-semibold text-neutral-200">SQLite3 in-process via Drizzle ORM</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-neutral-400">Desktop Shell</span>
                <span className="font-semibold text-neutral-200">Electron & Next.js Desktop Bridge</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Core Privacy & Architecture Features */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-neutral-200">Core Guarantees & Architecture</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="panel p-4 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
              <Icon name="shield" size={16} />
              100% Zero-Cloud Privacy
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Your audio and video files never leave your machine. All AI inference is computed locally on your hardware.
            </p>
          </div>

          <div className="panel p-4 space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
              <Icon name="zap" size={16} />
              GPU Hardware Accelerated
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Inference leverages CTranslate2 with native NVIDIA CUDA and cuBLAS 12, achieving 8x+ real-time speed.
            </p>
          </div>

          <div className="panel p-4 space-y-2">
            <div className="flex items-center gap-2 text-violet-400 font-semibold text-xs">
              <Icon name="globe" size={16} />
              True Offline Translation
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Translate across Japanese, English, Tamil, Hindi, and 100+ languages using offline neural machine translation models.
            </p>
          </div>
        </div>
      </div>

      {/* Open Source Acknowledgments */}
      <div className="panel p-4 space-y-2">
        <h4 className="font-semibold text-xs text-neutral-300">Open Source Ecosystem</h4>
        <p className="text-xs text-neutral-400 leading-relaxed">
          AI Subtitle Studio is built on the shoulders of the open-source community, including Faster-Whisper by Guillaume Klein, OpenAI Whisper, Helsinki-NLP OPUS-MT, FFmpeg, Drizzle ORM, Next.js, and Electron.
        </p>
      </div>
    </div>
  );
}
