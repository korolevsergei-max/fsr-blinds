"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./helpers";
import {
  assertOwnerForAccountActions,
  deleteQcsByEmail,
  ensureNotDeletingSelf,
  findAuthUserIdByEmail,
  upsertUserProfile,
} from "./helpers";

/**
 * Create a QC account (direct password, no email invite).
 */
export async function createQcAccount(
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
      user_metadata: { display_name: name, role: "qc" },
    });

    if (authErr) return { ok: false, error: authErr.message };
    if (!authUser?.user?.id) {
      return { ok: false, error: "Account created but no user id was returned." };
    }

    await deleteQcsByEmail(admin, email);

    const supabase = await createClient();
    const qcId = `qc-${crypto.randomUUID().slice(0, 8)}`;

    const { error: qcErr } = await supabase.from("qcs").insert({
      id: qcId,
      name,
      email,
      phone,
      auth_user_id: authUser.user.id,
    });

    if (qcErr) return { ok: false, error: qcErr.message };

    const profileErr = await upsertUserProfile(
      admin,
      authUser.user.id,
      "qc",
      name,
      email
    );
    if (profileErr) return { ok: false, error: profileErr };

    revalidatePath("/management", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create QC account" };
  }
}

/**
 * Delete a QC account.
 */
export async function deleteQcAccount(
  qcId: string,
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
      .from("qcs")
      .delete()
      .eq("id", qcId)
      .select("id");

    if (delIdErr) return { ok: false, error: delIdErr.message };

    if (!deletedById?.length && email?.trim()) {
      const normalized = email.trim();
      const { data: deletedByEmail, error: delEmailErr } = await admin
        .from("qcs")
        .delete()
        .ilike("email", normalized)
        .select("id");
      if (delEmailErr) return { ok: false, error: delEmailErr.message };
      if (!deletedByEmail?.length) {
        return {
          ok: false,
          error: "No QC row was removed. Refresh the page and try again.",
        };
      }
    }

    revalidatePath("/management/accounts", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete QC account" };
  }
}
