import { Suspense } from "react";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  loadPersistedRoleSchedule,
  reflowManufacturingSchedules,
} from "@/lib/manufacturing-scheduler";
import { computeAndUpdateManufacturingRisk } from "@/app/actions/production-actions";
import { ManufacturingRoleShell } from "@/components/manufacturing/manufacturing-role-dashboard";
import { ManufacturingRolePipelineDashboard } from "@/components/manufacturing/manufacturing-role-pipeline-dashboard";
import { ManufacturingPipelineSkeleton } from "@/components/manufacturing/manufacturing-dashboard-skeleton";

export default async function QcPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  after(async () => {
    await computeAndUpdateManufacturingRisk();
    await reflowManufacturingSchedules("load_queue");
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
