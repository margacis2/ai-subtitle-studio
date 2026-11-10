import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  hasFfmpeg,
  hasFfprobe,
  probeMedia,
  extractWav,
  energyVad,
  AudioProcessingError,
} from "@/lib/audio";
import { ensureDirs, isBackendAlive, ensureBackendRunning, WORK_DIR } from "@/lib/server";

export const runtime = "nodejs";

export interface DiagnosticStep {
  name: string;
  status: "PASS" | "FAIL";
  details: string;
  error?: string;
}

export async function GET() {
  const steps: DiagnosticStep[] = [];
  ensureDirs();

  // Step 1: Backend connectivity
  try {
    let alive = await isBackendAlive();
    if (!alive) {
      alive = await ensureBackendRunning();
    }
    if (alive) {
      steps.push({
        name: "1. Python AI Backend Connectivity",
        status: "PASS",
        details: "Local Python Faster-Whisper engine is online on 127.0.0.1:8001 (/health OK)",
      });
    } else {
      steps.push({
        name: "1. Python AI Backend Connectivity",
        status: "FAIL",
        details: "Local backend is unreachable on port 8001",
        error: "Run 'python -m backend.app.main' or launch via 'npm run desktop:dev'.",
      });
    }
  } catch (err: any) {
    steps.push({
      name: "1. Python AI Backend Connectivity",
      status: "FAIL",
      details: err.message,
      error: err.stack,
    });
  }

  // Step 2: FFmpeg executable
  try {
    if (hasFfmpeg()) {
      const ver = execFileSync("ffmpeg", ["-version"], { encoding: "utf-8", timeout: 3000 });
      const firstLine = ver.split("\n")[0] || "FFmpeg available";
      steps.push({
        name: "2. FFmpeg Executable",
        status: "PASS",
        details: firstLine.trim(),
      });
    } else {
      steps.push({
        name: "2. FFmpeg Executable",
        status: "FAIL",
        details: "ffmpeg command not found on system PATH",
        error: "Please install FFmpeg and add it to system PATH.",
      });
    }
  } catch (err: any) {
    steps.push({
      name: "2. FFmpeg Executable",
      status: "FAIL",
      details: "FFmpeg execution failed",
      error: err.message,
    });
  }

  // Step 3: FFprobe executable
  try {
    if (hasFfprobe()) {
      const ver = execFileSync("ffprobe", ["-version"], { encoding: "utf-8", timeout: 3000 });
      const firstLine = ver.split("\n")[0] || "FFprobe available";
      steps.push({
        name: "3. FFprobe Executable",
        status: "PASS",
        details: firstLine.trim(),
      });
    } else {
      steps.push({
        name: "3. FFprobe Executable",
        status: "FAIL",
        details: "ffprobe command not found on system PATH",
        error: "Please install FFprobe and add it to system PATH.",
      });
    }
  } catch (err: any) {
    steps.push({
      name: "3. FFprobe Executable",
      status: "FAIL",
      details: "FFprobe execution failed",
      error: err.message,
    });
  }

  // Step 4: Temporary Directory Write Access
  const testDir = path.join(WORK_DIR, "diag_temp");
  const testFile = path.join(testDir, "write_test.tmp");
  try {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testFile, "Antigravity Diagnostics Write Test", "utf-8");
    const read = fs.readFileSync(testFile, "utf-8");
    fs.unlinkSync(testFile);
    if (read.includes("Antigravity")) {
      steps.push({
        name: "4. Workspace & Temp Directory Permissions",
        status: "PASS",
        details: `Write, read, and delete confirmed in ${WORK_DIR}`,
      });
    } else {
      throw new Error("Read mismatch");
    }
  } catch (err: any) {
    steps.push({
      name: "4. Workspace & Temp Directory Permissions",
      status: "FAIL",
      details: `Cannot write to temporary directory ${WORK_DIR}`,
      error: err.message,
    });
  }

  // Step 5: Input Media Analysis
  let testMedia = path.join(process.cwd(), "sample_test_video.mp4");
  if (!fs.existsSync(testMedia)) {
    // Generate a minimal test media with ffmpeg if sample video is missing
    try {
      execFileSync("ffmpeg", [
        "-y", "-nostdin",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
        "-f", "lavfi", "-i", "color=c=black:s=320x240:d=3",
        "-c:v", "libx264", "-c:a", "aac",
        "-shortest",
        testMedia
      ], { timeout: 10000 });
    } catch {
      /* ignore */
    }
  }

  let probe: any = null;
  try {
    if (fs.existsSync(testMedia)) {
      probe = probeMedia(testMedia);
      steps.push({
        name: "5. Input Media Analysis",
        status: "PASS",
        details: `Analyzed ${path.basename(testMedia)}: format=${probe.format}, duration=${probe.durationSec.toFixed(1)}s`,
      });
    } else {
      steps.push({
        name: "5. Input Media Analysis",
        status: "FAIL",
        details: "No sample media file found for analysis test",
        error: "Create or upload a media file.",
      });
    }
  } catch (err: any) {
    steps.push({
      name: "5. Input Media Analysis",
      status: "FAIL",
      details: "Media probing failed",
      error: err.message,
    });
  }

  // Step 6: Audio Stream Detection
  try {
    if (probe && probe.hasAudio) {
      steps.push({
        name: "6. Audio Stream Detection",
        status: "PASS",
        details: `Audio stream verified (codec=${probe.audioCodec || "audio"}), hasVideo=${probe.hasVideo}`,
      });
    } else if (probe) {
      steps.push({
        name: "6. Audio Stream Detection",
        status: "FAIL",
        details: "Media file contains no audio track",
        error: "Input file must have an audio track.",
      });
    } else {
      steps.push({
        name: "6. Audio Stream Detection",
        status: "FAIL",
        details: "Skipped due to prior media probe failure",
      });
    }
  } catch (err: any) {
    steps.push({
      name: "6. Audio Stream Detection",
      status: "FAIL",
      details: err.message,
    });
  }

  // Step 7: Audio Extraction to mono 16kHz WAV
  const diagWav = path.join(testDir, "diag_extracted.wav");
  let wavOk = false;
  try {
    if (fs.existsSync(testMedia)) {
      await extractWav(testMedia, diagWav);
      if (fs.existsSync(diagWav) && fs.statSync(diagWav).size > 1024) {
        wavOk = true;
        steps.push({
          name: "7. Resilient Audio Extraction",
          status: "PASS",
          details: `Extracted mono 16 kHz PCM WAV (${(fs.statSync(diagWav).size / 1024).toFixed(1)} KB)`,
        });
      } else {
        throw new Error("Extracted file missing or empty");
      }
    } else {
      steps.push({
        name: "7. Resilient Audio Extraction",
        status: "FAIL",
        details: "No input media available to test extraction",
      });
    }
  } catch (err: any) {
    steps.push({
      name: "7. Resilient Audio Extraction",
      status: "FAIL",
      details: "Audio extraction failed",
      error: err.message,
    });
  }

  // Step 8: Output WAV Validation with FFprobe
  try {
    if (wavOk && fs.existsSync(diagWav)) {
      const wavProbe = probeMedia(diagWav);
      if (wavProbe.hasAudio && wavProbe.durationSec > 0) {
        steps.push({
          name: "8. Output WAV Acoustical Validation",
          status: "PASS",
          details: `WAV verified by FFprobe: format=${wavProbe.format}, duration=${wavProbe.durationSec.toFixed(2)}s`,
        });
      } else {
        throw new Error("Output WAV invalid duration or missing audio stream");
      }
    } else {
      steps.push({
        name: "8. Output WAV Acoustical Validation",
        status: "FAIL",
        details: "Skipped because WAV was not generated",
      });
    }
  } catch (err: any) {
    steps.push({
      name: "8. Output WAV Acoustical Validation",
      status: "FAIL",
      details: "WAV validation failed",
      error: err.message,
    });
  }

  // Step 9: VAD Initialization
  try {
    if (wavOk && fs.existsSync(diagWav)) {
      const v = energyVad(diagWav);
      steps.push({
        name: "9. Voice Activity Detection (VAD) Engine",
        status: "PASS",
        details: `Energy VAD calculated: speechRatio=${Math.round(v.speechRatio * 100)}%, intervals=${v.intervals}, speechSec=${v.speechSec}s`,
      });
    } else {
      steps.push({
        name: "9. Voice Activity Detection (VAD) Engine",
        status: "FAIL",
        details: "Skipped because WAV file was missing",
      });
    }
  } catch (err: any) {
    steps.push({
      name: "9. Voice Activity Detection (VAD) Engine",
      status: "FAIL",
      details: "VAD failed",
      error: err.message,
    });
  }

  // Cleanup temporary diagnostic file
  if (fs.existsSync(diagWav)) {
    try {
      fs.unlinkSync(diagWav);
    } catch {
      /* ignore */
    }
  }

  const allPassed = steps.every((s) => s.status === "PASS");

  return NextResponse.json({
    overall: allPassed ? "PASS" : "FAIL",
    passedCount: steps.filter((s) => s.status === "PASS").length,
    totalCount: steps.length,
    steps,
  });
}

