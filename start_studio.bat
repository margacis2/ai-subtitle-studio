@echo off
title AI Subtitle Studio Launcher
color 0b

echo =========================================================
echo             AI SUBTITLE STUDIO - ONE-CLICK START
echo =========================================================
echo.

:: 1. Check prerequisites
echo [1/3] Checking environment...
where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python not found on your system PATH!
    echo Please install Python 3.10+ and add it to PATH.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js / npm not found on your system PATH!
    echo Please install Node.js and add it to PATH.
    pause
    exit /b 1
)

echo [OK] Python and Node.js detected.
echo.

:: 2. Start Python Whisper GPU Server in a separate window
echo [2/3] Starting Whisper GPU Backend (Port 8001)...
start "Whisper GPU Server (FastAPI :8001)" cmd /k "title Whisper GPU Server && cd /d "%~dp0" && python server.py"

echo Waiting for Whisper server to initialize...
timeout /t 3 /nobreak >nul
echo.

:: 3. Start Next.js Web Interface
echo [3/3] Starting Next.js Web Studio (Port 3000)...
echo.
echo =========================================================
echo  Open your browser at: http://localhost:3000
echo =========================================================
echo.

cd /d "%~dp0"
npm run dev

pause

