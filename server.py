import os
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["PATH"] = os.path.dirname(os.path.abspath(__file__)) + os.pathsep + os.environ.get("PATH", "")
if hasattr(os, "add_dll_directory"):
    os.add_dll_directory(os.path.dirname(os.path.abspath(__file__)))

import tempfile
import threading
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from faster_whisper import WhisperModel
import uvicorn
from transformers import MarianMTModel, MarianTokenizer

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
whisper_model = WhisperModel(selected_model, device="cuda", compute_type="float16")
print(f"[✓] Model '{selected_model}' loaded and ready!\n")

# OPUS-MT Model Manager (Lazy loaded, lightweight ~300MB each)
OPUS_MODEL_MAP = {
    "ja": "Helsinki-NLP/opus-mt-ja-en",
    "ta": "Helsinki-NLP/opus-mt-dra-en",
    "te": "Helsinki-NLP/opus-mt-dra-en",
    "ml": "Helsinki-NLP/opus-mt-dra-en",
    "kn": "Helsinki-NLP/opus-mt-dra-en",
    "hi": "Helsinki-NLP/opus-mt-mul-en",
    "fr": "Helsinki-NLP/opus-mt-fr-en",
    "de": "Helsinki-NLP/opus-mt-de-en",
    "es": "Helsinki-NLP/opus-mt-es-en",
    "zh": "Helsinki-NLP/opus-mt-zh-en",
    "ar": "Helsinki-NLP/opus-mt-ar-en",
    "mul": "Helsinki-NLP/opus-mt-mul-en",
}

loaded_opus = {}
opus_lock = threading.Lock()

def get_opus_model(src_lang: str):
    lang_key = src_lang.lower().split("-")[0]
    hub_name = OPUS_MODEL_MAP.get(lang_key, OPUS_MODEL_MAP.get("mul"))
    if not hub_name:
        raise ValueError(f"No local OPUS model available for language code: {src_lang}")

    with opus_lock:
        if hub_name not in loaded_opus:
            print(f"[+] Loading OPUS-MT model '{hub_name}' for language '{src_lang}'...")
            tok = MarianTokenizer.from_pretrained(hub_name)
            mdl = MarianMTModel.from_pretrained(hub_name)
            loaded_opus[hub_name] = (tok, mdl)
            print(f"[✓] OPUS-MT model '{hub_name}' ready.")
        return loaded_opus[hub_name]

def translate_texts_with_opus(texts: List[str], src_lang: str, tgt_lang: str = "en") -> List[str]:
    if not texts:
        return []
    if src_lang == tgt_lang or (src_lang == "en" and tgt_lang == "en"):
        return texts
    tok, mdl = get_opus_model(src_lang)
    # Batch processing
    batch_size = 16
    results = []
    for i in range(0, len(texts), batch_size):
        chunk = texts[i : i + batch_size]
        # Clean inputs
        clean_chunk = [t if t.strip() else "." for t in chunk]
        inp = tok(clean_chunk, return_tensors="pt", padding=True, truncation=True, max_length=512)
        out = mdl.generate(**inp, max_length=512)
        decoded = [tok.decode(t, skip_special_tokens=True).strip() for t in out]
        for original, trans in zip(chunk, decoded):
            if not original.strip():
                results.append("")
            else:
                results.append(trans)
    return results

app = FastAPI(title="AI Subtitle & Translation Studio Backend")

@app.get("/health")
async def health_check():
    return {
        "status": "online",
        "whisper_model": selected_model,
        "device": "cuda",
    }

class TranslateRequest(BaseModel):
    texts: List[str]
    source_lang: str = "ja"
    target_lang: str = "en"

@app.post("/translate")
async def translate_endpoint(req: TranslateRequest):
    try:
        translated = translate_texts_with_opus(req.texts, req.source_lang, req.target_lang)
        return {
            "source_lang": req.source_lang,
            "target_lang": req.target_lang,
            "translations": translated,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    source_lang: str = Form("auto"),
    target_lang: str = Form("en"),
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Determine language for whisper
        lang = None if (not source_lang or source_lang == "auto") else source_lang
        
        # We transcribe in native source language first
        segments_gen, info = whisper_model.transcribe(
            tmp_path,
            language=lang,
            task="transcribe",
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
        
        raw_segments = list(segments_gen)
        detected_lang = info.language

        # Extract texts for translation
        original_texts = [s.text.strip() for s in raw_segments]

        # If target language is different, translate using OPUS-MT
        translated_texts = []
        effective_src = lang or detected_lang or "ja"
        if target_lang != "original" and target_lang != effective_src:
            try:
                translated_texts = translate_texts_with_opus(original_texts, effective_src, target_lang)
            except Exception as e:
                print(f"[!] Local OPUS translation error: {e}. Falling back to original.")
                translated_texts = original_texts
        else:
            translated_texts = original_texts

        results = []
        for s, orig_text, trans_text in zip(raw_segments, original_texts, translated_texts):
            if orig_text:
                results.append({
                    "startMs": int(s.start * 1000),
                    "endMs": int(s.end * 1000),
                    "original": orig_text,
                    "translation": trans_text,
                    "text": trans_text if target_lang != "original" else orig_text,
                    "confidence": int(round((1.0 - getattr(s, "no_speech_prob", 0.0)) * 100)),
                    "lang": detected_lang
                })

        return {"language": detected_lang, "segments": results}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)

