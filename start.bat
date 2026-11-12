@echo off
setlocal enabledelayedexpansion
title AI Subtitle Studio - Host Launcher & Multi-Device Server
color 0b
cd /d "%~dp0"

echo =====================================================================
echo              AI SUBTITLE STUDIO - MULTI-DEVICE LAUNCHER
echo        Windows PC Host GPU Engine & Remote Mobile Web Access
echo =====================================================================
echo.

:: 1. Identify correct Python interpreter
set "PY_EXE="
if exist "%USERPROFILE%\venv\Scripts\python.exe" (
    set "PY_EXE=%USERPROFILE%\venv\Scripts\python.exe"
) else if exist "%~dp0venv\Scripts\python.exe" (
    set "PY_EXE=%~dp0venv\Scripts\python.exe"
) else if exist "C:\Python314\python.exe" (
    set "PY_EXE=C:\Python314\python.exe"
) else (
    where python >nul 2>nul
    if not errorlevel 1 set "PY_EXE=python"
)

if not defined PY_EXE (
    color 0c
    echo [ERROR] Python environment not found! Please run setup.bat first.
    pause
    exit /b 1
)

:: 2. Detect Local Network IPv4 Address
echo [1/3] Detecting local network IPv4 address...
set "LAN_IP="
for /f "tokens=*" %%i in ('"%PY_EXE%" -c "import socket; s=socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); print(s.getsockname()[0]); s.close()" 2^>nul') do (
    set "LAN_IP=%%i"
)
if not defined LAN_IP (
    for /f "tokens=*" %%i in ('powershell -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi*','Ethernet*' | Where-Object {$_.IPAddress -notlike '169.254*'} | Select-Object -First 1).IPAddress" 2^>nul') do (
        set "LAN_IP=%%i"
    )
)
if not defined LAN_IP set "LAN_IP=127.0.0.1"

echo [OK] Local Host IP detected: !LAN_IP!
echo.

:: 3. Launch Python GPU Whisper Engine (bound to 0.0.0.0:8001)
echo [2/3] Starting Faster-Whisper GPU Engine on 0.0.0.0:8001...
set "STUDIO_HOST=0.0.0.0"
set "STUDIO_PORT=8001"
set "STUDIO_HOST_IP=!LAN_IP!"
start "AI Subtitle Studio - Engine (0.0.0.0:8001)" /min cmd /c "cd /d "%~dp0" && set STUDIO_HOST=0.0.0.0 && set STUDIO_PORT=8001 && "!PY_EXE!" -m backend.app.main"

echo Waiting for AI engine initialization...
timeout /t 2 /nobreak >nul
echo.

:: 4. Start Next.js Studio on 0.0.0.0:3000
echo [3/3] Starting Next.js Studio Web Interface...
echo.
echo =====================================================================
echo   CONNECTIVITY DETAILS:
echo   - This PC (Local):     http://localhost:3000
echo   - Android / iPhone:    http://!LAN_IP!:3000
echo   - GPU ASR Backend:     http://127.0.0.1:8001 (NVIDIA CUDA)
echo.
echo   TIP: Open "Share & Mobile" tab in the app to view and scan
echo        the QR code directly from your smartphone camera!
echo =====================================================================
echo.

:: Auto-open browser on PC
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Start Next.js on 0.0.0.0 so phone and other LAN devices can connect
call npm run dev

pause

