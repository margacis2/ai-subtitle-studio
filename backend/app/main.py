import os
import sys
import tempfile
import secrets
import traceback
import time
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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

from backend.app.core.hardware import detect_hardware, get_model_cache_dir
from backend.app.models.manager import (
    get_installed_models,
    download_whisper_model,
    delete_whisper_model,
    test_whisper_model_load,
    AVAILABLE_WHISPER_MODELS,
    get_installed_translation_models,
    download_translation_model,
    delete_translation_model,
    AVAILABLE_TRANSLATION_MODELS
)
from backend.app.engines.transcriber import transcribe_audio_file, release_whisper_engine
from backend.app.translation.translator import translate_with_opus, translate_with_nllb, translate_with_argos
from backend.app.media.processor import probe_media_info, extract_optimized_audio
from backend.app.remote import get_lan_ip, generate_qr_code_base64, tunnel_manager, device_manager

LOCAL_TOKEN = os.environ.get("STUDIO_INTERNAL_TOKEN", "")

app = FastAPI(
    title="AI Subtitle Studio Local Desktop Engine",
    version="3.1.0",
    docs_url="/docs",
    redoc_url=None
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_token(authorization: Optional[str] = Header(None)):
    if not LOCAL_TOKEN:
        return True
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ")[1]
    if not secrets.compare_digest(token, LOCAL_TOKEN):
        raise HTTPException(status_code=403, detail="Invalid token")
    return True

@app.get("/")
def root():
    return {
        "name": "AI Subtitle Studio Desktop Engine",
        "status": "online",
        "version": "3.1.0",
        "mode": "local-desktop"
    }

@app.get("/health")
def health():
    hw = detect_hardware()
    return {
        "status": "online",
        "device": hw.get("recommended_device", "cpu"),
        "gpu": hw.get("gpu_name"),
        "cuda": hw.get("cuda_available", False),
        "ram_gb": hw.get("ram_gb", 0),
        "ffmpeg": hw.get("ffmpeg_available", False)
    }

@app.get("/hardware")
def get_hardware():
    return detect_hardware()

@app.get("/models")
def list_models():
    return {
        "cache_dir": get_model_cache_dir(),
        "models": get_installed_models()
    }

@app.post("/models/{model_id}/download")
def trigger_download(model_id: str):
    try:
        res = download_whisper_model(model_id)
        return {"ok": True, "download": res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/models/{model_id}/test")
def test_model(model_id: str):
    res = test_whisper_model_load(model_id)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res)
    return res

@app.delete("/models/{model_id}")
def remove_model(model_id: str):
    res = delete_whisper_model(model_id)
    return res

@app.get("/models/translation")
def list_translation_models():
    return {
        "cache_dir": get_model_cache_dir(),
        "models": get_installed_translation_models()
    }

@app.post("/models/translation/{model_id}/download")
def trigger_translation_download(model_id: str):
    try:
        res = download_translation_model(model_id)
        return {"ok": True, "download": res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/models/translation/{model_id}")
def remove_translation_model(model_id: str):
    res = delete_translation_model(model_id)
    return res

from backend.app.core.benchmark import benchmark_model

class BenchmarkEndpointRequest(BaseModel):
    model_id: str = "small"
    audio_path: Optional[str] = None

@app.post("/benchmark")
def run_benchmark_endpoint(req: BenchmarkEndpointRequest):
    try:
        res = benchmark_model(model_id=req.model_id, audio_path=req.audio_path)
        return res
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class TranslateRequest(BaseModel):
    texts: List[str]
    source_lang: str = "ja"
    target_lang: str = "en"
    engine: str = "opus"

@app.post("/translate")
def translate_endpoint(req: TranslateRequest):
    if not req.texts:
        return {"source_lang": req.source_lang, "target_lang": req.target_lang, "translations": []}

    src = (req.source_lang or "auto").lower().split("-")[0]
    tgt = (req.target_lang or "en").lower().split("-")[0]

    # If target is original or matches source, return original texts instantly
    if src == tgt or tgt in ("original", "none", ""):
        return {
            "source_lang": req.source_lang,
            "target_lang": req.target_lang,
            "translations": req.texts
        }

    try:
        if req.engine == "argos":
            translated = translate_with_argos(req.texts, src, tgt)
        elif req.engine == "nllb":
            translated = translate_with_nllb(req.texts, src, tgt)
        else:
            translated = translate_with_opus(req.texts, src, tgt)
        return {
            "source_lang": req.source_lang,
            "target_lang": req.target_lang,
            "translations": translated
        }
    except Exception as e:
        print(f"[WARN] Translation error: {e}. Preserving original text.")
        return {
            "source_lang": req.source_lang,
            "target_lang": req.target_lang,
            "translations": req.texts,
            "warning": str(e)
        }

@app.post("/transcribe")
async def transcribe_endpoint(
    file: Optional[UploadFile] = File(None),
    file_path: Optional[str] = Form(None),
    source_lang: str = Form("auto"),
    model_id: str = Form("small"),
    device: str = Form("auto"),
    compute_type: str = Form("auto"),
    workers: int = Form(0),
    vad_filter: bool = Form(True),
    word_timestamps: bool = Form(True)
):
    tmp_path = None
    extracted_audio = None
    input_path = None

    if file is not None and file.filename:
        suffix = os.path.splitext(file.filename or "chunk.wav")[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            while chunk := await file.read(1024 * 1024):
                tmp.write(chunk)
            tmp_path = tmp.name
            input_path = tmp_path
    elif file_path and os.path.exists(file_path):
        input_path = file_path
    else:
        raise HTTPException(status_code=400, detail="Provide either 'file' upload or valid 'file_path'")

    try:
        ext = os.path.splitext(input_path)[1].lower()
        if ext in [".mp4", ".mkv", ".mov", ".avi", ".webm", ".m4a", ".flv"]:
            base_out = tempfile.mktemp(prefix="studio_opt_")
            opt = extract_optimized_audio(input_path, base_out)
            target_audio = opt["path"]
            extracted_audio = target_audio
        else:
            target_audio = input_path

        res = transcribe_audio_file(
            target_audio,
            model_id=model_id,
            source_lang=source_lang,
            preferred_device=device,
            compute_type=compute_type,
            word_timestamps=word_timestamps,
            vad_filter=vad_filter,
            workers=workers
        )

        return {
            "language": res["language"],
            "duration": res["duration"],
            "processing_seconds": res["processingTimeSec"],
            "segments": res["segments"]
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail={
                "error": str(e),
                "traceback": traceback.format_exc(),
                "model_id": model_id,
                "device": device
            }
        )
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
        if extracted_audio and os.path.exists(extracted_audio):
            try:
                os.remove(extracted_audio)
            except Exception:
                pass

class BenchmarkRequest(BaseModel):
    audio_path: str
    models: List[str] = ["small"]
    device: str = "auto"
    compute_type: str = "auto"

@app.post("/benchmark")
def run_benchmark_endpoint(req: BenchmarkRequest):
    """Run real inference benchmark on user audio for each specified model."""
    if not os.path.exists(req.audio_path):
        raise HTTPException(status_code=400, detail=f"Audio file not found: {req.audio_path}")

    results = []
    for mid in req.models:
        t0 = time.time()
        try:
            # Measure model load
            load_start = time.time()
            from backend.app.engines.transcriber import get_whisper_engine
            engine = get_whisper_engine(model_id=mid, preferred_device=req.device, compute_type=req.compute_type)
            load_time = round(time.time() - load_start, 2)

            # Measure inference
            inf_start = time.time()
            res = transcribe_audio_file(
                req.audio_path,
                model_id=mid,
                preferred_device=req.device,
                compute_type=req.compute_type,
                word_timestamps=True
            )
            inf_time = round(time.time() - inf_start, 2)
            total_time = round(time.time() - t0, 2)
            dur = res.get("duration", 0.0)
            rtf = round(inf_time / max(0.1, dur), 3)

            results.append({
                "model_id": mid,
                "status": "success",
                "load_time_sec": load_time,
                "inference_time_sec": inf_time,
                "total_time_sec": total_time,
                "audio_duration_sec": dur,
                "rtf": rtf,
                "speed_ratio": f"{round(dur / max(0.01, inf_time), 1)}x",
                "detected_lang": res.get("language"),
                "segments_count": len(res.get("segments", [])),
                "device": req.device
            })
        except Exception as e:
            results.append({
                "model_id": mid,
                "status": "failed",
                "error": str(e),
                "total_time_sec": round(time.time() - t0, 2)
            })

    return {"ok": True, "benchmark_results": results}

@app.post("/probe")
def probe_endpoint(file_path: str = Form(...)):
    try:
        return probe_media_info(file_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/release-memory")
@app.post("/models/unload")
def free_memory():
    import gc
    from backend.app.engines.transcriber import release_whisper_engine
    from backend.app.translation.translator import release_translation_models
    release_whisper_engine()
    release_translation_models()
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            if hasattr(torch.cuda, "ipc_collect"):
                torch.cuda.ipc_collect()
    except Exception:
        pass
    print("[✓] All ASR and Translation models unloaded from VRAM/RAM.")
    return {"ok": True, "message": "All ASR and Translation models unloaded from VRAM/RAM"}

# --- REMOTE ACCESS & MULTI-DEVICE MANAGEMENT ENDPOINTS ---

from fastapi import Request

class HeartbeatRequest(BaseModel):
    device_id: str
    active_task: Optional[str] = "Idle"

class PinVerifyRequest(BaseModel):
    pin: str

class PinConfigRequest(BaseModel):
    required: bool
    pin: Optional[str] = None

@app.get("/remote/status")
def get_remote_status(req: Request):
    lan_ip = get_lan_ip()
    port_fe = int(os.environ.get("PORT", "3000"))
    port_be = int(os.environ.get("STUDIO_PORT", "8001"))
    lan_url = f"http://{lan_ip}:{port_fe}"
    
    # Generate QR codes
    qr_lan = generate_qr_code_base64(lan_url)
    
    tunnel_st = tunnel_manager.get_status()
    qr_wan = None
    if tunnel_st.get("url"):
        qr_wan = generate_qr_code_base64(tunnel_st["url"])
        
    return {
        "ok": True,
        "lan_ip": lan_ip,
        "lan_url": lan_url,
        "backend_url": f"http://{lan_ip}:{port_be}",
        "ports": {"frontend": port_fe, "backend": port_be},
        "qr_lan": qr_lan,
        "tunnel": {
            **tunnel_st,
            "qr_wan": qr_wan
        },
        "devices": device_manager.list_devices(),
        "pin_required": device_manager.pin_required
    }

@app.get("/remote/qr")
def get_qr_endpoint(data: str):
    if not data:
        raise HTTPException(status_code=400, detail="Missing data query parameter")
    img_b64 = generate_qr_code_base64(data)
    if not img_b64:
        raise HTTPException(status_code=500, detail="Failed to generate QR code")
    return {"ok": True, "qr": img_b64}

@app.post("/remote/tunnel/start")
def start_remote_tunnel(port: Optional[int] = None):
    target = port or int(os.environ.get("PORT", "3000"))
    st = tunnel_manager.start_tunnel(target_port=target)
    if st.get("url"):
        st["qr_wan"] = generate_qr_code_base64(st["url"])
    return {"ok": True, "tunnel": st}

@app.post("/remote/tunnel/stop")
def stop_remote_tunnel():
    st = tunnel_manager.stop_tunnel()
    return {"ok": True, "tunnel": st}

@app.post("/remote/heartbeat")
def device_heartbeat(payload: HeartbeatRequest, request: Request):
    client_ip = request.client.host if request.client else "127.0.0.1"
    ua = request.headers.get("user-agent", "")
    host = request.headers.get("host", "")
    
    dev = device_manager.register_activity(
        device_id=payload.device_id,
        client_ip=client_ip,
        user_agent=ua,
        host_header=host,
        active_task=payload.active_task
    )
    if "error" in dev:
        raise HTTPException(status_code=403, detail=dev["error"])
    return {"ok": True, "device": dev, "pin_required": device_manager.pin_required}

@app.get("/remote/devices")
def get_devices_endpoint():
    return {"ok": True, "devices": device_manager.list_devices()}

@app.post("/remote/devices/{device_id}/block")
def block_device_endpoint(device_id: str):
    ok = device_manager.block_device(device_id)
    return {"ok": ok, "devices": device_manager.list_devices()}

@app.post("/remote/devices/{device_id}/unblock")
def unblock_device_endpoint(device_id: str):
    ok = device_manager.unblock_device(device_id)
    return {"ok": ok, "devices": device_manager.list_devices()}

@app.post("/remote/devices/{device_id}/disconnect")
def disconnect_device_endpoint(device_id: str):
    ok = device_manager.remove_device(device_id)
    return {"ok": ok, "devices": device_manager.list_devices()}

@app.post("/remote/auth/pin")
def verify_pin_endpoint(req: PinVerifyRequest):
    token = device_manager.verify_pin(req.pin)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid access PIN")
    return {"ok": True, "token": token}

@app.post("/remote/auth/configure")
def configure_pin_endpoint(req: PinConfigRequest):
    device_manager.set_pin_policy(req.required, req.pin)
    return {"ok": True, "pin_required": device_manager.pin_required}

def start_server(port: int = 8001):
    import uvicorn
    host = os.environ.get("STUDIO_HOST", "0.0.0.0")
    print(f"[Engine] Starting AI Subtitle Studio Engine on {host}:{port}...")
    uvicorn.run(app, host=host, port=port, log_level="warning")

if __name__ == "__main__":
    port = int(os.environ.get("STUDIO_PORT", 8001))
    start_server(port)
