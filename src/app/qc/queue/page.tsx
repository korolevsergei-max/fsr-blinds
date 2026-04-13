import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { ManufacturingRoleQueue } from "@/components/manufacturing/manufacturing-role-queue";

export default async function QcQueuePage() {
  const [schedule, user] = await Promise.all([
    loadManufacturingRoleSchedule("qc"),
    getCurrentUser(),
  ]);

  return <ManufacturingRoleQueue role="qc" schedule={schedule} userName={user?.displayName} />;
}
