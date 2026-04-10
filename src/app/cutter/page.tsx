import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { computeAndUpdateManufacturingRisk } from "@/app/actions/production-actions";
import { ManufacturingRoleDashboard } from "@/components/manufacturing/manufacturing-role-dashboard";

export default async function CutterPage() {
  // Refresh risk flags on every dashboard load
  await computeAndUpdateManufacturingRisk();

  const [data, user] = await Promise.all([
    loadManufacturingRoleSchedule("cutter"),
    getCurrentUser(),
  ]);

  return <ManufacturingRoleDashboard role="cutter" schedule={data} userName={user?.displayName} />;
}
