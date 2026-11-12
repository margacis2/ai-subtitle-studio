import os
import time
import secrets
from typing import Dict, List, Optional, Any

class DeviceManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DeviceManager, cls).__new__(cls)
            cls._instance._init()
        return cls._instance

    def _init(self):
        self._devices: Dict[str, Dict[str, Any]] = {}
        # PIN protection configuration
        self.pin_required: bool = os.environ.get("STUDIO_REQUIRE_PIN", "false").lower() in ("true", "1", "yes")
        self.access_pin: str = os.environ.get("STUDIO_ACCESS_PIN", "1234")
        self.valid_tokens: set = set()
        self.max_connected_devices: int = int(os.environ.get("STUDIO_MAX_DEVICES", "10"))

    def detect_device_type(self, user_agent: str) -> str:
        ua = (user_agent or "").lower()
        if "tablet" in ua or "ipad" in ua:
            return "tablet"
        if "mobi" in ua or "android" in ua or "iphone" in ua:
            return "mobile"
        return "desktop"

    def detect_device_os(self, user_agent: str) -> str:
        ua = (user_agent or "").lower()
        if "android" in ua:
            return "Android"
        if "iphone" in ua or "ipad" in ua:
            return "iOS"
        if "windows" in ua:
            return "Windows"
        if "macintosh" in ua or "mac os" in ua:
            return "macOS"
        if "linux" in ua:
            return "Linux"
        return "Unknown"

    def register_activity(
        self,
        device_id: str,
        client_ip: str,
        user_agent: str = "",
        host_header: str = "",
        active_task: Optional[str] = None
    ) -> Dict[str, Any]:
        """Record or update a device's heartbeat or activity."""
        now = time.time()
        
        # Detect if connection is via WAN (e.g. trycloudflare.com) or LAN
        is_wan = "trycloudflare.com" in host_header.lower() or not (
            client_ip.startswith("127.") or
            client_ip.startswith("192.168.") or
            client_ip.startswith("10.") or
            client_ip.startswith("172.")
        )
        conn_type = "WAN (Internet)" if is_wan else ("Local Host" if client_ip in ("127.0.0.1", "localhost") else "LAN (Wi-Fi)")

        if device_id not in self._devices:
            # Check maximum device limit
            active_count = len([d for d in self._devices.values() if not d.get("is_blocked") and now - d.get("last_seen", 0) < 600])
            if active_count >= self.max_connected_devices:
                return {"error": "Maximum connected device limit reached."}

            dev_type = self.detect_device_type(user_agent)
            dev_os = self.detect_device_os(user_agent)
            
            self._devices[device_id] = {
                "id": device_id,
                "ip": client_ip,
                "user_agent": user_agent,
                "device_type": dev_type,
                "os": dev_os,
                "connection": conn_type,
                "first_seen": now,
                "last_seen": now,
                "is_blocked": False,
                "active_task": active_task or "Idle"
            }
        else:
            dev = self._devices[device_id]
            dev["last_seen"] = now
            dev["ip"] = client_ip
            dev["connection"] = conn_type
            if active_task is not None:
                dev["active_task"] = active_task

        return self._devices[device_id]

    def is_blocked(self, device_id: str) -> bool:
        return self._devices.get(device_id, {}).get("is_blocked", False)

    def block_device(self, device_id: str) -> bool:
        if device_id in self._devices:
            self._devices[device_id]["is_blocked"] = True
            return True
        return False

    def unblock_device(self, device_id: str) -> bool:
        if device_id in self._devices:
            self._devices[device_id]["is_blocked"] = False
            return True
        return False

    def remove_device(self, device_id: str) -> bool:
        if device_id in self._devices:
            del self._devices[device_id]
            return True
        return False

    def list_devices(self) -> List[Dict[str, Any]]:
        now = time.time()
        # Clean up stale devices inactive for > 2 hours
        stale = [did for did, d in self._devices.items() if now - d.get("last_seen", 0) > 7200]
        for did in stale:
            del self._devices[did]

        res = []
        for d in self._devices.values():
            idle_sec = round(now - d["last_seen"], 0)
            res.append({
                "id": d["id"],
                "ip": d["ip"],
                "device_type": d["device_type"],
                "os": d["os"],
                "connection": d["connection"],
                "is_blocked": d["is_blocked"],
                "active_task": d["active_task"],
                "online": idle_sec < 45,
                "idle_seconds": idle_sec,
                "connected_at": time.strftime("%H:%M:%S", time.localtime(d["first_seen"]))
            })
        # Sort so active/most recent are first
        res.sort(key=lambda x: x["idle_seconds"])
        return res

    def set_pin_policy(self, required: bool, pin: Optional[str] = None):
        self.pin_required = required
        if pin and pin.strip():
            self.access_pin = pin.strip()

    def verify_pin(self, entered_pin: str) -> Optional[str]:
        if not self.pin_required or entered_pin == self.access_pin:
            token = secrets.token_urlsafe(24)
            self.valid_tokens.add(token)
            return token
        return None

    def validate_token(self, token: Optional[str]) -> bool:
        if not self.pin_required:
            return True
        if not token:
            return False
        return token in self.valid_tokens

device_manager = DeviceManager()

