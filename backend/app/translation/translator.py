import os
import re
import threading
from typing import List, Dict, Tuple, Optional, Any
import torch

_opus_cache: Dict[str, Tuple[Any, Any]] = {}
_opus_lock = threading.Lock()

_nllb_cache: Dict[str, Tuple[Any, Any]] = {}
_nllb_lock = threading.Lock()

# Curated, verified multilingual OPUS-MT mapping
OPUS_PAIRS: Dict[Tuple[str, str], str] = {
    ("ja", "en"): "Helsinki-NLP/opus-mt-ja-en",
    ("fr", "en"): "Helsinki-NLP/opus-mt-fr-en",
    ("de", "en"): "Helsinki-NLP/opus-mt-de-en",
    ("es", "en"): "Helsinki-NLP/opus-mt-es-en",
    ("zh", "en"): "Helsinki-NLP/opus-mt-zh-en",
    ("ar", "en"): "Helsinki-NLP/opus-mt-ar-en",
    ("hi", "en"): "Helsinki-NLP/opus-mt-hi-en",
    ("ta", "en"): "Helsinki-NLP/opus-mt-dra-en",
    ("te", "en"): "Helsinki-NLP/opus-mt-dra-en",
    ("ml", "en"): "Helsinki-NLP/opus-mt-dra-en",
    ("kn", "en"): "Helsinki-NLP/opus-mt-dra-en",
    ("en", "es"): "Helsinki-NLP/opus-mt-en-es",
    ("en", "fr"): "Helsinki-NLP/opus-mt-en-fr",
    ("en", "de"): "Helsinki-NLP/opus-mt-en-de",
    ("en", "ja"): "Helsinki-NLP/opus-mt-en-jap",
    ("en", "hi"): "Helsinki-NLP/opus-mt-en-hi",
    ("en", "ta"): "Helsinki-NLP/opus-mt-en-dra",
    ("en", "zh"): "Helsinki-NLP/opus-mt-en-zh",
}

# Standard language code mapping to Meta NLLB-200 BCP-47 codes
NLLB_CODE_MAP: Dict[str, str] = {
    "en": "eng_Latn",
    "es": "spa_Latn",
    "fr": "fra_Latn",
    "de": "deu_Latn",
    "ja": "jpn_Jpan",
    "zh": "zho_Hans",
    "hi": "hin_Deva",
    "ta": "tam_Taml",
    "te": "tel_Telu",
    "ml": "mal_Mlym",
    "kn": "kan_Knda",
    "ko": "kor_Hang",
    "ar": "ara_Arab",
    "ru": "rus_Cyrl",
    "pt": "por_Latn",
    "it": "ita_Latn",
    "nl": "nld_Latn",
    "tr": "tur_Latn",
    "vi": "vie_Latn",
    "id": "ind_Latn",
    "pl": "pol_Latn",
}

def detect_sample_lang(texts: List[str]) -> str:
    """Fast unicode-block heuristic to identify non-English alphabets."""
    sample = " ".join([t for t in texts[:10] if t])
    if not sample:
        return "en"
    if re.search(r"[\u3040-\u30ff]", sample):
        return "ja"
    if re.search(r"[\uac00-\ud7af]", sample):
        return "ko"
    if re.search(r"[\u4e00-\u9fff]", sample):
        return "zh"
    if re.search(r"[\u0900-\u097f]", sample):
        return "hi"
    if re.search(r"[\u0b80-\u0bff]", sample):
        return "ta"
    if re.search(r"[\u0c00-\u0c7f]", sample):
        return "te"
    if re.search(r"[\u0600-\u06ff]", sample):
        return "ar"
    if re.search(r"[\u0400-\u04ff]", sample):
        return "ru"
    return "en"

