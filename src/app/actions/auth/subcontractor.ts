"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./helpers";
import {
  assertOwnerForAccountActions,
  deleteSubcontractorsByEmail,
  ensureNotDeletingSelf,
  findAuthUserIdByEmail,
  upsertUserProfile,
} from "./helpers";

/**
 * Create a subcontractor account (direct password, no email invite).
 *
 * `partnerId` is what scopes everything they can see: the RLS helper
 * `auth_partner_id()` resolves it from this row, and the portal only ever shows
 * units whose `manufacturing_partner_id` matches.
 */
export async function createSubcontractorAccount(
  name: string,
  email: string,
  phone: string,
  password: string,
  partnerId: string
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    if (!password || password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters." };
    }
    if (!partnerId) {
      return { ok: false, error: "Choose which manufacturer this login belongs to." };
    }

    const supabase = await createClient();

    const { data: partner } = await supabase
      .from("manufacturing_partners")
      .select("id, is_internal")
      .eq("id", partnerId)
      .maybeSingle();
    if (!partner) {
      return { ok: false, error: "That manufacturer no longer exists." };
    }
    if ((partner as { is_internal: boolean }).is_internal) {
      return {
        ok: false,
        error:
          "In-house work is done by cutter, assembler and QC accounts. Pick a subcontractor instead.",
      };
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
      user_metadata: { display_name: name, role: "subcontractor" },
    });

    if (authErr) return { ok: false, error: authErr.message };
    if (!authUser?.user?.id) {
      return { ok: false, error: "Account created but no user id was returned." };
    }

    await deleteSubcontractorsByEmail(admin, email);

    const subcontractorId = `sub-${crypto.randomUUID().slice(0, 8)}`;

    const { error: insertErr } = await supabase.from("subcontractors").insert({
      id: subcontractorId,
      partner_id: partnerId,
      name,
      email,
      phone,
      auth_user_id: authUser.user.id,
    });

    if (insertErr) return { ok: false, error: insertErr.message };

    const profileErr = await upsertUserProfile(
      admin,
      authUser.user.id,
      "subcontractor",
      name,
      email
    );
    if (profileErr) return { ok: false, error: profileErr };

    revalidatePath("/management", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to create subcontractor account",
    };
  }
}

/** Delete a subcontractor account. */
export async function deleteSubcontractorAccount(
  subcontractorId: string,
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
      .from("subcontractors")
      .delete()
      .eq("id", subcontractorId)
      .select("id");

    if (delIdErr) return { ok: false, error: delIdErr.message };

    if (!deletedById?.length && email?.trim()) {
      const normalized = email.trim();
      const { data: deletedByEmail, error: delEmailErr } = await admin
        .from("subcontractors")
        .delete()
        .ilike("email", normalized)
        .select("id");
      if (delEmailErr) return { ok: false, error: delEmailErr.message };
      if (!deletedByEmail?.length) {
        return {
          ok: false,
          error: "No subcontractor row was removed. Refresh the page and try again.",
        };
      }
    }

    revalidatePath("/management/accounts", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to delete subcontractor account",
    };
  }
}

/**
 * Owner-side CRUD for the partner companies themselves. Kept here rather than in
 * management-actions so the whole "who manufactures" account surface lives
 * together with the login it gates.
 */
export async function createManufacturingPartner(
  name: string,
  contactName: string,
  contactEmail: string,
  contactPhone: string
): Promise<ActionResult & { partnerId?: string }> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    if (!name.trim()) return { ok: false, error: "Name is required." };

    const supabase = await createClient();
    const partnerId = `mp-${crypto.randomUUID().slice(0, 8)}`;
    const { error } = await supabase.from("manufacturing_partners").insert({
      id: partnerId,
      name: name.trim(),
      contact_name: contactName.trim(),
      contact_email: contactEmail.trim(),
      contact_phone: contactPhone.trim(),
      is_internal: false,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/management", "layout");
    return { ok: true, partnerId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to create manufacturer",
    };
  }
}

/**
 * Delete a partner. Units pointing at it fall back to the in-house factory via
 * the column's ON DELETE SET DEFAULT, so no unit is ever orphaned — but they will
 * silently return to the internal queues, hence the explicit confirmation in the UI.
 */
export async function deleteManufacturingPartner(partnerId: string): Promise<ActionResult> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    const supabase = await createClient();

    const { data: partner } = await supabase
      .from("manufacturing_partners")
      .select("id, is_internal")
      .eq("id", partnerId)
      .maybeSingle();
    if (!partner) return { ok: false, error: "That manufacturer no longer exists." };
    if ((partner as { is_internal: boolean }).is_internal) {
      return { ok: false, error: "The in-house factory cannot be removed." };
    }

    const { error } = await supabase
      .from("manufacturing_partners")
      .delete()
      .eq("id", partnerId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/management", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to delete manufacturer",
    };
  }
}
