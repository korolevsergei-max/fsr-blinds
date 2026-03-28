import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getInstallerManufacturerAuthDrift } from "@/lib/account-sync";
import { loadFullDataset, loadAllSchedulerBuildingAccess } from "@/lib/server-data";
import { AccountsManager } from "./accounts-manager";

export default async function AccountsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") {
    redirect("/management");
  }

  const [data, authDrift, schedulerAccess] = await Promise.all([
    loadFullDataset(),
    getInstallerManufacturerAuthDrift(),
    loadAllSchedulerBuildingAccess(),
  ]);

  return <AccountsManager data={data} authDrift={authDrift} schedulerAccess={schedulerAccess} />;
}
