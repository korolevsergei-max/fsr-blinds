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

export default async function AssemblerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  after(async () => {
    await computeAndUpdateManufacturingRisk();
    await reflowManufacturingSchedules("load_queue");
    revalidatePath("/assembler", "layout");
  });

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
