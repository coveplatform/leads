import type { NextConfig } from "next";
import path from "node:path";

// Embed routes may be framed by demo host pages (same origin) and, in local
// development, by any localhost origin. Every other route refuses framing.
const embedFrameAncestors =
  process.env.NODE_ENV === "production" && !process.env.DIG_ALLOW_LOCALHOST_EMBED
    ? "'self'"
    : "'self' http://localhost:* http://127.0.0.1:*";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // This app lives inside a larger repository; keep the build rooted here so the parent
  // project's files (and its lockfile) are never picked up.
  turbopack: { root: path.resolve(import.meta.dirname) },
  outputFileTracingRoot: path.resolve(import.meta.dirname),
  async headers() {
    return [
      {
        source: "/embed/:slug",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors ${embedFrameAncestors}` },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/embed/dig.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, must-revalidate" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      {
        source: "/((?!embed/).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
