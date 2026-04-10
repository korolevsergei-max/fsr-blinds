import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { ManufacturingRoleQueue } from "@/components/manufacturing/manufacturing-role-queue";

export default async function CutterQueuePage() {
  const [schedule, user] = await Promise.all([
    loadManufacturingRoleSchedule("cutter"),
    getCurrentUser(),
  ]);

  return <ManufacturingRoleQueue role="cutter" schedule={schedule} userName={user?.displayName} />;
}
