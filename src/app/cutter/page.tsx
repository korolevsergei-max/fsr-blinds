import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  loadPersistedRoleSchedule,
  reflowManufacturingSchedules,
} from "@/lib/manufacturing-scheduler";
import { computeAndUpdateManufacturingRisk } from "@/app/actions/production-actions";
import { ManufacturingRoleDashboard } from "@/components/manufacturing/manufacturing-role-dashboard";

export default async function CutterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = await loadPersistedRoleSchedule("cutter");

  after(async () => {
    await computeAndUpdateManufacturingRisk();
    await reflowManufacturingSchedules("load_queue");
    revalidatePath("/cutter", "layout");
  });

  return <ManufacturingRoleDashboard role="cutter" schedule={data} userName={user.displayName} />;
}
