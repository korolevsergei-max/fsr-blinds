import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getInstallerManufacturerAuthDrift } from "@/lib/account-sync";
import { loadFullDataset } from "@/lib/server-data";
import { AccountsManager } from "./accounts-manager";

export default async function AccountsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") {
    redirect("/management");
  }

  const [data, authDrift] = await Promise.all([
    loadFullDataset(),
    getInstallerManufacturerAuthDrift(),
  ]);

  return <AccountsManager data={data} authDrift={authDrift} />;
}
