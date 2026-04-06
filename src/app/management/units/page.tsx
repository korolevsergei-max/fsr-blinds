import { getCurrentUser } from "@/lib/auth";
import { loadFullDataset, loadUnitSchedulerAssignmentMap } from "@/lib/server-data";
import { UnitsList } from "./units-list";

export default async function UnitsPage() {
  const [user, data, unitSchedulerByUnit] = await Promise.all([
    getCurrentUser(),
    loadFullDataset(),
    loadUnitSchedulerAssignmentMap(),
  ]);

  if (!user) return null;

  return (
    <UnitsList
      data={data}
      schedulers={data.schedulers}
      unitSchedulerByUnit={unitSchedulerByUnit}
      userRole={user.role}
    />
  );
}
