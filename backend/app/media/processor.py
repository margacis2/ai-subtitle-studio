import os
import sys
import subprocess
import shutil
from typing import Optional, Dict, Any

def get_ffmpeg_path() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise RuntimeError("FFmpeg executable not found on system PATH")
    return path

def get_ffprobe_path() -> str:
    path = shutil.which("ffprobe")
    if not path:
        raise RuntimeError("FFprobe executable not found on system PATH")
    return path

def probe_media_info(file_path: str) -> Dict[str, Any]:
    """Extract media duration, streams, audio tracks using ffprobe."""
    ffprobe = get_ffprobe_path()
    cmd = [
        ffprobe,
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"FFprobe failed on {file_path}: {res.stderr}")

    import json
    data = json.loads(res.stdout)
    fmt = data.get("format", {})
    streams = data.get("streams", [])

    duration = float(fmt.get("duration", 0))
    size = int(fmt.get("size", 0))
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    has_video = any(s.get("codec_type") == "video" for s in streams)

    return {
        "durationSec": duration,
        "sizeBytes": size,
        "hasAudio": has_audio,
        "hasVideo": has_video,
        "format": fmt.get("format_name", "unknown")
    }

def extract_optimized_audio(
    media_path: str,
    output_base_path: str,
    max_bytes: int = 95 * 1024 * 1024
) -> Dict[str, Any]:
    """
    Extract 16 kHz mono WAV. If larger than max_bytes, automatically encode to 64 kbps MP3.
    Preserves speech fidelity while keeping size compact.
    """
    ffmpeg = get_ffmpeg_path()
    orig_size = os.path.getsize(media_path)
    wav_path = output_base_path + ".wav"

    # Step 1: Extract 16 kHz mono PCM WAV
    cmd_wav = [
        ffmpeg, "-y", "-nostdin",
        "-i", media_path,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-acodec", "pcm_s16le",
        "-f", "wav",
        wav_path
    ]
    res = subprocess.run(cmd_wav, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0 or not os.path.exists(wav_path):
        raise RuntimeError(f"FFmpeg WAV extraction failed: {res.stderr.decode('utf-8', errors='ignore')}")

    wav_size = os.path.getsize(wav_path)
    if wav_size <= max_bytes:
        return {
            "path": wav_path,
            "format": "wav",
            "originalSize": orig_size,
            "optimizedSize": wav_size,
            "compressionRatio": round(((orig_size - wav_size) / max_size_base(orig_size)) * 100, 1)
        }

    # Step 2: Fall back to 64 kbps mono MP3 for long-form audio (> 45 min)
    mp3_path = output_base_path + "_opt.mp3"
    cmd_mp3 = [
        ffmpeg, "-y", "-nostdin",
        "-i", wav_path,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "libmp3lame",
        "-b:a", "64k",
        mp3_path
    ]
    res2 = subprocess.run(cmd_mp3, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res2.returncode == 0 and os.path.exists(mp3_path):
        mp3_size = os.path.getsize(mp3_path)
        return {
            "path": mp3_path,
            "format": "mp3",
            "originalSize": orig_size,
            "optimizedSize": mp3_size,
            "compressionRatio": round(((orig_size - mp3_size) / max_size_base(orig_size)) * 100, 1)
        }

    return {
        "path": wav_path,
        "format": "wav",
        "originalSize": orig_size,
        "optimizedSize": wav_size,
        "compressionRatio": 0
    }

def max_size_base(val: int) -> int:
    return val if val > 0 else 1

