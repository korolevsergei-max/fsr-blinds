import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  isInvalidRefreshTokenError,
  isSupabaseAuthCookieName,
} from "@/lib/supabase/auth-errors";

function supabaseAuthCookieNames(request: NextRequest): string[] {
  return request.cookies.getAll().map((c) => c.name).filter(isSupabaseAuthCookieName);
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
    if (error && isInvalidRefreshTokenError(error)) {
      const names = supabaseAuthCookieNames(request);
      deletedAuthCookieNames = names;
      for (const name of names) {
        request.cookies.delete(name);
      }
      supabaseResponse = NextResponse.next({
        request: { headers: request.headers },
      });
      for (const name of names) {
        supabaseResponse.cookies.set(name, "", { path: "/", maxAge: 0 });
      }
      user = null;
    } else {
      user = data.user;
    }
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      const names = supabaseAuthCookieNames(request);
      deletedAuthCookieNames = names;
      for (const name of names) {
        request.cookies.delete(name);
      }
      supabaseResponse = NextResponse.next({
        request: { headers: request.headers },
      });
      for (const name of names) {
        supabaseResponse.cookies.set(name, "", { path: "/", maxAge: 0 });
      }
    }
    user = null;
  }

  const pathname = request.nextUrl.pathname;

  if (pathname === "/login" || pathname.startsWith("/auth/")) {
    return supabaseResponse;
  }

  if (pathname === "/") {
    if (user) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "owner" || profile?.role === "manufacturer")
        return applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/management", request.url)),
          deletedAuthCookieNames ?? []
        );
      if (profile?.role === "installer")
        return applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/installer", request.url)),
          deletedAuthCookieNames ?? []
        );
      if (profile?.role === "scheduler")
        return applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/scheduler", request.url)),
          deletedAuthCookieNames ?? []
        );
    }
    return applyAuthCookieDeletions(
      NextResponse.redirect(new URL("/login", request.url)),
      deletedAuthCookieNames ?? []
    );
  }

  if (
    !user &&
    (pathname.startsWith("/management") ||
      pathname.startsWith("/installer") ||
      pathname.startsWith("/scheduler"))
  ) {
    return applyAuthCookieDeletions(
      NextResponse.redirect(new URL("/login", request.url)),
      deletedAuthCookieNames ?? []
    );
  }

  if (user && pathname.startsWith("/management")) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "owner" && profile?.role !== "manufacturer") {
      if (profile?.role === "installer") {
        return applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/installer", request.url)),
          deletedAuthCookieNames ?? []
        );
      }
      if (profile?.role === "scheduler") {
        return applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/scheduler", request.url)),
          deletedAuthCookieNames ?? []
        );
      }
      return applyAuthCookieDeletions(
        NextResponse.redirect(new URL("/login", request.url)),
        deletedAuthCookieNames ?? []
      );
    }
  }

  if (user && pathname.startsWith("/installer")) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "installer") {
      if (profile?.role === "owner" || profile?.role === "manufacturer") {
        return applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/management", request.url)),
          deletedAuthCookieNames ?? []
        );
      }
      if (profile?.role === "scheduler") {
        return applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/scheduler", request.url)),
          deletedAuthCookieNames ?? []
        );
      }
      return applyAuthCookieDeletions(
        NextResponse.redirect(new URL("/login", request.url)),
        deletedAuthCookieNames ?? []
      );
    }
  }

  if (user && pathname.startsWith("/scheduler")) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "scheduler") {
      if (profile?.role === "owner" || profile?.role === "manufacturer") {
        return applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/management", request.url)),
          deletedAuthCookieNames ?? []
        );
      }
      if (profile?.role === "installer") {
        return applyAuthCookieDeletions(
          NextResponse.redirect(new URL("/installer", request.url)),
          deletedAuthCookieNames ?? []
        );
      }
      return applyAuthCookieDeletions(
        NextResponse.redirect(new URL("/login", request.url)),
        deletedAuthCookieNames ?? []
      );
    }
  }

  return supabaseResponse;
}
