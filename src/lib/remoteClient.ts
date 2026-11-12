import { api } from "./client";

export interface RemoteDevice {
  id: string;
  ip: string;
  device_type: "mobile" | "tablet" | "desktop";
  os: string;
  connection: string;
  is_blocked: boolean;
  active_task: string;
  online: boolean;
  idle_seconds: number;
  connected_at: string;
}

export interface RemoteStatus {
  ok: boolean;
  lan_ip: string;
  lan_url: string;
  backend_url: string;
  ports: { frontend: number; backend: number };
  qr_lan: string | null;
  tunnel: {
    status: "stopped" | "starting" | "online" | "error";
    url: string | null;
    uptime_seconds: number;
    error: string | null;
    qr_wan: string | null;
  };
  devices: RemoteDevice[];
  pin_required: boolean;
}

export const fetchRemoteStatus = () => api<RemoteStatus>("/api/remote");

export const startTunnel = () =>
  api<{ ok: boolean; tunnel: RemoteStatus["tunnel"] }>("/api/remote", {
    method: "POST",
    body: JSON.stringify({ action: "tunnel_start" }),
  });

export const stopTunnel = () =>
  api<{ ok: boolean; tunnel: RemoteStatus["tunnel"] }>("/api/remote", {
    method: "POST",
    body: JSON.stringify({ action: "tunnel_stop" }),
  });

export const sendHeartbeat = (deviceId: string, activeTask: string = "Idle") =>
  api<{ ok: boolean; device: RemoteDevice; pin_required: boolean }>("/api/remote", {
    method: "POST",
    body: JSON.stringify({ action: "heartbeat", deviceId, activeTask }),
  });

export const blockDevice = (deviceId: string) =>
  api<{ ok: boolean; devices: RemoteDevice[] }>("/api/remote", {
    method: "POST",
    body: JSON.stringify({ action: "block_device", deviceId }),
  });

export const unblockDevice = (deviceId: string) =>
  api<{ ok: boolean; devices: RemoteDevice[] }>("/api/remote", {
    method: "POST",
    body: JSON.stringify({ action: "unblock_device", deviceId }),
  });

export const disconnectDevice = (deviceId: string) =>
  api<{ ok: boolean; devices: RemoteDevice[] }>("/api/remote", {
    method: "POST",
    body: JSON.stringify({ action: "disconnect_device", deviceId }),
  });

export const verifyPin = (pin: string) =>
  api<{ ok: boolean; token: string }>("/api/remote", {
    method: "POST",
    body: JSON.stringify({ action: "verify_pin", pin }),
  });

export const configurePin = (required: boolean, pin?: string) =>
  api<{ ok: boolean; pin_required: boolean }>("/api/remote", {
    method: "POST",
    body: JSON.stringify({ action: "configure_pin", required, pin }),
  });

/** Get or create persistent device ID stored in browser localStorage. */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server-side";
  let id = localStorage.getItem("studio_device_id");
  if (!id) {
    id = "dev_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem("studio_device_id", id);
  }
  return id;
}
