import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { computeAndUpdateManufacturingRisk } from "@/app/actions/production-actions";
import { ManufacturingRoleDashboard } from "@/components/manufacturing/manufacturing-role-dashboard";

export default async function AssemblerPage() {
  await computeAndUpdateManufacturingRisk();

  const [data, user] = await Promise.all([
    loadManufacturingRoleSchedule("assembler"),
    getCurrentUser(),
  ]);

  return <ManufacturingRoleDashboard role="assembler" schedule={data} userName={user?.displayName} />;
}
