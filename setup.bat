@echo off
setlocal enabledelayedexpansion
title AI Subtitle Studio - Automated Environment Setup
color 0a
cd /d "%~dp0"

echo =====================================================================
echo            AI SUBTITLE STUDIO - AUTOMATED SETUP
echo      Configuring Python Virtual Environment, AI GPU & Dependencies
echo =====================================================================
echo.

:: 1. Detect Python
echo [1/5] Checking Python installation...
set "PY_EXE="

if exist "%USERPROFILE%\venv\Scripts\python.exe" (
    set "PY_EXE=%USERPROFILE%\venv\Scripts\python.exe"
    set "VENV_DIR=%USERPROFILE%\venv"
    echo [OK] Found existing venv at: !PY_EXE!
) else if exist "%~dp0venv\Scripts\python.exe" (
    set "PY_EXE=%~dp0venv\Scripts\python.exe"
    set "VENV_DIR=%~dp0venv"
    echo [OK] Found project venv at: !PY_EXE!
) else if exist "C:\Python314\python.exe" (
    set "PY_BASE=C:\Python314\python.exe"
    echo [OK] Found system Python at C:\Python314\python.exe
) else (
    where python >nul 2>nul
    if not errorlevel 1 (
        for /f "delims=" %%i in ('where python') do (
            if not defined PY_BASE set "PY_BASE=%%i"
        )
    )
)

:: Create venv if not already created
if not defined PY_EXE (
    if defined PY_BASE (
        echo Creating virtual environment at %~dp0venv ...
        "%PY_BASE%" -m venv "%~dp0venv"
        set "PY_EXE=%~dp0venv\Scripts\python.exe"
        set "VENV_DIR=%~dp0venv"
    ) else (
        color 0c
        echo [ERROR] Python not found! Please install Python 3.10+ (64-bit) from python.org.
        pause
        exit /b 1
    )
)

echo [OK] Using Python: "!PY_EXE!"
echo.

:: 2. Upgrade pip and install Python requirements
echo [2/5] Installing Python AI libraries (Faster-Whisper, FastAPI, CTranslate2, Torch)...
"!PY_EXE!" -m pip install --upgrade pip setuptools wheel
"!PY_EXE!" -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
    echo [WARN] Some packages reported warnings; retrying core components...
    "!PY_EXE!" -m pip install fastapi pydantic uvicorn python-multipart ctranslate2 faster-whisper transformers torch psutil qrcode websockets
)
echo [OK] Python dependencies installed successfully.
echo.

:: 3. Check and install Node.js / frontend dependencies
echo [3/5] Checking Node.js and NPM...
where npm >nul 2>nul
if errorlevel 1 (
    color 0c
    echo [ERROR] Node.js / npm not found! Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

if not exist "%~dp0node_modules" (
    echo Installing frontend dependencies with npm install...
    call npm install
) else (
    echo [OK] Node modules already present.
)
echo.

:: 4. Ensure Cloudflare Tunnel executable
echo [4/5] Checking Cloudflare Tunnel binary for WAN remote sharing...
if not exist "%~dp0cloudflared.exe" (
    echo Downloading cloudflared.exe for zero-config Internet remote access...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%~dp0cloudflared.exe'"
)
if exist "%~dp0cloudflared.exe" (
    echo [OK] cloudflared.exe ready.
) else (
    echo [WARN] cloudflared.exe could not be auto-downloaded. Local Wi-Fi sharing will still function.
)
echo.

:: 5. Create backend .env from example if missing
echo [5/5] Configuring environment files...
if not exist "%~dp0backend\.env" (
    if exist "%~dp0backend\.env.example" (
        copy "%~dp0backend\.env.example" "%~dp0backend\.env" >nul
        echo [OK] Created backend\.env from template.
    )
)

echo.
echo =====================================================================
echo [SUCCESS] Setup is complete!
echo To start the studio and enable multi-device / remote access:
echo   Double-click: start.bat
echo =====================================================================
echo.
pause

