import os
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["PATH"] = os.path.dirname(os.path.abspath(__file__)) + os.pathsep + os.environ.get("PATH", "")
if hasattr(os, "add_dll_directory"):
    os.add_dll_directory(os.path.dirname(os.path.abspath(__file__)))

import tempfile
from fastapi import FastAPI, UploadFile, File, Form
from faster_whisper import WhisperModel
import uvicorn

# Interactive Model Selection in Terminal
print("\n" + "=" * 50)
print("  SELECT WHISPER MODEL FOR GPU (RTX 3050)")
print("=" * 50)
print(" [1] tiny          (~75 MB  | Fastest, basic)")
print(" [2] base          (~145 MB | Fast draft)")
print(" [3] small         (~460 MB | Good balance)")
print(" [4] medium        (~1.5 GB | High accuracy, recommended for Tamil)")
print(" [5] large-v3-turbo (~1.6 GB | Top-tier accuracy & speed)")
print("=" * 50)

model_map = {
    "1": "tiny",
    "2": "base",
    "3": "small",
    "4": "medium",
    "5": "large-v3-turbo",
    "tiny": "tiny",
    "base": "base",
    "small": "small",
    "medium": "medium",
    "large": "large-v3-turbo",
    "large-v3-turbo": "large-v3-turbo",
}

choice = input("\nEnter choice [1-5 or name] (default: 4 - medium): ").strip().lower()
selected_model = model_map.get(choice, "medium")

print(f"\n[+] Loading model '{selected_model}' onto NVIDIA GeForce RTX 3050 (CUDA)...")
model = WhisperModel(selected_model, device="cuda", compute_type="float16")
print(f"[✓] Model '{selected_model}' loaded and ready!\n")

app = FastAPI()

@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    source_lang: str = Form("ta"),
    task: str = Form("translate")
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        lang = "ta" if (not source_lang or source_lang == "auto") else source_lang
        
        segments, info = model.transcribe(
            tmp_path,
            language=lang,
            task=task,
            beam_size=5,
            best_of=5,
            temperature=[0.0, 0.2, 0.4],
            compression_ratio_threshold=2.2,
            log_prob_threshold=-1.0,
            no_speech_threshold=0.6,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=400),
            condition_on_previous_text=False
        )
        
        results = []
        for s in segments:
            text = s.text.strip()
            if text:
                results.append({
                    "startMs": int(s.start * 1000),
                    "endMs": int(s.end * 1000),
                    "text": text,
                    "confidence": int(round((1.0 - getattr(s, "no_speech_prob", 0.0)) * 100)),
                    "lang": info.language
                })
        return {"language": info.language, "segments": results}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)