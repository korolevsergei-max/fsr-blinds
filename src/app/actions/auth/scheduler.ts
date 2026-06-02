"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./helpers";
import {
  assertOwnerForAccountActions,
  deleteSchedulersByEmail,
  ensureNotDeletingSelf,
  findAuthUserIdByEmail,
  isMissingRelationError,
  upsertUserProfile,
} from "./helpers";

export async function setSchedulerBuildingAccess(
  schedulerId: string,
  buildingIds: string[]
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    const supabase = await createClient();

    // Replace access list atomically: delete existing, then insert new.
    const { error: delErr } = await supabase
      .from("scheduler_building_access")
      .delete()
      .eq("scheduler_id", schedulerId);
    if (delErr) return { ok: false, error: delErr.message };

    if (buildingIds.length > 0) {
      const rows = buildingIds.map((buildingId) => ({
        id: `sba-${crypto.randomUUID().slice(0, 8)}`,
        scheduler_id: schedulerId,
        building_id: buildingId,
      }));
      const { error: insErr } = await supabase
        .from("scheduler_building_access")
        .insert(rows);
      if (insErr) return { ok: false, error: insErr.message };
    }

    revalidatePath("/management", "layout");
    revalidatePath("/scheduler", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update access" };
  }
}

export async function createSchedulerAccount(
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

    // If the email is already registered, delete old auth user first.
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
      user_metadata: { display_name: name, role: "scheduler" },
    });

    if (authErr) return { ok: false, error: authErr.message };
    if (!authUser?.user?.id) {
      return { ok: false, error: "Account created but no user id was returned." };
    }

    await deleteSchedulersByEmail(admin, email);

    const supabase = await createClient();
    const schedulerId = `sch-${crypto.randomUUID().slice(0, 8)}`;

    const { error: schErr } = await supabase.from("schedulers").insert({
      id: schedulerId,
      name,
      email,
      phone,
      auth_user_id: authUser.user.id,
    });

    if (schErr) return { ok: false, error: schErr.message };

    const profileErr = await upsertUserProfile(
      admin,
      authUser.user.id,
      "scheduler",
      name,
      email
    );
    if (profileErr) return { ok: false, error: profileErr };

    revalidatePath("/management", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create scheduler" };
  }
}

export async function deleteSchedulerAccount(
  schedulerId: string,
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
        const { error: userDelErr } = await admin.auth.admin.deleteUser(linkedAuthId);
        if (userDelErr && !/not found|User not found/i.test(userDelErr.message)) {
          // Continue: still remove the schedulers row so orphans can be cleared.
        }
      } catch {
        // continue with row delete
      }
    }

    // Drop dependents first so delete works even if older DBs lack ON DELETE CASCADE.
    const childTables = ["scheduler_unit_assignments", "scheduler_building_access"] as const;
    for (const table of childTables) {
      const { error: childErr } = await admin.from(table).delete().eq("scheduler_id", schedulerId);
      if (childErr && !isMissingRelationError(childErr.message)) {
        return { ok: false, error: childErr.message };
      }
    }

    const { data: deletedById, error: delIdErr } = await admin
      .from("schedulers")
      .delete()
      .eq("id", schedulerId)
      .select("id");

    if (delIdErr) return { ok: false, error: delIdErr.message };

    if (!deletedById?.length && email?.trim()) {
      const normalized = email.trim();
      const { data: deletedByEmail, error: delEmailErr } = await admin
        .from("schedulers")
        .delete()
        .ilike("email", normalized)
        .select("id");
      if (delEmailErr) return { ok: false, error: delEmailErr.message };
      if (!deletedByEmail?.length) {
        return {
          ok: false,
          error: "No scheduler row was removed. Refresh the page and try again.",
        };
      }
    }

    revalidatePath("/management/accounts", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete scheduler" };
  }
}
