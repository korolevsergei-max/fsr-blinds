import { redirect } from "next/navigation";
import { loadSchedulerDataset, loadUnitActivityLog } from "@/lib/server-data";
import { getUnitMilestoneCoverage } from "@/lib/unit-milestones";
import { recomputeUnitStatus } from "@/lib/unit-progress";
import { createClient } from "@/lib/supabase/server";
import { SchedulerUnitDetail } from "./scheduler-unit-detail";

export default async function SchedulerUnitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Self-heal stale unit status in DB so list views also reflect accurate state
  const supabase = await createClient();
  await recomputeUnitStatus(supabase, id);
  const [data, activityLog, milestones] = await Promise.all([
    loadSchedulerDataset(),
    loadUnitActivityLog(id),
    getUnitMilestoneCoverage(id),
  ]);

  // Guard: if the unit isn't in the scoped dataset, it's out of scope.
  const unit = data.units.find((u) => u.id === id);
  if (!unit) {
    redirect("/scheduler/units");
  }

  return <SchedulerUnitDetail data={data} activityLog={activityLog} milestones={milestones} />;
}
