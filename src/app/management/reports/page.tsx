"use client";

import { useDatasetSelector } from "@/lib/dataset-context";
import { StatusGridReport } from "./status-grid-report";

export default function ReportsPage() {
  const units = useDatasetSelector((value) => value.data.units);
  const clients = useDatasetSelector((value) => value.data.clients);
  const buildings = useDatasetSelector((value) => value.data.buildings);

  return (
    <StatusGridReport
      units={units}
      clients={clients}
      buildings={buildings}
    />
  );
}
