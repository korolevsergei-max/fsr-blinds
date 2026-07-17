"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/auth";
import { homePathForRole } from "@/lib/role-routes";
import type { ActionResult, AuthFlowResult } from "./helpers";
import {
  assertOwnerForAccountActions,
  ensureNotDeletingSelf,
  findAuthUserIdByEmail,
  getAuthRedirectBaseUrl,
  isAlreadyRegisteredAuthError,
  ownerAccountExists,
  upsertUserProfile,
} from "./helpers";

export async function signOut(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sign out failed" };
  }
}

export async function signInWithPasswordAction(
  email: string,
  password: string
): Promise<AuthFlowResult> {
  try {
    const supabase = await createClient();
    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const authUser = data.user;
    if (!authUser) {
      return { ok: false, error: "Sign in succeeded but no user was returned." };
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", authUser.id)
      .maybeSingle();

    const metadataRole =
      typeof authUser.user_metadata?.role === "string"
        ? authUser.user_metadata.role
        : null;
    const role = profile?.role ?? metadataRole;
    const redirectTo = homePathForRole(role) === "/" ? "/management" : homePathForRole(role);

    revalidatePath("/", "layout");

    return { ok: true, redirectTo };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Sign in failed",
    };
  }
}

export async function signUpOwnerAction(
  name: string,
  email: string,
  password: string
): Promise<AuthFlowResult> {
  try {
    if (await ownerAccountExists()) {
      return {
        ok: false,
        error: "Owner sign-up is closed. Ask an existing owner to invite you.",
      };
    }

    const supabase = await createClient();
    const normalizedEmail = email.trim().toLowerCase();
    const displayName = name.trim();

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          display_name: displayName,
          role: "owner",
        },
      },
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    if (data.user?.id) {
      const admin = createAdminClient();
      await upsertUserProfile(
        admin,
        data.user.id,
        "owner",
        displayName,
        normalizedEmail
      );
    }

    revalidatePath("/", "layout");

    if (data.session) {
      return { ok: true, redirectTo: "/management" };
    }

    return {
      ok: true,
      message: "Check your email for a confirmation link, then sign in.",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Account creation failed",
    };
  }
}

export async function inviteUser(
  email: string,
  role: UserRole,
  displayName: string
): Promise<ActionResult & { userId?: string }> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    const admin = createAdminClient();
    const redirectTo = `${getAuthRedirectBaseUrl()}/auth/set-password`;

    let { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { display_name: displayName, role },
    });

    if (error && isAlreadyRegisteredAuthError(error.message)) {
      const selfGuard = await ensureNotDeletingSelf(email);
      if (!selfGuard.ok) return { ok: false, error: selfGuard.error };

      const existingId = await findAuthUserIdByEmail(email);
      if (existingId) {
        await admin.auth.admin.deleteUser(existingId);
        ({ data, error } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo,
          data: { display_name: displayName, role },
        }));
      }
    }

    if (error) return { ok: false, error: error.message };

    if (!data?.user?.id) {
      return { ok: false, error: "Invite succeeded but no user id was returned." };
    }

    return { ok: true, userId: data.user.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invite failed" };
  }
}
