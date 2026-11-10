import os
import sys
import tempfile
import wave
import struct
import math

# Add root directory to PATH and sys.path
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
if os.name == "nt":
    os.environ["PATH"] = ROOT + os.pathsep + os.environ.get("PATH", "")
    if hasattr(os, "add_dll_directory") and os.path.exists(ROOT):
        try:
            os.add_dll_directory(ROOT)
        except Exception:
            pass

def generate_test_wav(filepath: str, duration_sec: float = 3.0, sample_rate: int = 16000):
    """Generate a clean test PCM WAV file."""
    n_samples = int(duration_sec * sample_rate)
    with wave.open(filepath, "w") as wav_file:
        wav_file.setnchannels(1)  # mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        # 440 Hz tone
        for i in range(n_samples):
            val = int(32767.0 * 0.4 * math.sin(2.0 * math.pi * 440.0 * (i / sample_rate)))
            data = struct.pack("<h", val)
            wav_file.writeframesraw(data)

def test_hardware():
    print("[1/5] Checking Hardware Detection...")
    from backend.app.core.hardware import detect_hardware
    hw = detect_hardware()
    print(f"      OS: {hw['os']} ({hw['architecture']}), CPU cores: {hw['cpu_count']}")
    print(f"      RAM: {hw['ram_gb']} GB total, {hw['ram_available_gb']} GB available")
    print(f"      CUDA available: {hw['cuda_available']}, GPU Count: {hw['cuda_device_count']}")
    if hw['gpu_name']:
        print(f"      GPU: {hw['gpu_name']} ({hw['gpu_vram_gb']} GB VRAM)")
    print(f"      Recommended Model: {hw['recommended_model']}")
    assert hw['ram_gb'] > 0
    print("      ✓ Hardware detection PASSED")

def test_model_manager():
    print("[2/5] Checking Model Manager Catalog...")
    from backend.app.models.manager import get_installed_models, AVAILABLE_WHISPER_MODELS
    catalog = get_installed_models()
    print(f"      Found {len(catalog)} catalog entries: {[m['id'] for m in catalog]}")
    assert len(catalog) >= 5
    print("      ✓ Model catalog PASSED")

def test_transcription():
    print("[3/5] Checking Faster-Whisper Local Engine...")
    from backend.app.engines.transcriber import transcribe_audio_file, release_whisper_engine
    
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_wav = tmp.name
    try:
        generate_test_wav(tmp_wav, duration_sec=2.0)
        res = transcribe_audio_file(tmp_wav, model_id="tiny")
        print(f"      Transcribe output language: {res.get('language')}")
        print(f"      Duration: {res.get('duration')}s, Processed in: {res.get('processingTimeSec')}s")
        print(f"      Segments returned: {len(res.get('segments', []))}")
        assert "language" in res
        release_whisper_engine()
        print("      ✓ Faster-Whisper local engine PASSED")
    finally:
        if os.path.exists(tmp_wav):
            os.remove(tmp_wav)

def test_offline_translation():
    print("[4/5] Checking Offline Translation (OPUS-MT / Argos)...")
    from backend.app.translation.translator import translate_with_opus, translate_with_argos
    text = "Good morning, how are you today?"
    try:
        translated = translate_with_opus([text], "en", "es")
        print(f"      OPUS-MT [en->es]: '{text}' -> '{translated[0]}'")
        assert len(translated) == 1
    except Exception as e:
        print(f"      OPUS-MT note: {e}, testing Argos Translate...")
        translated = translate_with_argos([text], "en", "es")
        print(f"      Argos [en->es]: '{text}' -> '{translated[0]}'")
    print("      ✓ Offline translation PASSED")

def test_fastapi_server_client():
    print("[5/5] Checking FastAPI Endpoints with TestClient...")
    from fastapi.testclient import TestClient
    from backend.app.main import app
    client = TestClient(app)
    
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] in ["online", "ok"]
    print("      /health: 200 OK (status=online)")
    
    res = client.get("/models")
    assert res.status_code == 200
    assert len(res.json()["models"]) >= 5
    print("      /models: 200 OK")
    
    res = client.get("/hardware")
    assert res.status_code == 200
    assert res.json()["cuda_available"] is True
    print("      /hardware: 200 OK (CUDA verified)")
    print("      ✓ FastAPI endpoints PASSED")

if __name__ == "__main__":
    print("==================================================")
    print("AI SUBTITLE STUDIO: DESKTOP PIPELINE VERIFICATION")
    print("==================================================")
    test_hardware()
    test_model_manager()
    test_transcription()
    test_offline_translation()
    test_fastapi_server_client()
    print("==================================================")
    print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY! (5/5)")
    print("==================================================")
