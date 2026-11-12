import os
import sys
import re
import time
import shutil
import threading
import subprocess
import urllib.request
from typing import Optional, Dict, Any

CLOUDFLARED_DOWNLOAD_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

class TunnelManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(TunnelManager, cls).__new__(cls)
                cls._instance._init()
            return cls._instance

    def _init(self):
        self.process: Optional[subprocess.Popen] = None
        self.tunnel_url: Optional[str] = None
        self.status: str = "stopped"  # "stopped", "starting", "online", "error"
        self.error_message: Optional[str] = None
        self.started_at: Optional[float] = None
        self.target_port: int = 3000
        self._monitor_thread: Optional[threading.Thread] = None

    def _get_cloudflared_path(self) -> str:
        # Check current working directory or ROOT_DIR
        local_bin = os.path.abspath(os.path.join(os.getcwd(), "cloudflared.exe"))
        if os.path.exists(local_bin):
            return local_bin
        
        # Check PATH
        path_bin = shutil.which("cloudflared")
        if path_bin and os.path.exists(path_bin):
            return path_bin

        return local_bin

    def ensure_binary(self) -> bool:
        path = self._get_cloudflared_path()
        if os.path.exists(path) and os.path.getsize(path) > 1000000:
            return True
        try:
            print(f"[Remote] Downloading cloudflared binary to {path}...")
            urllib.request.urlretrieve(CLOUDFLARED_DOWNLOAD_URL, path)
            print("[Remote] cloudflared downloaded successfully.")
            return True
        except Exception as e:
            self.error_message = f"Failed to download cloudflared: {e}"
            print(f"[ERROR] {self.error_message}")
            return False

    def start_tunnel(self, target_port: int = 3000) -> Dict[str, Any]:
        with self._lock:
            if self.status in ("starting", "online") and self.process and self.process.poll() is None:
                return self.get_status()

            self.target_port = target_port
            self.status = "starting"
            self.tunnel_url = None
            self.error_message = None
            self.started_at = time.time()

            bin_path = self._get_cloudflared_path()
            if not os.path.exists(bin_path):
                if not self.ensure_binary():
                    self.status = "error"
                    return self.get_status()

            try:
                cmd = [
                    bin_path,
                    "tunnel",
                    "--url",
                    f"http://127.0.0.1:{target_port}",
                    "--no-autoupdate"
                ]

                # Use creationflags to hide console window on Windows if needed
                creation_flags = 0
                if sys.platform == "win32":
                    creation_flags = subprocess.CREATE_NO_WINDOW

                self.process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    creationflags=creation_flags
                )

                self._monitor_thread = threading.Thread(target=self._read_tunnel_output, daemon=True)
                self._monitor_thread.start()

                # Wait up to 10 seconds for the URL to appear
                start_wait = time.time()
                while time.time() - start_wait < 10:
                    if self.tunnel_url:
                        break
                    if self.status == "error":
                        break
                    time.sleep(0.3)

                return self.get_status()
            except Exception as e:
                self.status = "error"
                self.error_message = str(e)
                print(f"[Remote] Failed to start tunnel: {e}")
                return self.get_status()

    def _read_tunnel_output(self):
        url_regex = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
        if not self.process or not self.process.stdout:
            return

        try:
            for line in iter(self.process.stdout.readline, ""):
                if not line:
                    break
                line_str = line.strip()
                # Check for trycloudflare url
                match = url_regex.search(line_str)
                if match:
                    found_url = match.group(0)
                    with self._lock:
                        self.tunnel_url = found_url
                        self.status = "online"
                        self.error_message = None
                    print(f"[Remote Tunnel ONLINE] Public HTTPS URL: {found_url}")
                elif "failed to request quick Tunnel" in line_str or "ERR" in line_str:
                    with self._lock:
                        self.error_message = line_str

            # Process exited
            if self.process:
                code = self.process.poll()
                if self.status != "stopped":
                    with self._lock:
                        if not self.tunnel_url:
                            self.status = "error"
                            if not self.error_message:
                                self.error_message = f"Tunnel exited (exit code: {code}). Check internet connection."
        except Exception as e:
            with self._lock:
                self.status = "error"
                self.error_message = str(e)

    def stop_tunnel(self) -> Dict[str, Any]:
        with self._lock:
            if self.process:
                try:
                    self.process.terminate()
                    self.process.wait(timeout=3)
                except Exception:
                    try:
                        self.process.kill()
                    except Exception:
                        pass
                self.process = None
            self.status = "stopped"
            self.tunnel_url = None
            self.error_message = None
            self.started_at = None
            print("[Remote Tunnel] Tunnel stopped by user.")
            return self.get_status()

    def get_status(self) -> Dict[str, Any]:
        is_active = self.process is not None and self.process.poll() is None and bool(self.tunnel_url)
        return {
            "status": "online" if is_active else self.status,
            "url": self.tunnel_url if is_active else None,
            "target_port": self.target_port,
            "uptime_seconds": round(time.time() - self.started_at, 1) if (self.started_at and is_active) else 0,
            "error": self.error_message
        }

tunnel_manager = TunnelManager()
