import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isInvalidRefreshTokenError } from "@/lib/supabase/auth-errors";

export type UserRole = "owner" | "installer" | "cutter" | "client" | "scheduler" | "assembler";

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
];

function normalizeUserRole(role: unknown): UserRole | null {
  return typeof role === "string" && VALID_USER_ROLES.includes(role as UserRole)
    ? (role as UserRole)
    : null;
}

function getDisplayNameFromAuthUser(user: User): string {
  return user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "User";
}

async function inferRoleFromLinkedAccount(
  supabase: SupabaseClient,
  authUserId: string
): Promise<UserRole | null> {
  const [
    schedulerRes,
    assemblerRes,
    cutterRes,
    installerRes,
  ] = await Promise.all([
    supabase.from("schedulers").select("id").eq("auth_user_id", authUserId).maybeSingle(),
    supabase.from("assemblers").select("id").eq("auth_user_id", authUserId).maybeSingle(),
    supabase.from("cutters").select("id").eq("auth_user_id", authUserId).maybeSingle(),
    supabase.from("installers").select("id").eq("auth_user_id", authUserId).maybeSingle(),
  ]);

  if (schedulerRes.data?.id) return "scheduler";
  if (assemblerRes.data?.id) return "assembler";
  if (cutterRes.data?.id) return "cutter";
  if (installerRes.data?.id) return "installer";
  return null;
}

async function inferRoleForAuthenticatedUser(
  supabase: SupabaseClient,
  user: User
): Promise<UserRole> {
  const metadataRole = normalizeUserRole(user.user_metadata?.role);
  if (metadataRole) return metadataRole;

  const linkedRole = await inferRoleFromLinkedAccount(supabase, user.id);
  if (linkedRole) return linkedRole;

  const { count: ownerCount } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "owner");

  return (ownerCount ?? 0) === 0 ? "owner" : "installer";
}

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();
  
  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error && isInvalidRefreshTokenError(error)) {
      return null;
    }
    user = data.user ?? null;
    if (!user && error) {
      const { data: sessionData } = await supabase.auth.getSession();
      user = sessionData.session?.user ?? null;
    }
  } catch (error: unknown) {
    if (isInvalidRefreshTokenError(error)) return null;
    console.error("Auth error in getCurrentUser:", error);
    return null;
  }

  if (!user) return null;

  const fallbackDisplayName = getDisplayNameFromAuthUser(user);

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role, display_name, email")
    .eq("id", user.id)
    .single();

  // Profile exists — happy path
  if (profile) {
    return {
      id: user.id,
      email: profile.email,
      role: profile.role as UserRole,
      displayName: profile.display_name,
    };
  }

  // user_profiles table missing (migration not yet applied) — treat authenticated
  // user as owner so they can access the portal and apply the migration.
  if (profileError?.code === "42P01") {
    return {
      id: user.id,
      email: user.email ?? "",
      role: "owner",
      displayName: fallbackDisplayName,
    };
  }

  // Profile row missing (trigger didn't fire) — auto-create it using the most
  // reliable role source we have: auth metadata, linked app tables, then
  // owner/installer bootstrap fallback.
  if (profileError?.code === "PGRST116") {
    const role = await inferRoleForAuthenticatedUser(supabase, user);

    await supabase.from("user_profiles").upsert({
      id: user.id,
      role,
      display_name: fallbackDisplayName,
      email: user.email ?? "",
    });

    return {
      id: user.id,
      email: user.email ?? "",
      role,
      displayName: fallbackDisplayName,
    };
  }

  // Unexpected profile lookup error — prefer inferred role over hard-coding
  // owner so schedulers/cutters/assemblers don't get misrouted.
  const inferredRole = await inferRoleForAuthenticatedUser(supabase, user);
  return {
    id: user.id,
    email: user.email ?? "",
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

export async function requireOwnerOrScheduler(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "owner" && user.role !== "scheduler")) {
    throw new Error("Unauthorized: owner or scheduler role required");
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
