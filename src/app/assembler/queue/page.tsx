import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadPersistedRoleSchedule } from "@/lib/manufacturing-scheduler";
import { selectRoleQueueView } from "@/lib/manufacturing-role-projection";
import { ManufacturingRoleQueue } from "@/components/manufacturing/manufacturing-role-queue";

export default async function AssemblerQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Pure read — the schedule is reflowed by mutations, never by views.
  const schedule = selectRoleQueueView(
    await loadPersistedRoleSchedule("assembler"),
  );

  return <ManufacturingRoleQueue role="assembler" schedule={schedule} userName={user.displayName} />;
}
