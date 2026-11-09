"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { SubLine } from "@/lib/types";
import { fmtClock } from "@/lib/time";
import { Icon } from "./icons";
import type { ExportField } from "@/lib/formats";

export function activeLine(lines: SubLine[], tMs: number): SubLine | null {
  let found: SubLine | null = null;
  for (const l of lines) {
    if (l.startMs <= tMs && tMs < l.endMs) return l;
    if (l.startMs <= tMs) found = l;
    else break;
  }
  if (found && tMs - found.endMs < 1200) return found;
  return null;
}

export default function PreviewPlayer({
  src,
  lines,
  field,
  speakerOn,
  seekTo,
  onTime,
}: {
  src: string;
  lines: SubLine[];
  field: ExportField;
  speakerOn: boolean;
  seekTo: number | null;
  onTime?: (tMs: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [vol, setVol] = useState(0.9);
  const [isMuted, setIsMuted] = useState(false);
  const [subsOn, setSubsOn] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (seekTo != null && ref.current) {
      ref.current.currentTime = seekTo / 1000;
    }
  }, [seekTo]);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (ref.current) {
      ref.current.volume = isMuted ? 0 : vol;
    }
  }, [vol, isMuted]);

  const togglePlay = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);

  const seekRelative = useCallback((seconds: number) => {
    if (ref.current) {
      ref.current.currentTime = Math.max(0, Math.min(ref.current.duration || 0, ref.current.currentTime + seconds));
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen?.().catch(() => undefined);
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen?.().catch(() => undefined);
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Auto-hide controls when playing and inactive
  const resetHideTimer = () => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (playing) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 2600);
    }
  };

  const cur = subsOn ? activeLine(lines, t * 1000) : null;
  const progressPercent = dur > 0 ? (t / dur) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`panel group relative overflow-hidden bg-black select-none ${
        isFullscreen ? "h-screen w-screen rounded-none" : "rounded-xl border shadow-xl"
      }`}
      onMouseMove={resetHideTimer}
      onClick={resetHideTimer}
    >
      {/* Video element */}
      <div
        className="relative flex items-center justify-center bg-black cursor-pointer"
        style={{ aspectRatio: isFullscreen ? "unset" : "16/9", height: isFullscreen ? "100vh" : "auto" }}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
      >
        <video
          ref={ref}
          src={src}
          className="h-full w-full object-contain"
          playsInline
          onTimeUpdate={(e) => {
            const ct = e.currentTarget.currentTime;
            setT(ct);
            onTime?.(ct * 1000);
          }}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
          onPlay={() => {
            setPlaying(true);
            resetHideTimer();
          }}
          onPause={() => {
            setPlaying(false);
            setShowControls(true);
          }}
          onEnded={() => {
            setPlaying(false);
            setShowControls(true);
          }}
          onError={() =>
            setError("This media format cannot be played natively in browser. Subtitle timestamps remain fully functional.")
          }
        />

        {/* Big play overlay when paused */}
        {!playing && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-white shadow-2xl backdrop-blur-md transition-transform hover:scale-110">
              <Icon name="play" size={30} className="ml-1" />
            </div>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div
            className="absolute inset-x-4 top-4 rounded-lg border px-4 py-2.5 text-xs shadow-lg backdrop-blur-md"
            style={{ background: "rgba(18,20,24,0.9)", borderColor: "var(--line2)", color: "var(--warn)" }}
          >
            {error}
          </div>
        )}

        {/* Subtitle Rendering Overlay */}
        {cur && (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 flex flex-col items-center gap-1.5 px-6 text-center transition-all duration-150">
            {field === "translation" && cur.original && (
              <div
                className="max-w-[90%] rounded bg-black/60 px-3 py-0.5 font-mono text-[0.85rem] text-white/70 backdrop-blur-sm"
                style={{ textShadow: "0 2px 4px rgba(0,0,0,0.9)" }}
              >
                {cur.speaker ? <span className="text-amber-300 mr-1.5 font-bold">{cur.speaker}:</span> : null}
                {cur.original}
              </div>
            )}
            <div
              className="max-w-[90%] rounded bg-black/75 px-4 py-1 text-[1.15rem] font-bold tracking-wide text-white shadow-2xl backdrop-blur-sm"
              style={{
                textShadow: "0 2px 8px rgba(0,0,0,0.95)",
                lineHeight: "1.4",
              }}
            >
              {(field === "translation" ? cur.translation || cur.original : cur.original).replace(
                speakerOn && cur.speaker ? `${cur.speaker}: ` : "",
                "",
              )}
            </div>
          </div>
        )}
      </div>

      {/* Professional Floating Control Bar */}
      <div
        className={`absolute inset-x-0 bottom-0 z-30 flex flex-col bg-gradient-to-t from-black/95 via-black/80 to-transparent px-4 pb-3 pt-8 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* Progress Bar & Scrubber */}
        <div className="relative mb-2 flex items-center group/scrubber cursor-pointer">
          <div className="relative h-1.5 w-full rounded-full bg-white/25 overflow-hidden transition-all group-hover/scrubber:h-2.5">
            <div
              className="h-full bg-gradient-to-r from-teal-400 to-indigo-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, dur)}
            step={0.05}
            value={t}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (ref.current) ref.current.currentTime = v;
              setT(v);
              onTime?.(v * 1000);
            }}
            className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
            aria-label="Seek Video"
          />
        </div>

        {/* Buttons and Tools Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-white">
          <div className="flex items-center gap-1.5">
            {/* Play / Pause */}
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/15 transition-colors text-white"
              title="Play / Pause (Space)"
            >
              <Icon name={playing ? "pause" : "play"} size={16} />
            </button>

            {/* Jump -5s */}
            <button
              type="button"
              onClick={() => seekRelative(-5)}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/15 transition-colors text-white/80 hover:text-white text-xs font-mono font-bold"
              title="Rewind 5s (←)"
            >
              -5s
            </button>

            {/* Jump +5s */}
            <button
              type="button"
              onClick={() => seekRelative(5)}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/15 transition-colors text-white/80 hover:text-white text-xs font-mono font-bold"
              title="Forward 5s (→)"
            >
              +5s
            </button>

            {/* Time Indicator */}
            <span className="ml-2 font-mono text-xs tracking-tight text-white/90">
              <span className="text-white font-semibold">{fmtClock(t)}</span>
              <span className="mx-1 text-white/40">/</span>
              <span className="text-white/60">{fmtClock(dur)}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Speed Selector */}
            <div className="flex items-center gap-1">
              <select
                className="rounded bg-white/10 px-2 py-0.5 text-xs text-white border border-white/20 hover:bg-white/20 cursor-pointer focus:outline-none"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                aria-label="Playback speed"
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                  <option key={s} value={s} className="bg-neutral-900 text-white">
                    {s}×
                  </option>
                ))}
              </select>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-1.5 group/vol">
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/15 text-white"
                title="Mute / Unmute"
              >
                <Icon name="waveform" size={14} className={isMuted ? "opacity-40" : "opacity-90"} />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : vol}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setVol(val);
                  setIsMuted(val === 0);
                }}
                className="w-14 h-1 accent-teal-400 bg-white/20 rounded cursor-pointer"
                aria-label="Volume"
              />
            </div>

            {/* Toggle CC Subtitles */}
            <button
              type="button"
              onClick={() => setSubsOn((v) => !v)}
              className={`flex h-7 px-2 items-center justify-center rounded text-xs font-bold transition-all border ${
                subsOn
                  ? "bg-teal-500/20 border-teal-400 text-teal-300"
                  : "bg-white/10 border-white/20 text-white/50"
              }`}
              title="Toggle Captions"
            >
              CC
            </button>

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/15 transition-colors text-white"
              title="Toggle Fullscreen"
            >
              <Icon name="spark" size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
