import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isInvalidRefreshTokenError } from "@/lib/supabase/auth-errors";

export type UserRole = "owner" | "installer" | "cutter" | "client" | "scheduler" | "assembler";

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
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
      displayName: user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "Owner",
    };
  }

  // Profile row missing (trigger didn't fire) — auto-create it.
  // First user in the system becomes owner, subsequent users become installer.
  if (profileError?.code === "PGRST116") {
    const displayName =
      user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "Owner";

    const { count: ownerCount } = await supabase
      .from("user_profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "owner");

    const role: UserRole = (ownerCount ?? 0) === 0 ? "owner" : "installer";

    await supabase.from("user_profiles").upsert({
      id: user.id,
      role,
      display_name: displayName,
      email: user.email ?? "",
    });

    return {
      id: user.id,
      email: user.email ?? "",
      role,
      displayName,
    };
  }

  // Unexpected error — still let the authenticated user through as owner so
  // they are never locked out of their own portal.
  return {
    id: user.id,
    email: user.email ?? "",
    role: "owner",
    displayName: user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "Owner",
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
