import type { MetadataRoute } from "next";

/** Self-hosted and private: never index, whatever hostname it ends up behind. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
