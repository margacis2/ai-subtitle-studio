"use client";

import { useState } from "react";
import { Btn, Modal, SectionTitle, Badge } from "./ui";
import { Icon } from "./icons";

interface DiagnosticStep {
  name: string;
  status: "PASS" | "FAIL";
  details: string;
  error?: string;
}

interface DiagnosticResponse {
  overall: "PASS" | "FAIL";
  passedCount: number;
  totalCount: number;
  steps: DiagnosticStep[];
}

export default function AudioDiagnosticsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosticResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnostics/audio");
      if (!res.ok) {
        throw new Error(`Diagnostic endpoint returned ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message || "Failed running audio diagnostic");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Audio Pipeline Diagnostics">
      <div className="space-y-4 text-xs">
        <p className="text-neutral-400">
          This test verifies the complete audio extraction, stream validation, FFmpeg, FFprobe, VAD, and local AI backend connectivity pipeline.
        </p>

        {!result && !loading && (
          <div className="flex flex-col items-center justify-center p-8 text-center panel-inset">
            <Icon name="wave" size={32} className="text-neutral-500 mb-3" />
            <p className="font-semibold text-neutral-200 mb-1">Audio Processing Verification</p>
            <p className="text-neutral-400 max-w-sm mb-4">
              Click below to execute an end-to-end check of all 9 audio &amp; speech processing subsystems.
            </p>
            <Btn variant="primary" icon="zap" onClick={runTest}>
              Test Audio Processing
            </Btn>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="h-6 w-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <p className="font-semibold text-neutral-300">Running 9-step audio diagnostic…</p>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            <strong>Diagnostic error:</strong> {error}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-900 border border-neutral-800">
              <span className="font-semibold text-neutral-200">
                Diagnostic Result: {result.passedCount} / {result.totalCount} Passed
              </span>
              <Badge tone={result.overall === "PASS" ? "ok" : "err"}>
                {result.overall === "PASS" ? "ALL SYSTEMS OPERATIONAL" : "ISSUES DETECTED"}
              </Badge>
            </div>

            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {result.steps.map((s, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border ${
                    s.status === "PASS"
                      ? "bg-emerald-950/20 border-emerald-800/40"
                      : "bg-rose-950/20 border-rose-800/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-neutral-200">{s.name}</span>
                    <span
                      className={`text-[0.7rem] font-bold px-1.5 py-0.5 rounded ${
                        s.status === "PASS"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-rose-500/20 text-rose-400"
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                  <p className="text-neutral-400 text-[0.75rem]">{s.details}</p>
                  {s.error && (
                    <div className="mt-1.5 p-1.5 rounded bg-rose-900/30 text-rose-300 font-mono text-[0.7rem]">
                      {s.error}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
              <Btn size="sm" icon="zap" onClick={runTest} disabled={loading}>
                Re-test
              </Btn>
              <Btn size="sm" variant="primary" onClick={onClose}>
                Done
              </Btn>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

