@echo off
setlocal enabledelayedexpansion
title AI Subtitle Studio - Host Launcher and Multi-Device Server
color 0b
cd /d "%~dp0"

echo =====================================================================
echo              AI SUBTITLE STUDIO - MULTI-DEVICE LAUNCHER
echo        Windows PC Host GPU Engine and Remote Mobile Web Access
echo =====================================================================
echo.

:: Add bundled CUDA DLL root and standard FFmpeg locations to PATH
set "PATH=%~dp0;%PATH%"
if exist "C:\ffmpeg\ffmpeg.exe" set "PATH=C:\ffmpeg;%PATH%"
if exist "C:\ffmpeg\bin\ffmpeg.exe" set "PATH=C:\ffmpeg\bin;%PATH%"

:: 1. Identify correct Python interpreter
set "PY_EXE="
if exist "%~dp0.venv\Scripts\python.exe" (
    set "PY_EXE=%~dp0.venv\Scripts\python.exe"
) else if exist "%~dp0venv\Scripts\python.exe" (
    set "PY_EXE=%~dp0venv\Scripts\python.exe"
) else if exist "%USERPROFILE%\venv\Scripts\python.exe" (
    set "PY_EXE=%USERPROFILE%\venv\Scripts\python.exe"
) else if exist "C:\Python314\python.exe" (
    set "PY_EXE=C:\Python314\python.exe"
) else (
    for /f "delims=" %%i in ('where python 2^>nul') do (
        echo "%%i" | findstr /i "WindowsApps" >nul
        if errorlevel 1 (
            if not defined PY_EXE set "PY_EXE=%%i"
        )
    )
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
for /f "tokens=*" %%i in ('"!PY_EXE!" -c "import socket; s=socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); print(s.getsockname()[0]); s.close()" 2^>nul') do (
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

:: 3. Check Web Port and Existing Process
echo [2/3] Checking Web Server port status...
set "EXISTING_WEB=0"
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 set "EXISTING_WEB=1"

set "PORT_PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do (
    set "PORT_PID=%%p"
)

set "WEB_PORT=3000"
if "!EXISTING_WEB!"=="0" (
    if defined PORT_PID (
        echo [WARN] Port 3000 is currently occupied by PID: !PORT_PID!.
        echo Switching studio web interface to port 3001 to avoid conflicts...
        set "WEB_PORT=3001"
    )
)

:: 4. Check and Launch Faster-Whisper GPU Engine on 0.0.0.0:8001
echo [3/3] Checking Faster-Whisper GPU Engine status...
set "BACKEND_READY=0"
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8001/health' -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 set "BACKEND_READY=1"

if "!BACKEND_READY!"=="1" (
    echo [OK] Faster-Whisper GPU Engine is already running and ready on port 8001.
) else (
    echo Starting Faster-Whisper GPU Engine on 0.0.0.0:8001...
    set "STUDIO_HOST=0.0.0.0"
    set "STUDIO_PORT=8001"
    set "PORT=!WEB_PORT!"
    set "STUDIO_HOST_IP=!LAN_IP!"
    start "AI Subtitle Studio - Engine (0.0.0.0:8001)" /min "!PY_EXE!" -m backend.app.main

    echo Waiting for AI engine initialization...
    set "WAIT_TRIES=0"
    :wait_engine
    ping -n 2 127.0.0.1 >nul
    powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8001/health' -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
    if errorlevel 1 (
        set /a WAIT_TRIES+=1
        if !WAIT_TRIES! lss 20 goto wait_engine
        echo [WARN] Backend initialization took longer than usual. Continuing...
    ) else (
        echo [OK] Faster-Whisper GPU Engine initialized successfully!
    )
)
echo.

if "!EXISTING_WEB!"=="1" (
    echo =====================================================================
    echo [OK] AI Subtitle Studio is ALREADY RUNNING on port 3000!
    echo Reusing active session. Opening browser...
    echo =====================================================================
    start http://localhost:3000
    ping -n 3 127.0.0.1 >nul
    exit /b 0
)

echo Starting Studio Web Interface on port !WEB_PORT!...
echo.
echo =====================================================================
echo   CONNECTIVITY DETAILS:
echo   - This PC (Local):     http://localhost:!WEB_PORT!
echo   - Android / iPhone:    http://!LAN_IP!:!WEB_PORT!
echo   - GPU ASR Backend:     http://127.0.0.1:8001 (NVIDIA CUDA)
echo.
echo   TIP: Open "Share and Mobile" tab in the app to view and scan
echo        the QR code directly from your smartphone camera!
echo =====================================================================
echo.

:: Auto-open browser on PC (unless --no-browser is passed)
if /i not "%~1"=="--no-browser" (
    start "" cmd /c "ping -n 4 127.0.0.1 >nul && start http://localhost:!WEB_PORT!"
)

:: Start Next.js (production build if present, otherwise dev server)
set "STUDIO_HOST_IP=!LAN_IP!"
set "PORT=!WEB_PORT!"
if exist "%~dp0.next\BUILD_ID" (
    call npx next start -H 0.0.0.0 -p !WEB_PORT!
) else if "!WEB_PORT!"=="3000" (
    call npm run dev
) else (
    call npx next dev -H 0.0.0.0 -p !WEB_PORT!
)

if /i not "%~1"=="--no-browser" pause
