import os
import sys
import time
import threading
import gc
from typing import Optional, Dict, Any, List

# Ensure current directory DLLs are available on Windows
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if sys.platform == "win32":
    os.environ["PATH"] = ROOT_DIR + os.pathsep + os.environ.get("PATH", "")
    if hasattr(os, "add_dll_directory") and os.path.isdir(ROOT_DIR):
        try:
            os.add_dll_directory(ROOT_DIR)
        except Exception:
            pass

from backend.app.core.hardware import get_model_cache_dir, detect_hardware

_model_instance = None
_current_model_id = None
_engine_lock = threading.Lock()

def get_whisper_engine(model_id: str = "small", preferred_device: str = "auto"):
    """
    Get or load the Faster-Whisper model instance with automatic hardware fallback.
    Tries CUDA (float16 -> int8_float16 -> int8) then CPU (int8).
    """
    global _model_instance, _current_model_id
    with _engine_lock:
        if _model_instance is not None and _current_model_id == model_id:
            return _model_instance

        # Unload existing to free VRAM
        if _model_instance is not None:
            del _model_instance
            _model_instance = None
            gc.collect()

        from faster_whisper import WhisperModel
        cache_dir = get_model_cache_dir()
        hw = detect_hardware()

        use_cuda = (preferred_device == "cuda") or (preferred_device == "auto" and hw["cuda_available"])
        loaded = None
        loaded_device = "cpu"
        loaded_compute = "int8"

        if use_cuda:
            for compute in ("float16", "int8_float16", "int8"):
                try:
                    loaded = WhisperModel(
                        model_id,
                        device="cuda",
                        compute_type=compute,
                        download_root=cache_dir
                    )
                    loaded_device = "cuda"
                    loaded_compute = compute
                    break
                except Exception as exc:
                    print(f"CUDA {compute} init failed: {exc}")

        if loaded is None:
            threads = max(2, (os.cpu_count() or 4) // 2)
            loaded = WhisperModel(
                model_id,
                device="cpu",
                compute_type="int8",
                cpu_threads=threads,
                download_root=cache_dir
            )
            loaded_device = "cpu"
            loaded_compute = "int8"

        _model_instance = loaded
        _current_model_id = model_id
        return _model_instance

def release_whisper_engine():
    """Explicitly release model from VRAM/RAM."""
    global _model_instance, _current_model_id
    with _engine_lock:
        if _model_instance is not None:
            del _model_instance
            _model_instance = None
            _current_model_id = None
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass

def transcribe_audio_file(
    audio_path: str,
    model_id: str = "small",
    source_lang: Optional[str] = None,
    word_timestamps: bool = False,
    beam_size: int = 5,
    vad_filter: bool = True
) -> Dict[str, Any]:
    """Transcribe an audio file and return structured segments with accurate timestamps."""
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    model = get_whisper_engine(model_id=model_id)
    lang = None if not source_lang or source_lang.lower() in ("auto", "") else source_lang.lower().split("-")[0]

    t0 = time.time()
    raw_segments = []
    detected_lang = lang or "ja"

    try:
        segments_gen, info = model.transcribe(
            audio_path,
            language=lang,
            task="transcribe",
            beam_size=beam_size,
            vad_filter=vad_filter,
            word_timestamps=word_timestamps,
            condition_on_previous_text=False
        )
        raw_segments = list(segments_gen)
        detected_lang = info.language
    except Exception as exc:
        print(f"[WARN] Primary transcription error ({exc}). Attempting CPU int8 fallback...")
        release_whisper_engine()
        from faster_whisper import WhisperModel
        threads = max(2, (os.cpu_count() or 4) // 2)
        cpu_model = WhisperModel(
            model_id,
            device="cpu",
            compute_type="int8",
            cpu_threads=threads,
            download_root=get_model_cache_dir()
        )
        segments_gen, info = cpu_model.transcribe(
            audio_path,
            language=lang,
            task="transcribe",
            beam_size=beam_size,
            vad_filter=vad_filter,
            word_timestamps=word_timestamps,
            condition_on_previous_text=False
        )
        raw_segments = list(segments_gen)
        detected_lang = info.language

    elapsed = time.time() - t0

    results = []
    for s in raw_segments:
        text = s.text.strip()
        if not text:
            continue
        seg_dict = {
            "startMs": int(round(s.start * 1000)),
            "endMs": int(round(s.end * 1000)),
            "original": text,
            "translation": text,
            "text": text,
            "confidence": int(round((1.0 - float(getattr(s, "no_speech_prob", 0.0))) * 100)),
            "lang": detected_lang
        }
        if word_timestamps and getattr(s, "words", None):
            seg_dict["words"] = [
                {
                    "startMs": int(round(w.start * 1000)),
                    "endMs": int(round(w.end * 1000)),
                    "text": w.word
                }
                for w in s.words
            ]
        results.append(seg_dict)

    return {
        "language": detected_lang,
        "duration": info.duration,
        "processingTimeSec": round(elapsed, 2),
        "segments": results
    }

