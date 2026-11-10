"use client";

import { useState } from "react";
import { Btn, Field, SectionTitle, Select } from "./ui";
import { Icon } from "./icons";
import { downloadText } from "@/lib/formats";

type UtilityTab = "convert" | "sync" | "merge" | "split" | "validate" | "mediaInfo" | "extractAudio";

export default function ToolsUtilitiesView({
  onToast,
}: {
  onToast: (tone: "ok" | "err" | "warn" | "info", text: string) => void;
}) {
  const [tab, setTab] = useState<UtilityTab>("convert");
  const [loading, setLoading] = useState(false);

  // Converter state
  const [convInput, setConvInput] = useState("");
  const [convTarget, setConvTarget] = useState<"srt" | "vtt" | "ass" | "txt" | "json">("vtt");
  const [convOutput, setConvOutput] = useState("");

  // Synchronizer state
  const [syncInput, setSyncInput] = useState("");
  const [syncOffsetSec, setSyncOffsetSec] = useState("1.5");
  const [syncOutput, setSyncOutput] = useState("");

  // Merger state
  const [mergeFile1, setMergeFile1] = useState("");
  const [mergeFile2, setMergeFile2] = useState("");
  const [mergeOutput, setMergeOutput] = useState("");

  // Splitter state
  const [splitInput, setSplitInput] = useState("");
  const [splitPartsCount, setSplitPartsCount] = useState("2");
  const [splitOutputs, setSplitOutputs] = useState<string[]>([]);

  // Validator state
  const [valInput, setValInput] = useState("");
  const [valReport, setValReport] = useState<{
    totalEntries: number;
    warningCount: number;
    warnings: Array<{ index: number; type: string; message: string }>;
  } | null>(null);

  // Media Info state
  const [mediaFilePath, setMediaFilePath] = useState("");
  const [mediaInfoResult, setMediaInfoResult] = useState<any | null>(null);

  // Audio Extractor state
  const [extractPath, setExtractPath] = useState("");
  const [extractFormat, setExtractFormat] = useState<"wav" | "mp3">("wav");
  const [extractResult, setExtractResult] = useState<any | null>(null);

  const handleConvert = async () => {
    if (!convInput.trim()) {
      onToast("warn", "Please enter or paste subtitle content to convert");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/utilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert", content: convInput, targetFormat: convTarget }),
      });
      const data = await res.json();
      if (res.ok) {
        setConvOutput(data.output);
        onToast("ok", `Successfully converted ${data.count} subtitles to .${data.format}`);
      } else {
        onToast("err", data.error || "Conversion failed");
      }
    } catch (e: any) {
      onToast("err", e.message || "Conversion request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (direction: "forward" | "backward") => {
    if (!syncInput.trim()) {
      onToast("warn", "Please enter or paste subtitle content to synchronize");
      return;
    }
    const sec = parseFloat(syncOffsetSec) || 0;
    const offsetMs = Math.round((direction === "forward" ? sec : -sec) * 1000);
    setLoading(true);
    try {
      const res = await fetch("/api/utilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", content: syncInput, offsetMs }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncOutput(data.output);
        onToast("ok", `Shifted ${data.shiftedCount} subtitles by ${offsetMs > 0 ? `+${offsetMs}` : offsetMs}ms`);
      } else {
        onToast("err", data.error || "Sync failed");
      }
    } catch (e: any) {
      onToast("err", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async () => {
    if (!mergeFile1.trim() || !mergeFile2.trim()) {
      onToast("warn", "Please provide content for both subtitle files to merge");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/utilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge", filesContent: [mergeFile1, mergeFile2] }),
      });
      const data = await res.json();
      if (res.ok) {
        setMergeOutput(data.output);
        onToast("ok", `Merged into ${data.totalCount} chronological subtitles`);
      } else {
        onToast("err", data.error || "Merge failed");
      }
    } catch (e: any) {
      onToast("err", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSplit = async () => {
    if (!splitInput.trim()) {
      onToast("warn", "Please enter subtitle content to split");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/utilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "split", content: splitInput, parts: parseInt(splitPartsCount, 10) || 2 }),
      });
      const data = await res.json();
      if (res.ok) {
        setSplitOutputs(data.parts || []);
        onToast("ok", `Split subtitles into ${data.count} equal parts`);
      } else {
        onToast("err", data.error || "Split failed");
      }
    } catch (e: any) {
      onToast("err", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!valInput.trim()) {
      onToast("warn", "Please enter subtitle content to validate");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/utilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", content: valInput }),
      });
      const data = await res.json();
      if (res.ok) {
        setValReport(data);
        if (data.warningCount === 0) {
          onToast("ok", `Validation passed! 0 issues found in ${data.totalEntries} subtitles.`);
        } else {
          onToast("warn", `Found ${data.warningCount} timing or formatting issues.`);
        }
      } else {
        onToast("err", data.error || "Validation failed");
      }
    } catch (e: any) {
      onToast("err", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMediaInfo = async () => {
    if (!mediaFilePath.trim()) {
      onToast("warn", "Enter a media file path on disk");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/utilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mediaInfo", filePath: mediaFilePath.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setMediaInfoResult(data);
        onToast("ok", "Media analysis complete");
      } else {
        onToast("err", data.error || "Media analysis failed");
      }
    } catch (e: any) {
      onToast("err", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExtractAudio = async () => {
    if (!extractPath.trim()) {
      onToast("warn", "Enter a video file path on disk");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/utilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extractAudio", filePath: extractPath.trim(), targetFormat: extractFormat }),
      });
      const data = await res.json();
      if (res.ok) {
        setExtractResult(data);
        onToast("ok", `Extracted ${extractFormat.toUpperCase()} audio to: ${data.outputPath}`);
      } else {
        onToast("err", data.error || "Audio extraction failed");
      }
    } catch (e: any) {
      onToast("err", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="border-b pb-4" style={{ borderColor: "var(--line)" }}>
        <h2 className="font-display text-xl font-bold tracking-tight">Subtitle Tools &amp; Utilities</h2>
        <p className="text-xs text-neutral-400">
          Standalone offline tools for format conversion, timestamp alignment, validation, merging, splitting, and FFmpeg media operations.
        </p>

        {/* Tab Bar */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {[
            { id: "convert", label: "Converter", icon: "refresh" },
            { id: "sync", label: "Synchronizer", icon: "clock" },
            { id: "merge", label: "Merger", icon: "layers" },
            { id: "split", label: "Splitter", icon: "scissors" },
            { id: "validate", label: "Validator", icon: "shield" },
            { id: "mediaInfo", label: "Media Info", icon: "film" },
            { id: "extractAudio", label: "Audio Extractor", icon: "wave" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as UtilityTab)}
              className={`chip text-xs px-3 py-1.5 cursor-pointer font-medium transition-all ${
                tab === t.id
                  ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-400 font-bold"
                  : "hover:bg-neutral-800 text-neutral-400"
              }`}
            >
              <Icon name={t.icon as any} size={12} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. CONVERTER TAB */}
      {tab === "convert" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="panel p-4 space-y-3">
              <SectionTitle icon="upload">Source Subtitles (SRT or VTT)</SectionTitle>
              <textarea
                className="input w-full font-mono text-xs h-64 resize-none"
                placeholder="1&#10;00:00:01,000 --> 00:00:04,000&#10;Paste subtitle content here..."
                value={convInput}
                onChange={(e) => setConvInput(e.target.value)}
              />
              <div className="flex items-center justify-between gap-3 pt-1">
                <Field label="Target Format" className="w-40">
                  <Select
                    value={convTarget}
                    onChange={(v) => setConvTarget(v as any)}
                    options={[
                      { value: "srt", label: "SRT (.srt)" },
                      { value: "vtt", label: "VTT (.vtt)" },
                      { value: "ass", label: "ASS (.ass)" },
                      { value: "txt", label: "Plain Text (.txt)" },
                      { value: "json", label: "JSON Data (.json)" },
                    ]}
                  />
                </Field>
                <Btn variant="primary" icon="zap" disabled={loading} onClick={handleConvert}>
                  {loading ? "Converting…" : "Convert Subtitles"}
                </Btn>
              </div>
            </div>

            <div className="panel p-4 space-y-3">
              <div className="flex items-center justify-between">
                <SectionTitle icon="download">Converted Output</SectionTitle>
                {convOutput && (
                  <div className="flex items-center gap-1.5">
                    <Btn size="sm" icon="copy" onClick={() => { navigator.clipboard.writeText(convOutput); onToast("ok", "Copied to clipboard"); }}>
                      Copy
                    </Btn>
                    <Btn size="sm" icon="download" onClick={() => downloadText(`converted.${convTarget}`, convOutput)}>
                      Download
                    </Btn>
                  </div>
                )}
              </div>
              <textarea
                className="input w-full font-mono text-xs h-64 resize-none bg-neutral-950/60"
                readOnly
                placeholder="Converted subtitle result will appear here..."
                value={convOutput}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. SYNCHRONIZER TAB */}
      {tab === "sync" && (
        <div className="panel p-5 space-y-4 max-w-3xl">
          <SectionTitle icon="clock">Subtitle Timestamp Synchronizer</SectionTitle>
          <p className="text-xs text-neutral-400">
            Shift all cue timestamps globally forward or backward to correct audio/video synchronization delays.
          </p>
          <textarea
            className="input w-full font-mono text-xs h-56 resize-none"
            placeholder="Paste your SRT or VTT content here..."
            value={syncInput}
            onChange={(e) => setSyncInput(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Field label="Time Offset (seconds)">
              <input
                type="number"
                step="0.1"
                className="input w-36 font-mono text-xs"
                value={syncOffsetSec}
                onChange={(e) => setSyncOffsetSec(e.target.value)}
              />
            </Field>
            <div className="flex items-center gap-2 pt-5">
              <Btn icon="arrow-left" disabled={loading} onClick={() => handleSync("backward")}>
                Shift Earlier (-{syncOffsetSec}s)
              </Btn>
              <Btn variant="primary" icon="arrow-right" disabled={loading} onClick={() => handleSync("forward")}>
                Shift Later (+{syncOffsetSec}s)
              </Btn>
            </div>
          </div>

          {syncOutput && (
            <div className="space-y-2 pt-2 border-t border-neutral-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200">Shifted Result:</span>
                <Btn size="sm" icon="download" onClick={() => downloadText("shifted_subtitles.srt", syncOutput)}>
                  Download Shifted SRT
                </Btn>
              </div>
              <textarea className="input w-full font-mono text-xs h-40 resize-none bg-neutral-950/60" readOnly value={syncOutput} />
            </div>
          )}
        </div>
      )}

      {/* 3. MERGER TAB */}
      {tab === "merge" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="panel p-4 space-y-2">
              <SectionTitle icon="upload">Subtitle File 1 (Part A)</SectionTitle>
              <textarea
                className="input w-full font-mono text-xs h-48 resize-none"
                placeholder="Paste Part 1 SRT content..."
                value={mergeFile1}
                onChange={(e) => setMergeFile1(e.target.value)}
              />
            </div>
            <div className="panel p-4 space-y-2">
              <SectionTitle icon="upload">Subtitle File 2 (Part B)</SectionTitle>
              <textarea
                className="input w-full font-mono text-xs h-48 resize-none"
                placeholder="Paste Part 2 SRT content..."
                value={mergeFile2}
                onChange={(e) => setMergeFile2(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-center">
            <Btn variant="primary" icon="merge" disabled={loading} onClick={handleMerge}>
              {loading ? "Merging…" : "Merge Subtitles into Single File"}
            </Btn>
          </div>
          {mergeOutput && (
            <div className="panel p-4 space-y-2">
              <div className="flex items-center justify-between">
                <SectionTitle icon="check">Merged Subtitle Result</SectionTitle>
                <Btn size="sm" icon="download" onClick={() => downloadText("merged_subtitles.srt", mergeOutput)}>
                  Download Merged SRT
                </Btn>
              </div>
              <textarea className="input w-full font-mono text-xs h-56 resize-none bg-neutral-950/60" readOnly value={mergeOutput} />
            </div>
          )}
        </div>
      )}

      {/* 4. SPLITTER TAB */}
      {tab === "split" && (
        <div className="panel p-5 space-y-4 max-w-3xl">
          <SectionTitle icon="scissors">Subtitle Splitter</SectionTitle>
          <p className="text-xs text-neutral-400">
            Split a large subtitle file into multiple equal segments for multi-part videos or episode segments.
          </p>
          <textarea
            className="input w-full font-mono text-xs h-48 resize-none"
            placeholder="Paste complete SRT subtitle content here..."
            value={splitInput}
            onChange={(e) => setSplitInput(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <Field label="Number of Parts">
              <input
                type="number"
                min="2"
                max="10"
                className="input w-28 font-mono text-xs"
                value={splitPartsCount}
                onChange={(e) => setSplitPartsCount(e.target.value)}
              />
            </Field>
            <div className="pt-5">
              <Btn variant="primary" icon="scissors" disabled={loading} onClick={handleSplit}>
                Split Subtitles
              </Btn>
            </div>
          </div>

          {splitOutputs.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-neutral-800">
              <h4 className="text-xs font-semibold text-neutral-200">Generated Parts:</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {splitOutputs.map((out, i) => (
                  <div key={i} className="panel-inset p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-cyan-400">Part {i + 1}</span>
                      <Btn size="sm" icon="download" onClick={() => downloadText(`part_${i + 1}.srt`, out)}>
                        Download
                      </Btn>
                    </div>
                    <textarea className="input w-full font-mono text-[0.7rem] h-28 resize-none bg-neutral-950" readOnly value={out} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. VALIDATOR TAB */}
      {tab === "validate" && (
        <div className="panel p-5 space-y-4 max-w-3xl">
          <SectionTitle icon="shield">Subtitle Quality &amp; Timing Validator</SectionTitle>
          <p className="text-xs text-neutral-400">
            Audit your subtitle file for overlapping timecodes, inverted start/end times, zero durations, line length limits, and excessive reading speed (CPS).
          </p>
          <textarea
            className="input w-full font-mono text-xs h-48 resize-none"
            placeholder="Paste your SRT or VTT content here to inspect..."
            value={valInput}
            onChange={(e) => setValInput(e.target.value)}
          />
          <Btn variant="primary" icon="check" disabled={loading} onClick={handleValidate}>
            {loading ? "Inspecting…" : "Run Validation Check"}
          </Btn>

          {valReport && (
            <div className="space-y-3 pt-3 border-t border-neutral-800">
              <div className="flex items-center justify-between p-3 rounded bg-neutral-900 border border-neutral-800">
                <span className="text-xs font-semibold text-neutral-200">
                  {valReport.totalEntries} entries inspected · {valReport.warningCount} warning(s) found
                </span>
                <span className={`chip text-xs ${valReport.warningCount === 0 ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-300"}`}>
                  {valReport.warningCount === 0 ? "PASSED VALIDATION" : "ISSUES FOUND"}
                </span>
              </div>

              {valReport.warnings.length > 0 && (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {valReport.warnings.map((w, idx) => (
                    <div key={idx} className="p-2.5 rounded bg-amber-950/20 border border-amber-800/40 text-amber-300 text-xs flex items-center justify-between">
                      <span><strong>#{w.index}:</strong> {w.message}</span>
                      <span className="text-[0.68rem] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-900/40">{w.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 6. MEDIA INFO TAB */}
      {tab === "mediaInfo" && (
        <div className="panel p-5 space-y-4 max-w-3xl">
          <SectionTitle icon="film">FFprobe Media Stream Inspector</SectionTitle>
          <p className="text-xs text-neutral-400">
            Extract technical container parameters, audio codecs, channel layouts, sample rates, and video bitrates from local files.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1 font-mono text-xs"
              placeholder="C:\Users\...\video.mp4"
              value={mediaFilePath}
              onChange={(e) => setMediaFilePath(e.target.value)}
            />
            <Btn variant="primary" icon="search" disabled={loading} onClick={handleMediaInfo}>
              Inspect
            </Btn>
          </div>

          {mediaInfoResult && (
            <div className="panel-inset p-4 space-y-3 font-mono text-xs">
              <div className="grid grid-cols-2 gap-2 text-neutral-300">
                <div>File: <span className="text-cyan-400">{mediaInfoResult.fileName}</span></div>
                <div>Size: <span className="text-neutral-400">{(mediaInfoResult.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span></div>
                <div>Duration: <span className="text-neutral-400">{mediaInfoResult.durationSec.toFixed(2)}s</span></div>
                <div>Format: <span className="text-neutral-400">{mediaInfoResult.format}</span></div>
              </div>
              <div className="pt-2 border-t border-neutral-800">
                <h5 className="font-semibold text-neutral-200 mb-2 font-sans">Streams Detected:</h5>
                <div className="space-y-1.5">
                  {mediaInfoResult.streams?.map((s: any, idx: number) => (
                    <div key={idx} className="p-2 rounded bg-neutral-900 text-neutral-300">
                      <span className="font-bold text-cyan-400 uppercase">[{s.type}]</span> Codec: {s.codec}
                      {s.channels && ` · ${s.channels} channels (${s.sampleRate} Hz)`}
                      {s.width && ` · ${s.width}x${s.height}`}
                      {s.bitrate && ` · ${(parseInt(s.bitrate, 10) / 1000).toFixed(0)} kbps`}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. AUDIO EXTRACTOR TAB */}
      {tab === "extractAudio" && (
        <div className="panel p-5 space-y-4 max-w-3xl">
          <SectionTitle icon="wave">FFmpeg Audio Extraction Utility</SectionTitle>
          <p className="text-xs text-neutral-400">
            Extract the audio track directly from an MP4, MKV, MOV, or AVI video into a standalone high-fidelity 16 kHz WAV or 192 kbps MP3.
          </p>
          <div className="space-y-3">
            <Field label="Source Video File Path">
              <input
                type="text"
                className="input w-full font-mono text-xs"
                placeholder="C:\Users\...\video.mp4"
                value={extractPath}
                onChange={(e) => setExtractPath(e.target.value)}
              />
            </Field>
            <div className="flex items-center gap-3">
              <Field label="Output Audio Format" className="w-36">
                <Select
                  value={extractFormat}
                  onChange={(v) => setExtractFormat(v as any)}
                  options={[
                    { value: "wav", label: "WAV (16kHz PCM)" },
                    { value: "mp3", label: "MP3 (192kbps)" },
                  ]}
                />
              </Field>
              <div className="pt-5">
                <Btn variant="primary" icon="zap" disabled={loading} onClick={handleExtractAudio}>
                  {loading ? "Extracting Audio…" : "Extract Audio"}
                </Btn>
              </div>
            </div>
          </div>

          {extractResult && (
            <div className="p-3.5 rounded bg-emerald-950/20 border border-emerald-800/40 text-emerald-400 text-xs space-y-1">
              <div className="font-semibold">Audio Extracted Successfully!</div>
              <div className="font-mono text-neutral-300 text-[0.72rem] truncate">
                Output Path: {extractResult.outputPath}
              </div>
              <div className="text-neutral-400 text-[0.7rem]">
                Format: {extractResult.format.toUpperCase()} · Size: {(extractResult.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

