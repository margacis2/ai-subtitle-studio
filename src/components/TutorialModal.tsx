"use client";

import { useEffect, useState } from "react";
import { Modal, Btn, SectionTitle } from "./ui";
import { Icon } from "./icons";

export default function TutorialModal({
  open,
  onClose,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"colab" | "realtime" | "optimization" | "local">("colab");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [engineStatus, setEngineStatus] = useState<{
    engineUrl: string;
    isColab: boolean;
    online: boolean;
    modelInfo: string;
    latencyMs: number | null;
  } | null>(null);
  const [checking, setChecking] = useState(false);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(id);
      setTimeout(() => setCopiedText(null), 2500);
    });
  };

  const checkEngine = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/colab");
      if (res.ok) {
        const data = await res.json();
        setEngineStatus(data);
      }
    } catch {
      /* ignore */
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (open) {
      fetch("/api/colab")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!active || !data) return;
          setEngineStatus(data);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="AI Subtitle Studio — Interactive Guide & Tutorial" wide>
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b pb-2" style={{ borderColor: "var(--line)" }}>
          <button
            type="button"
            onClick={() => setActiveTab("colab")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "colab"
                ? "bg-teal-500/15 text-teal-300 border border-teal-500/40"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40"
            }`}
          >
            ☁️ 1. Google Colab GPU Setup
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("realtime")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "realtime"
                ? "bg-teal-500/15 text-teal-300 border border-teal-500/40"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40"
            }`}
          >
            🎬 2. Real-Time Workflow Test
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("optimization")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "optimization"
                ? "bg-teal-500/15 text-teal-300 border border-teal-500/40"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40"
            }`}
          >
            🛡️ 3. Audio Pre-Optimization
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("local")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "local"
                ? "bg-teal-500/15 text-teal-300 border border-teal-500/40"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40"
            }`}
          >
            💻 4. Local Offline Engine
          </button>
        </div>

        {/* Live Engine Status Pill */}
        <div className="flex flex-wrap items-center justify-between gap-2 panel-inset px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-300">Current Active Engine:</span>
            <span
              className={`chip text-[0.7rem] ${
                engineStatus?.online
                  ? "border-emerald-500/40 text-emerald-400"
                  : "border-amber-500/40 text-amber-300"
              }`}
            >
              ● {engineStatus?.online ? `Online (${engineStatus.modelInfo})` : "Local / Offline"}
              {engineStatus?.latencyMs != null && ` · ${engineStatus.latencyMs}ms`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Btn size="sm" onClick={() => void checkEngine()} disabled={checking}>
              {checking ? "Checking..." : "Refresh Status"}
            </Btn>
            <Btn
              size="sm"
              variant="primary"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
            >
              Open Settings (⚙️)
            </Btn>
          </div>
        </div>

        {/* TAB 1: GOOGLE COLAB GPU SETUP */}
        {activeTab === "colab" && (
          <div className="space-y-3.5 text-xs leading-relaxed">
            <div className="rounded-lg p-3 bg-teal-500/10 border border-teal-500/20">
              <span className="font-bold text-teal-300">Why use Google Colab?</span>
              <p className="mt-1 text-neutral-300">
                Colab provides a free cloud <strong>NVIDIA Tesla T4 GPU (16 GB VRAM)</strong>. It lets you run top-tier
                models like <code>large-v3-turbo</code> at high speeds without utilizing your laptop&apos;s GPU memory or draining battery.
              </p>
            </div>

            <div className="space-y-3">
              <div className="panel-inset p-3 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-neutral-200">
                  <span className="h-5 w-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[0.7rem]">1</span>
                  <span>Open the Colab Notebook</span>
                </div>
                <p className="text-neutral-400 pl-7">
                  Click the button below to open the official, pre-configured backend notebook in Google Colab:
                </p>
                <div className="pl-7 pt-1">
                  <a
                    href="https://colab.research.google.com/github/margacis2/ai-subtitle-studio/blob/main/colab_backend.ipynb"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold px-3 py-1.5 text-xs transition-colors"
                  >
                    Open colab_backend.ipynb in Google Colab ↗
                  </a>
                </div>
              </div>

              <div className="panel-inset p-3 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-neutral-200">
                  <span className="h-5 w-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[0.7rem]">2</span>
                  <span>Enable Free Tesla T4 GPU</span>
                </div>
                <p className="text-neutral-400 pl-7">
                  In Google Colab, click top menu: <strong>Runtime</strong> → <strong>Change runtime type</strong> → select <strong>T4 GPU</strong> → click <strong>Save</strong>.
                </p>
              </div>

              <div className="panel-inset p-3 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-neutral-200">
                  <span className="h-5 w-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[0.7rem]">3</span>
                  <span>Run the 4 Notebook Cells</span>
                </div>
                <div className="pl-7 space-y-1 text-neutral-400">
                  <p>• <strong>Cell 1</strong>: Click ▶ to verify hardware (shows Tesla T4 ACTIVE).</p>
                  <p>• <strong>Cell 2</strong>: Click ▶ to install dependencies and Cloudflare tunnel.</p>
                  <p>• <strong>Cell 3</strong>: Click ▶ to configure model (default <code>large-v3-turbo</code>).</p>
                  <p>• <strong>Cell 4</strong>: Click ▶ to start server and generate your public Cloudflare HTTPS URL.</p>
                </div>
              </div>

              <div className="panel-inset p-3 space-y-2">
                <div className="flex items-center gap-2 font-bold text-neutral-200">
                  <span className="h-5 w-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[0.7rem]">4</span>
                  <span>Copy Tunnel URL &amp; API Token into Settings</span>
                </div>
                <p className="text-neutral-400 pl-7">
                  Cell 4 will display a banner with your <strong>Engine URL</strong> and <strong>API Token</strong>:
                </p>
                <div className="ml-7 rounded bg-black/60 p-2 font-mono text-[0.72rem] text-teal-300 border border-teal-500/20">
                  🔗 Engine URL : https://xxxx-xxxx.trycloudflare.com<br />
                  🔑 API Token  : colab-sec-9a8f
                </div>
                <p className="text-neutral-400 pl-7">
                  Paste these into <strong>Settings (⚙️)</strong> → click <strong>Save &amp; Verify Connection</strong>. Done!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: REAL-TIME WORKFLOW TEST */}
        {activeTab === "realtime" && (
          <div className="space-y-3.5 text-xs leading-relaxed">
            <div className="rounded-lg p-3 bg-indigo-500/10 border border-indigo-500/20">
              <span className="font-bold text-indigo-300">Included Real-Time Sample Video</span>
              <p className="mt-1 text-neutral-300">
                A verified 55-second spoken test video (<code>sample_test_video.mp4</code>, ~0.95 MB) is included in your project folder for immediate testing.
              </p>
            </div>

            <div className="space-y-3">
              <div className="panel-inset p-3 space-y-2">
                <span className="font-bold text-neutral-200">Step 1: Upload the Test Video</span>
                <p className="text-neutral-400">
                  On the home screen, drag and drop <code>sample_test_video.mp4</code> from the project folder into the upload zone.
                </p>
              </div>

              <div className="panel-inset p-3 space-y-2">
                <span className="font-bold text-neutral-200">Step 2: Choose Language &amp; Translation</span>
                <div className="space-y-1 text-neutral-400">
                  <p>• <strong>Source Language</strong>: Auto Detect (or English).</p>
                  <p>• <strong>Target Language</strong>: Select <code>Tamil</code> (தமிழ்), <code>Japanese</code> (日本語), or <code>Spanish</code> to test neural translation, or <code>Original</code> for English subtitles.</p>
                  <p>• <strong>Mode</strong>: Balanced (or High).</p>
                </div>
              </div>

              <div className="panel-inset p-3 space-y-2">
                <span className="font-bold text-neutral-200">Step 3: Click &quot;Start Processing&quot;</span>
                <p className="text-neutral-400">
                  The studio will automatically extract and optimize audio below 100 MB, stream it to Colab GPU, and display live recognition updates:
                </p>
                <div className="rounded bg-black/60 p-2 font-mono text-[0.7rem] text-emerald-300 border border-emerald-500/20 space-y-0.5">
                  <div>[00:00:00 → 00:00:03] Hello and welcome to AI Subtitle Studio.</div>
                  <div>[00:00:03 → 00:00:08] This video is an automated speech recognition and subtitle verification test.</div>
                  <div>[00:00:08 → 00:00:13] We are testing real-time transcription powered by FasterWhisper.</div>
                </div>
              </div>

              <div className="panel-inset p-3 space-y-2">
                <span className="font-bold text-neutral-200">Step 4: Interactive Video Player &amp; Subtitle Editor</span>
                <p className="text-neutral-400">
                  Once complete, the editor opens automatically. Hit <strong>Play (Spacebar)</strong> to watch the video with synchronized subtitles, click any subtitle to seek to that timestamp, or export to <strong>.SRT</strong>, <strong>.VTT</strong>, or burned video!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AUDIO PRE-OPTIMIZATION (<100MB) */}
        {activeTab === "optimization" && (
          <div className="space-y-3.5 text-xs leading-relaxed">
            <div className="rounded-lg p-3 bg-emerald-500/10 border border-emerald-500/20">
              <span className="font-bold text-emerald-300">How Media Optimization Protects Your Bandwidth &amp; Colab Limits</span>
              <p className="mt-1 text-neutral-300">
                You never have to worry about uploading multi-gigabyte video files to Google Colab. The server automatically optimizes media before upload.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="panel-inset p-3 space-y-1.5">
                <span className="font-bold text-neutral-200">1. Original Media Preservation</span>
                <p className="text-neutral-400">
                  Your source video (MP4, MKV, MOV, etc.) is preserved 100% untouched. Only a temporary speech audio track is created for the AI model.
                </p>
              </div>

              <div className="panel-inset p-3 space-y-1.5">
                <span className="font-bold text-neutral-200">2. 16 kHz Mono Extraction</span>
                <p className="text-neutral-400">
                  Whisper operates natively on 16 kHz mono audio (~32 KB/s). Stripping video streams and unneeded channels typically cuts file size by <strong>85% to 95%</strong>.
                </p>
              </div>

              <div className="panel-inset p-3 space-y-1.5">
                <span className="font-bold text-neutral-200">3. Automatic Long-Form MP3 Fallback</span>
                <p className="text-neutral-400">
                  If your video is over 45 minutes and raw WAV exceeds 95 MB, the engine automatically encodes to <strong>64 kbps mono MP3</strong>. A 2-hour movie is compressed to just <strong>~50 MB</strong> with zero speech intelligibility loss.
                </p>
              </div>

              <div className="panel-inset p-3 space-y-1.5">
                <span className="font-bold text-neutral-200">4. Colab 100 MB Upload Guard</span>
                <p className="text-neutral-400">
                  The Colab backend server streams uploads and rejects files exceeding 100 MB, preventing out-of-memory crashes on the cloud instance.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LOCAL OFFLINE MODE */}
        {activeTab === "local" && (
          <div className="space-y-3.5 text-xs leading-relaxed">
            <div className="rounded-lg p-3 bg-neutral-800/60 border border-neutral-700">
              <span className="font-bold text-neutral-200">100% Offline Processing with Local GPU</span>
              <p className="mt-1 text-neutral-400">
                AI Subtitle Studio works completely offline without Google Colab whenever you prefer to use your local NVIDIA RTX GPU or CPU.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="panel-inset p-3 space-y-2">
                <span className="font-bold text-neutral-200">Start the Studio with One Click</span>
                <p className="text-neutral-400">
                  Double-click <code>start_studio.bat</code> in the project root, or launch the Python server and web app manually:
                </p>
                <div className="flex items-center justify-between rounded bg-black/60 p-2 font-mono text-[0.72rem] text-teal-300 border border-neutral-800">
                  <span>python server.py</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard("python server.py", "cmd1")}
                    className="text-neutral-400 hover:text-white"
                  >
                    {copiedText === "cmd1" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="panel-inset p-3 space-y-1.5">
                <span className="font-bold text-neutral-200">Switching Back from Colab to Local GPU</span>
                <p className="text-neutral-400">
                  To disconnect from Colab, open <strong>Settings (⚙️)</strong> and click <strong>&quot;Reset to Local GPU&quot;</strong>. The studio immediately reverts to your local <code>http://127.0.0.1:8001</code> engine without needing a restart.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between border-t pt-3" style={{ borderColor: "var(--line)" }}>
          <span className="text-[0.72rem] text-neutral-400">
            Need help? Read the complete documentation in <code className="text-teal-300">README.md</code>.
          </span>
          <div className="flex items-center gap-2">
            <Btn size="sm" onClick={onClose}>
              Close Tutorial
            </Btn>
            <Btn
              size="sm"
              variant="primary"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
            >
              Open Settings (⚙️)
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}
