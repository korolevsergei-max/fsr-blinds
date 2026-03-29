import { redirect } from "next/navigation";
import { loadSchedulerDataset, loadUnitActivityLog } from "@/lib/server-data";
import { getUnitMilestoneCoverage } from "@/lib/unit-milestones";
import { SchedulerUnitDetail } from "./scheduler-unit-detail";

export default async function SchedulerUnitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
