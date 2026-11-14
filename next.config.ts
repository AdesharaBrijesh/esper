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
    serverActions: {
      // Statement / screenshot uploads go through a server action. Vercel caps request
      // bodies at 4.5MB, so that is the ceiling; the client compresses photos to fit.
      bodySizeLimit: "4.5mb",
    },
  },
  // Loans became the People ledger; keep old links and bookmarks working.
  async redirects() {
    return [
      { source: "/loans", destination: "/people", permanent: true },
      { source: "/loans/:personId", destination: "/people/:personId", permanent: true },
    ];
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
