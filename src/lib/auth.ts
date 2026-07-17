import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInvalidRefreshTokenError } from "@/lib/supabase/auth-errors";

export type UserRole = "owner" | "installer" | "cutter" | "client" | "scheduler" | "assembler" | "qc";

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
}

const VALID_USER_ROLES: UserRole[] = [
  "owner",
  "installer",
  "cutter",
  "client",
  "scheduler",
  "assembler",
  "qc",
];

function normalizeUserRole(role: unknown): UserRole | null {
  return typeof role === "string" && VALID_USER_ROLES.includes(role as UserRole)
    ? (role as UserRole)
    : null;
}

function deriveDisplayName(displayName: unknown, email: string): string {
  return (typeof displayName === "string" && displayName) || email.split("@")[0] || "User";
}

async function inferRoleFromLinkedAccount(
  supabase: SupabaseClient,
  authUserId: string
): Promise<UserRole | null> {
  const [
    schedulerRes,
    assemblerRes,
    qcRes,
    cutterRes,
    installerRes,
  ] = await Promise.all([
    supabase.from("schedulers").select("id").eq("auth_user_id", authUserId).maybeSingle(),
    supabase.from("assemblers").select("id").eq("auth_user_id", authUserId).maybeSingle(),
    supabase.from("qcs").select("id").eq("auth_user_id", authUserId).maybeSingle(),
    supabase.from("cutters").select("id").eq("auth_user_id", authUserId).maybeSingle(),
    supabase.from("installers").select("id").eq("auth_user_id", authUserId).maybeSingle(),
  ]);

  if (schedulerRes.data?.id) return "scheduler";
  if (assemblerRes.data?.id) return "assembler";
  if (qcRes.data?.id) return "qc";
  if (cutterRes.data?.id) return "cutter";
  if (installerRes.data?.id) return "installer";
  return null;
}

async function inferRoleForAuthenticatedUser(
  supabase: SupabaseClient,
  userId: string,
  appMetadataRole: unknown
): Promise<UserRole> {
  // Prefer the secure, service-role-only `app_metadata` claim; never trust the
  // user-writable `user_metadata` for an authorization decision.
  const claimRole = normalizeUserRole(appMetadataRole);
  if (claimRole) return claimRole;

  const linkedRole = await inferRoleFromLinkedAccount(supabase, userId);
  if (linkedRole) return linkedRole;

  const { count: ownerCount } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "owner");

  return (ownerCount ?? 0) === 0 ? "owner" : "installer";
}

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();

  // Resolve identity via getClaims() — a local JWT verify for asymmetric signing
  // keys (no Auth-server round-trip), falling back to a network getUser() only for
  // legacy symmetric tokens. The claims carry everything we need: id (sub), email,
  // the trusted app_metadata.role, and user_metadata for the display-name fallback.
  let claims: NonNullable<
    Awaited<ReturnType<typeof supabase.auth.getClaims>>["data"]
  >["claims"] | null = null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) {
      if (isInvalidRefreshTokenError(error)) return null;
      console.error("Auth error in getCurrentUser:", error);
      return null;
    }
    claims = data?.claims ?? null;
  } catch (error: unknown) {
    if (isInvalidRefreshTokenError(error)) return null;
    console.error("Auth error in getCurrentUser:", error);
    return null;
  }

  if (!claims) return null;

  const userId = claims.sub;
  const userEmail = claims.email ?? "";
  const appMetadataRole = (claims.app_metadata as Record<string, unknown> | undefined)?.role;
  const userMetadataName = (claims.user_metadata as Record<string, unknown> | undefined)?.display_name;
  const fallbackDisplayName = deriveDisplayName(userMetadataName, userEmail);

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role, display_name, email")
    .eq("id", userId)
    .single();

  // Profile exists — happy path
  if (profile) {
    // Organic backfill: keep the secure `app_metadata.role` claim in sync with the
    // DB so middleware can authorize from the token alone (no per-navigation DB read).
    // Best-effort and only when stale/missing, so steady-state cost is zero. Runs in
    // RSC/layouts (never middleware), so using the admin client here is safe.
    if (profile.role && appMetadataRole !== profile.role) {
      try {
        const admin = createAdminClient();
        await admin.auth.admin.updateUserById(userId, {
          app_metadata: { role: profile.role },
        });
      } catch {
        /* non-fatal: middleware DB fallback still covers this user */
      }
    }

    return {
      id: userId,
      email: profile.email,
      role: profile.role as UserRole,
      displayName: profile.display_name,
    };
  }

  // user_profiles table missing (migration not yet applied) — treat authenticated
  // user as owner so they can access the portal and apply the migration.
  if (profileError?.code === "42P01") {
    return {
      id: userId,
      email: userEmail,
      role: "owner",
      displayName: fallbackDisplayName,
    };
  }

  // Profile row missing (trigger didn't fire) — auto-create it using the most
  // reliable role source we have: auth metadata, linked app tables, then
  // owner/installer bootstrap fallback.
  if (profileError?.code === "PGRST116") {
    const role = await inferRoleForAuthenticatedUser(supabase, userId, appMetadataRole);

    await supabase.from("user_profiles").upsert({
      id: userId,
      role,
      display_name: fallbackDisplayName,
      email: userEmail,
    });

    return {
      id: userId,
      email: userEmail,
      role,
      displayName: fallbackDisplayName,
    };
  }

  // Unexpected profile lookup error — prefer inferred role over hard-coding
  // owner so schedulers/cutters/assemblers don't get misrouted.
  const inferredRole = await inferRoleForAuthenticatedUser(supabase, userId, appMetadataRole);
  return {
    id: userId,
    email: userEmail,
    role: inferredRole,
    displayName: fallbackDisplayName,
  };
});

export async function requireOwner(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") {
    throw new Error("Unauthorized: owner role required");
  }
  return user;
}

export async function requireInstaller(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "installer") {
    throw new Error("Unauthorized: installer role required");
  }
  return user;
}

export async function requireScheduler(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "scheduler") {
    throw new Error("Unauthorized: scheduler role required");
  }
  return user;
}

export async function requireCutter(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "cutter") {
    throw new Error("Unauthorized: cutter role required");
  }
  return user;
}

export async function requireAssembler(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "assembler") {
    throw new Error("Unauthorized: assembler role required");
  }
  return user;
}

export async function requireQc(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "qc") {
    throw new Error("Unauthorized: qc role required");
  }
  return user;
}

export async function requireOwnerOrScheduler(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "scheduler")) {
    throw new Error("Unauthorized: owner or scheduler role required");
  }
  return user;
}

export async function requireCutterOrOwner(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "cutter")) {
    throw new Error("Unauthorized: cutter or owner role required");
  }
  return user;
}

export async function getLinkedSchedulerId(
  authUserId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("schedulers")
    .select("id")
    .eq("auth_user_id", authUserId)
    .single();
  return data?.id ?? null;
}

export async function getLinkedCutterId(
  authUserId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cutters")
    .select("id")
    .eq("auth_user_id", authUserId)
    .single();
  return data?.id ?? null;
}

export async function getLinkedAssemblerId(
  authUserId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assemblers")
    .select("id")
    .eq("auth_user_id", authUserId)
    .single();
  return data?.id ?? null;
}

export async function getLinkedQcId(
  authUserId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("qcs")
    .select("id")
    .eq("auth_user_id", authUserId)
    .single();
  return data?.id ?? null;
}

export async function getLinkedInstallerId(
  authUserId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("installers")
    .select("id")
    .eq("auth_user_id", authUserId)
    .single();
  return data?.id ?? null;
}
