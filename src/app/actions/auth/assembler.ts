"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./helpers";
import {
  assertOwnerForAccountActions,
  deleteAssemblersByEmail,
  ensureNotDeletingSelf,
  findAuthUserIdByEmail,
  upsertUserProfile,
} from "./helpers";

/**
 * Create an assembler account (direct password, no email invite).
 * Mirrors createSchedulerAccount.
 */
export async function createAssemblerAccount(
  name: string,
  email: string,
  phone: string,
  password: string
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    if (!password || password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters." };
    }

    const admin = createAdminClient();

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
      user_metadata: { display_name: name, role: "assembler" },
    });

    if (authErr) return { ok: false, error: authErr.message };
    if (!authUser?.user?.id) {
      return { ok: false, error: "Account created but no user id was returned." };
    }

    await deleteAssemblersByEmail(admin, email);

    const supabase = await createClient();
    const asmId = `asm-${crypto.randomUUID().slice(0, 8)}`;

    const { error: asmErr } = await supabase.from("assemblers").insert({
      id: asmId,
      name,
      email,
      phone,
      auth_user_id: authUser.user.id,
    });

    if (asmErr) return { ok: false, error: asmErr.message };

    const profileErr = await upsertUserProfile(
      admin,
      authUser.user.id,
      "assembler",
      name,
      email
    );
    if (profileErr) return { ok: false, error: profileErr };

    revalidatePath("/management", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create assembler account" };
  }
}

/**
 * Delete an assembler account.
 */
export async function deleteAssemblerAccount(
  assemblerId: string,
  authUserId: string | null,
  email?: string
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    const admin = createAdminClient();

    const linkedAuthId = authUserId?.trim();
    if (linkedAuthId) {
      try {
        await admin.auth.admin.deleteUser(linkedAuthId);
      } catch {
        // continue with row delete
      }
    }

    const { data: deletedById, error: delIdErr } = await admin
      .from("assemblers")
      .delete()
      .eq("id", assemblerId)
      .select("id");

    if (delIdErr) return { ok: false, error: delIdErr.message };

    if (!deletedById?.length && email?.trim()) {
      const normalized = email.trim();
      const { data: deletedByEmail, error: delEmailErr } = await admin
        .from("assemblers")
        .delete()
        .ilike("email", normalized)
        .select("id");
      if (delEmailErr) return { ok: false, error: delEmailErr.message };
      if (!deletedByEmail?.length) {
        return {
          ok: false,
          error: "No assembler row was removed. Refresh the page and try again.",
        };
      }
    }

    revalidatePath("/management/accounts", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete assembler account" };
  }
}
