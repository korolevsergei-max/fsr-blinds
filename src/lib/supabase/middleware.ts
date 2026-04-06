import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  AUTH_COOKIE_PURGE_FLAG,
  isInvalidRefreshTokenError,
  isSupabaseBrowserCookieName,
} from "@/lib/supabase/auth-errors";
import { homePathForRole } from "@/lib/role-routes";

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

  let url: string;
  let key: string;
  try {
    const env = getSupabaseEnv();
    url = env.url;
    key = env.key;
  } catch {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
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

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    user = data.user;
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
    user = null;
  }

  const pathname = request.nextUrl.pathname;

  if (pathname === "/login" || pathname.startsWith("/auth/")) {
    return finish(supabaseResponse, authInvalidated);
  }

  if (pathname === "/") {
    if (user) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role === "owner")
        return finish(
          applyAuthCookieDeletions(
            NextResponse.redirect(new URL("/management", request.url)),
            deletedAuthCookieNames ?? []
          ),
          authInvalidated
        );
      if (profile?.role === "manufacturer")
        return finish(
          applyAuthCookieDeletions(
            NextResponse.redirect(new URL("/manufacturer", request.url)),
            deletedAuthCookieNames ?? []
          ),
          authInvalidated
        );
      if (profile?.role === "qc")
        return finish(
          applyAuthCookieDeletions(
            NextResponse.redirect(new URL("/qc", request.url)),
            deletedAuthCookieNames ?? []
          ),
          authInvalidated
        );
      if (profile?.role === "installer")
        return finish(
          applyAuthCookieDeletions(
            NextResponse.redirect(new URL("/installer", request.url)),
            deletedAuthCookieNames ?? []
          ),
          authInvalidated
        );
      if (profile?.role === "scheduler")
        return finish(
          applyAuthCookieDeletions(
            NextResponse.redirect(new URL("/scheduler", request.url)),
            deletedAuthCookieNames ?? []
          ),
          authInvalidated
        );
    }
    return finish(
      applyAuthCookieDeletions(
        NextResponse.redirect(new URL("/login", request.url)),
        deletedAuthCookieNames ?? []
      ),
      authInvalidated
    );
  }

  if (
    !user &&
    (pathname.startsWith("/management") ||
      pathname.startsWith("/installer") ||
      pathname.startsWith("/scheduler") ||
      pathname.startsWith("/manufacturer") ||
      pathname.startsWith("/qc"))
  ) {
    return finish(
      applyAuthCookieDeletions(
        NextResponse.redirect(new URL("/login", request.url)),
        deletedAuthCookieNames ?? []
      ),
      authInvalidated
    );
  }

  if (user && pathname.startsWith("/management")) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role;

    /**
     * Route installers/schedulers to their portals. Allow owner, manufacturer, or **missing**
     * profile through — `getCurrentUser` in layouts can repair / infer profile. Previously,
     * `profile == null` made `profile?.role` undefined, which matched "not owner" and sent
     * users to `/login` (e.g. flaky RLS/read or row not visible yet on cold navigation).
     */
    if (role === "installer") {
      return finish(
        applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/installer", request.url)),
          deletedAuthCookieNames ?? []
        ),
        authInvalidated
      );
    }
    if (role === "scheduler") {
      return finish(
        applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/scheduler", request.url)),
          deletedAuthCookieNames ?? []
        ),
        authInvalidated
      );
    }
    if (role === "manufacturer") {
      return finish(
        applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/manufacturer", request.url)),
          deletedAuthCookieNames ?? []
        ),
        authInvalidated
      );
    }
    if (role === "qc") {
      return finish(
        applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/qc", request.url)),
          deletedAuthCookieNames ?? []
        ),
        authInvalidated
      );
    }
    if (role && role !== "owner") {
      return finish(
        applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/login", request.url)),
          deletedAuthCookieNames ?? []
        ),
        authInvalidated
      );
    }
  }

  if (user && pathname.startsWith("/installer")) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "installer") {
      if (profile?.role === "owner") {
        return finish(
          applyAuthCookieDeletions(
            NextResponse.redirect(new URL("/management", request.url)),
            deletedAuthCookieNames ?? []
          ),
          authInvalidated
        );
      }
      if (profile?.role === "manufacturer") {
        return finish(
          applyAuthCookieDeletions(
            NextResponse.redirect(new URL("/manufacturer", request.url)),
            deletedAuthCookieNames ?? []
          ),
          authInvalidated
        );
      }
      if (profile?.role === "scheduler") {
        return finish(
          applyAuthCookieDeletions(
            NextResponse.redirect(new URL("/scheduler", request.url)),
            deletedAuthCookieNames ?? []
          ),
          authInvalidated
        );
      }
      if (profile?.role === "qc") {
        return finish(
          applyAuthCookieDeletions(
            NextResponse.redirect(new URL("/qc", request.url)),
            deletedAuthCookieNames ?? []
          ),
          authInvalidated
        );
      }
      return finish(
        applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/login", request.url)),
          deletedAuthCookieNames ?? []
        ),
        authInvalidated
      );
    }
  }

  if (user && pathname.startsWith("/scheduler")) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "scheduler") {
      if (profile?.role === "owner") {
        return finish(
          applyAuthCookieDeletions(
            NextResponse.redirect(new URL("/management", request.url)),
            deletedAuthCookieNames ?? []
          ),
          authInvalidated
        );
      }
      if (profile?.role === "manufacturer") {
        return finish(
          applyAuthCookieDeletions(
            NextResponse.redirect(new URL("/manufacturer", request.url)),
            deletedAuthCookieNames ?? []
          ),
          authInvalidated
        );
      }
      if (profile?.role === "installer") {
        return finish(
          applyAuthCookieDeletions(
            NextResponse.redirect(new URL("/installer", request.url)),
            deletedAuthCookieNames ?? []
          ),
          authInvalidated
        );
      }
      if (profile?.role === "qc") {
        return finish(
          applyAuthCookieDeletions(
            NextResponse.redirect(new URL("/qc", request.url)),
            deletedAuthCookieNames ?? []
          ),
          authInvalidated
        );
      }
      return finish(
        applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/login", request.url)),
          deletedAuthCookieNames ?? []
        ),
        authInvalidated
      );
    }
  }

  if (user && pathname.startsWith("/manufacturer")) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "manufacturer") {
      return finish(
        applyAuthCookieDeletions(
          NextResponse.redirect(
            new URL(homePathForRole(profile?.role), request.url)
          ),
          deletedAuthCookieNames ?? []
        ),
        authInvalidated
      );
    }
  }

  if (user && pathname.startsWith("/qc")) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "qc") {
      return finish(
        applyAuthCookieDeletions(
          NextResponse.redirect(
            new URL(homePathForRole(profile?.role), request.url)
          ),
          deletedAuthCookieNames ?? []
        ),
        authInvalidated
      );
    }
  }

  return finish(supabaseResponse, authInvalidated);
}
