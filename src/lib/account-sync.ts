import { createAdminClient } from "@/lib/supabase/admin";

export type InstallerCutterAuthDrift = {
  authUserId: string;
  email: string;
  displayName: string;
  role: "installer" | "cutter" | "scheduler";
};

/**
 * Auth users whose profile says installer/cutter/scheduler but who are not linked from
 * the respective app table's auth_user_id column (stale Supabase Auth after app deletes).
 */
export async function getInstallerCutterAuthDrift(): Promise<
  InstallerCutterAuthDrift[]
> {
  try {
    const admin = createAdminClient();
    const { data: profiles, error: profilesError } = await admin
      .from("user_profiles")
      .select("id,email,display_name,role")
      .in("role", ["installer", "cutter", "scheduler"]);

    if (profilesError || !profiles?.length) {
      return [];
    }

    const [{ data: installerRows }, { data: cutterRows }, { data: schedulerRows }] =
      await Promise.all([
        admin.from("installers").select("auth_user_id").not("auth_user_id", "is", null),
        admin.from("cutters").select("auth_user_id").not("auth_user_id", "is", null),
        admin.from("schedulers").select("auth_user_id").not("auth_user_id", "is", null),
      ]);

    const linked = new Set<string>();
    for (const row of installerRows ?? []) {
      if (row.auth_user_id) linked.add(row.auth_user_id);
    }
    for (const row of cutterRows ?? []) {
      if (row.auth_user_id) linked.add(row.auth_user_id);
    }
    for (const row of schedulerRows ?? []) {
      if (row.auth_user_id) linked.add(row.auth_user_id);
    }

    return profiles
      .filter((p) => !linked.has(p.id))
      .map((p) => ({
        authUserId: p.id,
        email: p.email,
        displayName: p.display_name,
        role: p.role as "installer" | "cutter" | "scheduler",
      }));
  } catch {
    // Drift detection is an admin-only enhancement; the Accounts page should still load without it.
    return [];
  }
}
