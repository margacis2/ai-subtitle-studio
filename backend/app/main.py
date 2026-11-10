import os
import sys
import tempfile
import secrets
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.app.core.hardware import detect_hardware, get_model_cache_dir
from backend.app.models.manager import get_installed_models, download_whisper_model, delete_whisper_model
from backend.app.engines.transcriber import transcribe_audio_file, release_whisper_engine
from backend.app.translation.translator import translate_with_opus, translate_with_argos
from backend.app.media.processor import probe_media_info, extract_optimized_audio

LOCAL_TOKEN = os.environ.get("STUDIO_INTERNAL_TOKEN", "")

app = FastAPI(
    title="AI Subtitle Studio Local Desktop Engine",
    version="3.0.0",
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
        "mode": "local-desktop"
    }

@app.get("/health")
def health():
    hw = detect_hardware()
    return {
        "status": "online",
        "device": hw["recommended_device"],
        "gpu": hw["gpu_name"],
        "cuda": hw["cuda_available"],
        "ram_gb": hw["ram_gb"],
        "ffmpeg": hw["ffmpeg_available"]
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

@app.delete("/models/{model_id}")
def remove_model(model_id: str):
    deleted = delete_whisper_model(model_id)
    return {"ok": deleted}

class TranslateRequest(BaseModel):
    texts: List[str]
    source_lang: str = "ja"
    target_lang: str = "en"
    engine: str = "opus"  # "opus" or "argos"

@app.post("/translate")
def translate_endpoint(req: TranslateRequest):
    if not req.texts:
        return {"source_lang": req.source_lang, "target_lang": req.target_lang, "translations": []}

    try:
        if req.engine == "argos":
            translated = translate_with_argos(req.texts, req.source_lang, req.target_lang)
        else:
            translated = translate_with_opus(req.texts, req.source_lang, req.target_lang)
        return {
            "source_lang": req.source_lang,
            "target_lang": req.target_lang,
            "translations": translated
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/transcribe")
async def transcribe_endpoint(
    file: Optional[UploadFile] = File(None),
    file_path: Optional[str] = Form(None),
    source_lang: str = Form("auto"),
    target_lang: str = Form("original"),
    model_id: str = Form("small"),
    word_timestamps: bool = Form(False)
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
        # Check if file needs audio extraction
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
            word_timestamps=word_timestamps
        )

        detected_lang = res["language"]
        segments = res["segments"]

        # If translation requested
        if target_lang != "original" and target_lang != detected_lang and segments:
            orig_texts = [s["original"] for s in segments]
            try:
                translated_texts = translate_with_opus(orig_texts, detected_lang, target_lang)
                for s, tr in zip(segments, translated_texts):
                    s["translation"] = tr
                    s["text"] = tr
            except Exception as tr_err:
                print(f"[WARN] Translation note: {tr_err}")

        return {
            "language": detected_lang,
            "duration": res["duration"],
            "processing_seconds": res["processingTimeSec"],
            "segments": segments
        }
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

@app.post("/probe")
def probe_endpoint(file_path: str = Form(...)):
    try:
        return probe_media_info(file_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/release-memory")
def free_memory():
    release_whisper_engine()
    return {"ok": True, "message": "Model memory released"}

def start_server(port: int = 8001):
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")

if __name__ == "__main__":
    port = int(os.environ.get("STUDIO_PORT", 8001))
    start_server(port)
