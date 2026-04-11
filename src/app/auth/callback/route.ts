import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { homePathForRole } from "@/lib/role-routes";

function roleFromAuthMetadata(user: { user_metadata?: { role?: unknown } } | null): string | null {
  const role = user?.user_metadata?.role;
  return typeof role === "string" ? role : null;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const next = searchParams.get("next");

  const isPasswordSetupFlow = type === "invite" || type === "recovery";
  const requestedNextPath = next?.startsWith("/") ? next : null;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (isPasswordSetupFlow || requestedNextPath === "/auth/set-password") {
        return NextResponse.redirect(`${origin}/auth/set-password`);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        const path = homePathForRole(profile?.role ?? roleFromAuthMetadata(user));
        return NextResponse.redirect(`${origin}${path === "/" ? "/management" : path}`);
      }
      return NextResponse.redirect(`${origin}/management`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
