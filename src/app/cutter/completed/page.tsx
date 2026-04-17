import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingCompletedRoleData } from "@/lib/manufacturing-scheduler";
import { ManufacturingRoleCompletedScreen } from "@/components/manufacturing/manufacturing-role-completed-screen";

export default async function CutterCompletedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = await loadManufacturingCompletedRoleData("cutter");

  return <ManufacturingRoleCompletedScreen role="cutter" data={data} userName={user.displayName} />;
}
