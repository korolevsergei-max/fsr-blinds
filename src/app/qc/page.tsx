import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { computeAndUpdateManufacturingRisk } from "@/app/actions/production-actions";
import { ManufacturingRoleDashboard } from "@/components/manufacturing/manufacturing-role-dashboard";

export default async function QcPage() {
  await computeAndUpdateManufacturingRisk();

  const [data, user] = await Promise.all([
    loadManufacturingRoleSchedule("qc"),
    getCurrentUser(),
  ]);

  return <ManufacturingRoleDashboard role="qc" schedule={data} userName={user?.displayName} />;
}
