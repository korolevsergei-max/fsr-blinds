import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingCompletedRoleData } from "@/lib/manufacturing-scheduler";
import { ManufacturingRoleCompletedScreen } from "@/components/manufacturing/manufacturing-role-completed-screen";

export default async function CutterCompletedPage() {
  const [data, user] = await Promise.all([
    loadManufacturingCompletedRoleData("cutter"),
    getCurrentUser(),
  ]);

  return <ManufacturingRoleCompletedScreen role="cutter" data={data} userName={user?.displayName} />;
}
