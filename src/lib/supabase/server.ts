import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function createClient() {
  const { url, key } = getSupabaseEnv();

  const cookieStore = await cookies();

  // createServerClient registers onAuthStateChange, which fires _emitInitialSession
  // on the next microtask — before getUser() acquires the lock. If the session is
  // stale, _emitInitialSession would call _callRefreshToken, fail, and log
  // console.error(). Guard against this by returning empty cookies on the first
  // getAll() call (consumed by _emitInitialSession) and the real cookies on every
  // subsequent call (consumed by getUser / getSession). The middleware is
  // responsible for token refresh; server components should only read the result.
  let initEmitConsumed = false;

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        if (!initEmitConsumed) {
          initEmitConsumed = true;
          return [];
        }
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* ignore when called from a Server Component */
        }
      },
    },
  });
}
