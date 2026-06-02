"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, getLinkedSchedulerId } from "@/lib/auth";
import type { ActionResult } from "./helpers";
import {
  assertOwnerForAccountActions,
  assertOwnerOrSchedulerForInstallerActions,
  deleteInstallersByEmail,
  ensureNotDeletingSelf,
  findAuthUserIdByEmail,
  isMissingColumnError,
  upsertUserProfile,
} from "./helpers";
import { deleteSchedulerAccount } from "./scheduler";

export async function createInstallerAccount(
  name: string,
  email: string,
  phone: string,
  password: string
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerOrSchedulerForInstallerActions();
    if (denied) return denied;

    if (!password || password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters." };
    }

    // Detect if the caller is a scheduler and resolve their team ID.
    const callerUser = await getCurrentUser();
    const callerSchedulerId =
      callerUser?.role === "scheduler"
        ? await getLinkedSchedulerId(callerUser.id)
        : null;

    const admin = createAdminClient();

    // If the email is already registered, delete the old auth user first so we
    // can create a fresh one. Guard against accidentally deleting the signed-in owner.
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
      user_metadata: { display_name: name, role: "installer" },
    });

    if (authErr) return { ok: false, error: authErr.message };
    if (!authUser?.user?.id) {
      return { ok: false, error: "Account created but no user id was returned." };
    }

    // Clean up any stale installer rows for this email.
    await deleteInstallersByEmail(admin, email);

    const supabase = await createClient();
    const installerId = `inst-${crypto.randomUUID().slice(0, 8)}`;

    const installerInsertWithAuth = {
      id: installerId,
      name,
      email,
      phone,
      avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
      auth_user_id: authUser.user.id,
      // Tag to scheduler's team if created by a scheduler.
      ...(callerSchedulerId ? { scheduler_id: callerSchedulerId } : {}),
    };

    let { error: insErr } = await supabase.from("installers").insert(installerInsertWithAuth);
    if (isMissingColumnError(insErr, "installers", "auth_user_id")) {
      const installerInsertLegacy = {
        id: installerId,
        name,
        email,
        phone,
        avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
        ...(callerSchedulerId ? { scheduler_id: callerSchedulerId } : {}),
      };
      const retry = await supabase.from("installers").insert(installerInsertLegacy);
      insErr = retry.error;
    }

    if (insErr) return { ok: false, error: insErr.message };

    const profileErr = await upsertUserProfile(
      admin,
      authUser.user.id,
      "installer",
      name,
      email
    );
    if (profileErr) return { ok: false, error: profileErr };

    revalidatePath("/management", "layout");
    revalidatePath("/scheduler", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create installer" };
  }
}

export async function deleteInstallerAccount(
  installerId: string,
  authUserId: string | null,
  email?: string
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    /**
     * Schedulers are merged into the installers picklist as `SC: …` with id `sch-${row.id}`.
     * Since `schedulers.id` is already `sch-…`, the composite id is `sch-sch-…` — not an
     * `installers` PK. Deleting those rows must target `schedulers` (same as Accounts → Schedulers).
     */
    if (installerId.startsWith("sch-")) {
      const schedulerTableId = installerId.slice(4);
      if (schedulerTableId.length > 0) {
        return deleteSchedulerAccount(schedulerTableId, authUserId, email);
      }
    }

    const admin = createAdminClient();

    // Delete auth user first so any user_profile rows cascade automatically.
    if (authUserId) {
      try {
        const { error: userDelErr } =
          await admin.auth.admin.deleteUser(authUserId);
        // If the auth user doesn't exist anymore, we still want to delete the installer row.
        if (userDelErr) {
          // ignore not-found-ish errors; still continue with row delete below
        }
      } catch {
        // ignore and continue with row delete below
      }
    }

    const { error: rowDelErr, count } = await admin
      .from("installers")
      .delete({ count: "exact" })
      .eq("id", installerId);

    if (rowDelErr) return { ok: false, error: rowDelErr.message };

    if ((count ?? 0) === 0 && email?.trim()) {
      const { error: emailDelErr } = await admin
        .from("installers")
        .delete()
        .ilike("email", email.trim());
      if (emailDelErr) return { ok: false, error: emailDelErr.message };
    }

    revalidatePath("/management/accounts", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete installer" };
  }
}
