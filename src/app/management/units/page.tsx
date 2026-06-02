"use client";

import { useDatasetSelector, shallowEqual } from "@/lib/dataset-context";
import { UnitsList, type UnitsListData } from "./units-list";

export default function UnitsPage() {
  const data = useDatasetSelector<UnitsListData>(
    (value) => ({
      units: value.data.units,
      clients: value.data.clients,
      buildings: value.data.buildings,
      installers: value.data.installers,
      rooms: value.data.rooms,
      windows: value.data.windows,
      manufacturingEscalations: value.data.manufacturingEscalations,
    }),
    shallowEqual
  );
  const schedulers = useDatasetSelector((value) => value.data.schedulers);
  const userRole = useDatasetSelector((value) => value.user.role);

  return <UnitsList data={data} schedulers={schedulers} userRole={userRole} />;
}
