import type { StudioSettings } from "./types";

export interface Preset {
  id: string;
  name: string;
  desc: string;
  settings: Partial<StudioSettings>;
  custom?: boolean;
}

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: "movie",
    name: "Movie",
    desc: "Dialogue-first: VAD tuned for music, profanity preserved",
    settings: { mode: "balanced", chunkSizeSec: 600, overlapSec: 4, vadEnabled: true, diarization: false, nonSpeechEvents: true, profanityMode: "preserve", autoPunctuate: true },
  },
  {
    id: "youtube",
    name: "YouTube",
    desc: "Fast turns-around, tighter chunks",
    settings: { mode: "fast", chunkSizeSec: 300, overlapSec: 3, vadEnabled: true, diarization: false, nonSpeechEvents: false, autoPunctuate: true },
  },
  {
    id: "lecture",
    name: "Lecture",
    desc: "High accuracy, long lines tolerated",
    settings: { mode: "high", chunkSizeSec: 900, overlapSec: 5, vadEnabled: true, diarization: true, autoPunctuate: true, maxDurationSec: 9 },
  },
  {
    id: "podcast",
    name: "Podcast",
    desc: "Speaker labels on, balanced accuracy",
    settings: { mode: "balanced", chunkSizeSec: 600, overlapSec: 4, diarization: true, vadEnabled: true },
  },
  {
    id: "fast",
    name: "Fast",
    desc: "Smallest model, minimal overhead",
    settings: { mode: "fast", chunkSizeSec: 300, overlapSec: 2, asrModel: "sensevoice" },
  },
  {
    id: "high",
    name: "High Accuracy",
    desc: "Largest model that fits, context translation",
    settings: { mode: "high", chunkSizeSec: 600, overlapSec: 5, asrModel: "auto", diarization: true },
  },
];
