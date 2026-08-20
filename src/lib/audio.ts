/**
 * Real audio utilities used when FFmpeg is present on the server:
 *  - extract a mono 16 kHz WAV from any media container (safe arg lists only)
 *  - energy-based VAD over raw 16-bit PCM (30 ms frames)
 * When FFmpeg is missing these return null and the pipeline falls back to
 * the seeded signal model so the rest of the workflow stays fully functional.
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; err: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err) => {
      resolve({ ok: !err, err: err ? (err as Error).message : "" });
    });
  });
}

export function hasFfmpeg(): boolean {
  try {
    require("node:child_process").execFileSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/** Extract full mono 16k WAV. Returns wav path or null. */
export async function extractWav(mediaPath: string, wavPath: string, timeoutMs = 240000): Promise<string | null> {
  const r = await run("ffmpeg", [
    "-y",
    "-nostdin",
    "-i", mediaPath,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-acodec", "pcm_s16le",
    "-f", "wav",
    wavPath,
  ], timeoutMs);
  return r.ok && fs.existsSync(wavPath) ? wavPath : null;
}

export interface VadResult {
  speechRatio: number;
  speechSec: number;
  durationSec: number;
  intervals: number;
}

/** Energy VAD over a 16-bit PCM mono WAV. */
export function energyVad(wavPath: string, opts?: { thresholdDb?: number; frameMs?: number }): VadResult | null {
  try {
    const buf = fs.readFileSync(wavPath);
    // parse WAV header for PCM format 1, 16-bit
    if (buf.length < 44) return null;
    const sampleRate = buf.readUInt32LE(24);
    const bitsPerSample = buf.readUInt16LE(34);
    const numChannels = buf.readUInt16LE(2);
    let dataOffset = 44;
    // walk sub-chunks to find 'data'
    let i = 12;
    while (i + 8 <= buf.length) {
      const id = buf.toString("ascii", i, i + 4);
      const size = buf.readUInt32LE(i + 4);
      if (id === "data") {
        dataOffset = i + 8;
        break;
      }
      i += 8 + size + (size % 2);
    }
    const data = buf.subarray(dataOffset);
    const frame = Math.max(1, Math.floor(((opts?.frameMs ?? 30) / 1000) * sampleRate / (numChannels * (bitsPerSample / 8))));
    const frames = Math.floor(data.length / frame / 2);
    if (frames < 4) return null;

    // adaptive threshold: mean + 3 * std of frame energies
    const energies = new Float64Array(frames);
    for (let f = 0; f < frames; f++) {
      let sum = 0;
      const start = f * frame * 2;
      for (let s = 0; s < frame * 2; s += 2) {
        const v = data.readInt16LE(start + s) / 32768;
        sum += v * v;
      }
      energies[f] = Math.sqrt(sum / frame);
    }
    let mean = 0;
    for (let f = 0; f < frames; f++) mean += energies[f];
    mean /= frames;
    let variance = 0;
    for (let f = 0; f < frames; f++) variance += (energies[f] - mean) ** 2;
    variance /= frames;
    const threshold = Math.max(mean + 3 * Math.sqrt(variance), Math.pow(10, (opts?.thresholdDb ?? -38) / 20));

    let speechFrames = 0;
    let run = 0;
    let intervals = 0;
    for (let f = 0; f < frames; f++) {
      const isSpeech = energies[f] > threshold;
      if (isSpeech) {
        if (run === 0) intervals++;
        run++;
        speechFrames++;
      } else if (run >= 4) {
        run = 0; // keep short blips, drop them below 120 ms
      } else {
        run = 0;
      }
    }
    const frameSec = (frame * (numChannels * (bitsPerSample / 8))) / 2 / sampleRate;
    const durationSec = frames * frameSec;
    const speechSec = speechFrames * frameSec;
    return {
      speechRatio: durationSec > 0 ? Math.round((speechSec / durationSec) * 1000) / 1000 : 0,
      speechSec: Math.round(speechSec * 10) / 10,
      durationSec: Math.round(durationSec * 10) / 10,
      intervals,
    };
  } catch {
    return null;
  }
}

export function wavExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export const audioWorkPath = (dir: string, index: number) => path.join(dir, `chunk_${String(index).padStart(3, "0")}.wav`);
