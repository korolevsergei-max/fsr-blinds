import { getCurrentUser } from "@/lib/auth";
import { loadManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { ManufacturingRoleQueue } from "@/components/manufacturing/manufacturing-role-queue";

export default async function AssemblerQueuePage() {
  const [schedule, user] = await Promise.all([
    loadManufacturingRoleSchedule("assembler"),
    getCurrentUser(),
  ]);

  return <ManufacturingRoleQueue role="assembler" schedule={schedule} userName={user?.displayName} />;
}
