"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/auth";
import { requireOwner, requireOwnerOrScheduler } from "@/lib/auth";

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

function isRateLimitError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("email rate limit") || normalized.includes("rate limit exceeded") || normalized.includes("over_email_send_rate_limit");
}

/** Generates a readable temporary password: e.g. "Tiger-284-Kite" */
function generateTempPassword(): string {
  const words = ["Tiger","Maple","River","Stone","Frost","Cedar","Blaze","Scout","Ember","Pearl"];
  const a = words[Math.floor(Math.random() * words.length)];
  const b = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(100 + Math.random() * 900);
  return `${a}-${n}-${b}`;
}

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

/** Remove manufacturer rows for this contact email (case-insensitive). */
async function deleteManufacturersByContactEmail(admin: SupabaseClient, email: string) {
  const e = email.trim();
  if (!e) return;
  await admin.from("manufacturers").delete().ilike("contact_email", e);
}

function getAuthRedirectBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    "http://localhost:3000"
  );
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
  phone: string
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerOrSchedulerForInstallerActions();
    if (denied) return denied;

    const admin = createAdminClient();
    const redirectTo = `${getAuthRedirectBaseUrl()}/auth/set-password`;

    // NOTE: Delete stale rows only AFTER auth invite succeeds to avoid leaving
    // orphaned auth users when the invite email hits a rate limit.
    let { data: authUser, error: authErr } =
      await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { display_name: name, role: "installer" },
      });

    if (authErr && isAlreadyRegisteredAuthError(authErr.message)) {
      const selfGuard = await ensureNotDeletingSelf(email);
      if (!selfGuard.ok) return { ok: false, error: selfGuard.error };

      const existingId = await findAuthUserIdByEmail(email);
      if (existingId) {
        await admin.auth.admin.deleteUser(existingId);
        ({ data: authUser, error: authErr } =
          await admin.auth.admin.inviteUserByEmail(email, {
            redirectTo,
            data: { display_name: name, role: "installer" },
          }));
      }
    }

    // Fallback: if email rate limit hit, create the user directly with a temp password.
    let tempPassword: string | undefined;
    if (authErr && isRateLimitError(authErr.message)) {
      tempPassword = generateTempPassword();
      const { data: createdUser, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { display_name: name, role: "installer" },
        });
      if (createErr) return { ok: false, error: createErr.message };
      authUser = createdUser;
      authErr = null;
    }

    if (authErr) return { ok: false, error: authErr.message };

    if (!authUser?.user?.id) {
      return { ok: false, error: "Invite succeeded but no user id was returned." };
    }

    // Auth invite succeeded — now safe to clean up any stale installer rows for this email.
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
    };

    let { error: insErr } = await supabase.from("installers").insert(installerInsertWithAuth);
    if (isMissingColumnError(insErr, "installers", "auth_user_id")) {
      const installerInsertLegacy = {
        id: installerId,
        name,
        email,
        phone,
        avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
      };
      const retry = await supabase.from("installers").insert(installerInsertLegacy);
      insErr = retry.error;
    }

    if (insErr) return { ok: false, error: insErr.message };

    revalidatePath("/management", "layout");
    revalidatePath("/scheduler", "layout");
    return { ok: true, tempPassword };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create installer" };
  }
}

