"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { UnitsList } from "./units-list";

export default function UnitsPage() {
  const { data, user } = useAppDataset();

  return (
    <UnitsList
      data={data}
      schedulers={data.schedulers}
      unitSchedulerByUnit={data.unitSchedulerByUnit ?? {}}
      userRole={user.role}
    />
  );
}
