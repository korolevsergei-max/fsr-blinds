"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./helpers";
import {
  assertOwnerForAccountActions,
  deleteCuttersByContactEmail,
  ensureNotDeletingSelf,
  findAuthUserIdByEmail,
  isMissingColumnError,
  upsertUserProfile,
} from "./helpers";

export async function createCutterAccount(
  name: string,
  email: string,
  contactName: string,
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
      user_metadata: { display_name: name, role: "cutter" },
    });

    if (authErr) return { ok: false, error: authErr.message };
    if (!authUser?.user?.id) {
      return { ok: false, error: "Account created but no user id was returned." };
    }

    await deleteCuttersByContactEmail(admin, email);

    const supabase = await createClient();
    const cutterId = `cut-${crypto.randomUUID().slice(0, 8)}`;

    const cutterInsertWithAuth = {
      id: cutterId,
      name,
      contact_name: contactName,
      contact_email: email,
      contact_phone: phone,
      auth_user_id: authUser.user.id,
    };

    let { error: cutErr } = await supabase.from("cutters").insert(
      cutterInsertWithAuth
    );
    if (isMissingColumnError(cutErr, "cutters", "auth_user_id")) {
      const cutterInsertLegacy = {
        id: cutterId,
        name,
        contact_name: contactName,
        contact_email: email,
        contact_phone: phone,
      };
      const retry = await supabase.from("cutters").insert(cutterInsertLegacy);
      cutErr = retry.error;
    }

    if (cutErr) return { ok: false, error: cutErr.message };

    const profileErr = await upsertUserProfile(
      admin,
      authUser.user.id,
      "cutter",
      name,
      email
    );
    if (profileErr) return { ok: false, error: profileErr };

    revalidatePath("/management", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create cutter" };
  }
}

export async function deleteCutterAccount(
  cutterId: string,
  authUserId: string | null,
  contactEmail?: string
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    const admin = createAdminClient();

    if (authUserId) {
      try {
        const { error: userDelErr } =
          await admin.auth.admin.deleteUser(authUserId);
        if (userDelErr) {
          // ignore and continue
        }
      } catch {
        // ignore and continue
      }
    }

    const { error: rowDelErr, count } = await admin
      .from("cutters")
      .delete({ count: "exact" })
      .eq("id", cutterId);

    if (rowDelErr) return { ok: false, error: rowDelErr.message };

    if ((count ?? 0) === 0 && contactEmail?.trim()) {
      const { error: emailDelErr } = await admin
        .from("cutters")
        .delete()
        .ilike("contact_email", contactEmail.trim());
      if (emailDelErr) return { ok: false, error: emailDelErr.message };
    }

    revalidatePath("/management/accounts", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete cutter" };
  }
}
