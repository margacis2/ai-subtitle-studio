import os
import time
import shutil
import subprocess
import tempfile
import psutil
from typing import Dict, Any, Optional
from backend.app.media.processor import get_ffmpeg_path


def _query_nvidia_used_mb() -> float:
    if not shutil.which("nvidia-smi"):
        return 0.0
    try:
        res = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=2,
        )
        if res.returncode == 0 and res.stdout.strip():
            return float(res.stdout.strip().splitlines()[0].strip())
    except Exception:
        pass
    return 0.0


def get_reference_audio(audio_path: Optional[str] = None) -> str:
    """Finds an existing audio file or generates a clean 10-second test WAV."""
    if audio_path and os.path.exists(audio_path):
        return audio_path

    # Check project root sample video/audio first if present
    sample_vid = os.path.join(os.getcwd(), "sample_test_video.mp4")
    if os.path.exists(sample_vid):
        return sample_vid

    # Check project directories for real user audio
    search_dirs = [
        os.path.join(os.getcwd(), "data", "work"),
        os.path.join(os.getcwd(), "data", "uploads"),
    ]
    for d in search_dirs:
        if os.path.isdir(d):
            for root, _, files in os.walk(d):
                for f in files:
                    if f.endswith((".wav", ".mp3")):
                        cand = os.path.join(root, f)
                        if os.path.getsize(cand) > 10000:
                            return cand

    # Generate a clean 10-second sine sample with ffmpeg
    sample_path = os.path.join(tempfile.gettempdir(), "studio_benchmark_sample.wav")
    if not os.path.exists(sample_path) or os.path.getsize(sample_path) < 1000:
        ffmpeg_bin = get_ffmpeg_path()
        res = subprocess.run([
            ffmpeg_bin, "-y", "-nostdin",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=10",
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
            sample_path
        ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if res.returncode != 0 or not os.path.exists(sample_path):
            raise RuntimeError(f"Failed to generate benchmark sample WAV: {res.stderr.decode('utf-8', errors='ignore')}")

    return sample_path


def benchmark_model(
    model_id: str = "small",
    audio_path: Optional[str] = None,
    device: str = "auto",
    compute_type: str = "auto",
) -> Dict[str, Any]:
    """
    Executes actual Faster-Whisper inference on hardware and measures
    load time, inference latency, RTF, RAM, and VRAM.
    """
    audio_file = get_reference_audio(audio_path)
    from backend.app.engines.transcriber import get_whisper_engine
    from backend.app.core.hardware import detect_hardware
    import torch

    process = psutil.Process(os.getpid())
    hw = detect_hardware()

    vram_before_mb = 0.0
    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()
        vram_before_mb = torch.cuda.memory_allocated() / (1024 * 1024)
    else:
        vram_before_mb = _query_nvidia_used_mb()

    t0 = time.time()
    engine = get_whisper_engine(
        model_id=model_id,
        preferred_device=device,
        compute_type=compute_type,
    )
    t_load = round(time.time() - t0, 3)

    actual_device = getattr(engine, "_studio_device", None)
    if not actual_device:
        raw_dev = getattr(getattr(engine, "model", None), "device", None)
        actual_device = str(raw_dev) if raw_dev else ("cuda" if hw.get("cuda_available") else "cpu")
    actual_compute = getattr(engine, "_studio_compute", None) or (
        "int8_float16" if actual_device == "cuda" else "int8"
    )

    t1 = time.time()
    segments_gen, info = engine.transcribe(
        audio_file,
        task="transcribe",
        beam_size=1,
        vad_filter=False,
        word_timestamps=False,
    )
    segments = list(segments_gen)
    t_transcribe = round(time.time() - t1, 3)

    duration = float(getattr(info, "duration", 10.0) or 10.0)
    rtf = round(t_transcribe / max(0.1, duration), 3)
    speedup = round(duration / max(0.01, t_transcribe), 1)

    ram_after_mb = process.memory_info().rss / (1024 * 1024)
    vram_peak_mb = 0.0
    if torch.cuda.is_available():
        vram_peak_mb = torch.cuda.max_memory_allocated() / (1024 * 1024)
    elif actual_device == "cuda":
        vram_after_mb = _query_nvidia_used_mb()
        vram_peak_mb = max(0.0, vram_after_mb - vram_before_mb) if vram_after_mb > vram_before_mb else vram_after_mb

    return {
        "ok": True,
        "model_id": model_id,
        "device": actual_device,
        "compute_type": actual_compute,
        "audio_duration_sec": round(duration, 2),
        "load_time_sec": t_load,
        "transcribe_time_sec": t_transcribe,
        "rtf": rtf,
        "speedup_factor": f"{speedup}x",
        "segments_count": len(segments),
        "detected_language": getattr(info, "language", "unknown"),
        "peak_ram_mb": round(ram_after_mb, 1),
        "peak_vram_mb": round(vram_peak_mb, 1),
    }
