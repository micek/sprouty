import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  serverExternalPackages: ["pdf-parse", "mammoth"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.openrouter.ai" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "oaidalleapiprodscus.blob.core.windows.net" },
    ],
  },
};

export default nextConfig;
