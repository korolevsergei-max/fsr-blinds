import { loadFullDataset } from "@/lib/server-data";
import { SchedulerUnitsList } from "./scheduler-units-list";

export default async function SchedulerUnitsPage() {
  const data = await loadFullDataset();
  return <SchedulerUnitsList data={data} />;
}
