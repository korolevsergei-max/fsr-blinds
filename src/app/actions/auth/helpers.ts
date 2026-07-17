import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/auth";
import { requireOwner, requireOwnerOrScheduler } from "@/lib/auth";

export type ActionResult =
  | { ok: true; tempPassword?: string }
  | { ok: false; error: string };

export type AuthFlowResult =
  | { ok: true; redirectTo?: string; message?: string }
  | { ok: false; error: string };

export async function assertOwnerForAccountActions(): Promise<ActionResult | null> {
  try {
    await requireOwner();
    return null;
  } catch {
    return { ok: false, error: "Only the owner can manage accounts." };
  }
}

export async function assertOwnerOrSchedulerForInstallerActions(): Promise<ActionResult | null> {
  try {
    await requireOwnerOrScheduler();
    return null;
  } catch {
    return { ok: false, error: "Only the owner or scheduler can manage installers." };
  }
}

/** True once any owner account exists — used to close public owner self-signup. */
export async function ownerAccountExists(): Promise<boolean> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("user_profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner");

  // Fail closed: if we can't verify, don't allow a new owner to self-register.
  if (error) return true;
  return (count ?? 0) > 0;
}

export function isMissingColumnError(error: unknown, table: string, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeMessage = "message" in error ? error.message : undefined;
  if (typeof maybeMessage !== "string") return false;
  return maybeMessage.includes(`'${column}'`) && maybeMessage.includes(`'${table}'`);
}

export function isAlreadyRegisteredAuthError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("already been registered") || normalized.includes("already registered");
}

export function isMissingRelationError(message: string): boolean {
  return /does not exist|schema cache|Could not find the table/i.test(message);
}

export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
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

export async function ensureNotDeletingSelf(targetEmail: string): Promise<ActionResult> {
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
export async function deleteInstallersByEmail(admin: SupabaseClient, email: string) {
  const e = email.trim();
  if (!e) return;
  await admin.from("installers").delete().ilike("email", e);
}

/** Remove cutter rows for this contact email (case-insensitive). */
export async function deleteCuttersByContactEmail(admin: SupabaseClient, email: string) {
  const e = email.trim();
  if (!e) return;
  await admin.from("cutters").delete().ilike("contact_email", e);
}

/** Remove scheduler rows for this email so re-invite is not blocked by stale/orphan rows. */
export async function deleteSchedulersByEmail(admin: SupabaseClient, email: string) {
  const e = email.trim();
  if (!e) return;
  await admin.from("schedulers").delete().ilike("email", e);
}

/** Remove assembler rows for this email so re-creation is not blocked by stale/orphan rows. */
export async function deleteAssemblersByEmail(admin: SupabaseClient, email: string) {
  const e = email.trim();
  if (!e) return;
  await admin.from("assemblers").delete().ilike("email", e);
}

/** Remove QC rows for this email so re-creation is not blocked by stale/orphan rows. */
export async function deleteQcsByEmail(admin: SupabaseClient, email: string) {
  const e = email.trim();
  if (!e) return;
  await admin.from("qcs").delete().ilike("email", e);
}

export function getAuthRedirectBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    "http://localhost:3000"
  );
}

export async function upsertUserProfile(
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

  // Write the authorization claim. app_metadata is service-role-only writable
  // (unlike user_metadata, which the user can edit), so middleware can trust it
  // as the role source without a per-navigation user_profiles query. Best-effort:
  // if this fails, middleware falls back to the DB and getCurrentUser self-heals.
  try {
    await admin.auth.admin.updateUserById(authUserId, { app_metadata: { role } });
  } catch {
    /* non-fatal: middleware DB fallback + getCurrentUser self-heal cover this */
  }

  return error?.message ?? null;
}
