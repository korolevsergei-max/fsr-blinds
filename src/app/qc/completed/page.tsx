import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingCompletedRoleData } from "@/lib/manufacturing-scheduler";
import { ManufacturingRoleCompletedScreen } from "@/components/manufacturing/manufacturing-role-completed-screen";

export default async function QcCompletedPage() {
  const [data, user] = await Promise.all([
    loadManufacturingCompletedRoleData("qc"),
    getCurrentUser(),
  ]);

  return <ManufacturingRoleCompletedScreen role="qc" data={data} userName={user?.displayName} />;
}
