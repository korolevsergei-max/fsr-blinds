import Script from "next/script";

/**
 * Runs before React and vendor chunks: if middleware set fsr_auth_purge, delete all
 * `sb-*` cookies so createBrowserClient never calls refresh with a dead token (avoids AuthApiError in console).
 * Uses a static /public file so no <script> tag appears in the React component tree.
 */
export function SupabaseCookiePurgeScript() {
  // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
  return <Script src="/cookie-purge.js" strategy="beforeInteractive" />;
}
