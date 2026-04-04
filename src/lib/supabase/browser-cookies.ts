import { AUTH_COOKIE_PURGE_FLAG } from "@/lib/supabase/auth-errors";

const EXPIRE = "Thu, 01 Jan 1970 00:00:00 GMT";

/** Remove Supabase session cookies in the browser (path=/, with and without Secure). */
export function clearSupabaseBrowserCookies(): void {
  if (typeof document === "undefined") return;
  const raw = document.cookie ?? "";
  if (!raw.trim()) return;

  const names = raw
    .split(";")
    .map((s) => s.trim().split("=")[0])
    .filter(Boolean);

  for (const name of names) {
    if (!name.startsWith("sb-") && name !== AUTH_COOKIE_PURGE_FLAG) continue;
    document.cookie = `${encodeURIComponent(name)}=;path=/;max-age=0;expires=${EXPIRE}`;
    document.cookie = `${encodeURIComponent(name)}=;path=/;max-age=0;expires=${EXPIRE};Secure;SameSite=Lax`;
  }
}
