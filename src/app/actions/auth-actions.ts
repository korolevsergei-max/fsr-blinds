"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/auth";
import { requireOwner, requireOwnerOrScheduler, getCurrentUser, getLinkedSchedulerId } from "@/lib/auth";

export type ActionResult =
  | { ok: true; tempPassword?: string }
  | { ok: false; error: string };

async function assertOwnerForAccountActions(): Promise<ActionResult | null> {
  try {
    await requireOwner();
    return null;
  } catch {
    return { ok: false, error: "Only the owner can manage accounts." };
  }
}

async function assertOwnerOrSchedulerForInstallerActions(): Promise<ActionResult | null> {
  try {
    await requireOwnerOrScheduler();
    return null;
  } catch {
    return { ok: false, error: "Only the owner or scheduler can manage installers." };
  }
}

function isMissingColumnError(error: unknown, table: string, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeMessage = "message" in error ? error.message : undefined;
  if (typeof maybeMessage !== "string") return false;
  return maybeMessage.includes(`'${column}'`) && maybeMessage.includes(`'${table}'`);
}

function isAlreadyRegisteredAuthError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("already been registered") || normalized.includes("already registered");
}

// Unused functions removed to fix lint warnings

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  const normalizedEmail = email.trim().toLowerCase();

  // Paginate defensively; most projects will have very small user counts.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === normalizedEmail);
    if (match?.id) return match.id;
    if (data.users.length < 200) break;
  }

  return null;
}

async function ensureNotDeletingSelf(targetEmail: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email && user.email.toLowerCase() === targetEmail.trim().toLowerCase()) {
    return { ok: false, error: "Refusing to delete the currently signed-in user." };
  }

  return { ok: true };
}

/** Remove installer rows for this email so re-invite is not blocked by stale/orphan rows. */
async function deleteInstallersByEmail(admin: SupabaseClient, email: string) {
  const e = email.trim();
  if (!e) return;
  await admin.from("installers").delete().ilike("email", e);
}

/** Remove cutter rows for this contact email (case-insensitive). */
async function deleteCuttersByContactEmail(admin: SupabaseClient, email: string) {
  const e = email.trim();
  if (!e) return;
  await admin.from("cutters").delete().ilike("contact_email", e);
}

function getAuthRedirectBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    "http://localhost:3000"
  );
}

async function upsertUserProfile(
  admin: SupabaseClient,
  authUserId: string,
  role: UserRole,
  displayName: string,
  email: string
): Promise<string | null> {
  const { error } = await admin.from("user_profiles").upsert({
    id: authUserId,
    role,
    display_name: displayName.trim() || email.trim(),
    email: email.trim(),
  });

  return error?.message ?? null;
}

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

/** Remove scheduler rows for this email so re-invite is not blocked by stale/orphan rows. */
async function deleteSchedulersByEmail(admin: SupabaseClient, email: string) {
  const e = email.trim();
  if (!e) return;
  await admin.from("schedulers").delete().ilike("email", e);
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

function isMissingRelationError(message: string): boolean {
  return /does not exist|schema cache|Could not find the table/i.test(message);
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

/** Remove assembler rows for this email so re-creation is not blocked by stale/orphan rows. */
async function deleteAssemblersByEmail(admin: SupabaseClient, email: string) {
  const e = email.trim();
  if (!e) return;
  await admin.from("assemblers").delete().ilike("email", e);
}

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
