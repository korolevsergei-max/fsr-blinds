import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadPersistedRoleSchedule } from "@/lib/manufacturing-scheduler";
import { ManufacturingRoleShell } from "@/components/manufacturing/manufacturing-role-dashboard";
import { ManufacturingRolePipelineDashboard } from "@/components/manufacturing/manufacturing-role-pipeline-dashboard";
import { ManufacturingPipelineSkeleton } from "@/components/manufacturing/manufacturing-dashboard-skeleton";

export default async function AssemblerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Risk flags (C2) are recomputed set-based by the daily cron + the qc-approve
  // mutation — no longer a facility scan on every dashboard view.
  return (
    <ManufacturingRoleShell role="assembler" userName={user.displayName}>
      <Suspense fallback={<ManufacturingPipelineSkeleton />}>
        <AssemblerPipeline />
      </Suspense>
    </ManufacturingRoleShell>
  );
}

async function AssemblerPipeline() {
  const schedule = await loadPersistedRoleSchedule("assembler");
  return (
    <ManufacturingRolePipelineDashboard
      role="assembler"
      schedule={schedule}
      unitHrefBase="/assembler/units"
    />
  );
}
