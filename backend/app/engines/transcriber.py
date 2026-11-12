import os
import sys
import time
import threading
import gc
import traceback
from typing import Optional, Dict, Any, List

# Locate project root dynamically to find cublas64_12.dll and cublasLt64_12.dll
def find_project_root():
    curr = os.path.abspath(os.path.dirname(__file__))
    for _ in range(6):
        if os.path.exists(os.path.join(curr, "cublas64_12.dll")) or os.path.exists(os.path.join(curr, "package.json")):
            return curr
        parent = os.path.dirname(curr)
        if parent == curr:
            break
        curr = parent
    return curr

ROOT_DIR = find_project_root()
if sys.platform == "win32":
    os.environ["PATH"] = ROOT_DIR + os.pathsep + os.environ.get("PATH", "")
    if hasattr(os, "add_dll_directory") and os.path.isdir(ROOT_DIR):
        try:
            os.add_dll_directory(ROOT_DIR)
        except Exception as e:
            print(f"[WARN] Failed to add DLL directory {ROOT_DIR}: {e}")

from backend.app.core.hardware import get_model_cache_dir, detect_hardware

_model_instance = None
_current_model_key = None
_engine_lock = threading.Lock()

def get_whisper_engine(
    model_id: str = "small",
    preferred_device: str = "auto",
    compute_type: str = "auto",
    workers: int = 0
):
    """
    Get or load the Faster-Whisper model instance.
    Supports CUDA with float16 / int8_float16 / int8, with graceful CPU int8 fallback.
    """
    global _model_instance, _current_model_key

    clean_id = (model_id or "small").strip()
    if clean_id in ("turbo", "large-v3-turbo"):
        resolved_id = "turbo"
    elif clean_id in ("large", "large-v3"):
        resolved_id = "large-v3"
    else:
        resolved_id = clean_id

    model_key = f"{resolved_id}:{preferred_device}:{compute_type}"

    with _engine_lock:
        if _model_instance is not None and _current_model_key == model_key:
            return _model_instance

        # Unload existing model to free VRAM/RAM
        if _model_instance is not None:
            del _model_instance
            _model_instance = None
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass

        # Check for next-gen models requirement
        if resolved_id in ("canary", "parakeet", "qwen-audio", "moonshine", "phonon-2"):
            from backend.app.models.manager import find_model_path, AVAILABLE_WHISPER_MODELS
            path = find_model_path(resolved_id)
            meta = AVAILABLE_WHISPER_MODELS.get(resolved_id, {})
            if not path:
                raise ValueError(
                    f"Model '{meta.get('name', resolved_id)}' weights are not yet downloaded on this machine. "
                    f"Please visit the Model Manager tab to download {meta.get('name', resolved_id)} ({meta.get('size_mb', 0)} MB)."
                )

        from faster_whisper import WhisperModel
        cache_dir = get_model_cache_dir()
        hw = detect_hardware()

        use_cuda = False
        if preferred_device == "cuda":
            use_cuda = True
        elif preferred_device == "auto":
            use_cuda = bool(hw.get("cuda_available", False))

        loaded = None
        used_device = "cpu"
        used_compute = "int8"

        if use_cuda:
            # Candidates for CUDA compute types
            if compute_type not in ("auto", "", None):
                computes = [compute_type]
            else:
                computes = ["float16", "int8_float16", "int8"]

            for comp in computes:
                try:
                    print(f"[*] Initializing Faster-Whisper '{resolved_id}' on CUDA ({comp})...")
                    loaded = WhisperModel(
                        resolved_id,
                        device="cuda",
                        compute_type=comp,
                        download_root=cache_dir
                    )
                    used_device = "cuda"
                    used_compute = comp
                    print(f"[✓] Faster-Whisper '{resolved_id}' loaded on CUDA ({comp})")
                    break
                except Exception as exc:
                    print(f"[WARN] CUDA {comp} failed: {exc}")

        if loaded is None:
            threads = workers if workers > 0 else max(2, (os.cpu_count() or 4) // 2)
            comp = compute_type if compute_type in ("int8", "float32") else "int8"
            print(f"[*] Initializing Faster-Whisper '{resolved_id}' on CPU ({comp}, {threads} threads)...")
            loaded = WhisperModel(
                resolved_id,
                device="cpu",
                compute_type=comp,
                cpu_threads=threads,
                download_root=cache_dir
            )
            used_device = "cpu"
            used_compute = comp
            print(f"[✓] Faster-Whisper '{resolved_id}' loaded on CPU ({comp})")

        _model_instance = loaded
        _current_model_key = model_key
        return _model_instance

def release_whisper_engine():
    """Explicitly release model from VRAM/RAM."""
    global _model_instance, _current_model_key
    with _engine_lock:
        if _model_instance is not None:
            del _model_instance
            _model_instance = None
            _current_model_key = None
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
    preferred_device: str = "auto",
    compute_type: str = "auto",
    word_timestamps: bool = True,
    beam_size: int = 5,
    vad_filter: bool = True,
    workers: int = 0
) -> Dict[str, Any]:
    """
    Transcribes an audio file into its ORIGINAL language with precise timestamps.
    Returns structured segments and detection metadata.
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    model = get_whisper_engine(
        model_id=model_id,
        preferred_device=preferred_device,
        compute_type=compute_type,
        workers=workers
    )

    lang = None if not source_lang or source_lang.lower() in ("auto", "") else source_lang.lower().split("-")[0]

    t0 = time.time()
    raw_segments = []
    detected_lang = lang or "auto"

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
        print(f"[WARN] Primary inference error ({exc}). Attempting CPU int8 fallback...")
        release_whisper_engine()
        threads = max(2, (os.cpu_count() or 4) // 2)
        from faster_whisper import WhisperModel
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
            "translation": "",  # Stage 1: pure original transcript
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
        "duration": getattr(info, "duration", 0.0),
        "processingTimeSec": round(elapsed, 2),
        "segments": results
    }
