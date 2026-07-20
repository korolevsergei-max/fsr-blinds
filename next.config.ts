import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

// Derived from env so the CSP allowlist can't drift from images.remotePatterns below.
const supabaseOrigin = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://fbjjqfmsroryfgfushmb.supabase.co"
).origin;
const supabaseWsOrigin = supabaseOrigin.replace(/^http/, "ws");
const dicebearOrigin = "https://api.dicebear.com";

// Report-only for now (Phase 5): logs violations without blocking anything, so a
// gap in this allowlist can't break the app. Flip to `Content-Security-Policy`
// once a production pass shows zero console violations across every portal.
const contentSecurityPolicy = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' blob: data: ${supabaseOrigin} ${dicebearOrigin}`,
  `font-src 'self' data:`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseWsOrigin}`,
  `media-src 'self' blob: ${supabaseOrigin}`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `frame-src 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  // Allow the dev server to be reached over the LAN (phones/tablets on the
  // same network). Without this, Next.js 16 blocks cross-origin requests to
  // dev resources — including Server Actions like sign-in — which silently
  // breaks login when the app is opened via the machine's LAN IP instead of
  // localhost. The wildcards cover DHCP reassigning the host a new address.
  allowedDevOrigins: ["192.168.68.59", "192.168.68.*", "192.168.71.*"],
  // Auto-memoize components/hooks at build time (compilationMode: 'infer',
  // panicThreshold: 'none' — violations bail out per-component, never fail the build).
  reactCompiler: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
    viewTransition: true,
    optimizePackageImports: ["@phosphor-icons/react", "framer-motion"],
  },
  compiler: {
    removeConsole: {
      exclude: ["error", "warn"],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fbjjqfmsroryfgfushmb.supabase.co",
      },
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
    ],
  },
};

export default withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" })(
  nextConfig
);
