import os
import sys
import time
import json
import requests

BACKEND_URL = "http://127.0.0.1:8001"

def run_tests():
    print("=" * 60)
    print("AI SUBTITLE STUDIO - ENGINE AUTOMATED TEST SUITE")
    print("=" * 60)

    # 1. Health & Hardware
    print("\n[TEST 1/6] Checking Backend Health & Hardware Detection...")
    res = requests.get(f"{BACKEND_URL}/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    health = res.json()
    print(f"  ✓ Status: {health.get('status')}")
    print(f"  ✓ Device: {health.get('device')}")
    print(f"  ✓ GPU: {health.get('gpu')}")
    print(f"  ✓ CUDA: {health.get('cuda')}")
    print(f"  ✓ FFmpeg Available: {health.get('ffmpeg')}")

    # 2. Model Catalog
    print("\n[TEST 2/6] Querying Model Catalog...")
    res = requests.get(f"{BACKEND_URL}/models")
    assert res.status_code == 200, f"Models check failed: {res.text}"
    models_data = res.json()
    installed = [m for m in models_data.get("models", []) if m.get("installed")]
    print(f"  ✓ Total Models in Catalog: {len(models_data.get('models', []))}")
    print(f"  ✓ Installed Models: {[m['id'] for m in installed]}")

    # 3. Model Load Verification
    print("\n[TEST 3/6] Testing Faster-Whisper 'small' Model Load...")
    res = requests.post(f"{BACKEND_URL}/models/small/test")
    assert res.status_code == 200, f"Model test failed: {res.text}"
    test_res = res.json()
    print(f"  ✓ Loaded on: {test_res.get('device')}")
    print(f"  ✓ Load Time: {test_res.get('load_time_ms', 0):.1f} ms")

    # 4. ASR Inference on Japanese Speech Audio
    print("\n[TEST 4/6] Transcribing Japanese Speech WAV...")
    test_audio = "C:/Users/marga/Downloads/ai-video-subtitle-generator-browser/data/work/3c285531-053d-44c3-8d7a-70814c9dbd79/audio_optimized.wav"
    assert os.path.exists(test_audio), f"Test audio missing: {test_audio}"

    t0 = time.time()
    res = requests.post(f"{BACKEND_URL}/transcribe", data={
        "file_path": test_audio,
        "source_lang": "ja",
        "model_id": "small",
        "word_timestamps": "true"
    })
    elapsed = time.time() - t0
    assert res.status_code == 200, f"Transcribe failed: {res.text}"
    asr_res = res.json()
    segs = asr_res.get("segments", [])
    print(f"  ✓ Detected Language: {asr_res.get('language')}")
    print(f"  ✓ Audio Duration: {asr_res.get('duration', 0):.1f}s")
    print(f"  ✓ Segments Generated: {len(segs)}")
    print(f"  ✓ Inference Elapsed: {elapsed:.2f}s ({asr_res.get('duration', 0)/max(0.1, elapsed):.1f}x realtime)")
    assert len(segs) > 50, "Expected at least 50 Japanese segments"
    print(f"  ✓ Sample Segment 1: [{segs[0]['startMs']}ms -> {segs[0]['endMs']}ms] {segs[0]['text']}")
    print(f"  ✓ Sample Segment 2: [{segs[1]['startMs']}ms -> {segs[1]['endMs']}ms] {segs[1]['text']}")

    # 5. Local Neural Machine Translation
    print("\n[TEST 5/6] Testing MarianMT Local Translation (Japanese -> English)...")
    sample_text = segs[0]['text']
    res = requests.post(f"{BACKEND_URL}/translate", json={
        "texts": [sample_text],
        "source_lang": "ja",
        "target_lang": "en"
    })
    assert res.status_code == 200, f"Translate failed: {res.text}"
    trans_res = res.json()
    trans_text = trans_res.get("translations", [""])[0]
    print(f"  ✓ Original (JA): {sample_text}")
    print(f"  ✓ Translated (EN): {trans_text}")
    assert len(trans_text) > 0, "Translation result was empty"

    # 6. Real Model Benchmark
    print("\n[TEST 6/6] Running Hardware Benchmark Endpoint...")
    res = requests.post(f"{BACKEND_URL}/benchmark", json={"model_id": "small"})
    assert res.status_code == 200, f"Benchmark failed: {res.text}"
    bench = res.json()
    print(f"  ✓ Model: {bench.get('model_id')}")
    print(f"  ✓ Device: {bench.get('device')} ({bench.get('compute_type')})")
    print(f"  ✓ RTF: {bench.get('rtf')}")
    print(f"  ✓ Speedup Factor: {bench.get('speedup_factor')}")
    print(f"  ✓ Peak RAM: {bench.get('peak_ram_mb')} MB")

    print("\n" + "=" * 60)
    print("ALL 6 ENGINE TEST SUITES PASSED WITH 100% SUCCESS!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
