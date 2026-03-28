import { redirect } from "next/navigation";
import { loadSchedulerDataset, loadUnitActivityLog } from "@/lib/server-data";
import { SchedulerUnitDetail } from "./scheduler-unit-detail";

export default async function SchedulerUnitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, activityLog] = await Promise.all([
    loadSchedulerDataset(),
    loadUnitActivityLog(id),
  ]);

  // Guard: if the unit isn't in the scoped dataset, it's out of scope.
  const unit = data.units.find((u) => u.id === id);
  if (!unit) {
    redirect("/scheduler/units");
  }

  return <SchedulerUnitDetail data={data} activityLog={activityLog} />;
}
