import os
import sys
import platform
import psutil
import shutil
import subprocess

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
    """Detailed real hardware diagnostics for CPU, RAM, and GPU from system APIs."""
    total_ram = psutil.virtual_memory().total / (1024 ** 3)
    avail_ram = psutil.virtual_memory().available / (1024 ** 3)

    info = {
        "os": platform.system(),
        "os_version": platform.version(),
        "architecture": platform.machine(),
        "cpu_count": os.cpu_count() or 4,
        "ram_gb": round(total_ram, 2),
        "ram_available_gb": round(avail_ram, 2),
        "cuda_available": False,
        "cuda_device_count": 0,
        "gpu_name": None,
        "gpu_vram_gb": None,
        "gpu_vram_free_gb": None,
        "gpu_vram_used_gb": None,
        "gpu_utilization_pct": None,
        "driver_version": None,
        "ffmpeg_available": shutil.which("ffmpeg") is not None,
        "recommended_model": "small",
        "recommended_device": "cpu",
        "recommended_compute": "int8"
    }

    # 1. Query CTranslate2 for genuine CUDA support
    try:
        import ctranslate2
        cuda_count = ctranslate2.get_cuda_device_count()
        if cuda_count > 0:
            info["cuda_available"] = True
            info["cuda_device_count"] = cuda_count
    except Exception:
        pass

    # 2. Query nvidia-smi directly for accurate GPU hardware metrics
    if shutil.which("nvidia-smi"):
        try:
            cmd = [
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.free,memory.used,utilization.gpu,driver_version",
                "--format=csv,noheader,nounits"
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            if res.returncode == 0 and res.stdout.strip():
                first_line = res.stdout.strip().split("\n")[0]
                parts = [p.strip() for p in first_line.split(",")]
                if len(parts) >= 6:
                    info["gpu_name"] = parts[0]
                    info["gpu_vram_gb"] = round(float(parts[1]) / 1024, 2)
                    info["gpu_vram_free_gb"] = round(float(parts[2]) / 1024, 2)
                    info["gpu_vram_used_gb"] = round(float(parts[3]) / 1024, 2)
                    info["gpu_utilization_pct"] = int(parts[4])
                    info["driver_version"] = parts[5]
                    info["cuda_available"] = True
        except Exception:
            pass

    # Fallback to torch if nvidia-smi didn't populate gpu_name
    if not info["gpu_name"]:
        try:
            import torch
            if torch.cuda.is_available():
                info["gpu_name"] = torch.cuda.get_device_name(0)
                vram = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
                info["gpu_vram_gb"] = round(vram, 2)
                info["cuda_available"] = True
        except Exception:
            pass

    # Hardware recommendation
    if info["cuda_available"] and (info.get("gpu_vram_gb") or 0) >= 3.0:
        info["recommended_device"] = "cuda"
        info["recommended_compute"] = "float16"
        info["recommended_model"] = "small"
    elif info["ram_available_gb"] >= 8.0:
        info["recommended_device"] = "cpu"
        info["recommended_compute"] = "int8"
        info["recommended_model"] = "small"
    else:
        info["recommended_device"] = "cpu"
        info["recommended_compute"] = "int8"
        info["recommended_model"] = "base"

    return info
