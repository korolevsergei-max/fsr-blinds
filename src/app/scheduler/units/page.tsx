"use client";

import { useDatasetSelector, shallowEqual } from "@/lib/dataset-context";
import { SchedulerUnitsList, type SchedulerUnitsListData } from "./scheduler-units-list";

export default function SchedulerUnitsPage() {
  const data = useDatasetSelector<SchedulerUnitsListData>(
    (value) => ({
      units: value.data.units,
      buildings: value.data.buildings,
      installers: value.data.installers,
      rooms: value.data.rooms,
      windows: value.data.windows,
      manufacturingEscalations: value.data.manufacturingEscalations,
    }),
    shallowEqual
  );
  return <SchedulerUnitsList data={data} />;
}
