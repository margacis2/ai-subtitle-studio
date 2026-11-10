import os
import sys
import time
import shutil
import threading
from typing import Dict, Any, List, Optional
from tqdm.auto import tqdm
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
        "repo_id": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
        "size_mb": 1600,
        "vram_gb": 4.5,
        "ram_gb": 6.0,
        "speed": "High Accuracy & Fast",
        "accuracy": "State of the Art",
        "description": "Latest release combining top-tier accuracy with fast inference speed."
    }
}

_active_downloads: Dict[str, Dict[str, Any]] = {}
_download_lock = threading.Lock()

def get_cache_search_dirs() -> List[str]:
    """Returns candidate directories where HuggingFace or Studio models might reside."""
    dirs = []
    custom = os.environ.get("STUDIO_MODELS_DIR")
    if custom:
        dirs.append(custom)

    hf_default = os.path.expanduser("~/.cache/huggingface/hub")
    dirs.append(hf_default)

    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or os.path.expanduser("~")
        dirs.append(os.path.join(base, "AI Subtitle Studio", "models"))
    elif sys.platform == "darwin":
        dirs.append(os.path.join(os.path.expanduser("~"), "Library", "Application Support", "AI Subtitle Studio", "models"))
    else:
        dirs.append(os.path.join(os.path.expanduser("~"), ".local", "share", "AI Subtitle Studio", "models"))

    valid_dirs = []
    for d in dirs:
        try:
            if not os.path.isdir(d):
                os.makedirs(d, exist_ok=True)
            valid_dirs.append(d)
        except Exception:
            pass

    return list(dict.fromkeys(valid_dirs))

def find_model_path(model_id: str) -> Optional[str]:
    """Finds the actual directory on disk for a model if installed."""
    if model_id not in AVAILABLE_WHISPER_MODELS:
        return None

    meta = AVAILABLE_WHISPER_MODELS[model_id]
    repo_clean = meta["repo_id"].replace("/", "--")

    for cdir in get_cache_search_dirs():
        # Check standard huggingface repo snapshot directory
        candidate = os.path.join(cdir, f"models--{repo_clean}")
        if os.path.isdir(candidate):
            # Check if snapshots directory has files
            snap_dir = os.path.join(candidate, "snapshots")
            if os.path.isdir(snap_dir) and os.listdir(snap_dir):
                return candidate
            if any(f.endswith(".bin") for _, _, files in os.walk(candidate) for f in files):
                return candidate

        # Also check direct folder named model_id
        direct = os.path.join(cdir, model_id)
        if os.path.isdir(direct) and any(f.endswith((".bin", ".safetensors")) for _, _, files in os.walk(direct) for f in files):
            return direct

    return None

def get_installed_models() -> List[Dict[str, Any]]:
    """Scan disk and return real installation status of each catalog model."""
    results = []

    for model_id, meta in AVAILABLE_WHISPER_MODELS.items():
        item = dict(meta)
        found_path = find_model_path(model_id)

        installed = False
        installed_bytes = 0

        if found_path and os.path.isdir(found_path):
            total_sz = 0
            has_weights = False
            for root, _, files in os.walk(found_path):
                for f in files:
                    fp = os.path.join(root, f)
                    try:
                        sz = os.path.getsize(fp)
                        total_sz += sz
                        if f.endswith((".bin", ".safetensors")):
                            has_weights = True
                    except OSError:
                        pass
            if total_sz > 10 * 1024 * 1024 and has_weights:
                installed = True
                installed_bytes = total_sz
                item["path"] = found_path

        item["installed"] = installed
        item["installed_size_mb"] = round(installed_bytes / (1024 * 1024), 1) if installed else 0

        with _download_lock:
            dl_info = _active_downloads.get(model_id)
            if dl_info:
                item["downloading"] = True
                item["progress"] = dl_info.get("progress", 0)
                item["bytes_downloaded"] = dl_info.get("bytes_downloaded", 0)
                item["total_bytes"] = dl_info.get("total_bytes", 0)
                item["status"] = dl_info.get("status", "downloading")
                item["speed_mbps"] = dl_info.get("speed_mbps", 0)
            else:
                item["downloading"] = False
                item["progress"] = 100 if installed else 0
                item["status"] = "installed" if installed else "available"

        results.append(item)

    return results

