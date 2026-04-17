import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { computeAndUpdateManufacturingRisk } from "@/app/actions/production-actions";
import { ManufacturingRoleDashboard } from "@/components/manufacturing/manufacturing-role-dashboard";

export default async function CutterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Refresh risk flags on every dashboard load
  await computeAndUpdateManufacturingRisk();

  const data = await loadManufacturingRoleSchedule("cutter");

  return <ManufacturingRoleDashboard role="cutter" schedule={data} userName={user.displayName} />;
}
