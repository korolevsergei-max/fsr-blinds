"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { StatusGridReport } from "./status-grid-report";

export default function ReportsPage() {
  const { data } = useAppDataset();
  return (
    <StatusGridReport
      units={data.units}
      clients={data.clients}
      buildings={data.buildings}
    />
  );
}
