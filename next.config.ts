import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow your mobile device IP on the local network
  allowedDevOrigins: ["10.22.224.153:3000", "10.22.224.153"],
};

export default nextConfig;