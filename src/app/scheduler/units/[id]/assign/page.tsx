import { loadSchedulerDataset } from "@/lib/server-data";
import { AssignUnitScheduler } from "./assign-unit-scheduler";

export default async function SchedulerAssignPage() {
  const data = await loadSchedulerDataset();
  return <AssignUnitScheduler data={data} />;
}
