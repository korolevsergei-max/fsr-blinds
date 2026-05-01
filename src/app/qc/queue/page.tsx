import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  loadPersistedRoleSchedule,
  reflowManufacturingSchedules,
} from "@/lib/manufacturing-scheduler";
import { ManufacturingRoleQueue } from "@/components/manufacturing/manufacturing-role-queue";

export default async function QcQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const schedule = await loadPersistedRoleSchedule("qc");

  after(async () => {
    await reflowManufacturingSchedules("load_queue");
    revalidatePath("/qc/queue", "layout");
  });

  return <ManufacturingRoleQueue role="qc" schedule={schedule} userName={user.displayName} />;
}
