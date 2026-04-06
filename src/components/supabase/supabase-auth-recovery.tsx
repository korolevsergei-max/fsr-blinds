"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { isInvalidRefreshTokenError } from "@/lib/supabase/auth-errors";
import { clearSupabaseBrowserCookies } from "@/lib/supabase/browser-cookies";

declare global {
  interface Window {
    __fsrAuthRecoveryStarted?: boolean;
  }
}

/**
 * Handles dead refresh tokens that still exist in the browser: middleware may not have run yet
 * (client navigation / Turbopack), so getUser() can return an error here. Clear cookies and send
 * the user to login instead of leaving Supabase retrying refresh (console AuthApiError loop).
 */
export function SupabaseAuthRecovery() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__fsrAuthRecoveryStarted) return;
    window.__fsrAuthRecoveryStarted = true;

    const supabase = createClient();
    const hasAuthCookies = document.cookie.split(";").some((c) => c.trim().startsWith("sb-"));

    void (async () => {
      if (!hasAuthCookies) return;

      const { error } = await supabase.auth.getUser();
      if (!error || !isInvalidRefreshTokenError(error)) return;

      // We have an error that indicates a dead refresh token. Clear everything.
      clearSupabaseBrowserCookies();
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        /* ignore */
      }

      const path = window.location.pathname;
      if (path !== "/login" && !path.startsWith("/auth/")) {
        window.location.replace(`/login?reason=session_expired`);
      }
    })();
  }, []);

  return null;
}
