import os
import sys
import platform
import psutil
import shutil

# Ensure current directory DLLs are available on Windows
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if sys.platform == "win32":
    os.environ["PATH"] = ROOT_DIR + os.pathsep + os.environ.get("PATH", "")
    if hasattr(os, "add_dll_directory") and os.path.isdir(ROOT_DIR):
        try:
            os.add_dll_directory(ROOT_DIR)
        except Exception:
            pass

def get_model_cache_dir() -> str:
    """Return platform-standard model storage directory."""
    custom = os.environ.get("STUDIO_MODELS_DIR")
    if custom and os.path.isdir(custom):
        return custom
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or os.path.expanduser("~")
        path = os.path.join(base, "AI Subtitle Studio", "models")
    elif sys.platform == "darwin":
        path = os.path.join(os.path.expanduser("~"), "Library", "Application Support", "AI Subtitle Studio", "models")
    else:
        path = os.path.join(os.path.expanduser("~"), ".local", "share", "ai-subtitle-studio", "models")
    os.makedirs(path, exist_ok=True)
    return path

def detect_hardware():
    """Detailed hardware diagnostics for CPU, RAM, and GPU."""
    info = {
        "os": platform.system(),
        "os_version": platform.version(),
        "architecture": platform.machine(),
        "cpu_count": os.cpu_count() or 4,
        "ram_gb": round(psutil.virtual_memory().total / (1024 ** 3), 2),
        "ram_available_gb": round(psutil.virtual_memory().available / (1024 ** 3), 2),
        "cuda_available": False,
        "cuda_device_count": 0,
        "gpu_name": None,
        "gpu_vram_gb": None,
        "ffmpeg_available": shutil.which("ffmpeg") is not None,
        "recommended_model": "small",
        "recommended_device": "cpu",
        "recommended_compute": "int8"
    }

    try:
        import ctranslate2
        cuda_count = ctranslate2.get_cuda_device_count()
        if cuda_count > 0:
            info["cuda_available"] = True
            info["cuda_device_count"] = cuda_count
    except Exception:
        pass

    try:
        import torch
        if torch.cuda.is_available():
            info["gpu_name"] = torch.cuda.get_device_name(0)
            vram = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            info["gpu_vram_gb"] = round(vram, 2)
            info["cuda_available"] = True
    except Exception:
        # Fallback GPU detection through nvidia-smi if torch lacks CUDA binaries
        if shutil.which("nvidia-smi") and info["cuda_device_count"] > 0:
            info["gpu_name"] = "NVIDIA CUDA GPU"
            info["gpu_vram_gb"] = 4.0  # Safe default estimation

    # Model recommendation based on hardware
    if info["cuda_available"] and (info["gpu_vram_gb"] or 0) >= 3.5:
        info["recommended_device"] = "cuda"
        info["recommended_compute"] = "float16"
        info["recommended_model"] = "small" if (info["gpu_vram_gb"] or 0) < 6.0 else "medium"
    elif info["ram_available_gb"] >= 8.0:
        info["recommended_device"] = "cpu"
        info["recommended_compute"] = "int8"
        info["recommended_model"] = "small"
    else:
        info["recommended_device"] = "cpu"
        info["recommended_compute"] = "int8"
        info["recommended_model"] = "base"

    return info

