import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
/* What a page may load. Everything comes from Connect itself; photos may come from any https address (Google and
   LinkedIn profile pictures). No plugins, no frames, and no scripts or connections to other sites, so a slipped-in
   script could not pull code from elsewhere or send data out. Development needs two extras for live reload. */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "font-src 'self' data:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const security = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera and microphone for calls, voice notes and the chat camera; only Connect's own pages may ask.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), display-capture=(self)" },
  { key: "Content-Security-Policy", value: csp },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Builds a self-contained server in .next/standalone for the Dockerfile.
  output: "standalone",
  poweredByHeader: false,
  // Dev only: lets http://127.0.0.1:3000 load scripts as well as localhost.
  allowedDevOrigins: ["127.0.0.1", "*.localhost"],
  // Forms can carry one proof file (a certificate or letter, up to 5 MB).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    // Chat attachments set their own, stricter headers in app/api/files/[key]/route.ts.
    return [
      { source: "/((?!api/files/).*)", headers: security },
      // The service worker must always be fetched fresh so fixes reach everyone.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;
