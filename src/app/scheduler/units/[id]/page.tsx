import { loadFullDataset, loadUnitActivityLog } from "@/lib/server-data";
import { SchedulerUnitDetail } from "./scheduler-unit-detail";

export default async function SchedulerUnitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, activityLog] = await Promise.all([
    loadFullDataset(),
    loadUnitActivityLog(id),
  ]);
  return <SchedulerUnitDetail data={data} activityLog={activityLog} />;
}
