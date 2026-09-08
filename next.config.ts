import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
