import { useEffect, useRef, useState } from "react";
import type { SubLine } from "@/lib/types";
import { fmtClock } from "@/lib/time";
import { Btn } from "./ui";
import { Icon } from "./icons";
import type { ExportField } from "@/lib/formats";

export function activeLine(lines: SubLine[], tMs: number): SubLine | null {
  let found: SubLine | null = null;
  for (const l of lines) {
    if (l.startMs <= tMs && tMs < l.endMs) return l;
    if (l.startMs <= tMs) found = l;
    else break;
  }
  // tolerate a short gap after the last shown line
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
  /** external seek request (ms) */
  seekTo: number | null;
  onTime?: (tMs: number) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [vol, setVol] = useState(0.9);
  const [subsOn, setSubsOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (seekTo != null && ref.current) {
      ref.current.currentTime = seekTo / 1000;
    }
  }, [seekTo]);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed]);
  useEffect(() => {
    if (ref.current) ref.current.volume = vol;
  }, [vol]);

  const cur = subsOn ? activeLine(lines, t * 1000) : null;

  return (
    <div className="panel overflow-hidden">
      <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
        <video
          ref={ref}
          src={src}
          className="h-full w-full"
          playsInline
          onTimeUpdate={(e) => {
            const ct = e.currentTarget.currentTime * 1000;
            setT(ct);
            onTime?.(ct);
          }}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() =>
            setError("This container may not play in the browser (e.g. MKV/AVI). Subtitle timing still works — try a MP4/WebM source.")
          }
        />
        {error && (
          <div
            className="absolute inset-x-3 top-3 rounded-lg border px-3 py-2 text-[0.72rem] leading-snug"
            style={{ background: "rgba(10,12,16,0.85)", borderColor: "var(--line2)", color: "var(--warn)" }}
          >
            {error}
          </div>
        )}
        {cur && (
          <div className="pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center gap-1 px-8 text-center">
            {field === "translation" && cur.original && (
              <div className="font-mono text-[0.78rem] leading-snug text-white/55" style={{ textShadow: "0 1px 3px #000" }}>
                {cur.speaker ? `${cur.speaker}: ` : ""}
                {cur.original}
              </div>
            )}
            <div
              className="font-display max-w-[85%] text-[1.05rem] font-bold leading-snug text-white"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
            >
              {(field === "translation" ? cur.translation || cur.original : cur.original).replace(
                speakerOn && cur.speaker ? `${cur.speaker}: ` : "",
                "",
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2" style={{ borderColor: "var(--line)" }}>
        <Btn
          size="sm"
          icon={playing ? "pause" : "play"}
          onClick={() => {
            const v = ref.current;
            if (!v) return;
            if (v.paused) void v.play().catch(() => undefined);
            else v.pause();
          }}
          title="Play / Pause (Space)"
        />
        <span className="mono text-[0.72rem]" style={{ color: "var(--muted)" }}>
          {fmtClock(t)} / {fmtClock(dur)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, dur)}
          step={0.05}
          value={t}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (ref.current) ref.current.currentTime = v;
            setT(v * 1000);
          }}
          className="min-w-24 flex-1"
          aria-label="Seek"
        />
        <select
          className="input !w-auto !py-1 text-[0.72rem]"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label="Playback speed"
        >
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
            <option key={s} value={s}>{s}×</option>
          ))}
        </select>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={vol}
          onChange={(e) => setVol(Number(e.target.value))}
          className="w-16"
          aria-label="Volume"
        />
        <Btn size="sm" icon={subsOn ? "eye" : "x"} onClick={() => setSubsOn((v) => !v)} title="Toggle subtitles" />
        {cur && (
          <span className="mono text-[0.65rem]" style={{ color: "var(--faint)" }}>
            #{String(cur.seq).padStart(3, "0")}
          </span>
        )}
      </div>
    </div>
  );
}
