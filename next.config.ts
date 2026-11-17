import type { NextConfig } from "next";
import os from "os";

// Automatically detect all local network IPv4 addresses on the host machine
const detectedIps: string[] = [];
try {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === "IPv4" || (iface.family as unknown as number) === 4) {
        detectedIps.push(iface.address);
      }
    }
  }
} catch {
  // fallback if network discovery encounters OS permissions
}

const allowedDevOrigins: string[] = [
  "localhost",
  "localhost:3000",
  "127.0.0.1",
  "127.0.0.1:3000",
  "0.0.0.0",
  "0.0.0.0:3000",
  "*.trycloudflare.com",
  "trycloudflare.com",
  "*.loca.lt",
  "loca.lt",
  "*.ngrok-free.app",
  "*.ngrok.io",
];

// Add all local network interface IPs (both with and without port :3000)
for (const ip of detectedIps) {
  if (!allowedDevOrigins.includes(ip)) allowedDevOrigins.push(ip);
  const withPort = `${ip}:3000`;
  if (!allowedDevOrigins.includes(withPort)) allowedDevOrigins.push(withPort);
}

// Add any custom host IP or origin specified in environment variables
if (process.env.STUDIO_HOST_IP) {
  const envIp = process.env.STUDIO_HOST_IP.trim();
  if (envIp && !allowedDevOrigins.includes(envIp)) {
    allowedDevOrigins.push(envIp);
    allowedDevOrigins.push(`${envIp}:3000`);
  }
}

if (process.env.STUDIO_ALLOWED_ORIGINS) {
  for (const orig of process.env.STUDIO_ALLOWED_ORIGINS.split(",")) {
    const trimmed = orig.trim();
    if (trimmed && !allowedDevOrigins.includes(trimmed)) {
      allowedDevOrigins.push(trimmed);
    }
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

export default nextConfig;