export async function createManufacturerAccount(
  name: string,
  email: string,
  contactName: string,
  phone: string
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    const admin = createAdminClient();
    const redirectTo = `${getAuthRedirectBaseUrl()}/auth/set-password`;

    // NOTE: Delete stale rows only AFTER auth invite succeeds to avoid leaving
    // orphaned auth users when the invite email hits a rate limit.
    let { data: authUser, error: authErr } =
      await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { display_name: name, role: "manufacturer" },
      });

    if (authErr && isAlreadyRegisteredAuthError(authErr.message)) {
      const selfGuard = await ensureNotDeletingSelf(email);
      if (!selfGuard.ok) return { ok: false, error: selfGuard.error };

      const existingId = await findAuthUserIdByEmail(email);
      if (existingId) {
        await admin.auth.admin.deleteUser(existingId);
        ({ data: authUser, error: authErr } =
          await admin.auth.admin.inviteUserByEmail(email, {
            redirectTo,
            data: { display_name: name, role: "manufacturer" },
          }));
      }
    }

    // Fallback: if email rate limit hit, create the user directly with a temp password.
    let tempPassword: string | undefined;
    if (authErr && isRateLimitError(authErr.message)) {
      tempPassword = generateTempPassword();
      const { data: createdUser, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { display_name: name, role: "manufacturer" },
        });
      if (createErr) return { ok: false, error: createErr.message };
      authUser = createdUser;
      authErr = null;
    }

    if (authErr) return { ok: false, error: authErr.message };

    if (!authUser?.user?.id) {
      return { ok: false, error: "Invite succeeded but no user id was returned." };
    }

    // Auth invite succeeded — now safe to clean up any stale manufacturer rows for this email.
    await deleteManufacturersByContactEmail(admin, email);

    const supabase = await createClient();
    const mfrId = `mfr-${crypto.randomUUID().slice(0, 8)}`;

    const manufacturerInsertWithAuth = {
      id: mfrId,
      name,
      contact_name: contactName,
      contact_email: email,
      contact_phone: phone,
      auth_user_id: authUser.user.id,
    };

    let { error: mfrErr } = await supabase.from("manufacturers").insert(
      manufacturerInsertWithAuth
    );
    if (isMissingColumnError(mfrErr, "manufacturers", "auth_user_id")) {
      const manufacturerInsertLegacy = {
        id: mfrId,
        name,
        contact_name: contactName,
        contact_email: email,
        contact_phone: phone,
      };
      const retry = await supabase.from("manufacturers").insert(manufacturerInsertLegacy);
      mfrErr = retry.error;
    }

    if (mfrErr) return { ok: false, error: mfrErr.message };

    revalidatePath("/management", "layout");
    return { ok: true, tempPassword };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create manufacturer" };
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

export async function deleteManufacturerAccount(
  manufacturerId: string,
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
      .from("manufacturers")
      .delete({ count: "exact" })
      .eq("id", manufacturerId);

    if (rowDelErr) return { ok: false, error: rowDelErr.message };

    if ((count ?? 0) === 0 && contactEmail?.trim()) {
      const { error: emailDelErr } = await admin
        .from("manufacturers")
        .delete()
        .ilike("contact_email", contactEmail.trim());
      if (emailDelErr) return { ok: false, error: emailDelErr.message };
    }

    revalidatePath("/management/accounts", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete manufacturer" };
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
  phone: string
): Promise<ActionResult> {
  try {
    const denied = await assertOwnerForAccountActions();
    if (denied) return denied;

    const admin = createAdminClient();
    const redirectTo = `${getAuthRedirectBaseUrl()}/auth/set-password`;

    let { data: authUser, error: authErr } =
      await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { display_name: name, role: "scheduler" },
      });

    if (authErr && isAlreadyRegisteredAuthError(authErr.message)) {
      const selfGuard = await ensureNotDeletingSelf(email);
      if (!selfGuard.ok) return { ok: false, error: selfGuard.error };

      const existingId = await findAuthUserIdByEmail(email);
      if (existingId) {
        await admin.auth.admin.deleteUser(existingId);
        ({ data: authUser, error: authErr } =
          await admin.auth.admin.inviteUserByEmail(email, {
            redirectTo,
            data: { display_name: name, role: "scheduler" },
          }));
      }
    }

    let tempPassword: string | undefined;
    if (authErr && isRateLimitError(authErr.message)) {
      tempPassword = generateTempPassword();
      const { data: createdUser, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { display_name: name, role: "scheduler" },
        });
      if (createErr) return { ok: false, error: createErr.message };
      authUser = createdUser;
      authErr = null;
    }

    if (authErr) return { ok: false, error: authErr.message };

    if (!authUser?.user?.id) {
      return { ok: false, error: "Invite succeeded but no user id was returned." };
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

    revalidatePath("/management", "layout");
    return { ok: true, tempPassword };
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

    if (authUserId) {
      try {
        await admin.auth.admin.deleteUser(authUserId);
      } catch {
        // ignore and continue with row delete
      }
    }

    const { error: rowDelErr, count } = await admin
      .from("schedulers")
      .delete({ count: "exact" })
      .eq("id", schedulerId);

    if (rowDelErr) return { ok: false, error: rowDelErr.message };

    if ((count ?? 0) === 0 && email?.trim()) {
      const { error: emailDelErr } = await admin
        .from("schedulers")
        .delete()
        .ilike("email", email.trim());
      if (emailDelErr) return { ok: false, error: emailDelErr.message };
    }

    revalidatePath("/management/accounts", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete scheduler" };
  }
}

/** Remove an Auth user (and cascaded profile) that has no linked installer/manufacturer row. */
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
