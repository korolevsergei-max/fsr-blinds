import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SupabaseCookiePurgeScript } from "@/components/supabase/supabase-cookie-purge-script";
import { SupabaseAuthRecovery } from "@/components/supabase/supabase-auth-recovery";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "FSR Blinds",
  description: "Commercial blinds measurement, installation, and management platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FSR Blinds",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f4f4f3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-[100dvh] bg-background text-foreground font-sans"
      >
        <SupabaseCookiePurgeScript />
        <SupabaseAuthRecovery />
        <ServiceWorkerRegistrar />
        <ConnectionStatus />
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
