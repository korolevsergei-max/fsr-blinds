import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadPersistedRoleSchedule } from "@/lib/manufacturing-scheduler";
import { CutterQueue } from "@/components/manufacturing/cutter-queue";

export default async function CutterQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Pure read — the schedule is reflowed by mutations, never by views.
  const schedule = await loadPersistedRoleSchedule("cutter");

  return <CutterQueue schedule={schedule} userName={user.displayName} />;
}
