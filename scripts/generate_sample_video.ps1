# Generate a 60-90s sample test video with spoken English for AI Subtitle Studio verification
$ErrorActionPreference = "Stop"

$transcript = @"
Hello and welcome to AI Subtitle Studio.
This video is an automated speech recognition and subtitle verification test.
We are testing real-time transcription powered by Faster-Whisper.
The audio from this media file is extracted and preprocessed to a sixteen kilohertz mono signal.
The target file size is optimized to remain well below one hundred megabytes.
This ensures ultra-fast transmission to the Google Colab GPU cloud backend.
Voice activity detection automatically locates speech regions and trims silence.
Neural machine translation can convert these subtitles into multiple languages such as Japanese, Tamil, and Spanish.
Accurate word-level timestamps are calculated for every sentence.
Thank you for using AI Subtitle Studio. Processing test complete.
"@

$transcriptPath = Join-Path $PSScriptRoot "..\sample_reference_transcript.txt"
$transcript | Set-Content -Path $transcriptPath -Encoding UTF8
Write-Host "[✓] Reference transcript saved to: sample_reference_transcript.txt"

# 1. Synthesize Speech
$tempWav = Join-Path $PSScriptRoot "temp_speech.wav"
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0  # Normal speed
$synth.SetOutputToWaveFile($tempWav)

foreach ($line in ($transcript -split "`r?`n")) {
    if ($line.Trim()) {
        $synth.Speak($line.Trim())
        Start-Sleep -Milliseconds 400
    }
}
$synth.Dispose()

Write-Host "[✓] Speech synthesized to $tempWav"

# 2. Inspect audio duration with ffprobe
$audioDuration = & ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $tempWav
$durInt = [Math]::Ceiling([double]$audioDuration)
Write-Host "[✓] Synthesized audio duration: $audioDuration seconds ($durInt s)"

# 3. Create MP4 video with testsrc pattern and audio
$outputMp4 = Join-Path $PSScriptRoot "..\sample_test_video.mp4"
Write-Host "[*] Rendering sample video with FFmpeg to $outputMp4..."

& ffmpeg -y -f lavfi -i "testsrc=size=640x360:rate=25" -i $tempWav -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k -t $durInt -shortest $outputMp4

if (Test-Path $tempWav) {
    Remove-Item -Force $tempWav
}

$mp4Item = Get-Item $outputMp4
$mp4Mb = ($mp4Item.Length / 1MB).ToString("0.00")
Write-Host "[✓] Sample test video generated successfully!"
Write-Host "    File    : $($mp4Item.FullName)"
Write-Host "    Size    : $mp4Mb MB"
Write-Host "    Duration: $audioDuration s"
