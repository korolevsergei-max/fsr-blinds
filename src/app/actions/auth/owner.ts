"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./helpers";
import {
  assertOwnerForAccountActions,
  ensureNotDeletingSelf,
  findAuthUserIdByEmail,
  upsertUserProfile,
} from "./helpers";

/**
 * Create a co-owner account. Creates a Supabase auth user (direct password,
 * no email invite) and inserts a user_profiles row with role = 'owner'.
 */
export async function createOwnerAccount(
  displayName: string,
  email: string,
  password: string
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    if (!password || password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters." };
    }

    const admin = createAdminClient();

    // If already registered, remove the old auth user first (guard against self-delete).
    const existingId = await findAuthUserIdByEmail(email);
    if (existingId) {
      const selfGuard = await ensureNotDeletingSelf(email);
      if (!selfGuard.ok) return { ok: false, error: selfGuard.error };
      await admin.auth.admin.deleteUser(existingId);
    }

    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName, role: "owner" },
    });

    if (authErr) return { ok: false, error: authErr.message };
    if (!authUser?.user?.id) {
      return { ok: false, error: "Account created but no user id was returned." };
    }

    // Upsert user_profiles so the new owner can log in immediately.
    const profileErr = await upsertUserProfile(
      admin,
      authUser.user.id,
      "owner",
      displayName,
      email
    );
    if (profileErr) return { ok: false, error: profileErr };

    revalidatePath("/management/accounts", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create owner account" };
  }
}

/**
 * Delete a co-owner account. Refuses to delete the currently signed-in owner.
 */
export async function deleteOwnerAccount(
  authUserId: string,
  email: string
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    const selfGuard = await ensureNotDeletingSelf(email);
    if (!selfGuard.ok) return selfGuard;

    const admin = createAdminClient();

    // Deleting the auth user will cascade-delete the user_profiles row via trigger/FK.
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (error) return { ok: false, error: error.message };

    // Belt-and-suspenders: explicitly remove any lingering user_profiles row.
    const supabase = await createClient();
    await supabase.from("user_profiles").delete().eq("id", authUserId);

    revalidatePath("/management/accounts", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete owner account" };
  }
}

/**
 * Change the password for any account. Owner-only.
 * Uses admin API so no old-password confirmation is needed.
 */
export async function changeAccountPassword(
  authUserId: string,
  newPassword: string
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    if (!newPassword || newPassword.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters." };
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(authUserId, {
      password: newPassword,
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to change password." };
  }
}

/** Remove an Auth user (and cascaded profile) that has no linked installer/cutter row. */
export async function deleteOrphanAuthAccount(
  authUserId: string,
  email: string
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    const selfGuard = await ensureNotDeletingSelf(email);
    if (!selfGuard.ok) return selfGuard;

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/management/accounts", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to remove auth user",
    };
  }
}
