# 🎬 AI Subtitle Studio — Cross-Platform Desktop Application

### 100% Local • Offline AI • CUDA GPU-Accelerated • Faster-Whisper • Zero External Dependencies

**AI Subtitle Studio** is a professional, cross-platform desktop application for multilingual AI-powered subtitle generation, offline translation, and intelligent subtitle editing.

Built with **Electron**, **Next.js (React 19 / TypeScript)**, **FastAPI (Python)**, **Faster-Whisper (CTranslate2)**, and an embedded **SQLite** database, it operates completely locally on Windows, macOS, and Linux without requiring API keys, cloud credits, or active internet connections after models are downloaded.

<p align="center">
  <a href="https://github.com/margacis2/ai-subtitle-studio">
    <img src="https://img.shields.io/badge/Project-AI%20Subtitle%20Studio-7C3AED?style=for-the-badge" />
  </a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-black?style=for-the-badge&logo=electron" />
  <img src="https://img.shields.io/badge/AI%20Engine-Faster--Whisper%20(CUDA)-16A34A?style=for-the-badge&logo=nvidia" />
  <img src="https://img.shields.io/badge/Database-Embedded%20SQLite-003B57?style=for-the-badge&logo=sqlite" />
  <img src="https://img.shields.io/badge/Translation-Offline%20OPUS--MT-FF6F00?style=for-the-badge" />
</p>

---

## 📌 Table of Contents

