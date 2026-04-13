import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { AUTH_COOKIE_PURGE_FLAG } from "@/lib/supabase/auth-errors";
import { clearSupabaseBrowserAuthState } from "@/lib/supabase/browser-cookies";

let browserSingleton: SupabaseClient | null = null;

function documentHasCookie(name: string): boolean {
  if (typeof document === "undefined") return false;
  const encodedName = `${encodeURIComponent(name)}=`;
  return document.cookie.split(";").some((part) => part.trim().startsWith(encodedName));
}

function normalizePendingBrowserAuthPurge(): void {
  if (typeof window === "undefined") return;
  if (!documentHasCookie(AUTH_COOKIE_PURGE_FLAG)) return;

  clearSupabaseBrowserAuthState();
}

function getAllCookiesFromDocument(): Array<{ name: string; value: string }> {
  if (typeof document === "undefined") return [];
  const raw = document.cookie ?? "";
  if (!raw.trim()) return [];

  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((kv) => {
      const eq = kv.indexOf("=");
      if (eq === -1) return { name: kv, value: "" };
      return { name: decodeURIComponent(kv.slice(0, eq)), value: decodeURIComponent(kv.slice(eq + 1)) };
    });
}

function setCookieOnDocument(
  name: string,
  value: string,
  options?: {
    path?: string;
    domain?: string;
    maxAge?: number;
    expires?: string | Date;
    sameSite?: "lax" | "strict" | "none";
    secure?: boolean;
  }
) {
  if (typeof document === "undefined") return;

  const parts: string[] = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  const path = options?.path?.trim() || "/";

  parts.push(`Path=${path}`);
  if (options?.domain) parts.push(`Domain=${options.domain}`);
  if (typeof options?.maxAge === "number") parts.push(`Max-Age=${options.maxAge}`);
  if (options?.expires) {
    const d = typeof options.expires === "string" ? new Date(options.expires) : options.expires;
    parts.push(`Expires=${d.toUTCString()}`);
  }
  if (options?.sameSite) parts.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`);
  if (options?.secure) parts.push("Secure");

  document.cookie = parts.join("; ");
}

export function createClient() {
  if (browserSingleton) return browserSingleton;

  normalizePendingBrowserAuthPurge();

  const { url, key } = getSupabaseEnv();
  browserSingleton = createBrowserClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    cookies: {
      getAll() {
        return getAllCookiesFromDocument();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          const { sameSite, ...rest } = options ?? {};
          const safeOptions = {
            ...rest,
            ...(sameSite && typeof sameSite === "string" ? { sameSite } : {}),
          };
          setCookieOnDocument(name, value, safeOptions);
        });
      },
    },
  });
  return browserSingleton;
}
