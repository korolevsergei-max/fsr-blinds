import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingCompletedRoleData } from "@/lib/manufacturing-scheduler";
import { ManufacturingRoleCompletedScreen } from "@/components/manufacturing/manufacturing-role-completed-screen";

export default async function QcCompletedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = await loadManufacturingCompletedRoleData("qc");

  return <ManufacturingRoleCompletedScreen role="qc" data={data} userName={user.displayName} />;
}
