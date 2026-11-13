# 🎬 AI Subtitle Studio — Cross-Platform Desktop & Multi-Device Workstation

### 100% Local • Offline AI • NVIDIA CUDA GPU-Accelerated • Faster-Whisper • Multi-Device Remote Access

**AI Subtitle Studio** is a professional, GPU-accelerated workstation for multilingual AI-powered subtitle generation, offline neural translation, and intelligent subtitle editing.

Run heavy AI speech recognition and translation on your host Windows PC (e.g. NVIDIA RTX 3050 Laptop GPU) and access the complete application seamlessly from your **Android phones, iPhones, tablets, laptops, and desktop browsers** over local Wi-Fi or secure remote tunnels.

<p align="center">
  <a href="https://github.com/margacis2/ai-subtitle-studio">
    <img src="https://img.shields.io/badge/Project-AI%20Subtitle%20Studio-7C3AED?style=for-the-badge" />
  </a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Android%20%7C%20iOS%20%7C%20Web-black?style=for-the-badge&logo=electron" />
  <img src="https://img.shields.io/badge/AI%20Engine-Faster--Whisper%20(CUDA)-16A34A?style=for-the-badge&logo=nvidia" />
  <img src="https://img.shields.io/badge/Database-Embedded%20SQLite%20(WAL)-003B57?style=for-the-badge&logo=sqlite" />
  <img src="https://img.shields.io/badge/Translation-Meta%20NLLB--200%20%2B%20OPUS--MT-FF6F00?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Remote%20Access-LAN%20%2B%20Cloudflare%20Tunnel-00C49F?style=for-the-badge" />
</p>

---

## 📌 Table of Contents

