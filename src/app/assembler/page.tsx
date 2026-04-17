import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { computeAndUpdateManufacturingRisk } from "@/app/actions/production-actions";
import { ManufacturingRoleDashboard } from "@/components/manufacturing/manufacturing-role-dashboard";

export default async function AssemblerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await computeAndUpdateManufacturingRisk();

  const data = await loadManufacturingRoleSchedule("assembler");

  return <ManufacturingRoleDashboard role="assembler" schedule={data} userName={user.displayName} />;
}