- [Key Capabilities](#-key-capabilities)
- [Desktop Architecture](#-desktop-architecture)
- [Hardware & Acceleration](#-hardware--acceleration)
- [Model Management System](#-model-management-system)
- [Batch Processing Queue](#-batch-processing-queue)
- [Offline Translation](#-offline-translation)
- [Subtitle Editor & Export Formats](#-subtitle-editor--export-formats)
- [Quick Start Guide](#-quick-start-guide)
- [Desktop Development & Packaging](#-desktop-development--packaging)
- [Data Storage & Privacy](#-data-storage--privacy)
- [License & Credits](#-license--credits)

---

## 🚀 Key Capabilities

- **100% Local Processing**: Speech recognition and translation run on your device. Zero audio or video data leaves your computer.
- **Genuine AI Speech Recognition**: Powered by Faster-Whisper (CTranslate2) with automatic CUDA GPU acceleration (e.g. NVIDIA RTX 3050) and intelligent CPU int8 fallback.
- **Zero-Configuration SQLite Database**: Replaces PostgreSQL server requirements with an embedded SQLite database (`studio.db`) stored in your OS application data folder.
- **Built-in Model Manager**: One-click download and management of Faster-Whisper models (`tiny`, `base`, `small`, `medium`, `large-v3-turbo`) with RAM and VRAM estimation.
- **Batch Processing Queue**: Queue multiple audio and video files for sequential background processing with automated SRT export.
- **Offline Translation Engine**: Local neural machine translation via Hugging Face OPUS-MT (`transformers`) and Argos Translate.
- **Full-Featured Subtitle Editor**: Audio-waveform scrubbing, video synchronization, find & replace, timing shift, speaker assignment, quality checks, and video subtitle burn-in.
- **Multi-Format Export**: Export subtitles in **SRT**, **VTT**, **ASS** (with custom typography styling), **TXT**, and **JSON**.

---

## 🚀 Overview

AI Subtitle Studio aims to make professional subtitle generation and editing accessible through a unified web-based workstation.

Instead of processing an entire video as one large task, the application divides media into manageable chunks and schedules them through a resource-aware worker pool.

This architecture helps manage long media files, supports recovery after interruptions and provides greater control over the subtitle generation workflow.

**Core capabilities:**

- Intelligent media preparation and audio extraction.
- Voice Activity Detection (VAD).
- Configurable audio chunking with overlap.
- Parallel chunk scheduling.
- Language detection and translation pipeline.
- Timestamp-aware subtitle segmentation.
- Automatic subtitle quality inspection.
- Interactive subtitle editing.
- Multiple subtitle export formats.
- GPU, CPU and RAM monitoring.
- Project persistence and checkpoint recovery.

## 🔄 Processing Architecture

The complete processing workflow is designed around the following pipeline:

```text
         VIDEO / AUDIO INPUT
                 │
                 ▼
          MEDIA ANALYSIS
                 │
                 ▼
          AUDIO EXTRACTION
                 │
                 ▼
       VOICE ACTIVITY DETECTION
                 │
                 ▼
       CONFIGURABLE CHUNKING
          (2–30 Minutes)
                 │
                 ▼
       OVERLAPPING CHUNK PLAN
                 │
                 ▼
       RESOURCE-AWARE WORKER POOL
                 │
          ┌──────┼──────┐
          ▼      ▼      ▼
       Chunk 1 Chunk 2 Chunk N
          │      │      │
          ▼      ▼      ▼
       SPEECH RECOGNITION (ASR)
                 │
                 ▼
          LANGUAGE DETECTION
                 │
                 ▼
       CONTEXT-AWARE TRANSLATION
                 │
                 ▼
        SUBTITLE SEGMENTATION
                 │
                 ▼
        TIMESTAMP ALIGNMENT
                 │
                 ▼
          OVERLAP DEDUPLICATION
                 │
                 ▼
          QUALITY ANALYSIS
                 │
                 ▼
          SUBTITLE EDITOR
                 │
                 ▼
          EXPORT SUBTITLES
          ┌──────┼──────┐
          ▼      ▼      ▼
         SRT    VTT    ASS / TXT
                 │
                 ▼
        OPTIONAL VIDEO BURN-IN
```

## ✨ Features

### 1. Intelligent Chunk Processing

Long media files are divided into configurable processing segments.

- Chunk duration: 2–30 minutes.
- Configurable overlap: 1–5 seconds.
- Deterministic segment generation.
- Boundary segment deduplication.
- Global timeline consistency.
- Processed chunk tracking.

Overlapping chunks help maintain continuity at segment boundaries. The merge stage identifies and removes matching duplicate segments.

### 2. Resource-Aware Parallel Processing

The application uses a client-side worker pool to coordinate chunk-processing requests.

- Configurable concurrent workers.
- RAM, VRAM and CPU-aware recommendations.
- Pause and resume processing.
- Cancellation with checkpoint preservation.
- Processing status and activity logs.
- Resource-aware workload planning.

### 3. Project Checkpoint and Recovery

Project information and processing progress are persisted using PostgreSQL.

- Completed chunk tracking.
- Subtitle row persistence.
- Resume incomplete processing tasks.
- Preserve completed work after cancellation.
- Recover projects after browser interruptions.

The application can continue from the remaining chunks rather than restarting an entire project, subject to the availability of its saved project data.

### 4. Integrated Subtitle Editor

A dedicated editing workspace provides control over subtitle text and timing.

**Editing capabilities:**

- Add, edit and delete subtitle entries.
- Split and merge subtitle segments.
- Adjust start and end timestamps.
- Shift subtitle timings.
- Search and replace text.
- Rename speaker labels.
- Undo and redo operations.
- Automatic saving.
- Preview subtitles alongside video.
- Click-to-seek playback.
- Playback speed and volume controls.

### 5. Subtitle Quality Engine

An automated quality inspection system identifies common structural subtitle problems.

| Quality check | Description |
|---|---|
| Overlapping subtitles | Detects conflicting time ranges |
| Duplicate entries | Identifies repeated segments |
| Empty subtitles | Finds missing subtitle text |
| Flash subtitles | Detects unusually short entries |
| Long subtitle lines | Identifies excessively long text |
| Reading speed | Evaluates characters per second (CPS) |
| Maximum duration | Detects excessively long entries |
| Punctuation | Checks basic punctuation patterns |
| Repeated phrases | Identifies suspicious repetition |
| ASR hallucinations | Flags known suspicious transcription patterns |

The quality score is a heuristic structural indicator. It does not represent guaranteed linguistic accuracy.

Users can inspect flagged entries, navigate to the relevant subtitle and choose whether to keep or remove them.

### 6. Multiple Subtitle Export Formats

Export subtitles according to your requirements.

| Format | Supported capabilities |
|---|---|
| SRT | Standard subtitle format |
| VTT | Web video subtitles |
| ASS | Advanced styling and positioning |
| TXT | Plain transcription text |
| TXT with timestamps | Text with timeline information |

**ASS customization includes:**

- Font family.
- Font size.
- Bold and italic styling.
- Outline.
- Alignment.
- Screen margins.

Exported files can be downloaded or copied.

### 7. Video Preview and Subtitle Burn-in

The integrated preview player supports:

- Video playback.
- Subtitle overlay.
- Click-to-seek navigation.
- Playback speed adjustment.
- Volume adjustment.

Optional FFmpeg-powered subtitle burn-in creates a new subtitled video file.

The original media file is not overwritten. Burn-in output uses a separate filename:

```text
original_video.mp4
original_video_subtitled.mp4
```

### 8. Glossary and Translation Memory

Maintain consistent terminology throughout subtitle projects.

- Custom glossary entries.
- Translation memory.
- Reusable terminology.
- Glossary application during processing.
- Language-aware text handling.

### 9. Batch Processing and Automation

Manage multiple subtitle projects through a unified queue.

- Batch upload.
- Processing queue.
- Reusable processing presets.
- Automatic processing of newly uploaded files.
- Benchmarking.
- Processing progress monitoring.

### 10. Accessibility and Customization

- Light and dark themes.
- Adjustable font scaling.
- High-contrast mode.
- Configurable processing preferences.
- Keyboard shortcuts.

---

## 🌍 Supported Languages

The offline demonstration engine includes sample language corpora for:

| Language | Code |
|---|---|
| English | EN |
| Japanese | JA |
| Tamil | TA |
| Hindi | HI |

The architecture supports language detection and translation adapters.

**Note:** These languages are represented in the deterministic demonstration engine. Actual transcription and translation language coverage depends on the configured ASR and translation provider.

---

## 🤖 AI and ASR Architecture

AI Subtitle Studio uses a modular processing architecture designed to support different speech recognition and translation backends.

### Current Offline Engine

The repository includes a deterministic offline demonstration engine behind a common ASR-style interface.

It simulates aspects of the subtitle-processing workflow, including:

- VAD-like segment slotting.
- Per-chunk language selection.
- Sample multilingual subtitle generation.
- Code-switched sample lines.
- Speaker labels.
- Non-speech events.
- Glossary application.
- Profanity handling modes.
- Automatic punctuation.
- Deterministic processing artifacts.

**Important:** The current deterministic offline engine is not equivalent to a real Whisper speech recognition model. Its generated text must not be treated as genuine transcription of uploaded audio.

### Real Media Processing

Where the required server dependencies are installed, the application also includes real media-processing paths:

- FFmpeg audio extraction.
- WAV generation.
- Adaptive-threshold energy-based VAD on PCM audio.
- FFmpeg subtitle burn-in.

### Extensible AI Integrations

The architecture is designed to accommodate external ASR and translation integrations.

Potential integrations include:

- OpenAI Whisper.
- Google Cloud Speech services.
- Microsoft Azure Speech services.
- Faster-Whisper.
- OPUS-MT translation models.

These integrations require their corresponding backend implementations, dependencies and credentials. They should not be considered active merely because the architecture supports adapters.

---

## ☁️ Google Colab Cloud GPU Addon

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/margacis2/ai-subtitle-studio/blob/main/colab_backend.ipynb)

```
+-----------------------------------+         +----------------------------------+
|   AI Subtitle Studio (Local PC)   |         |    Google Colab (Cloud GPU T4)   |
|   http://localhost:3000           |         |                                  |
|                                   |  HTTPS  |  Faster-Whisper (Large-v3-Turbo) |
| 1. Uploads video                  | ======> |  OPUS-MT (Neural Translation)    |
| 2. Auto-optimizes audio (<100MB)  | (Tunnel)|  Tesla T4 16 GB VRAM             |
| 3. Displays Real-time Subtitles   | <====== |  Accurate Timestamps             |
+-----------------------------------+         +----------------------------------+
```

For users wanting maximum transcription quality using large models (`large-v3-turbo`) without utilizing local GPU memory or laptop battery, AI Subtitle Studio includes an authenticated, high-speed Google Colab GPU pipeline.

---

### 📖 Step-by-Step Real-Time Walkthrough

#### Step 1: Open the Colab Notebook & Enable Free GPU
1. Click the **[Open In Colab](https://colab.research.google.com/github/margacis2/ai-subtitle-studio/blob/main/colab_backend.ipynb)** badge or open `colab_backend.ipynb`.
2. In Google Colab's menu bar, click:
   - **Runtime** → **Change runtime type**
   - Under **Hardware accelerator**, select **T4 GPU** (free tier)
   - Click **Save**

#### Step 2: Run the Notebook Cells
1. **Cell 1 (Diagnostics)**: Click ▶ to verify hardware. Shows `GPU Accelerator: [ACTIVE] Tesla T4 (15.00 GB VRAM)` and FFmpeg status.
2. **Cell 2 (Dependencies)**: Click ▶ to install Faster-Whisper, Hugging Face Transformers, and Cloudflare tunnel (~45s).
3. **Cell 3 (Engine Config)**: Click ▶ to configure model settings (default: `large-v3-turbo`, 100 MB upload limit).
4. **Cell 4 (Launch Tunnel)**: Click ▶ to start the GPU server. It displays your connection card:
   ```text
   =================================================================
     🚀 AI SUBTITLE STUDIO - GOOGLE COLAB GPU BACKEND ONLINE!
   =================================================================
     🔗 Engine URL    : https://xxxx-xxxx.trycloudflare.com
     🔑 API Token     : colab-sec-9a8f
     ⚡ Model Target  : Faster-Whisper large-v3-turbo (CUDA)
   =================================================================
   ```

#### Step 3: Connect in AI Subtitle Studio
1. In your browser at `http://localhost:3000`, click **Settings (⚙️)** (or click **Guide & Tutorial**).
2. Under **Addon: Google Colab Remote GPU**:
   - **Tunnel / Engine URL**: Paste `https://xxxx-xxxx.trycloudflare.com`
   - **API Secret Token**: Paste `colab-sec-9a8f`
3. Click **Save & Verify Connection**. The status indicator turns green:
   ```text
   ● Online (large-v3-turbo) · 165ms
   ```

#### Step 4: Run a Real-Time Video Transcription & Translation
1. On the home page, drop any video or the included sample file: `sample_test_video.mp4` (~0.95 MB).
2. Choose **Source Language**: `Auto Detect` (or `English`).
3. Choose **Target Language**: `Tamil` (தமிழ்), `Japanese` (日本語), `Spanish` (Español), or `Original`.
4. Click **Start Processing**.
5. Watch the real-time processing log:
   - Audio is extracted and optimized (16 kHz mono WAV / MP3 under 100 MB).
   - Voice activity detection (VAD) identifies speech boundaries.
   - Sent to Colab GPU: Faster-Whisper transcribes every line with millisecond timestamps.
   - OPUS-MT translates sentences on the GPU.
   - Live subtitles appear synchronized in the real-time player!
6. Click **Export** anytime to download `.srt`, `.vtt`, `.ass`, or burn subtitles into your video.

#### Step 5: Switch Back to Local Mode
Whenever you want to run offline:
1. Open **Settings (⚙️)**.
2. Click **Reset to Local GPU**. The studio immediately returns to your local `http://127.0.0.1:8001` backend without restarting.

---

### 🛡️ Automatic Pre-Upload Media Optimization (< 100 MB Target)
Before sending media over the cloud tunnel, the server extracts and optimizes the audio track:
- Original media remains completely intact and untouched.
- Optimized audio is converted to **16 kHz mono WAV** (~32 KB/sec).
- If duration exceeds 45 minutes and WAV exceeds 95 MB, it automatically compresses to **64 kbps mono MP3**, staying well below the 100 MB upload limit while maintaining peak ASR speech clarity.
- Progress and byte savings (e.g., `142 MB → 18 MB, saved 87%`) are displayed live in the processing log.

### 🧪 Automated Acceptance Testing
You can run the end-to-end pipeline verification test anytime using the included test assets:
```bash
# Generate sample test video with speech synthesis
powershell -ExecutionPolicy Bypass -File scripts\generate_sample_video.ps1

# Run full pipeline verification test
python scripts\verify_pipeline.py
```
This automatically verifies video conversion, < 100 MB size validation, Faster-Whisper execution, timestamp monotonicity, and OPUS-MT translation.

### 🛡️ Automatic Pre-Upload Media Optimization (< 100 MB Target)
Before sending media over the cloud tunnel, the server extracts and optimizes the audio track:
- Original media remains completely intact and untouched.
- Optimized audio is converted to **16 kHz mono WAV** (~32 KB/sec).
- If duration exceeds 45 minutes and WAV exceeds 95 MB, it automatically compresses to **64 kbps mono MP3**, staying well below the 100 MB upload limit while maintaining peak ASR speech clarity.
- Progress and byte savings (e.g., `142 MB → 18 MB, saved 87%`) are displayed live in the processing log.

### 🧪 Automated Acceptance Testing
You can run the end-to-end pipeline verification test anytime using the included test assets:
```bash
# Generate sample test video with speech synthesis
powershell -ExecutionPolicy Bypass -File scripts\generate_sample_video.ps1

# Run full pipeline verification test
python scripts\verify_pipeline.py
```
This automatically verifies video conversion, < 100 MB size validation, Faster-Whisper execution, timestamp monotonicity, and OPUS-MT translation.

---

## ⚡ Resource Management

The Model Manager recommends processing configurations using available hardware resources.

| Resource | Purpose |
|---|---|
| CPU | General processing capacity |
| RAM | Memory availability |
| GPU | Accelerated AI processing where supported |
| VRAM | GPU memory capacity |
| Worker pool | Concurrent chunk scheduling |

The application uses these recommendations to help select an appropriate processing configuration.

Actual processing speed depends on the selected backend, model, hardware, media duration and workload.

## 📊 Hardware Monitoring

The hardware monitoring module provides server-side system information.

**CPU**
- CPU model.
- Available cores.
- System load average.

**RAM**
- Total memory.
- Available memory.
- Memory utilization.

**NVIDIA GPU**
- GPU model.
- VRAM capacity.
- VRAM utilization.
- VRAM usage.

**Media tools**
- FFmpeg availability.
- FFmpeg version.

GPU monitoring uses `nvidia-smi` when available. Missing hardware information is reported as unavailable rather than presented as fabricated measurements.

---

## 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Styling | Tailwind CSS |
| Backend | Next.js API Routes |
| Database | PostgreSQL |
| ORM | Drizzle ORM |
| Media processing | FFmpeg |
| Audio processing | WAV, PCM, Energy-based VAD |
| AI architecture | Modular ASR and translation adapters |
| Hardware monitoring | Python, NVIDIA `nvidia-smi` |
| Development | Node.js, npm, Python |

---

## 📁 Project Structure

```text
ai-subtitle-studio/
│
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   │
│   │   └── api/
│   │       ├── projects/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       ├── prepare/
│   │       │       ├── chunks/
│   │       │       ├── subtitles/
│   │       │       ├── cancel/
│   │       │       └── media/
│   │       │
│   │       ├── burn/
│   │       ├── colab/
│   │       ├── glossary/
│   │       ├── hardware/
│   │       └── translate/
│   │
│   ├── components/
│   │   ├── Home.tsx
│   │   ├── Processing.tsx
│   │   ├── Editor.tsx
│   │   ├── PreviewPlayer.tsx
│   │   ├── TranslationView.tsx
│   │   ├── HardwarePanel.tsx
│   │   └── SettingsModal.tsx
│   │
│   ├── lib/
│   │   ├── demo.ts
│   │   ├── modelManager.ts
│   │   ├── quality.ts
│   │   ├── formats.ts
│   │   ├── time.ts
│   │   ├── hardware.ts
│   │   ├── audio.ts
│   │   └── client.ts
│   │
│   └── db/
│       └── schema.ts
│
├── server.py
├── start_studio.bat
├── colab_backend.ipynb
├── drizzle.config.json
├── package.json
├── package-lock.json
├── next.config.ts
├── tsconfig.json
└── README.md
```

---

## 💻 Requirements

Before installing, ensure the following tools are available.

| Requirement | Purpose |
|---|---|
| Node.js | Next.js runtime |
| npm | Dependency management |
| Python 3 | Optional backend services |
| PostgreSQL | Persistent project storage |
| FFmpeg | Audio extraction and video processing |
| NVIDIA GPU | Optional GPU acceleration |
| NVIDIA drivers | GPU monitoring and CUDA workloads |

A compatible NVIDIA GPU is not mandatory for running the web application. GPU-dependent features require the appropriate hardware, drivers and backend configuration.

---

## 📦 Installation

### 1. Clone the repository

```bash
git clone https://github.com/margacis2/ai-subtitle-studio.git

cd ai-subtitle-studio
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure PostgreSQL

Create a PostgreSQL database for the application.

Configure the database connection using the environment variable expected by the project's Drizzle configuration.

For example, if the project uses `DATABASE_URL`, create a `.env.local` file:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/ai_subtitle_studio
```

Replace the example credentials with your actual database details.

Never commit database credentials or API keys to GitHub.

### 4. Apply the database schema

```bash
npx drizzle-kit push
```

This applies the Drizzle schema to the configured database.

### 5. Start the development server

```bash
npm run dev
```

### 6. Open the application

Visit:

```text
http://localhost:3000
```

---

## 🪟 Windows Quick Start

The repository includes a Windows startup script.

You can start the application using:

```powershell
.\start_studio.bat
```

Alternatively:

1. Open the project folder.
2. Double-click `start_studio.bat`.
3. Allow the startup process to complete.
4. Open your browser.
5. Visit `http://localhost:3000`.

The script handles the startup steps implemented in the repository. Database configuration and required dependencies must be completed beforehand.

---

## 🐍 Optional Python Backend

The repository also includes `server.py` and a Colab backend notebook.

For configurations where the Python backend and its dependencies have been installed:

```bash
python -m venv .venv
```

Activate the environment on Windows:

```powershell
.venv\Scripts\activate
```

Install the backend dependencies using the project's provided requirements file, if available.

Start the backend:

```bash
python server.py
```

The actual ASR and translation capabilities depend on the backend implementation and its configured models or providers.

---

## 🖥️ Desktop Development & Packaging

To run the application locally in desktop mode:

```bash
# 1. Install Node.js dependencies
npm install

# 2. Start Electron desktop application connected to local AI backend
npm run desktop:dev
```

To build and package native desktop installers:

```bash
# Compile desktop Electron bridge
npm run desktop:build

# Package for current platform (Windows NSIS / Portable, macOS DMG, Linux AppImage)
npm run desktop:pack

# Create distributable installers
npm run desktop:dist
```

### End-to-End Pipeline Verification

Verify all local hardware, CTranslate2 CUDA speech recognition, OPUS-MT translation, and FastAPI endpoints:

```bash
python scripts/verify_desktop_pipeline.py
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + O` | Open media file picker |
| `Ctrl + S` | Save subtitles to SQLite database |
| `Ctrl + Z` | Undo subtitle edits |
| `Ctrl + Y` | Redo subtitle edits |
| `Ctrl + F` | Search & Replace subtitles |
| `←` | Jump to previous subtitle |
| `→` | Jump to next subtitle |

---

## 🔐 Data Storage & Privacy

AI Subtitle Studio operates on a **100% Local-First** architecture:

- **Database**: Zero external database servers required. Project records, chunk states, and glossaries are saved in an embedded SQLite database (`studio.db`) stored at `%LOCALAPPDATA%/AI Subtitle Studio/` (or OS standard equivalent).
- **AI Models**: Faster-Whisper and OPUS-MT models are downloaded from Hugging Face directly to your local cache (`%LOCALAPPDATA%/AI Subtitle Studio/models/`) and run completely offline.
- **Media Privacy**: Uploaded media, extracted audio, and transcribed dialogue never leave your machine.
- **Cleanup**: Temporary audio chunks and intermediate extraction files are guaranteed to be cleaned up after processing.

---

## ⚠️ Current Status & Verification

| Component | Status | Details |
|---|---|---|
| **Cross-Platform Desktop Shell** | ✅ Operational | Electron 45 + secure context-isolated preload bridge |
| **Local SQLite Database** | ✅ Operational | `better-sqlite3` + Drizzle ORM (Zero PostgreSQL dependency) |
| **GPU Speech Recognition** | ✅ Operational | Faster-Whisper on NVIDIA RTX 3050 CUDA (0.49s for test WAV) |
| **CPU int8 Fallback** | ✅ Operational | Multi-stage fallback for devices without dedicated GPUs |
| **Model Download Manager** | ✅ Operational | Official Faster-Whisper catalog with real-time download tracking |
| **Batch Processing Queue** | ✅ Operational | Multi-media queue with background execution and auto-export |
| **Offline Translation Engine** | ✅ Operational | OPUS-MT (`transformers`) + Argos Translate (ES/JA/TA/HI -> EN) |
| **Complete Subtitle Editor** | ✅ Operational | Waveform seeking, split, merge, undo/redo, speaker diarization |
| **Multi-Format Subtitle Export** | ✅ Operational | Full support for SRT, VTT, ASS (styled typography), TXT, JSON |
| **Video Subtitle Burn-In** | ✅ Operational | Hardcode styled subtitles directly into MP4 video with FFmpeg |

---

## 🤝 Contributing

Contributions, bug reports and feature suggestions are welcome!

If you want to contribute:

1. Fork this repository.
2. Create a feature branch.
3. Implement your changes.
4. Test your changes.
5. Submit a pull request.

For bugs and feature requests, use the GitHub Issues section.

---

## 🗺️ Project Roadmap

Potential future improvements include:

- [ ] Full local Whisper/Faster-Whisper integration.
- [ ] GPU-accelerated transcription.
- [ ] Real OPUS-MT translation integration.
- [ ] Improved multilingual and code-switched transcription.
- [ ] Advanced speaker diarization.
- [ ] More accurate word-level timestamp alignment.
- [ ] Enhanced subtitle synchronization.
- [ ] Advanced subtitle translation memory.
- [ ] Improved batch processing.
- [ ] Additional AI model integrations.
- [ ] Docker-based deployment.
- [ ] Improved offline-first deployment.

---

## 📄 License

Check the repository for its applicable license before redistributing or modifying the project.

---

## 👨‍💻 Author

**Tamilselvan**

GitHub: [@margacis2](https://github.com/margacis2)

Project: [AI Subtitle Studio](https://github.com/margacis2/ai-subtitle-studio)

If you find this project interesting, consider giving the repository a ⭐ star and sharing your feedback!

---

<p align="center">
  <b>AI Subtitle Studio</b><br/>
  Making multilingual subtitle workflows smarter, more manageable and more accessible.
</p>