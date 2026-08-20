# AI Subtitle Studio

A GPU-aware, multilingual, parallel AI subtitle workstation — built as a full web app
(Next.js + PostgreSQL/Drizzle) that implements the complete desktop pipeline in the browser:

```
Video / Audio → Media analysis → Audio extraction → VAD → 10-min chunking (overlap)
  → Parallel worker pool → ASR → Language detection → Context-aware translation
  → Segmentation → Timestamp alignment → Quality engine → SRT / VTT / ASS / TXT
  → (optional) Burn-in
```

## What runs for real in this build

- **Chunk scheduler with overlap + true dedupe.** Chunks are planned with configurable
  2–30 min size and 1–5 s overlap. Segment generation is deterministic per global
  timeline slot, so overlapping chunks produce *identical* boundary segments — the
  merge stage genuinely counts and drops them ("overlap dups removed").
- **Resource-aware parallelism.** A client-side worker pool dispatches N concurrent
  chunk jobs (N chosen from the Model Manager's VRAM/RAM/CPU recommendation).
  Pausing stops dispatch without losing in-flight work; cancel keeps checkpoints.
- **Checkpoint / resume (PostgreSQL).** Every completed chunk and every subtitle row
  is persisted. Cancel, close the tab, or crash — resume re-processes only remaining
  chunks.
- **Quality engine.** Overlaps, duplicates, empties, flashes, long lines,
  max-duration, reading speed (CPS), punctuation, repeated phrases and ASR
  hallucination patterns ("Thank you for watching…") with jump-to-line and
  keep/remove actions. Score is a heuristic structural indicator, not a linguistic
  judgment.
- **Subtitle editor.** Edit text/timing, split, merge, add, delete, shift
  timestamps, search & replace, speaker rename, undo/redo (Ctrl+Z / Ctrl+Y),
  autosave, click-to-seek preview with overlaid subtitles, speed/volume controls.
- **Export.** SRT, VTT, ASS (font, size, bold/italic, outline, alignment, margins),
  TXT (plain or with timestamps). Download or copy.
- **Hardware monitor.** Real server probe: CPU model/cores, RAM, load average,
  NVIDIA GPU via `nvidia-smi` (name, VRAM, utilization, VRAM usage) and FFmpeg
  version — each shown honestly when absent, with the pipeline degrading to
  labeled fallbacks.
- **Glossary / translation memory, presets, benchmark, batch queue, auto-process
  new uploads (watch-folder equivalent), accessibility (theme, font scale,
  high contrast), keyboard shortcuts, local-first privacy.**

## The ASR engine — honest labeling

This sandbox has no Whisper/CUDA runtime, so the studio ships a **deterministic
offline engine** behind the same `BaseASR`-style interface. It models the full
signal path: VAD-like slotting, per-chunk language detection (EN/JA/TA/HI sample
corpora, including code-switched lines), seeded hallucination artifacts, non-speech
events, speaker labels, glossary application, profanity modes and auto-punctuation.
The UI labels it "Offline engine" everywhere it matters, and the benchmark table
states its numbers are measured wall time of that engine, not of Whisper.

Real FFmpeg paths exist in code and activate automatically when the server has
FFmpeg: full WAV extraction + adaptive-threshold **energy VAD on real PCM**, and
**burn-in** via safe `execFile` argument lists (`subtitles=` filter, output written
to a new `*_subtitled.mp4` — the original is never touched). Cloud ASR adapters
(OpenAI Whisper, Google, Azure) plug into the same engine interface and are
disabled until a provider key + FFmpeg extraction are configured server-side.

## Project layout

```
src/
  app/
    page.tsx                    app shell: views, toasts, prefs, shortcuts
    api/
      projects/                 CRUD + media streaming (HTTP Range)
        [id]/                   detail / patch / delete
        [id]/prepare            extraction + VAD stage
        [id]/chunks/[chunkId]   chunk worker (ASR + translation + dedupe)
        [id]/subtitles          bulk editor save
        [id]/cancel             keep-checkpoint cancel
        [id]/media              range-capable media / burned output
      burn/                     FFmpeg subtitle burn-in (safe subprocess)
      glossary/                 translation memory CRUD
      hardware/                 nvidia-smi / os probe with caching
  components/
    Home.tsx                    drop zone, job settings, presets, benchmarks, queue
    Processing.tsx              live dashboard: pool loop, log, feed, hardware
    Editor.tsx                  subtitle workbench + quality + export + glossary
    PreviewPlayer.tsx           seekable preview with subtitle overlay
    HardwarePanel.tsx           GPU/VRAM/CPU/RAM monitor
    SettingsModal.tsx           appearance, pipeline defaults, privacy
  lib/
    demo.ts                     offline engine (seeded, deterministic, dedupe-safe)
    modelManager.ts             VRAM/RAM-aware model + worker recommendation
    quality.ts                  heuristic quality engine
    formats.ts                  SRT/VTT/ASS/TXT writers + ASS styling
    time.ts                     time parsing/formatting + chunk planner
    hardware.ts / audio.ts      server probes, FFmpeg extraction, energy VAD
    client.ts                   typed browser API client
  db/schema.ts                  projects / chunks / subtitles / glossary
```

## Run

```bash
npm install
npx drizzle-kit push      # apply schema
npm run build && npm start
```

Server-side logs land in `logs/application.log` (timings, counts, languages —
never dialogue). Uploads/work files live under `data/`.

## Keyboard shortcuts

`Ctrl+O` open files · `Ctrl+S` save · `Ctrl+Z / Ctrl+Y` undo/redo ·
`Ctrl+F` search · `← / →` previous/next subtitle in preview.
