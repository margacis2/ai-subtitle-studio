import os
import sys
import time
import threading
import gc
from typing import Optional, Dict, Any, List, Tuple

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

# Fix PyAV incompatibility where av.open does not support metadata_errors in newer versions
try:
    import av
    if hasattr(av, "open"):
        _orig_av_open = av.open
        def _safe_av_open(*args, **kwargs):
            kwargs.pop("metadata_errors", None)
            return _orig_av_open(*args, **kwargs)
        av.open = _safe_av_open
except Exception:
    pass

from backend.app.core.hardware import get_model_cache_dir, detect_hardware

_model_instance = None
_current_model_key: Optional[str] = None
_engine_lock = threading.Lock()

# Ordered model downgrade chain for 4GB VRAM OOM recovery
_MODEL_DOWNGRADE_CHAIN = ["large-v3", "turbo", "medium", "small", "base", "tiny"]


def _resolve_model_id(model_id: str) -> str:
    clean_id = (model_id or "small").strip()
    if clean_id in ("turbo", "large-v3-turbo"):
        return "turbo"
    if clean_id in ("large", "large-v3"):
        return "large-v3"
    if clean_id in ("whisper-tamil-medium", "vasista22/whisper-tamil-medium", "tamil-medium"):
        return "mohankumars26/whisper-tamil-medium-ct2"
    return clean_id


