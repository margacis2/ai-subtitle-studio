@echo off
setlocal enabledelayedexpansion
title AI Subtitle Studio
color 0b
cd /d "%~dp0"

echo =====================================================================
echo                 AI SUBTITLE STUDIO - DESKTOP WORKSTATION
echo         100%% Local AI Speech Recognition ^& Subtitle Editor
echo =====================================================================
echo.

:: 1. Check prerequisites
echo [*] Checking runtime environment...

where python >nul 2>nul
if errorlevel 1 (
    color 0c
    echo [ERROR] Python was not found in your system PATH!
    echo Please install Python 3.10+ from python.org and check "Add Python to PATH".
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    color 0c
    echo [ERROR] Node.js / npm was not found in your system PATH!
    echo Please install Node.js (v18+) from nodejs.org.
    echo.
    pause
    exit /b 1
)

echo [OK] Python and Node.js detected.
echo.

:: 2. Menu options
echo Choose how you would like to run AI Subtitle Studio:
echo.
echo   [1] Start AI Subtitle Studio in Browser (Default / Recommended)
echo   [2] Launch Native Desktop Application (Electron)
echo   [3] Run 9-Step Hardware & Audio Diagnostics
echo   [4] Start Python AI Backend Only (Port 8001)
echo.
set /p MODE="Enter choice [1-4, default is 1]: "
if "%MODE%"=="" set MODE=1

echo.

if "%MODE%"=="2" goto LAUNCH_ELECTRON
if "%MODE%"=="3" goto RUN_DIAGNOSTICS
if "%MODE%"=="4" goto LAUNCH_BACKEND_ONLY
goto LAUNCH_WEB

:LAUNCH_WEB
echo =====================================================================
echo [*] Starting Python AI Engine (Faster-Whisper CUDA / CTranslate2)...
start "AI Subtitle Studio - Python Engine" /min cmd /c "cd /d "%~dp0" && python -m backend.app.main"

echo [*] Starting Next.js Studio on http://localhost:3000 ...
echo [*] Opening browser in 4 seconds...
start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000"

echo.
echo =====================================================================
echo   Studio URL : http://localhost:3000
echo   AI Backend : http://127.0.0.1:8001
echo =====================================================================
echo Press Ctrl+C in this window to stop the studio.
echo.
npm run dev
goto END

:LAUNCH_ELECTRON
echo =====================================================================
echo [*] Starting Desktop Application with Electron...
echo =====================================================================
start "AI Subtitle Studio - Python Engine" /min cmd /c "cd /d "%~dp0" && python -m backend.app.main"
npm run desktop:dev
goto END

:RUN_DIAGNOSTICS
echo =====================================================================
echo [*] Running Hardware & Audio Pipeline Diagnostics...
echo =====================================================================
npx tsx scripts/run_diag_test.ts
echo.
pause
goto END

:LAUNCH_BACKEND_ONLY
echo =====================================================================
echo [*] Starting Python AI Engine directly on Port 8001...
echo =====================================================================
python -m backend.app.main
goto END

:END
