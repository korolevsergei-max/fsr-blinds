import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadPersistedRoleSchedule } from "@/lib/manufacturing-scheduler";
import { ManufacturingRoleShell } from "@/components/manufacturing/manufacturing-role-dashboard";
import { ManufacturingRolePipelineDashboard } from "@/components/manufacturing/manufacturing-role-pipeline-dashboard";
import { ManufacturingPipelineSkeleton } from "@/components/manufacturing/manufacturing-dashboard-skeleton";

export default async function CutterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Risk flags (C2) are recomputed set-based by the daily cron + the qc-approve
  // mutation — no longer a facility scan on every dashboard view.
  return (
    <ManufacturingRoleShell role="cutter" userName={user.displayName}>
      <Suspense fallback={<ManufacturingPipelineSkeleton />}>
        <CutterPipeline />
      </Suspense>
    </ManufacturingRoleShell>
  );
}

async function CutterPipeline() {
  const schedule = await loadPersistedRoleSchedule("cutter");
  return (
    <ManufacturingRolePipelineDashboard
      role="cutter"
      schedule={schedule}
      unitHrefBase="/cutter/units"
    />
  );
}
