/**
 * Real audio utilities used when FFmpeg/FFprobe is present:
 *  - Probe media format, streams, and detect audio tracks
 *  - Extract mono 16 kHz WAV with resilient decoding (-fflags +discardcorrupt+genpts)
 *  - High-fidelity compression fallback under 95 MB limit
 *  - Energy-based VAD over raw 16-bit PCM (accurate header parsing & adaptive threshold)
 */
import fs from "node:fs";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";

export interface MediaProbeResult {
  hasAudio: boolean;
  hasVideo: boolean;
  durationSec: number;
  format: string;
  audioCodec?: string;
}

export class AudioProcessingError extends Error {
  code: string;
  stage: string;
  retryable: boolean;
  details?: string;

  constructor(message: string, code = "AUDIO_EXTRACTION_FAILED", stage = "audio_preparation", retryable = false, details?: string) {
    super(message);
    this.name = "AudioProcessingError";
    this.code = code;
    this.stage = stage;
    this.retryable = retryable;
    this.details = details;
  }
}

export function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 2500 });
    return true;
  } catch {
    return false;
  }
}

export function hasFfprobe(): boolean {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore", timeout: 2500 });
    return true;
  } catch {
    return false;
  }
}

/** Probe media file using ffprobe to verify streams and metadata. */
export function probeMedia(mediaPath: string): MediaProbeResult {
  if (!fs.existsSync(mediaPath)) {
    throw new AudioProcessingError(`Media file does not exist: ${mediaPath}`, "FILE_NOT_FOUND", "probe");
  }

  try {
    const stdout = execFileSync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration,format_name:stream=codec_type,codec_name",
      "-of", "json",
      mediaPath,
    ], { encoding: "utf-8", timeout: 12000, windowsHide: true });

    const data = JSON.parse(stdout);
    const streams = data.streams || [];
    const audioStream = streams.find((s: any) => s.codec_type === "audio");
    const hasAudio = !!audioStream;
    const hasVideo = streams.some((s: any) => s.codec_type === "video");
    const durationSec = parseFloat(data.format?.duration || "0");

    return {
      hasAudio,
      hasVideo,
      durationSec,
      format: data.format?.format_name || "unknown",
      audioCodec: audioStream?.codec_name,
    };
  } catch (err: any) {
    throw new AudioProcessingError(
      `Failed to analyze media file with FFprobe: ${err.message}`,
      "FFPROBE_FAILED",
      "probe",
      true,
      err.stderr || err.message
    );
  }
}

function runCommand(cmd: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; stderr: string; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: stdout ? stdout.toString() : "",
        stderr: stderr ? stderr.toString() : "",
      });
    });
  });
}

/** Extract full mono 16k WAV with resilient decoding for imperfect or streaming downloads. */
export async function extractWav(mediaPath: string, wavPath: string, timeoutMs = 240000): Promise<string> {
  if (!fs.existsSync(mediaPath)) {
    throw new AudioProcessingError(`Input media file not found: ${mediaPath}`, "FILE_NOT_FOUND", "audio_extraction");
  }

  const probe = probeMedia(mediaPath);
  if (!probe.hasAudio) {
    throw new AudioProcessingError(
      "The selected video file contains no audio track to transcribe.",
      "NO_AUDIO_STREAM",
      "audio_extraction",
      false
    );
  }

  const dir = path.dirname(wavPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const args = [
    "-y",
    "-nostdin",
    "-fflags", "+discardcorrupt+genpts",
    "-err_detect", "ignore_err",
    "-i", mediaPath,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-acodec", "pcm_s16le",
    "-f", "wav",
    wavPath,
  ];

  const result = await runCommand("ffmpeg", args, timeoutMs);

  // Verification: check if valid WAV was created with non-zero audio content
  if (fs.existsSync(wavPath) && fs.statSync(wavPath).size > 1024) {
    try {
      // Validate that ffprobe recognizes the output wav
      const wavProbe = probeMedia(wavPath);
      if (wavProbe.hasAudio && wavProbe.durationSec > 0) {
        return wavPath;
      }
    } catch {
      // If ffprobe check fails, proceed if file size is substantial
      if (fs.statSync(wavPath).size > 4096) {
        return wavPath;
      }
    }
  }

  const errDetail = result.stderr.slice(-400) || "FFmpeg returned no audio output";
  throw new AudioProcessingError(
    `Audio extraction failed: ${errDetail}`,
    "FFMPEG_EXTRACTION_FAILED",
    "audio_extraction",
    true,
    result.stderr
  );
}

export interface AudioOptimizationResult {
  path: string;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  format: "wav" | "mp3";
}

/**
 * Extracts, resamples to mono 16kHz, and optimizes audio under targetMaxBytes (default 95 MB).
 * If uncompressed 16-bit PCM WAV fits within limit, outputs WAV for optimal acoustic clarity.
 * If WAV exceeds limit (e.g. multi-hour long media), automatically encodes to high-fidelity
 * 16kHz mono MP3 (64k CBR) preserving speech intelligibility under 95 MB.
 */
export async function extractOptimizedAudio(
  mediaPath: string,
  outputBasePath: string,
  targetMaxBytes = 95 * 1024 * 1024,
  timeoutMs = 300000
): Promise<AudioOptimizationResult> {
  const origStat = fs.statSync(mediaPath);
  const wavPath = outputBasePath.endsWith(".wav") ? outputBasePath : `${outputBasePath}.wav`;

  // Step 1: Extract mono 16k WAV
  await extractWav(mediaPath, wavPath, timeoutMs);

  const wavStat = fs.statSync(wavPath);
  if (wavStat.size <= targetMaxBytes) {
    return {
      path: wavPath,
      originalSize: origStat.size,
      optimizedSize: wavStat.size,
      compressionRatio: Math.round(((origStat.size - wavStat.size) / Math.max(1, origStat.size)) * 100),
      format: "wav",
    };
  }

  // Step 2: If WAV > 95MB, encode to compact 16kHz mono MP3
  const mp3Path = outputBasePath.replace(/\.[^.]+$/, "") + "_opt.mp3";
  const r = await runCommand("ffmpeg", [
    "-y",
    "-nostdin",
    "-fflags", "+discardcorrupt+genpts",
    "-err_detect", "ignore_err",
    "-i", wavPath,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-c:a", "libmp3lame",
    "-b:a", "64k",
    mp3Path,
  ], timeoutMs);

  if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 1024) {
    const mp3Stat = fs.statSync(mp3Path);
    return {
      path: mp3Path,
      originalSize: origStat.size,
      optimizedSize: mp3Stat.size,
      compressionRatio: Math.round(((origStat.size - mp3Stat.size) / Math.max(1, origStat.size)) * 100),
      format: "mp3",
    };
  }

  return {
    path: wavPath,
    originalSize: origStat.size,
    optimizedSize: wavStat.size,
    compressionRatio: Math.round(((origStat.size - wavStat.size) / Math.max(1, origStat.size)) * 100),
    format: "wav",
  };
}

