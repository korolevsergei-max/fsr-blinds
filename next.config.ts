import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
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
      exclude: ["error"],
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