def _is_cuda_oom(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(
        needle in msg
        for needle in (
            "out of memory",
            "cublas_status_alloc_failed",
            "cuda failed with error",
            "cuda error",
            "cudnn",
            "allocation failed",
            "failed to allocate",
        )
    )


def _clear_cuda_cache():
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            if hasattr(torch.cuda, "ipc_collect"):
                torch.cuda.ipc_collect()
    except Exception:
        pass


def _smaller_model_candidates(resolved_id: str) -> List[str]:
    if resolved_id == "mohankumars26/whisper-tamil-medium-ct2":
        return ["small", "base", "tiny"]
    if resolved_id in _MODEL_DOWNGRADE_CHAIN:
        idx = _MODEL_DOWNGRADE_CHAIN.index(resolved_id)
        return _MODEL_DOWNGRADE_CHAIN[idx + 1 :]
    return ["small", "base", "tiny"]


def get_whisper_engine(
    model_id: str = "small",
    preferred_device: str = "auto",
    compute_type: str = "auto",
    workers: int = 0
):
    """
    Get or load the Faster-Whisper model instance.
    Prioritizes int8_float16 on <=6GB CUDA GPUs, gracefully steps down on CUDA OOM
    (compute type -> smaller model -> CPU int8) instead of crashing.
    """
    global _model_instance, _current_model_key

    resolved_id = _resolve_model_id(model_id)
    model_key = f"{resolved_id}:{preferred_device}:{compute_type}"

    with _engine_lock:
        if _model_instance is not None and _current_model_key == model_key:
            return _model_instance

        # Unload existing model to free VRAM/RAM
        if _model_instance is not None:
            del _model_instance
            _model_instance = None
            _current_model_key = None
            _clear_cuda_cache()

        # Check for non-Whisper / external family models requirement
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
            use_cuda = bool(hw.get("cuda_available", False))
            if not use_cuda:
                print("[WARN] CUDA requested but not detected; using CPU int8 fallback.")
        elif preferred_device == "auto":
            use_cuda = bool(hw.get("cuda_available", False))

        loaded = None
        used_device = "cpu"
        used_compute = "int8"
        used_model = resolved_id
        fallback_note: Optional[str] = None

        if use_cuda:
            vram_gb = float(hw.get("gpu_vram_gb") or hw.get("vram_gb") or 0)
            free_vram = float(hw.get("gpu_vram_free_gb") or vram_gb)

            if compute_type not in ("auto", "", None):
                computes = [compute_type]
                for fallback_comp in ("int8_float16", "int8"):
                    if fallback_comp not in computes:
                        computes.append(fallback_comp)
            elif (0 < vram_gb <= 6.0) or (0 < free_vram < 3.5):
                computes = ["int8_float16", "int8", "float16"]
            else:
                computes = ["float16", "int8_float16", "int8"]

            # 1. Try requested model across CUDA compute types
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
                    used_model = resolved_id
                    if comp != compute_type and compute_type not in ("auto", "", None):
                        fallback_note = f"Switched CUDA compute type from {compute_type} to {comp} to fit VRAM."
                    print(f"[✓] Faster-Whisper '{resolved_id}' loaded on CUDA ({comp})")
                    break
                except Exception as exc:
                    print(f"[WARN] CUDA {resolved_id} ({comp}) failed: {exc}")
                    _clear_cuda_cache()

            # 2. If CUDA failed/OOMed on requested model, try smaller models on CUDA int8_float16/int8
            if loaded is None:
                for smaller_id in _smaller_model_candidates(resolved_id):
                    for comp in ("int8_float16", "int8"):
                        try:
                            print(f"[WARN] Trying smaller CUDA model '{smaller_id}' ({comp}) to fit 4GB VRAM...")
                            loaded = WhisperModel(
                                smaller_id,
                                device="cuda",
                                compute_type=comp,
                                download_root=cache_dir
                            )
                            used_device = "cuda"
                            used_compute = comp
                            used_model = smaller_id
                            fallback_note = (
                                f"Model '{resolved_id}' exceeded available VRAM; "
                                f"gracefully fell back to '{smaller_id}' ({comp}) on CUDA."
                            )
                            print(f"[✓] Faster-Whisper fallback '{smaller_id}' loaded on CUDA ({comp})")
                            break
                        except Exception as exc:
                            print(f"[WARN] Smaller CUDA fallback {smaller_id} ({comp}) failed: {exc}")
                            _clear_cuda_cache()
                    if loaded is not None:
                        break

        # 3. Final CPU int8 fallback
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
            used_model = resolved_id
            if use_cuda:
                fallback_note = f"CUDA unavailable or out of memory; fell back to CPU ({comp})."
            print(f"[✓] Faster-Whisper '{resolved_id}' loaded on CPU ({comp})")

        setattr(loaded, "_studio_device", used_device)
        setattr(loaded, "_studio_compute", used_compute)
        setattr(loaded, "_studio_model", used_model)
        setattr(loaded, "_studio_note", fallback_note)

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
            _clear_cuda_cache()


def _run_transcribe_with_model(
    model,
    audio_path: str,
    lang: Optional[str],
    beam_size: int,
    vad_filter: bool,
    word_timestamps: bool,
) -> Tuple[List[Any], Any]:
    segments_gen, info = model.transcribe(
        audio_path,
        language=lang,
        task="transcribe",
        beam_size=beam_size,
        vad_filter=vad_filter,
        word_timestamps=word_timestamps,
        condition_on_previous_text=False
    )
    return list(segments_gen), info


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
    Handles CUDA OOM during inference by stepping down compute_type -> smaller model -> CPU int8.
    """
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    clean_id = (model_id or "small").strip()
    resolved_id = _resolve_model_id(clean_id)

    model = get_whisper_engine(
        model_id=resolved_id,
        preferred_device=preferred_device,
        compute_type=compute_type,
        workers=workers
    )

    is_tamil_model = resolved_id == "mohankumars26/whisper-tamil-medium-ct2" or "tamil" in clean_id.lower()
    lang = None if not source_lang or source_lang.lower() in ("auto", "") else source_lang.lower().split("-")[0]
    if is_tamil_model and (not lang or lang == "auto"):
        lang = "ta"

    t0 = time.time()
    raw_segments: List[Any] = []
    info = None
    used_device = getattr(model, "_studio_device", "cpu")
    used_compute = getattr(model, "_studio_compute", "int8")
    used_model = getattr(model, "_studio_model", resolved_id)
    fallback_note: Optional[str] = getattr(model, "_studio_note", None)

    try:
        raw_segments, info = _run_transcribe_with_model(
            model, audio_path, lang, beam_size, vad_filter, word_timestamps
        )
    except Exception as exc:
        print(f"[WARN] Primary inference failed ({exc}). Attempting graceful fallback...")
        release_whisper_engine()
        _clear_cuda_cache()

        from faster_whisper import WhisperModel
        cache_dir = get_model_cache_dir()
        recovered = False

        # Fallback Stage A: try int8_float16 -> smaller model on CUDA if original ran on CUDA float16/large
        if used_device == "cuda":
            retry_plans: List[Tuple[str, str]] = []
            if used_compute != "int8_float16":
                retry_plans.append((used_model, "int8_float16"))
            if used_compute != "int8":
                retry_plans.append((used_model, "int8"))
            for smaller in _smaller_model_candidates(used_model):
                retry_plans.append((smaller, "int8_float16"))

            for cand_model, cand_comp in retry_plans:
                try:
                    print(f"[WARN] Retrying CUDA inference with {cand_model} ({cand_comp})...")
                    cand = WhisperModel(
                        cand_model,
                        device="cuda",
                        compute_type=cand_comp,
                        download_root=cache_dir,
                    )
                    raw_segments, info = _run_transcribe_with_model(
                        cand, audio_path, lang, beam_size, vad_filter, word_timestamps
                    )
                    del cand
                    _clear_cuda_cache()
                    used_device = "cuda"
                    used_compute = cand_comp
                    used_model = cand_model
                    fallback_note = f"Recovered from CUDA error via {cand_model} ({cand_comp})."
                    recovered = True
                    break
                except Exception as cuda_exc:
                    print(f"[WARN] CUDA retry {cand_model} ({cand_comp}) failed: {cuda_exc}")
                    _clear_cuda_cache()

        # Fallback Stage B: CPU int8 guaranteed fallback
        if not recovered:
            print("[WARN] Falling back to CPU int8 transcription...")
            threads = workers if workers > 0 else max(2, (os.cpu_count() or 4) // 2)
            cpu_model = WhisperModel(
                resolved_id,
                device="cpu",
                compute_type="int8",
                cpu_threads=threads,
                download_root=cache_dir
            )
            try:
                raw_segments, info = _run_transcribe_with_model(
                    cpu_model, audio_path, lang, beam_size, vad_filter, word_timestamps
                )
            finally:
                del cpu_model
                gc.collect()
            used_device = "cpu"
            used_compute = "int8"
            used_model = resolved_id
            fallback_note = f"CUDA inference failed ({exc}); completed on CPU int8."

    detected_lang = getattr(info, "language", None) or lang or "auto"
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
        "duration": float(getattr(info, "duration", 0.0) or 0.0),
        "processingTimeSec": round(elapsed, 2),
        "device": used_device,
        "computeType": used_compute,
        "modelUsed": used_model,
        "note": fallback_note,
        "segments": results
    }