export interface VadResult {
  speechRatio: number;
  speechSec: number;
  durationSec: number;
  intervals: number;
}

/** Energy VAD over a 16-bit PCM mono WAV with robust header parsing and adaptive energy thresholding. */
export function energyVad(wavPath: string, opts?: { thresholdDb?: number; frameMs?: number }): VadResult {
  if (!fs.existsSync(wavPath)) {
    throw new AudioProcessingError(`WAV file for VAD not found: ${wavPath}`, "FILE_NOT_FOUND", "vad");
  }

  const buf = fs.readFileSync(wavPath);
  if (buf.length < 44) {
    throw new AudioProcessingError("WAV file is truncated or invalid header", "INVALID_WAV_HEADER", "vad");
  }

  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const numChannels = buf.readUInt16LE(22); // Correct offset 22 for numChannels

  if (numChannels === 0 || bitsPerSample === 0 || sampleRate === 0) {
    throw new AudioProcessingError("Corrupt WAV audio parameters in header", "INVALID_WAV_PARAMS", "vad");
  }

  let dataOffset = 44;
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
  const bytesPerSample = Math.max(1, Math.floor(bitsPerSample / 8));
  const frameSamples = Math.max(1, Math.floor(((opts?.frameMs ?? 30) / 1000) * sampleRate));
  const frameBytes = frameSamples * numChannels * bytesPerSample;

  if (frameBytes <= 0 || data.length < frameBytes) {
    // Very short clip or empty
    return { speechRatio: 0, speechSec: 0, durationSec: 0, intervals: 0 };
  }

  const frames = Math.floor(data.length / frameBytes);
  if (frames < 2) {
    return { speechRatio: 0, speechSec: 0, durationSec: 0, intervals: 0 };
  }

  const energies = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * frameBytes;
    for (let s = 0; s < frameSamples * numChannels; s++) {
      const offset = start + s * bytesPerSample;
      if (offset + 2 <= data.length) {
        const v = data.readInt16LE(offset) / 32768.0;
        sum += v * v;
      }
    }
    energies[f] = Math.sqrt(sum / frameSamples);
  }

  let mean = 0;
  for (let f = 0; f < frames; f++) mean += energies[f];
  mean /= frames;

  let variance = 0;
  for (let f = 0; f < frames; f++) variance += (energies[f] - mean) ** 2;
  variance /= frames;
  const threshold = Math.max(mean + 1.5 * Math.sqrt(variance), 0.012);

  let speechFrames = 0;
  let intervals = 0;
  let inSpeech = false;

  for (let f = 0; f < frames; f++) {
    const isSpeech = energies[f] > threshold;
    if (isSpeech) {
      speechFrames++;
      if (!inSpeech) {
        intervals++;
        inSpeech = true;
      }
    } else {
      inSpeech = false;
    }
  }

  const durationSec = (frames * frameSamples) / sampleRate;
  const speechSec = (speechFrames * frameSamples) / sampleRate;

  return {
    speechRatio: durationSec > 0 ? Math.round((speechSec / durationSec) * 1000) / 1000 : 0,
    speechSec: Math.round(speechSec * 10) / 10,
    durationSec: Math.round(durationSec * 10) / 10,
    intervals,
  };
}

export function wavExists(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).size > 1024;
  } catch {
    return false;
  }
}

export const audioWorkPath = (dir: string, index: number) =>
  path.join(dir, `chunk_${String(index).padStart(3, "0")}.wav`);