class _DownloadProgressTracker(tqdm):
    """Custom tqdm class to capture real-time byte progress from huggingface_hub."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.model_id = getattr(self, "model_id", None)
        self.last_update = time.time()
        self.last_n = 0

    def update(self, n=1):
        super().update(n)
        if self.model_id and self.total and self.total > 0:
            pct = max(0, min(99, int((self.n / self.total) * 100)))
            now = time.time()
            dt = max(0.1, now - self.last_update)
            speed = round(((self.n - self.last_n) / (1024 * 1024)) / dt, 2)
            self.last_update = now
            self.last_n = self.n

            with _download_lock:
                if self.model_id in _active_downloads:
                    _active_downloads[self.model_id]["progress"] = pct
                    _active_downloads[self.model_id]["bytes_downloaded"] = self.n
                    _active_downloads[self.model_id]["total_bytes"] = self.total
                    _active_downloads[self.model_id]["speed_mbps"] = speed

def _handle_rmtree_error(func, path, exc_info):
    """Clear Windows read-only flags to allow safe folder removal."""
    try:
        import stat
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass

def download_whisper_model(model_id: str):
    """Downloads model files with real byte-level progress reporting and post-download verification."""
    if model_id not in AVAILABLE_WHISPER_MODELS:
        raise ValueError(f"Unknown model: {model_id}")

    meta = AVAILABLE_WHISPER_MODELS[model_id]
    repo_id = meta["repo_id"]
    repo_clean = repo_id.replace("/", "--")
    cache_dir = get_model_cache_dir()

    with _download_lock:
        active = _active_downloads.get(model_id)
        if active and active.get("status") in ["starting", "downloading", "verifying"]:
            return active
        _active_downloads[model_id] = {
            "model_id": model_id,
            "status": "starting",
            "progress": 1,
            "bytes_downloaded": 0,
            "total_bytes": meta["size_mb"] * 1024 * 1024,
            "speed_mbps": 0.0,
            "error": None
        }

    # Clean up any stale lock files before download begins
    for cdir in get_cache_search_dirs():
        locks_dir = os.path.join(cdir, ".locks")
        if os.path.isdir(locks_dir):
            for lf in os.listdir(locks_dir):
                if repo_clean in lf or model_id in lf:
                    try:
                        os.remove(os.path.join(locks_dir, lf))
                    except Exception:
                        pass

    def _worker():
        stop_monitor = threading.Event()

        def _monitor():
            expected_bytes = meta["size_mb"] * 1024 * 1024
            prev_bytes = 0
            prev_time = time.time()
            while not stop_monitor.is_set():
                time.sleep(0.4)
                total_current = 0
                for cdir in get_cache_search_dirs():
                    cand = os.path.join(cdir, f"models--{repo_clean}")
                    if os.path.isdir(cand):
                        for root, _, files in os.walk(cand):
                            for f in files:
                                try:
                                    total_current += os.path.getsize(os.path.join(root, f))
                                except OSError:
                                    pass
                now = time.time()
                dt = max(0.2, now - prev_time)
                speed = round(((total_current - prev_bytes) / (1024 * 1024)) / dt, 2)
                prev_bytes = total_current
                prev_time = now

                pct = min(96, max(1, int((total_current / max(1, expected_bytes)) * 100)))

                with _download_lock:
                    if model_id in _active_downloads and _active_downloads[model_id].get("status") == "downloading":
                        _active_downloads[model_id]["bytes_downloaded"] = total_current
                        _active_downloads[model_id]["progress"] = pct
                        _active_downloads[model_id]["speed_mbps"] = max(0.0, speed)

        monitor_thread = threading.Thread(target=_monitor, daemon=True)
        try:
            from huggingface_hub import snapshot_download

            with _download_lock:
                _active_downloads[model_id]["status"] = "downloading"
                _active_downloads[model_id]["progress"] = 2

            monitor_thread.start()

            allow_patterns = [
                "config.json",
                "preprocessor_config.json",
                "model.bin",
                "tokenizer.json",
                "vocabulary.*",
                "model.safetensors"
            ]

            # Download actual model files from Hugging Face Hub
            snapshot_download(
                repo_id=repo_id,
                cache_dir=cache_dir,
                allow_patterns=allow_patterns,
            )

            stop_monitor.set()
            monitor_thread.join(timeout=1.0)

            # Verification: Test that Faster-Whisper can actually load the downloaded model structure
            with _download_lock:
                _active_downloads[model_id]["status"] = "verifying"
                _active_downloads[model_id]["progress"] = 98

            from faster_whisper import WhisperModel
            test_instance = WhisperModel(
                model_id,
                device="cpu",
                compute_type="int8",
                cpu_threads=2,
                download_root=cache_dir
            )
            del test_instance
            import gc
            gc.collect()

            with _download_lock:
                _active_downloads[model_id]["status"] = "completed"
                _active_downloads[model_id]["progress"] = 100
                _active_downloads[model_id]["bytes_downloaded"] = meta["size_mb"] * 1024 * 1024
        except Exception as e:
            stop_monitor.set()
            with _download_lock:
                _active_downloads[model_id]["status"] = "failed"
                _active_downloads[model_id]["error"] = str(e)
        finally:
            time.sleep(3)
            with _download_lock:
                # Retain completed or clear if not downloading
                if _active_downloads.get(model_id, {}).get("status") in ["completed", "failed"]:
                    _active_downloads.pop(model_id, None)

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()
    return _active_downloads[model_id]

def delete_whisper_model(model_id: str) -> Dict[str, Any]:
    """Safely removes installed model files from disk after checking that it is not in use."""
    if model_id not in AVAILABLE_WHISPER_MODELS:
        return {"ok": False, "error": f"Unknown model: {model_id}"}

    with _download_lock:
        if model_id in _active_downloads and _active_downloads[model_id].get("status") == "downloading":
            return {"ok": False, "error": "Cannot delete model while download is in progress"}
        _active_downloads.pop(model_id, None)

    # Unload from engine if currently loaded
    from backend.app.engines.transcriber import release_whisper_engine
    release_whisper_engine()

    meta = AVAILABLE_WHISPER_MODELS[model_id]
    repo_clean = meta["repo_id"].replace("/", "--")

    deleted_dirs = []
    failed_errors = []

    for cdir in get_cache_search_dirs():
        targets = [
            os.path.join(cdir, f"models--{repo_clean}"),
            os.path.join(cdir, model_id)
        ]
        for t in targets:
            if os.path.isdir(t):
                try:
                    shutil.rmtree(t, onerror=_handle_rmtree_error)
                    deleted_dirs.append(t)
                except Exception as err:
                    failed_errors.append(f"{t}: {str(err)}")

        # Also clean up any lock files in .locks
        locks_dir = os.path.join(cdir, ".locks")
        if os.path.isdir(locks_dir):
            for lf in os.listdir(locks_dir):
                if repo_clean in lf or model_id in lf:
                    try:
                        os.remove(os.path.join(locks_dir, lf))
                    except Exception:
                        pass

    if failed_errors:
        return {
            "ok": False,
            "error": "; ".join(failed_errors),
            "deleted": deleted_dirs
        }

    return {
        "ok": True,
        "deleted_count": len(deleted_dirs),
        "deleted_paths": deleted_dirs
    }

def test_whisper_model_load(model_id: str) -> Dict[str, Any]:
    """Actively tests loading the model into Faster-Whisper to verify hardware compatibility."""
    if model_id not in AVAILABLE_WHISPER_MODELS:
        raise ValueError(f"Unknown model: {model_id}")

    t0 = time.time()
    try:
        from backend.app.engines.transcriber import get_whisper_engine
        engine = get_whisper_engine(model_id=model_id, preferred_device="auto")
        load_ms = round((time.time() - t0) * 1000, 1)

        # Detect whether model loaded on cuda or cpu
        is_cuda = False
        try:
            is_cuda = bool(getattr(engine.model, "device", "") == "cuda")
        except Exception:
            pass

        return {
            "ok": True,
            "model_id": model_id,
            "device": "cuda" if is_cuda else "cpu",
            "load_time_ms": load_ms,
            "message": f"Model '{model_id}' successfully loaded and verified on {'CUDA GPU' if is_cuda else 'CPU'}"
        }
    except Exception as e:
        return {
            "ok": False,
            "model_id": model_id,
            "error": str(e),
            "load_time_ms": round((time.time() - t0) * 1000, 1)
        }
