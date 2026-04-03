import { loadFullDataset, loadUnitSchedulerAssignmentMap } from "@/lib/server-data";
import { UnitsList } from "./units-list";

export default async function UnitsPage() {
  const [data, unitSchedulerByUnit] = await Promise.all([
    loadFullDataset(),
    loadUnitSchedulerAssignmentMap(),
  ]);
  return (
    <UnitsList
      data={data}
      schedulers={data.schedulers}
      unitSchedulerByUnit={unitSchedulerByUnit}
    />
  );
}
