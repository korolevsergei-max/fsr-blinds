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

export default async function QcPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = await loadPersistedRoleSchedule("qc");

  after(async () => {
    await computeAndUpdateManufacturingRisk();
    await reflowManufacturingSchedules("load_queue");
    revalidatePath("/qc", "layout");
  });

  return <ManufacturingRoleDashboard role="qc" schedule={data} userName={user.displayName} />;
}
