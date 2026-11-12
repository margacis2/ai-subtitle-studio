"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  fetchRemoteStatus,
  startTunnel,
  stopTunnel,
  disconnectDevice,
  blockDevice,
  unblockDevice,
  configurePin,
  RemoteStatus,
  RemoteDevice,
} from "@/lib/remoteClient";

interface RemoteAccessViewProps {
  onClose?: () => void;
}

export function RemoteAccessView({ onClose }: RemoteAccessViewProps) {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [copiedLan, setCopiedLan] = useState(false);
  const [copiedWan, setCopiedWan] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinInput, setPinInput] = useState("1234");
  const [pinSaved, setPinSaved] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await fetchRemoteStatus();
      setStatus(data);
      setPinRequired(data.pin_required);
      setActionError(null);
    } catch (err: any) {
      console.warn("Failed to fetch remote status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 4000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const handleToggleTunnel = async () => {
    setTunnelLoading(true);
    setActionError(null);
    try {
      if (status?.tunnel?.status === "online") {
        await stopTunnel();
      } else {
        await startTunnel();
      }
      await refreshStatus();
    } catch (err: any) {
      setActionError(err.message || "Failed to toggle tunnel");
    } finally {
      setTunnelLoading(false);
    }
  };

  const handleCopy = (text: string, isWan: boolean) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (isWan) {
      setCopiedWan(true);
      setTimeout(() => setCopiedWan(false), 2000);
    } else {
      setCopiedLan(true);
      setTimeout(() => setCopiedLan(false), 2000);
    }
  };

  const handleSavePin = async () => {
    try {
      await configurePin(pinRequired, pinInput);
      setPinSaved(true);
      setTimeout(() => setPinSaved(false), 2000);
      await refreshStatus();
    } catch (err: any) {
      setActionError(err.message || "Failed to update PIN");
    }
  };

  const handleDisconnect = async (deviceId: string) => {
    try {
      await disconnectDevice(deviceId);
      await refreshStatus();
    } catch (err: any) {
      setActionError(err.message || "Failed to disconnect device");
    }
  };

  const handleToggleBlock = async (dev: RemoteDevice) => {
    try {
      if (dev.is_blocked) {
        await unblockDevice(dev.id);
      } else {
        await blockDevice(dev.id);
      }
      await refreshStatus();
    } catch (err: any) {
      setActionError(err.message || "Failed to update device status");
    }
  };

  const isTunnelOnline = status?.tunnel?.status === "online";
  const tunnelUrl = status?.tunnel?.url;

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-blue-900/30 via-slate-900/40 to-indigo-900/30 border border-blue-500/20 shadow-xl backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">
              Remote Access & Multi-Device Hub
            </h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Access this Windows PC&apos;s AI GPU engine from Android phones, tablets, laptops, or share long-distance with friends.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs font-mono text-slate-300 flex items-center gap-1.5">
            <span className="text-slate-400">LAN Host:</span>
            <span className="text-emerald-400 font-semibold">{status?.lan_ip || "Detecting..."}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300 flex items-center gap-1.5">
            <span className="text-slate-400">Devices:</span>
            <span className="text-blue-400 font-semibold">{status?.devices?.length || 0} active</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
            >
              ✕ Close
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-sm text-red-300 flex items-center gap-2">
          <span>⚠️</span>
          <span>{actionError}</span>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 1: Local Network (Wi-Fi) */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg">
                  📶
                </div>
                <div>
                  <h2 className="font-semibold text-slate-100 text-base">Local Network (Wi-Fi)</h2>
                  <p className="text-xs text-slate-400">Same router or home/office Wi-Fi</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Direct LAN • Ultra Low Latency
              </span>
            </div>

            {/* QR Code and URL */}
            <div className="mt-5 flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
              {status?.qr_lan ? (
                <div className="p-2 rounded-xl bg-white shadow-md flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={status.qr_lan}
                    alt="Scan Wi-Fi QR Code"
                    className="w-32 h-32 object-contain"
                  />
                </div>
              ) : (
                <div className="w-32 h-32 rounded-xl bg-slate-800 animate-pulse flex items-center justify-center text-xs text-slate-500">
                  Generating QR...
                </div>
              )}

              <div className="flex-1 w-full space-y-2 text-center sm:text-left">
                <div className="text-xs text-slate-400 font-medium">Local Browser Access URL:</div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-700/80 font-mono text-sm text-emerald-300 break-all select-all">
                  {status?.lan_url || "http://127.0.0.1:3000"}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => handleCopy(status?.lan_url || "", false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 flex items-center gap-1.5 transition active:scale-95"
                  >
                    {copiedLan ? "✓ Copied Link" : "📋 Copy Link"}
                  </button>
                  {status?.lan_url && (
                    <a
                      href={status.lan_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-xs font-medium text-blue-300 border border-blue-500/30 transition flex items-center gap-1"
                    >
                      ↗ Open Tab
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="mt-4 space-y-2 text-xs text-slate-400">
              <div className="font-medium text-slate-300">How to connect from Android or iPhone:</div>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>Make sure your phone is connected to the same Wi-Fi network as this PC.</li>
                <li>Open your phone&apos;s camera app and scan the QR code above.</li>
                <li>Tap the link to open AI Subtitle Studio in Chrome or Safari.</li>
              </ul>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>FastAPI Port: {status?.ports?.backend || 8001}</span>
            <span>Next.js Web Port: {status?.ports?.frontend || 3000}</span>
          </div>
        </div>

        {/* CARD 2: Internet Remote Access (Cloudflare Tunnel) */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-lg">
                  🌐
                </div>
                <div>
                  <h2 className="font-semibold text-slate-100 text-base">Internet Access (WAN)</h2>
                  <p className="text-xs text-slate-400">Cloudflare Quick Tunnel • Zero Port Forwarding</p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  isTunnelOnline
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : status?.tunnel?.status === "starting"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {isTunnelOnline
                  ? "● Tunnel Active"
                  : status?.tunnel?.status === "starting"
                  ? "◌ Connecting..."
                  : "○ Offline"}
              </span>
            </div>

            {/* Tunnel State Details */}
            {isTunnelOnline && tunnelUrl ? (
              <div className="mt-5 flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl bg-slate-950/50 border border-indigo-500/30">
                {status?.tunnel?.qr_wan ? (
                  <div className="p-2 rounded-xl bg-white shadow-md flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={status.tunnel.qr_wan}
                      alt="Scan Internet QR Code"
                      className="w-32 h-32 object-contain"
                    />
                  </div>
                ) : null}

                <div className="flex-1 w-full space-y-2 text-center sm:text-left">
                  <div className="text-xs text-indigo-300 font-medium">Public HTTPS Link (Share with Friends):</div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-indigo-500/40 font-mono text-sm text-indigo-200 break-all select-all">
                    {tunnelUrl}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={() => handleCopy(tunnelUrl, true)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white shadow-sm flex items-center gap-1.5 transition active:scale-95"
                    >
                      {copiedWan ? "✓ Copied Public Link" : "📋 Copy Public Link"}
                    </button>
                    <a
                      href={tunnelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition"
                    >
                      ↗ Test Link
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 p-5 rounded-xl bg-slate-950/40 border border-slate-800/80 text-center space-y-3">
                <div className="text-sm text-slate-300 font-medium">
                  {status?.tunnel?.status === "starting"
                    ? "Establishing secure Cloudflare tunnel..."
                    : "Public remote sharing is currently off."}
                </div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Start the tunnel to generate a temporary, free public HTTPS link. Anyone with the link or QR code can access your studio over the internet.
                </p>
                {status?.tunnel?.error && (
                  <p className="text-xs text-amber-400 font-mono">
                    Note: {status.tunnel.error}
                  </p>
                )}
              </div>
            )}

            {/* Toggle Button */}
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleToggleTunnel}
                disabled={tunnelLoading}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold tracking-wide transition flex items-center justify-center gap-2 shadow-md ${
                  isTunnelOnline
                    ? "bg-red-600/80 hover:bg-red-500 text-white border border-red-500"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/30"
                } ${tunnelLoading ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {tunnelLoading ? (
                  <span>Processing...</span>
                ) : isTunnelOnline ? (
                  <span>🛑 Stop Public Sharing</span>
                ) : (
                  <span>🚀 Start Public Internet Access (Cloudflare)</span>
                )}
              </button>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-800/80 text-xs text-slate-500 flex items-center justify-between">
            <span>Tunnel: cloudflared</span>
            <span>Uptime: {status?.tunnel?.uptime_seconds || 0}s</span>
          </div>
        </div>
      </div>

      {/* Security & Access Protection Panel */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
              <span>🔐</span> Security & PIN Protection
            </h3>
            <p className="text-xs text-slate-400">
              Require mobile and remote guests to enter a 4-digit PIN before they can upload or generate subtitles.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={pinRequired}
                onChange={(e) => setPinRequired(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 bg-slate-800 border-slate-700"
              />
              Require PIN
            </label>

            {pinRequired && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="PIN code"
                  className="w-24 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-center text-slate-200"
                />
                <button
                  onClick={handleSavePin}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700"
                >
                  {pinSaved ? "✓ Saved" : "Save"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Connected Devices Management Panel */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-100 text-base flex items-center gap-2">
              <span>📱</span> Connected Devices
            </h3>
            <p className="text-xs text-slate-400">
              Phones, tablets, and computers currently accessing your AI Subtitle Studio.
            </p>
          </div>
          <button
            onClick={refreshStatus}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition"
          >
            ↻ Refresh List
          </button>
        </div>

        {status?.devices && status.devices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-2.5 px-3">Device / OS</th>
                  <th className="py-2.5 px-3">Connection</th>
                  <th className="py-2.5 px-3">IP Address</th>
                  <th className="py-2.5 px-3">Current Task</th>
                  <th className="py-2.5 px-3">Last Active</th>
                  <th className="py-2.5 px-3 text-right">Host Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {status.devices.map((dev) => (
                  <tr key={dev.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">
                          {dev.device_type === "mobile"
                            ? "📱"
                            : dev.device_type === "tablet"
                            ? "📟"
                            : "💻"}
                        </span>
                        <div>
                          <div className="font-medium text-slate-200">
                            {dev.os} {dev.device_type}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {dev.id.substring(0, 12)}...
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                          dev.connection.includes("WAN")
                            ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                            : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                        }`}
                      >
                        {dev.connection}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-400">
                      {dev.ip}
                    </td>

                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                        {dev.active_task || "Idle"}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-slate-400">
                      {dev.online ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-medium">
                          ● Online
                        </span>
                      ) : (
                        <span>{dev.idle_seconds}s ago</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleBlock(dev)}
                          className={`px-2 py-1 rounded text-[11px] border transition ${
                            dev.is_blocked
                              ? "bg-amber-600/20 text-amber-300 border-amber-500/30 hover:bg-amber-600/30"
                              : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                          }`}
                        >
                          {dev.is_blocked ? "Unblock" : "Block"}
                        </button>
                        <button
                          onClick={() => handleDisconnect(dev.id)}
                          className="px-2 py-1 rounded text-[11px] bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30 transition"
                        >
                          Disconnect
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
            No external devices connected yet. Scan the Wi-Fi or Internet QR code above to connect your phone!
          </div>
        )}
      </div>
    </div>
  );
}

