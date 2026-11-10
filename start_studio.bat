@echo off
setlocal enabledelayedexpansion
title AI Subtitle Studio Launcher
color 0b
cd /d "%~dp0"

echo =====================================================================
echo             AI SUBTITLE STUDIO - ONE-CLICK START
echo     100%% Local AI Speech Recognition ^& Subtitle Editor
echo =====================================================================
echo.

:: 1. Check prerequisites
echo [1/3] Checking environment...
where python >nul 2>nul
if errorlevel 1 (
    color 0c
    echo [ERROR] Python not found on your system PATH!
    echo Please install Python 3.10+ and add it to PATH.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    color 0c
    echo [ERROR] Node.js / npm not found on your system PATH!
    echo Please install Node.js and add it to PATH.
    pause
    exit /b 1
)

echo [OK] Python and Node.js detected.
echo.

:: 2. Start Python Whisper GPU Server in background
echo [2/3] Starting Faster-Whisper GPU Engine (Port 8001)...
start "AI Subtitle Studio - Python Engine" /min cmd /c "cd /d "%~dp0" && python -m backend.app.main"

echo Waiting for Whisper server to initialize...
timeout /t 2 /nobreak >nul
echo.

:: 3. Start Next.js Web Interface & auto-open browser
echo [3/3] Starting Next.js Web Studio (Port 3000)...
echo.
echo =====================================================================
echo  Studio URL : http://localhost:3000
echo  AI Engine  : http://127.0.0.1:8001 (NVIDIA CUDA fp16)
echo =====================================================================
echo.

start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000"
npm run dev

pause