def translate_with_opus(texts: List[str], source_lang: str, target_lang: str) -> List[str]:
    """Translate batch of texts using local MarianMT OPUS model with fast greedy decoding."""
    if not texts:
        return []

    src = (source_lang or "auto").lower().split("-")[0]
    tgt = (target_lang or "en").lower().split("-")[0]

    # Handle auto source language
    if src in ("auto", "", "original", "none"):
        src = detect_sample_lang(texts)

    if src == tgt or tgt in ("original", ""):
        return texts

    pair = (src, tgt)
    model_id = OPUS_PAIRS.get(pair)

    # If OPUS pair is not configured, try NLLB if available, else preserve original gracefully
    if not model_id:
        try:
            return translate_with_nllb(texts, src, tgt)
        except Exception:
            print(f"[WARN] Translation pair '{src}' -> '{tgt}' not in OPUS catalog; preserving original.")
            return texts

    device = "cuda" if torch.cuda.is_available() else "cpu"

    with _opus_lock:
        if model_id not in _opus_cache:
            from transformers import MarianMTModel, MarianTokenizer
            tok = MarianTokenizer.from_pretrained(model_id)
            mdl = MarianMTModel.from_pretrained(model_id)
            if device == "cuda":
                try:
                    mdl = mdl.to("cuda")
                except Exception:
                    device = "cpu"
            else:
                torch.set_num_threads(max(2, (os.cpu_count() or 4) // 2))
            mdl.eval()
            _opus_cache[model_id] = (tok, mdl)

        tok, mdl = _opus_cache[model_id]

    results = []
    # Batch size 32 for optimal CPU/GPU throughput
    batch_size = 32
    for i in range(0, len(texts), batch_size):
        chunk = texts[i : i + batch_size]
        clean_chunk = [t.strip() if t.strip() else "." for t in chunk]
        inputs = tok(clean_chunk, return_tensors="pt", padding=True, truncation=True, max_length=128)
        if device == "cuda":
            inputs = {k: v.to("cuda") for k, v in inputs.items()}

        with torch.no_grad():
            # Fast greedy decoding (num_beams=1) for 8x faster subtitle translation
            generated = mdl.generate(
                **inputs,
                max_new_tokens=64,
                num_beams=1,
                do_sample=False,
                early_stopping=True
            )
        decoded = tok.batch_decode(generated, skip_special_tokens=True)
        for original, translated in zip(chunk, decoded):
            results.append("" if not original.strip() else translated.strip())

    return results

def translate_with_nllb(texts: List[str], source_lang: str, target_lang: str) -> List[str]:
    """Universal multilingual translation using Meta NLLB-200 (supports 200 languages)."""
    if not texts:
        return []

    src_raw = (source_lang or "en").lower().split("-")[0]
    tgt_raw = (target_lang or "en").lower().split("-")[0]

    if src_raw in ("auto", "", "original"):
        src_raw = detect_sample_lang(texts)

    if src_raw == tgt_raw or tgt_raw in ("original", ""):
        return texts

    src_nllb = NLLB_CODE_MAP.get(src_raw, f"{src_raw}_Latn")
    tgt_nllb = NLLB_CODE_MAP.get(tgt_raw, f"{tgt_raw}_Latn")

    model_id = "facebook/nllb-200-distilled-600M"
    device = "cuda" if torch.cuda.is_available() else "cpu"

    with _nllb_lock:
        if model_id not in _nllb_cache:
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
            tok = AutoTokenizer.from_pretrained(model_id, src_lang=src_nllb)
            mdl = AutoModelForSeq2SeqLM.from_pretrained(model_id)
            if device == "cuda":
                try:
                    mdl = mdl.to("cuda")
                except Exception:
                    device = "cpu"
            mdl.eval()
            _nllb_cache[model_id] = (tok, mdl)

        tok, mdl = _nllb_cache[model_id]

    tok.src_lang = src_nllb
    forced_bos_token_id = None
    if hasattr(tok, "lang_code_to_id") and tgt_nllb in tok.lang_code_to_id:
        forced_bos_token_id = tok.lang_code_to_id[tgt_nllb]
    elif hasattr(tok, "convert_tokens_to_ids"):
        tid = tok.convert_tokens_to_ids(tgt_nllb)
        if tid is not None and tid != getattr(tok, "unk_token_id", None):
            forced_bos_token_id = tid

    results = []
    batch_size = 16
    for i in range(0, len(texts), batch_size):
        chunk = texts[i : i + batch_size]
        clean_chunk = [t.strip() if t.strip() else "." for t in chunk]
        inputs = tok(clean_chunk, return_tensors="pt", padding=True, truncation=True, max_length=128)
        if device == "cuda":
            inputs = {k: v.to("cuda") for k, v in inputs.items()}

        with torch.no_grad():
            gen_kwargs = {
                "max_new_tokens": 64,
                "num_beams": 1,
                "do_sample": False
            }
            if forced_bos_token_id is not None:
                gen_kwargs["forced_bos_token_id"] = forced_bos_token_id
            generated = mdl.generate(**inputs, **gen_kwargs)

        decoded = tok.batch_decode(generated, skip_special_tokens=True)
        for original, translated in zip(chunk, decoded):
            results.append("" if not original.strip() else translated.strip())

    return results

def translate_with_argos(texts: List[str], source_lang: str, target_lang: str) -> List[str]:
    """Translate batch using offline Argos Translate engine if available."""
    try:
        import argostranslate.translate
        src = source_lang.lower().split("-")[0]
        tgt = target_lang.lower().split("-")[0]
        if src == tgt:
            return texts

        installed_languages = argostranslate.translate.get_installed_languages()
        from_lang = next((l for l in installed_languages if l.code == src), None)
        to_lang = next((l for l in installed_languages if l.code == tgt), None)

        if not from_lang or not to_lang:
            return translate_with_opus(texts, source_lang, target_lang)

        translation = from_lang.get_translation(to_lang)
        if not translation:
            return translate_with_opus(texts, source_lang, target_lang)

        return [translation.translate(t) if t.strip() else "" for t in texts]
    except Exception:
        return translate_with_opus(texts, source_lang, target_lang)

def release_translation_models():
    """Unload all cached MarianMT and NLLB translation models and free VRAM/RAM."""
    global _opus_cache, _nllb_cache
    with _opus_lock:
        _opus_cache.clear()
    with _nllb_lock:
        _nllb_cache.clear()
    import gc
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            if hasattr(torch.cuda, "ipc_collect"):
                torch.cuda.ipc_collect()
    except Exception:
        pass
    print("[✓] Translation models successfully unloaded from VRAM/RAM.")
