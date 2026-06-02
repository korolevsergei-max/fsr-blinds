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

export default async function CutterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  after(async () => {
    await computeAndUpdateManufacturingRisk();
    await reflowManufacturingSchedules("load_queue");
    revalidatePath("/cutter", "layout");
  });

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
