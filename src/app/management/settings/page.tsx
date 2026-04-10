import { getCurrentUser } from "@/lib/auth";
import { getInstallerCutterAuthDrift } from "@/lib/account-sync";
import { loadFullDataset, loadAllSchedulerBuildingAccess } from "@/lib/server-data";
import { createClient } from "@/lib/supabase/server";
import { loadManufacturingSettings } from "@/lib/manufacturing-scheduler";
import { AccountsManager } from "../accounts/accounts-manager";
import type { Assembler } from "@/lib/types";
import { SettingsScreen } from "./settings-screen";

interface OwnerProfile {
  authUserId: string;
  displayName: string;
  email: string;
}

async function loadAssemblers(): Promise<Assembler[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("assemblers")
      .select("id, name, email, phone, auth_user_id")
      .order("name");
    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone ?? "",
      authUserId: row.auth_user_id ?? null,
    }));
  } catch {
    return [];
  }
}

async function loadOwnerProfiles(): Promise<OwnerProfile[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_profiles")
      .select("id, display_name, email")
      .eq("role", "owner")
      .order("display_name");
    return (data ?? []).map((row) => ({
      authUserId: row.id,
      displayName: row.display_name ?? row.email ?? "Owner",
      email: row.email ?? "",
    }));
  } catch {
    return [];
  }
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const params = (await searchParams) ?? {};
  const tab = typeof params.tab === "string" ? params.tab : "manufacturing";

  const [data, authDrift, schedulerAccess, ownerProfiles, assemblers, manufacturing] =
    await Promise.all([
      loadFullDataset(),
      getInstallerCutterAuthDrift(),
      loadAllSchedulerBuildingAccess(),
      loadOwnerProfiles(),
      loadAssemblers(),
      loadManufacturingSettings(),
    ]);

  const accounts = (
    <AccountsManager
      data={data}
      authDrift={authDrift}
      schedulerAccess={schedulerAccess}
      ownerProfiles={ownerProfiles}
      assemblers={assemblers}
      currentUserAuthId={user?.id ?? ""}
    />
  );

  return (
    <SettingsScreen
      initialTab={tab === "accounts" ? "accounts" : "manufacturing"}
      accounts={accounts}
      settings={manufacturing.settings}
      overrides={manufacturing.overrides}
    />
  );
}
