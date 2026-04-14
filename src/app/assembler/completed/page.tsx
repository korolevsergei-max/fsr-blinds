import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingCompletedRoleData } from "@/lib/manufacturing-scheduler";
import { ManufacturingRoleCompletedScreen } from "@/components/manufacturing/manufacturing-role-completed-screen";

export default async function AssemblerCompletedPage() {
  const [data, user] = await Promise.all([
    loadManufacturingCompletedRoleData("assembler"),
    getCurrentUser(),
  ]);

  return <ManufacturingRoleCompletedScreen role="assembler" data={data} userName={user?.displayName} />;
}
