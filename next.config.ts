import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" is for the self-hosted Docker image (see Dockerfile). Vercel's own
  // build pipeline expects its native output layout and breaks if this is set while
  // building there (it sets VERCEL=1 in every build), so skip it on that platform.
  output: process.env.VERCEL ? undefined : "standalone",
  // Native/driver packages must stay external to the server bundle.
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],
  experimental: {
    useOffline: true,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