- [Key Capabilities](#-key-capabilities)
- [Multi-Device Remote Access](#-multi-device-remote-access)
- [System Architecture](#-system-architecture)
- [AI Speech Recognition & Translation Engines](#-ai-speech-recognition--translation-engines)
- [Hardware Acceleration & Monitoring](#-hardware-acceleration--monitoring)
- [Subtitle Editor & Export Formats](#-subtitle-editor--export-formats)
- [Batch Processing Queue & Model Switching](#-batch-processing-queue--model-switching)
- [Quick Start Guide](#-quick-start-guide)
- [Troubleshooting & Compatibility](#-troubleshooting--compatibility)
- [Data Privacy & Local Storage](#-data-privacy--local-storage)
- [Author & Acknowledgments](#-author)

---

## 🚀 Key Capabilities

- **100% Local AI Processing**: Faster-Whisper and neural translation execute entirely on your host computer. Zero audio or video data is transmitted to external clouds.
- **CUDA GPU Acceleration**: Native NVIDIA GPU execution (e.g. RTX 3050) with `float16` and `int8_float16` compute types, alongside automated CPU multi-threaded fallback.
- **Multi-Device & Mobile Access**: Access your PC's GPU processing from smartphones, tablets, and remote laptops over local Wi-Fi or secure internet tunnels without installing any mobile app.
- **Touch-Optimized Mobile UI**: Responsive slide-out navigation drawer, sticky bottom navigation bar, live upload progress indicator (showing %, MB loaded, and upload speed in MB/s).
- **Universal Neural Translation**:
  - **Meta NLLB-200**: Accelerated with CTranslate2 GPU INT8/FP16 supporting 200+ languages (Asian, Indic, European, Arabic, etc.).
  - **Helsinki-NLP OPUS-MT**: Fast, lightweight language-specific neural translation.
- **Embedded SQLite Database**: Zero-configuration, zero-dependency persistence using `better-sqlite3` in WAL mode (`studio.db`). No PostgreSQL server required!
- **Dynamic Model Switching**: Switch between `tiny`, `base`, `small`, `medium`, and `large-v3-turbo` models on the fly with automatic cache invalidation and fresh GPU re-transcription.
- **Full-Featured Subtitle Editor**: Audio-waveform scrubbing, video synchronization, timing shift, search & replace, speaker assignment, quality audit, and direct 1-tap mobile subtitle exports (SRT, VTT, ASS).
- **Video Subtitle Burn-In**: Hardcode styled subtitles directly into MP4 video with FFmpeg.

---

## 📱 Multi-Device Remote Access

AI Subtitle Studio turns your Windows PC into a private AI processing server for your household or workspace.

```
       📱 Android / iPhone (Safari / Chrome)
                      │
                      │  Wi-Fi LAN: http://192.168.x.x:3000
                      │  WAN Tunnel: https://*.trycloudflare.com
                      ▼
     ┌────────────────────────────────────────────────────────┐
     │           WINDOWS PC (Host AI Studio)                  │
     │                                                        │
     │  ┌──────────────────────┐    ┌──────────────────────┐  │
     │  │   Next.js BFF Web    │    │  FastAPI GPU Engine  │  │
     │  │   (Port 3000)        │───►│  (Port 8001, CUDA)   │  │
     │  └──────────────────────┘    └──────────────────────┘  │
     │                                     │                  │
     │                                     ▼                  │
     │                           NVIDIA RTX 3050 GPU          │
     │                        (Faster-Whisper / NLLB)         │
     └────────────────────────────────────────────────────────┘
```

### 1. Same Wi-Fi Access (LAN)
1. Launch the studio on your PC using `start.bat`.
2. Connect your phone or laptop to the same Wi-Fi network.
3. Open your mobile browser and navigate to the detected LAN URL (e.g. `http://10.170.213.169:3000`).
4. Or simply scan the **QR code** displayed on your PC screen or in the **Share & Mobile** tab.

### 2. Worldwide Internet Access (Cloudflare Tunnel)
- Enable **Internet Access** with a single click in the **Share & Mobile** tab.
- Generates an encrypted public HTTPS URL (`https://xxxx.trycloudflare.com`) with zero router port forwarding or firewall alterations.
- Optional **Access PIN security** prevents unauthorized users from submitting jobs to your GPU.

### 3. Remote Device Manager
- Real-time dashboard showing all connected devices, IP addresses, connection types (LAN / WAN), and active processing status.
- One-click capability to disconnect or block any remote device.

---

## 🔄 System Architecture

The pipeline processes media files with deterministic continuity and checkpoint recovery:

```text
         MEDIA INPUT (Mobile Upload / PC Drag & Drop)
                            │
                            ▼
              AUDIO EXTRACTION & OPTIMIZATION
                   (16 kHz Mono WAV / MP3)
                            │
                            ▼
                ENERGY-BASED VOICE DETECTION
                   (PCM Energy Thresholds)
                            │
                            ▼
              OVERLAPPING CHUNK SEGMENTATION
                            │
                            ▼
              GPU-ACCELERATED ASR TRANSCRIPTION
             (Faster-Whisper CUDA Float16 / INT8)
                            │
                            ▼
                 STAGE 2: NEURAL TRANSLATION
             (Meta NLLB-200 / OPUS-MT on CUDA)
                            │
                            ▼
              SUBTITLE DEDUPLICATION & MERGE
                            │
                            ▼
                 AUTOMATED QUALITY AUDIT
                            │
                            ▼
         SUBTITLE EDITOR & MULTI-FORMAT EXPORT
           ┌──────────┼──────────┼──────────┐
           ▼          ▼          ▼          ▼
          SRT        VTT        ASS     VIDEO BURN
```

---

## 🤖 AI Speech Recognition & Translation Engines

### 1. Faster-Whisper Speech Recognition
- **Engine**: CTranslate2-based implementation of OpenAI's Whisper.
- **Hardware**: Native CUDA 12 execution with cuBLAS acceleration and automatic CPU fallback.
- **Supported Models**:
  - `tiny` (~39M params, ~0.5 GB VRAM) — Ultra-fast drafting.
  - `base` (~74M params, ~0.7 GB VRAM) — Great balance for simple speech.
  - `small` (~244M params, ~1.5 GB VRAM) — Recommended default for conversational audio.
  - `medium` (~769M params, ~3.5 GB VRAM) — High-accuracy multilingual transcription.
  - `turbo` / `large-v3-turbo` (~809M params, ~4.0 GB VRAM) — State-of-the-art accuracy with 8x inference speedup.

### 2. Meta NLLB-200 Neural Translation
- **Engine**: Meta's No Language Left Behind (NLLB-200) distilled model powered by CTranslate2.
- **Capabilities**: Real-time multilingual translation supporting over 200 languages with native scripts (Japanese, Spanish, French, German, Tamil, Hindi, Arabic, Chinese, Russian, etc.).
- **Performance**: High-speed batch inference on CUDA GPU with INT8 precision.

### 3. Helsinki-NLP OPUS-MT
- **Engine**: Transformers MarianMT architecture with SentencePiece tokenization.
- **Capabilities**: Fast, dedicated bilingual neural translation models for common pairs.

---

## 📊 Hardware Acceleration & Monitoring

The built-in hardware diagnostic panel provides real-time system metrics:

- **GPU Status**: GPU model name, CUDA compute capability, VRAM usage, and driver status.
- **VRAM Optimization**: Automatic VRAM release between ASR and translation stages to ensure smooth operation on 4 GB laptop GPUs (e.g. RTX 3050).
- **RAM & CPU Monitoring**: Active process memory tracking and multi-core utilization.
- **Real-Time Speed & ETA**: Dynamic calculation of speech transcription throughput (audio seconds / processing second) and live countdown ETAs.

---

## ✏️ Subtitle Editor & Export Formats

The integrated subtitle workstation provides desktop and mobile control over subtitle text, layout, and timing:

- **Interactive Timeline**: Click-to-seek video synchronization and waveform scrubbing.
- **In-Editor Re-Translation**: Switch target languages or translation engines (`NLLB` / `OPUS`) and re-translate subtitles directly from the editor toolbar.
- **Search & Replace**: Global case-sensitive search and batch replacement.
- **Timing Adjustment**: Shift subtitle timings globally or by segment ranges.
- **One-Tap Mobile Downloads**: Dedicated download buttons for `.srt`, `.vtt`, and `.ass`.
- **Stylized Typography**: ASS subtitle export with custom fonts, colors, outlines, shadows, and screen alignments.
- **Video Burn-In**: Permanent subtitle embedding into MP4 video with FFmpeg.

---

## 🗂️ Batch Processing Queue & Model Switching

- **Multi-File Queue**: Add multiple videos or audio recordings for sequential batch processing.
- **Model Switching**: Change the ASR model on any queued or completed project; the system automatically resets the chunk status, purges old caches, and re-transcribes on the GPU.
- **Fault-Tolerant Resumption**: Incomplete jobs can be paused, resumed, or re-run from specific checkpoints without re-uploading media.

---

## ⚡ Quick Start Guide

### Prerequisites
- **Operating System**: Windows 10/11, macOS, or Linux.
- **Node.js**: Version 18 or newer.
- **Python**: Version 3.10 – 3.14.
- **NVIDIA GPU** *(Optional, recommended)*: NVIDIA RTX / GTX GPU with updated drivers for CUDA acceleration.

---

### One-Click Windows Setup & Launch

#### Step 1: Clone Repository
```powershell
git clone https://github.com/margacis2/ai-subtitle-studio.git
cd ai-subtitle-studio
```

#### Step 2: Automatic Environment Setup
Run the automated setup script to configure the Python virtual environment, install PyTorch with CUDA, Faster-Whisper, Transformers, and Node dependencies:
```powershell
.\setup.bat
```

#### Step 3: Launch Multi-Device Server
Start both the GPU AI backend (port 8001) and Next.js Studio (port 3000) with automatic LAN IP detection:
```powershell
.\start.bat
```

#### Step 4: Open in Browser
- **On your Windows PC**: Open [http://localhost:3000](http://localhost:3000)
- **On your Android / iPhone**: Connect to the same Wi-Fi and open `http://<YOUR_LAN_IP>:3000` (e.g. `http://10.170.213.169:3000`), or scan the QR code in the **Share** tab.

---

## 🛠️ Troubleshooting & Compatibility

### 1. PyAV `metadata_errors` Incompatibility
- *Issue*: PyAV versions 14+ removed the deprecated `metadata_errors` argument, causing older versions of Faster-Whisper to throw `TypeError: open() got an unexpected keyword argument 'metadata_errors'`.
- *Solution*: AI Subtitle Studio automatically wraps `av.open` with a backward-compatible kwarg filter in `backend/app/engines/transcriber.py` and `backend/app/main.py`.

### 2. cuBLAS DLL Resolution on Windows
- *Issue*: CTranslate2 cannot find `cublas64_12.dll` or `cublasLt64_12.dll` when running inside certain virtual environments.
- *Solution*: The engine dynamically resolves the project root and invokes `os.add_dll_directory()` on startup to guarantee seamless CUDA loading.

### 3. Mobile Upload Restrictions
- Supported mobile formats: MP4, MKV, MOV, WEBM, MP3, WAV, M4A, 3GP, 3GPP, AMR, FLAC, OGG, OPUS, AAC.
- Uses native Android and iOS media pickers with real-time XHR upload progress reporting.

---

## 🔐 Data Privacy & Local Storage

- **100% Offline AI**: Audio, video, and text transcripts are stored exclusively in `%LOCALAPPDATA%/AI Subtitle Studio/` and the local workspace `data/` folder.
- **No Cloud Subscription or API Keys**: Zero recurring subscription fees, quota limits, or third-party telemetry.
- **Automatic Garbage Collection**: Temporary extracted WAV chunks and optimized audio buffers are cleaned up automatically after processing.

---

## 👨‍💻 Author

**Tamilselvan**  
GitHub: [@margacis2](https://github.com/margacis2)  
Repository: [ai-subtitle-studio](https://github.com/margacis2/ai-subtitle-studio)

---

<p align="center">
  <b>AI Subtitle Studio</b><br/>
  Making local, GPU-accelerated subtitle workflows accessible from any device.
</p>
