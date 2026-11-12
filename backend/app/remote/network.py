import os
import socket
import io
import base64
from typing import List, Dict, Any, Optional

def get_lan_ip() -> str:
    """
    Detect the active local network IPv4 address that is routable to other devices
    on the same Wi-Fi / Local Area Network.
    """
    # Priority 1: Check environment override
    override = os.environ.get("STUDIO_HOST_IP")
    if override and override.strip():
        return override.strip()

    # Priority 2: Use UDP routing probe to determine outward-facing interface IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        # 8.8.8.8 does not need to be reachable; the OS selects interface routing
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127.") and not ip.startswith("169.254."):
            return ip
    except Exception:
        pass

    # Priority 3: Enumerate local host interfaces
    try:
        hostname = socket.gethostname()
        _, _, ips = socket.gethostbyname_ex(hostname)
        # Filter out loopback, link-local, and hyper-v default switches if possible
        for ip in ips:
            if ip.startswith("192.168.") or ip.startswith("10.") or (ip.startswith("172.") and not ip.startswith("172.17.") and not ip.startswith("172.22.")):
                return ip
        for ip in ips:
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                return ip
    except Exception:
        pass

    return "127.0.0.1"

def get_all_network_interfaces() -> List[Dict[str, str]]:
    """Return all IPv4 addresses found on the machine."""
    found = []
    try:
        hostname = socket.gethostname()
        _, _, ips = socket.gethostbyname_ex(hostname)
        for ip in ips:
            if not ip.startswith("127."):
                found.append({"ip": ip, "type": "lan" if ip.startswith(("192.168.", "10.", "172.")) else "other"})
    except Exception:
        pass
    return found

def generate_qr_code_base64(text: str) -> Optional[str]:
    """Generate a base64-encoded PNG data URI of a QR code for the given text."""
    try:
        import qrcode
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=8,
            border=2,
        )
        qr.add_data(text)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{encoded}"
    except Exception as e:
        print(f"[WARN] QR code generation error: {e}")
        return None

