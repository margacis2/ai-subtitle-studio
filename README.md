# 🎬 AI Subtitle Studio

### GPU-Aware • Multilingual • Parallel Processing • Intelligent Subtitle Editing

**AI Subtitle Studio** is a multilingual AI-powered subtitle generation and editing workstation built with Next.js, TypeScript, PostgreSQL and Drizzle ORM.

Designed for long-form videos, movies, lectures, podcasts and other media, it provides a complete subtitle workflow — from media analysis and audio processing to transcription, translation, subtitle correction and export.

The application features resource-aware parallel processing, overlapping audio chunks, checkpoint-based recovery, subtitle quality analysis, an integrated editor and multiple subtitle export formats.

<p align="center">
  <a href="https://github.com/margacis2/ai-subtitle-studio">
    <img src="https://img.shields.io/badge/Project-AI%20Subtitle%20Studio-7C3AED?style=for-the-badge" />
  </a>
  <img src="https://img.shields.io/badge/Framework-Next.js-black?style=for-the-badge&logo=next.js" />
  <img src="https://img.shields.io/badge/Language-TypeScript-3178C6?style=for-the-badge&logo=typescript" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL-4169E1?style=for-the-badge&logo=postgresql" />
  <img src="https://img.shields.io/badge/Processing-GPU%20Aware-16A34A?style=for-the-badge" />
</p>

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Processing Architecture](#-processing-architecture)
- [Features](#-features)
- [Supported Languages](#-supported-languages)
- [Supported Export Formats](#-supported-export-formats)
- [AI and ASR Architecture](#-ai-and-asr-architecture)
- [Resource Management](#-resource-management)
- [Subtitle Quality Engine](#-subtitle-quality-engine)
- [Hardware Monitoring](#-hardware-monitoring)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [Requirements](#-requirements)
- [Installation](#-installation)
- [Windows Quick Start](#-windows-quick-start)
- [Keyboard Shortcuts](#-keyboard-shortcuts)
- [Data Storage and Privacy](#-data-storage-and-privacy)
- [Current Limitations](#-current-limitations)
- [Contributing](#-contributing)

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
│   │       ├── glossary/
│   │       └── hardware/
│   │
│   ├── components/
│   │   ├── Home.tsx
│   │   ├── Processing.tsx
│   │   ├── Editor.tsx
│   │   ├── PreviewPlayer.tsx
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

## 🏗️ Production Build

To generate a production build:

```bash
npm run build
```

Start the production application:

```bash
npm start
```

Ensure PostgreSQL and any required backend services are running before launching the application.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + O` | Open media files |
| `Ctrl + S` | Save project |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |
| `Ctrl + F` | Search subtitles |
| `←` | Previous subtitle |
| `→` | Next subtitle |

---

## 🔐 Data Storage and Privacy

AI Subtitle Studio is designed around local-first processing and locally managed project data.

- Project records are stored in PostgreSQL.
- Uploaded media and working files are stored under `data/` according to the application configuration.
- Server logs are written under `logs/application.log`.
- Logs are designed to record processing information such as timings, counts and detected languages rather than subtitle dialogue.
- External AI services require explicit backend configuration and may process data outside the local machine.

**Privacy note:** Local-first architecture does not automatically guarantee that every operation is offline. Actual data handling depends on enabled integrations and backend configuration.

Do not expose the application publicly without appropriate authentication, upload validation, access controls and secure configuration.

---

## ⚠️ Current Limitations

This project is actively evolving. Some capabilities depend on the configured backend and available hardware.

| Component | Current status |
|---|---|
| Web application | Implemented |
| Subtitle editor | Implemented |
| SRT/VTT/ASS/TXT export | Implemented |
| Chunk scheduler | Implemented |
| Overlap deduplication | Implemented |
| PostgreSQL checkpointing | Implemented |
| Quality inspection | Implemented |
| Hardware monitoring | Dependency-dependent |
| FFmpeg extraction | Dependency-dependent |
| Video subtitle burn-in | Dependency-dependent |
| Offline ASR demonstration engine | Implemented |
| Real Whisper transcription | Requires a working ASR integration |
| External translation providers | Requires provider configuration |

The built-in offline engine is intended to demonstrate and test the processing workflow. For real-world transcription, configure an actual speech recognition backend.

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