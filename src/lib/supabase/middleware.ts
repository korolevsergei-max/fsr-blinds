import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  AUTH_COOKIE_PURGE_FLAG,
  isInvalidRefreshTokenError,
  isSupabaseBrowserCookieName,
} from "@/lib/supabase/auth-errors";
import { homePathForRole } from "@/lib/role-routes";

/**
 * Trust model for per-navigation authorization:
 * - Role is read from `app_metadata.role`, which ONLY the service-role key can
 *   write (set at account creation / profile upsert, see auth-actions.ts). This
 *   lets middleware authorize from the token alone — no per-navigation DB query.
 * - `user_metadata` is user-writable (supabase.auth.updateUser) and MUST NEVER
 *   drive an authorization decision.
 * - When the claim is absent (a legacy user not yet backfilled), fall back to a
 *   single `user_profiles` read; getCurrentUser self-heals the claim afterwards.
 *
 * Auth is resolved via `getClaims()` rather than `getUser()`: getClaims verifies
 * the signed JWT locally (no Auth-server round-trip when the project uses
 * asymmetric signing keys) and only falls back to a network getUser() for legacy
 * symmetric (HS256) tokens — so per-navigation auth cost drops from a guaranteed
 * round-trip to (usually) a local verify. getClaims still refreshes the session
 * through getSession(), so the cookie-refresh responsibility is preserved.
 */
function roleFromAuthClaim(
  claims: { app_metadata?: Record<string, unknown> | null } | null
): string | null {
  const role = claims?.app_metadata?.role;
  return typeof role === "string" ? role : null;
}

/** Portal path prefix → the role required to access it. */
const PORTAL_REQUIRED_ROLE: Record<string, string> = {
  "/management": "owner",
  "/installer": "installer",
  "/scheduler": "scheduler",
  "/cutter": "cutter",
  "/assembler": "assembler",
  "/qc": "qc",
};

function supabaseAuthCookieNames(request: NextRequest): string[] {
  return request.cookies.getAll().map((c) => c.name).filter(isSupabaseBrowserCookieName);
}

function finish(response: NextResponse, authInvalidated: boolean): NextResponse {
  if (authInvalidated) {
    response.cookies.set(AUTH_COOKIE_PURGE_FLAG, "1", {
      path: "/",
      maxAge: 60,
      sameSite: "lax",
    });
  }
  return response;
}

/** Copy Set-Cookie deletions onto another response (e.g. redirects). */
function applyAuthCookieDeletions(response: NextResponse, names: string[]): NextResponse {
  for (const name of names) {
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return response;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  /** When non-null, browser must receive these cookie clears on the final response. */
  let deletedAuthCookieNames: string[] | null = null;
  let authInvalidated = false;
  const pathname = request.nextUrl.pathname;

  // Auth callback routes must never trigger a purge — they are in the middle of
  // establishing a session and cookies are not yet stable.
  if (pathname.startsWith("/auth/")) {
    return supabaseResponse;
  }

  let url: string;
  let key: string;
  try {
    const env = getSupabaseEnv();
    url = env.url;
    key = env.key;
  } catch {
    return supabaseResponse;
  }

  // Same guard as in server.ts: _emitInitialSession fires before getUser() acquires
  // the lock and would console.error() on a stale refresh token. Return empty on
  // the first getAll() (consumed by _emitInitialSession) so it exits cleanly, then
  // return real cookies for the actual getUser() call.
  let initEmitConsumed = false;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        if (!initEmitConsumed) {
          initEmitConsumed = true;
          return [];
        }
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Update the incoming request cookies so downstream Server Components
        // see the new tokens and don't try to refresh an already-used token.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        // Create a new response with the updated request headers so Next.js propagates it
        supabaseResponse = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        if (deletedAuthCookieNames && deletedAuthCookieNames.length > 0) {
          applyAuthCookieDeletions(supabaseResponse, deletedAuthCookieNames);
        }
        if (authInvalidated) {
          supabaseResponse.cookies.set(AUTH_COOKIE_PURGE_FLAG, "1", {
            path: "/",
            maxAge: 60,
            sameSite: "lax",
          });
        }

        // Set the outgoing response cookies so the browser saves the new tokens
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  type AuthClaims = NonNullable<Awaited<ReturnType<typeof supabase.auth.getClaims>>["data"]>["claims"];
  let claims: AuthClaims | null = null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) throw error;
    claims = data?.claims ?? null;
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      authInvalidated = true;
      const names = supabaseAuthCookieNames(request);
      deletedAuthCookieNames = names;

      // Wipe from incoming request so downstream Server Components don't see it
      for (const name of names) {
        request.cookies.delete(name);
      }

      // Re-initialize response with stripped headers
      supabaseResponse = NextResponse.next({
        request: {
          headers: request.headers,
        },
      });

      // Also wipe from outgoing response so browser deletes them
      for (const name of names) {
        supabaseResponse.cookies.set(name, "", { path: "/", maxAge: 0 });
      }
    }
    claims = null;
  }

  // Login page: token cleanup ran above (clears stale cookies so LoginPage's
  // getCurrentUser() won't see an invalid token), but no redirect logic needed.
  if (pathname === "/login") {
    return finish(supabaseResponse, authInvalidated);
  }

  const redirectTo = (path: string) =>
    finish(
      applyAuthCookieDeletions(
        NextResponse.redirect(new URL(path, request.url)),
        deletedAuthCookieNames ?? []
      ),
      authInvalidated
    );

  /**
   * Resolve the signed-in user's role from the trusted `app_metadata` claim,
   * falling back to a single `user_profiles` read only when the claim is missing
   * (legacy user not yet backfilled — getCurrentUser self-heals it afterwards).
   * Never reads the user-writable `user_metadata`.
   */
  const resolveRole = async (): Promise<string | null> => {
    const claim = roleFromAuthClaim(claims);
    if (claim) return claim;
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", claims!.sub)
      .maybeSingle();
    return profile?.role ?? null;
  };

  if (pathname === "/") {
    if (claims) {
      const home = homePathForRole(await resolveRole());
      if (home !== "/") return redirectTo(home);
    }
    return redirectTo("/login");
  }

  const portalPrefix = Object.keys(PORTAL_REQUIRED_ROLE).find((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!claims && portalPrefix) {
    return redirectTo("/login");
  }

  if (claims && portalPrefix) {
    const role = await resolveRole();
    /**
     * A known, mismatched role is routed to its own portal — e.g. an installer
     * hitting /management lands on /installer (homePathForRole). A null/unknown
     * role is allowed through so the layout's getCurrentUser can repair a missing
     * profile instead of redirect-looping (previously a flaky RLS read / not-yet-
     * visible row could bounce a valid user to /login).
     */
    if (role && role !== PORTAL_REQUIRED_ROLE[portalPrefix]) {
      return redirectTo(homePathForRole(role));
    }
  }

  return finish(supabaseResponse, authInvalidated);
}
