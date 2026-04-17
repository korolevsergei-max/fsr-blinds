import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { ManufacturingRoleQueue } from "@/components/manufacturing/manufacturing-role-queue";

export default async function CutterQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const schedule = await loadManufacturingRoleSchedule("cutter");

  return <ManufacturingRoleQueue role="cutter" schedule={schedule} userName={user.displayName} />;
}
