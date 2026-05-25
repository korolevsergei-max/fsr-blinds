import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  loadPersistedRoleSchedule,
  reflowManufacturingSchedules,
} from "@/lib/manufacturing-scheduler";
import { CutterProduction } from "@/components/manufacturing/cutter-production";

export default async function CutterProductionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const schedule = await loadPersistedRoleSchedule("cutter");

  after(async () => {
    await reflowManufacturingSchedules("load_queue");
    revalidatePath("/cutter/production", "layout");
  });

  return <CutterProduction schedule={schedule} userName={user.displayName} />;
}
