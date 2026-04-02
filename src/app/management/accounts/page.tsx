import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getInstallerManufacturerAuthDrift } from "@/lib/account-sync";
import { loadFullDataset, loadAllSchedulerBuildingAccess } from "@/lib/server-data";
import { createClient } from "@/lib/supabase/server";
import { AccountsManager } from "./accounts-manager";

export interface OwnerProfile {
  authUserId: string;
  displayName: string;
  email: string;
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

export default async function AccountsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") {
    redirect("/management");
  }

  const [data, authDrift, schedulerAccess, ownerProfiles] = await Promise.all([
    loadFullDataset(),
    getInstallerManufacturerAuthDrift(),
    loadAllSchedulerBuildingAccess(),
    loadOwnerProfiles(),
  ]);

  return (
    <AccountsManager
      data={data}
      authDrift={authDrift}
      schedulerAccess={schedulerAccess}
      ownerProfiles={ownerProfiles}
      currentUserAuthId={user.id}
    />
  );
}
