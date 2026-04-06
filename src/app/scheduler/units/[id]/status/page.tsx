import { loadSchedulerDataset } from "@/lib/server-data";
import { getUnitMilestoneCoverage } from "@/lib/unit-milestones";
import { StatusUpdate } from "./status-update";

export default async function StatusUpdatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, milestones] = await Promise.all([
    loadSchedulerDataset(),
    getUnitMilestoneCoverage(id),
  ]);
  return <StatusUpdate data={data} milestones={milestones} />;
}
