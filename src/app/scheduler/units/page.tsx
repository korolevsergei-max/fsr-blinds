import { loadSchedulerDataset } from "@/lib/server-data";
import { SchedulerUnitsList } from "./scheduler-units-list";

export default async function SchedulerUnitsPage() {
  const data = await loadSchedulerDataset();
  return <SchedulerUnitsList data={data} />;
}
