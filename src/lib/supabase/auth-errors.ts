/** Short-lived flag cookie: inline layout script wipes every `sb-*` cookie before JS bundles run. */
export const AUTH_COOKIE_PURGE_FLAG = "fsr_auth_purge";

/** True when the session cannot be refreshed (clear cookies and treat as signed out). */
export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const o = error as { message?: string; code?: string; status?: number };

  if (typeof o.message === "string") {
    const message = o.message.toLowerCase();
    if (
      message.includes("invalid refresh token") ||
      message.includes("refresh token not found") ||
      message.includes("refresh_token_not_found") ||
      message.includes("already used") ||
      message.includes("expired") ||
      message.includes("revoked")
    ) {
      return true;
    }
  }

  if (typeof o.code === "string") {
    const code = o.code.toLowerCase();
    if (
      code === "refresh_token_not_found" ||
      code === "invalid_refresh_token" ||
      code === "already_used" ||
      code === "session_not_found" ||
      code === "expired_token"
    ) {
      return true;
    }
  }

  if (o.status === 401 || o.status === 400) {
    // Some versions of Supabase return raw status codes for auth failures
    return true;
  }

  return false;
}

/** Supabase SSR uses the `sb-` prefix for session chunks, PKCE verifier cookies, etc. */
export function isSupabaseBrowserCookieName(name: string): boolean {
  return name.startsWith("sb-");
}
