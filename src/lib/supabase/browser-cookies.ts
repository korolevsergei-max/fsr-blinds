import { AUTH_COOKIE_PURGE_FLAG } from "@/lib/supabase/auth-errors";

const EXPIRE = "Thu, 01 Jan 1970 00:00:00 GMT";

function clearSupabaseBrowserStorageArea(storage: Storage | null | undefined): void {
  if (!storage) return;

  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    if (!key.startsWith("sb-") && key !== AUTH_COOKIE_PURGE_FLAG) continue;
    keysToRemove.push(key);
  }

  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
}

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

/** Remove any browser-persisted Supabase auth state that can keep refresh loops alive. */
export function clearSupabaseBrowserStorage(): void {
  if (typeof window === "undefined") return;
  clearSupabaseBrowserStorageArea(window.localStorage);
  clearSupabaseBrowserStorageArea(window.sessionStorage);
}

export function clearSupabaseBrowserAuthState(): void {
  clearSupabaseBrowserCookies();
  clearSupabaseBrowserStorage();
}
