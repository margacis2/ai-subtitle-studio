import os
import threading
from typing import List, Dict, Tuple, Optional, Any
import torch

_opus_cache: Dict[str, Tuple[Any, Any]] = {}
_opus_lock = threading.Lock()

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
}

def translate_with_opus(texts: List[str], source_lang: str, target_lang: str) -> List[str]:
    """Translate batch of texts using local MarianMT OPUS model."""
    if not texts:
        return []

    src = source_lang.lower().split("-")[0]
    tgt = target_lang.lower().split("-")[0]
    if src == tgt:
        return texts

    pair = (src, tgt)
    model_id = OPUS_PAIRS.get(pair)
    if not model_id:
        raise ValueError(
            f"Translation pair '{src}' -> '{tgt}' is not currently configured. Supported pairs: {', '.join(f'{s}->{t}' for s, t in OPUS_PAIRS.keys())}"
        )

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
            mdl.eval()
            _opus_cache[model_id] = (tok, mdl)

        tok, mdl = _opus_cache[model_id]

    results = []
    batch_size = 16
    for i in range(0, len(texts), batch_size):
        chunk = texts[i : i + batch_size]
        clean_chunk = [t if t.strip() else "." for t in chunk]
        inputs = tok(clean_chunk, return_tensors="pt", padding=True, truncation=True, max_length=512)
        if device == "cuda":
            inputs = {k: v.to("cuda") for k, v in inputs.items()}
        with torch.no_grad():
            generated = mdl.generate(**inputs, max_new_tokens=256)
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
            raise ValueError(f"Argos translation package for {src} -> {tgt} not installed.")

        translation = from_lang.get_translation(to_lang)
        if not translation:
            raise ValueError(f"No direct translation link between {src} and {tgt}.")

        return [translation.translate(t) if t.strip() else "" for t in texts]
    except ImportError:
        raise RuntimeError("argostranslate is not installed")

