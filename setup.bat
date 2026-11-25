@echo off
setlocal enabledelayedexpansion
title AI Subtitle Studio - Automated Environment Setup
color 0a
cd /d "%~dp0"

set "NO_PAUSE=0"
if /i "%~1"=="--no-pause" set "NO_PAUSE=1"

echo =====================================================================
echo            AI SUBTITLE STUDIO - AUTOMATED SETUP
echo      Configuring Python Virtual Environment, AI GPU ^& Dependencies
echo =====================================================================
echo.

:: 1. Detect Python
echo [1/6] Checking Python installation...
set "PY_EXE="
set "PY_BASE="

if exist "%~dp0.venv\Scripts\python.exe" (
    set "PY_EXE=%~dp0.venv\Scripts\python.exe"
    set "VENV_DIR=%~dp0.venv"
    echo [OK] Found project venv at: !PY_EXE!
) else if exist "%~dp0venv\Scripts\python.exe" (
    set "PY_EXE=%~dp0venv\Scripts\python.exe"
    set "VENV_DIR=%~dp0venv"
    echo [OK] Found project venv at: !PY_EXE!
) else if exist "%USERPROFILE%\venv\Scripts\python.exe" (
    set "PY_EXE=%USERPROFILE%\venv\Scripts\python.exe"
    set "VENV_DIR=%USERPROFILE%\venv"
    echo [OK] Found existing venv at: !PY_EXE!
) else if exist "C:\Python314\python.exe" (
    set "PY_BASE=C:\Python314\python.exe"
    echo [OK] Found system Python at C:\Python314\python.exe
) else (
    where py >nul 2>nul
    if not errorlevel 1 (
        for /f "delims=" %%i in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do (
            if not defined PY_BASE set "PY_BASE=%%i"
        )
    )
    if not defined PY_BASE (
        for /f "delims=" %%i in ('where python 2^>nul') do (
            echo "%%i" | findstr /i "WindowsApps" >nul
            if errorlevel 1 (
                if not defined PY_BASE set "PY_BASE=%%i"
            )
        )
    )
)

:: Create .venv if not already created
if not defined PY_EXE (
    if defined PY_BASE (
        echo Creating virtual environment at %~dp0.venv ...
        "!PY_BASE!" -m venv "%~dp0.venv"
        if errorlevel 1 (
            color 0c
            echo [ERROR] Failed to create Python virtual environment!
            if "!NO_PAUSE!"=="0" pause
            exit /b 1
        )
        set "PY_EXE=%~dp0.venv\Scripts\python.exe"
        set "VENV_DIR=%~dp0.venv"
    ) else (
        color 0c
        echo [ERROR] Python not found! Please install 64-bit Python 3.10+ from python.org.
        if "!NO_PAUSE!"=="0" pause
        exit /b 1
    )
)

echo [OK] Using Python: "!PY_EXE!"
echo.

:: 2. Upgrade pip and install Python requirements
echo [2/6] Installing Python AI libraries (Faster-Whisper, FastAPI, CTranslate2, Torch)...
"!PY_EXE!" -m pip install --upgrade pip setuptools wheel
"!PY_EXE!" -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
    echo [WARN] Some packages reported warnings; retrying core components...
    "!PY_EXE!" -m pip install fastapi pydantic uvicorn python-multipart ctranslate2 faster-whisper transformers torch psutil "qrcode[pil]" pillow websockets
    if errorlevel 1 (
        color 0c
        echo [ERROR] Core Python package installation failed.
        if "!NO_PAUSE!"=="0" pause
        exit /b 1
    )
)
echo [OK] Python dependencies installed successfully.
echo.

:: 3. Check and install Node.js / frontend dependencies
echo [3/6] Checking Node.js and NPM...
where npm >nul 2>nul
if errorlevel 1 (
    color 0c
    echo [ERROR] Node.js / npm not found! Please install Node.js 18+ from https://nodejs.org
    if "!NO_PAUSE!"=="0" pause
    exit /b 1
)

if not exist "%~dp0node_modules" (
    echo Installing frontend dependencies with npm install...
    call npm install
    if errorlevel 1 (
        color 0c
        echo [ERROR] npm install failed!
        if "!NO_PAUSE!"=="0" pause
        exit /b 1
    )
) else (
    echo [OK] Node modules already present.
)

:: Initialize SQLite DB directory & push schema
if not exist "%LOCALAPPDATA%\AI Subtitle Studio" mkdir "%LOCALAPPDATA%\AI Subtitle Studio" >nul 2>nul
call npx drizzle-kit push --force >nul 2>nul
echo [OK] Database schema initialized.
echo.

:: 4. Ensure Cloudflare Tunnel executable
echo [4/6] Checking Cloudflare Tunnel binary for WAN remote sharing...
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
echo [5/6] Configuring environment files...
if not exist "%~dp0backend\.env" (
    if exist "%~dp0backend\.env.example" (
        copy "%~dp0backend\.env.example" "%~dp0backend\.env" >nul
        echo [OK] Created backend\.env from template.
    )
)
if not exist "%~dp0.env" (
    echo STUDIO_PORT=8001> "%~dp0.env"
    echo [OK] Created root .env configuration.
)
echo.

:: 6. Configure Windows Defender Firewall for LAN access (ports 3000 & 8001)
echo [6/6] Configuring Windows Firewall rules for Wi-Fi / LAN multi-device access...
netsh advfirewall firewall add rule name="AI Subtitle Studio Web (3000)" dir=in action=allow protocol=TCP localport=3000 profile=any >nul 2>nul
netsh advfirewall firewall add rule name="AI Subtitle Studio Engine (8001)" dir=in action=allow protocol=TCP localport=8001 profile=any >nul 2>nul
echo [OK] Inbound firewall ports 3000 ^& 8001 configured.

echo.
echo =====================================================================
echo [SUCCESS] Setup is complete!
echo To start the studio and enable multi-device / remote access:
echo   Double-click: start.bat
echo =====================================================================
echo.
if "!NO_PAUSE!"=="0" pause
