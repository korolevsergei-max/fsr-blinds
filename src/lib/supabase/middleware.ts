import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String(error.message).toLowerCase();
  return message.includes("invalid refresh token") || message.includes("refresh token not found");
}

function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-") && name.includes("-auth-token");
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
        // Only mutate the outgoing response cookies.
        // NextRequest cookies are not reliably mutable across runtimes.
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    // Stale/invalid refresh token cookies can throw AuthApiError in middleware.
    // Clear Supabase auth cookies and continue as signed out.
    if (isInvalidRefreshTokenError(error)) {
      request.cookies.getAll().forEach(({ name }) => {
        if (!isSupabaseAuthCookie(name)) return;
        supabaseResponse.cookies.set(name, "", {
          path: "/",
          maxAge: 0,
        });
      });
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
        return NextResponse.redirect(new URL("/management", request.url));
      if (profile?.role === "installer")
        return NextResponse.redirect(new URL("/installer", request.url));
      if (profile?.role === "scheduler")
        return NextResponse.redirect(new URL("/scheduler", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (
    !user &&
    (pathname.startsWith("/management") ||
      pathname.startsWith("/installer") ||
      pathname.startsWith("/scheduler"))
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && pathname.startsWith("/management")) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "owner" && profile?.role !== "manufacturer") {
      if (profile?.role === "installer") {
        return NextResponse.redirect(new URL("/installer", request.url));
      }
      if (profile?.role === "scheduler") {
        return NextResponse.redirect(new URL("/scheduler", request.url));
      }
      return NextResponse.redirect(new URL("/login", request.url));
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
        return NextResponse.redirect(new URL("/management", request.url));
      }
      if (profile?.role === "scheduler") {
        return NextResponse.redirect(new URL("/scheduler", request.url));
      }
      return NextResponse.redirect(new URL("/login", request.url));
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
        return NextResponse.redirect(new URL("/management", request.url));
      }
      if (profile?.role === "installer") {
        return NextResponse.redirect(new URL("/installer", request.url));
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return supabaseResponse;
}
