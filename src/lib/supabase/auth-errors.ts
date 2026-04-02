/** True when the session cannot be refreshed (clear cookies and treat as signed out). */
export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String((error as { message: string }).message).toLowerCase();
  return (
    message.includes("invalid refresh token") || message.includes("refresh token not found")
  );
}

export function isSupabaseAuthCookieName(name: string): boolean {
  return name.startsWith("sb-") && name.includes("-auth-token");
}
