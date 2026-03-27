import { loadFullDataset } from "@/lib/server-data";
import { AssignUnitScheduler } from "./assign-unit-scheduler";

export default async function SchedulerAssignPage() {
  const data = await loadFullDataset();
  return <AssignUnitScheduler data={data} />;
}
