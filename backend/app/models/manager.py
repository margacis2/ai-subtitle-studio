import os
import time
import threading
from typing import Dict, Any, List
from backend.app.core.hardware import get_model_cache_dir

# Curated catalog of official Faster-Whisper models from Hugging Face
AVAILABLE_WHISPER_MODELS: Dict[str, Dict[str, Any]] = {
    "tiny": {
        "id": "tiny",
        "name": "Faster-Whisper Tiny",
        "repo_id": "Systran/faster-whisper-tiny",
        "size_mb": 75,
        "vram_gb": 0.5,
        "ram_gb": 1.0,
        "speed": "Very Fast (5x)",
        "accuracy": "Basic",
        "description": "Ultra lightweight model for quick drafts or low-resource hardware."
    },
    "base": {
        "id": "base",
        "name": "Faster-Whisper Base",
        "repo_id": "Systran/faster-whisper-base",
        "size_mb": 145,
        "vram_gb": 0.8,
        "ram_gb": 1.5,
        "speed": "Fast (3x)",
        "accuracy": "Good",
        "description": "Great balance for fast turnaround on CPU or entry-level GPUs."
    },
    "small": {
        "id": "small",
        "name": "Faster-Whisper Small (Recommended)",
        "repo_id": "Systran/faster-whisper-small",
        "size_mb": 460,
        "vram_gb": 1.6,
        "ram_gb": 3.0,
        "speed": "Balanced (1x)",
        "accuracy": "High",
        "description": "Recommended for 4 GB GPUs (e.g. RTX 3050) and modern laptops. Excellent multilingual accuracy."
    },
    "medium": {
        "id": "medium",
        "name": "Faster-Whisper Medium",
        "repo_id": "Systran/faster-whisper-medium",
        "size_mb": 1450,
        "vram_gb": 3.2,
        "ram_gb": 5.0,
        "speed": "Moderate (0.6x)",
        "accuracy": "Very High",
        "description": "Ideal for complex multilingual audio, Indian languages (Tamil, Hindi), and accents."
    },
    "large-v3-turbo": {
        "id": "large-v3-turbo",
        "name": "Whisper Large-v3-Turbo",
        "repo_id": "deepdml/faster-whisper-large-v3-turbo-ct2",
        "size_mb": 1600,
        "vram_gb": 4.5,
        "ram_gb": 6.0,
        "speed": "High Accuracy & Fast",
        "accuracy": "State of the Art",
        "description": "Latest optimized release combining top-tier accuracy with optimized speed."
    }
}

_active_downloads: Dict[str, Dict[str, Any]] = {}
_download_lock = threading.Lock()

def get_installed_models() -> List[Dict[str, Any]]:
    """Scan the model cache directory and return status of each catalog model."""
    cache_dir = get_model_cache_dir()
    results = []

    for model_id, meta in AVAILABLE_WHISPER_MODELS.items():
        item = dict(meta)
        # Check if model snapshot exists in cache
        # Hugging Face snapshot downloads create folder `models--Systran--faster-whisper-<id>`
        repo_clean = meta["repo_id"].replace("/", "--")
        expected_hf_dir = os.path.join(cache_dir, f"models--{repo_clean}")
        direct_dir = os.path.join(cache_dir, model_id)

        installed = False
        installed_bytes = 0

        for target in (expected_hf_dir, direct_dir):
            if os.path.isdir(target):
                # Calculate size
                total_sz = 0
                for root, _, files in os.walk(target):
                    for f in files:
                        total_sz += os.path.getsize(os.path.join(root, f))
                if total_sz > 10 * 1024 * 1024:  # > 10 MB indicates actual weights exist
                    installed = True
                    installed_bytes = total_sz
                    break

        item["installed"] = installed
        item["installed_size_mb"] = round(installed_bytes / (1024 * 1024), 1) if installed else 0

        with _download_lock:
            dl_info = _active_downloads.get(model_id)
            if dl_info:
                item["downloading"] = True
                item["progress"] = dl_info.get("progress", 0)
                item["status"] = dl_info.get("status", "downloading")
            else:
                item["downloading"] = False
                item["progress"] = 100 if installed else 0
                item["status"] = "installed" if installed else "available"

        results.append(item)

    return results

def download_whisper_model(model_id: str):
    """Download model asynchronously with progress reporting."""
    if model_id not in AVAILABLE_WHISPER_MODELS:
        raise ValueError(f"Unknown model: {model_id}")

    meta = AVAILABLE_WHISPER_MODELS[model_id]
    repo_id = meta["repo_id"]
    cache_dir = get_model_cache_dir()

    with _download_lock:
        if model_id in _active_downloads:
            return _active_downloads[model_id]
        _active_downloads[model_id] = {
            "model_id": model_id,
            "status": "starting",
            "progress": 5,
            "error": None
        }

    def _worker():
        try:
            from huggingface_hub import snapshot_download
            with _download_lock:
                _active_downloads[model_id]["status"] = "downloading"
                _active_downloads[model_id]["progress"] = 25

            snapshot_download(
                repo_id=repo_id,
                cache_dir=cache_dir,
                resume_download=True
            )

            with _download_lock:
                _active_downloads[model_id]["status"] = "completed"
                _active_downloads[model_id]["progress"] = 100
        except Exception as e:
            with _download_lock:
                _active_downloads[model_id]["status"] = "failed"
                _active_downloads[model_id]["error"] = str(e)
        finally:
            time.sleep(3)
            with _download_lock:
                _active_downloads.pop(model_id, None)

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()
    return _active_downloads[model_id]

def delete_whisper_model(model_id: str) -> bool:
    """Safely delete model files from disk."""
    if model_id not in AVAILABLE_WHISPER_MODELS:
        return False

    meta = AVAILABLE_WHISPER_MODELS[model_id]
    repo_clean = meta["repo_id"].replace("/", "--")
    cache_dir = get_model_cache_dir()

    targets = [
        os.path.join(cache_dir, f"models--{repo_clean}"),
        os.path.join(cache_dir, model_id)
    ]

    import shutil
    deleted = False
    for t in targets:
        if os.path.isdir(t):
            try:
                shutil.rmtree(t)
                deleted = True
            except Exception:
                pass
    return deleted

