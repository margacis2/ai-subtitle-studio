import os
import time
import subprocess
import tempfile
import psutil
from typing import Dict, Any, Optional

def get_reference_audio(audio_path: Optional[str] = None) -> str:
    """Finds an existing audio file or generates a clean 15-second test WAV."""
    if audio_path and os.path.exists(audio_path):
        return audio_path

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
        subprocess.run([
            "ffmpeg", "-y", "-nostdin",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=10",
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
            sample_path
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    return sample_path

def benchmark_model(model_id: str = "small", audio_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Executes actual Faster-Whisper inference on hardware and measures
    load time, inference latency, RTF, RAM, and VRAM.
    """
    audio_file = get_reference_audio(audio_path)
    from backend.app.engines.transcriber import get_whisper_engine
    import torch

    process = psutil.Process(os.getpid())
    ram_before_mb = process.memory_info().rss / (1024 * 1024)

    vram_before_mb = 0.0
    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()
        vram_before_mb = torch.cuda.memory_allocated() / (1024 * 1024)

    t0 = time.time()
    engine = get_whisper_engine(model_id=model_id, preferred_device="auto")
    t_load = round(time.time() - t0, 3)

    device = getattr(engine.model, "device", "unknown") if hasattr(engine, "model") else "cuda"
    compute_type = "float16" if device == "cuda" else "int8"

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

    duration = getattr(info, "duration", 10.0)
    rtf = round(t_transcribe / max(0.1, duration), 3)
    speedup = round(duration / max(0.01, t_transcribe), 1)

    ram_after_mb = process.memory_info().rss / (1024 * 1024)
    vram_peak_mb = 0.0
    if torch.cuda.is_available():
        vram_peak_mb = torch.cuda.max_memory_allocated() / (1024 * 1024)

    return {
        "ok": True,
        "model_id": model_id,
        "device": device,
        "compute_type": compute_type,
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
