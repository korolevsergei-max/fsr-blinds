import { Suspense } from "react";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadPersistedRoleSchedule } from "@/lib/manufacturing-scheduler";
import { computeAndUpdateManufacturingRisk } from "@/app/actions/production-actions";
import { ManufacturingRoleShell } from "@/components/manufacturing/manufacturing-role-dashboard";
import { ManufacturingRolePipelineDashboard } from "@/components/manufacturing/manufacturing-role-pipeline-dashboard";
import { ManufacturingPipelineSkeleton } from "@/components/manufacturing/manufacturing-dashboard-skeleton";

export default async function QcPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Recompute time-based manufacturing risk flags out-of-band. The schedule
  // itself is reflowed by mutations, not by views, so we no longer recompute
  // the whole facility on every dashboard load (the 2026-06-23 storm shape).
  after(async () => {
    await computeAndUpdateManufacturingRisk();
    revalidatePath("/qc", "layout");
  });

  return (
    <ManufacturingRoleShell role="qc" userName={user.displayName}>
      <Suspense fallback={<ManufacturingPipelineSkeleton />}>
        <QcPipeline />
      </Suspense>
    </ManufacturingRoleShell>
  );
}

async function QcPipeline() {
  const schedule = await loadPersistedRoleSchedule("qc");
  return (
    <ManufacturingRolePipelineDashboard
      role="qc"
      schedule={schedule}
      unitHrefBase="/qc/units"
    />
  );
}
