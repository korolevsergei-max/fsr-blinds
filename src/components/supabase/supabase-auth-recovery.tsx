"use client";

import { useEffect } from "react";
import { AUTH_COOKIE_PURGE_FLAG } from "@/lib/supabase/auth-errors";
import { clearSupabaseBrowserAuthState } from "@/lib/supabase/browser-cookies";

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

    const shouldPurge = document.cookie
      .split(";")
      .some((cookie) => cookie.trim().startsWith(`${AUTH_COOKIE_PURGE_FLAG}=`));

    if (!shouldPurge) return;

    clearSupabaseBrowserAuthState();

    const path = window.location.pathname;
    if (path !== "/login" && !path.startsWith("/auth/")) {
      window.location.replace(`/login?reason=session_expired`);
    }
  }, []);

  return null;
}
