"use client";

import { useDatasetSlices } from "@/lib/dataset-context";
import { SummaryView } from "@/components/units/summary-view";

export default function ManagementSummaryPage() {
  const data = useDatasetSlices(["units", "rooms", "windows"]);
  return <SummaryView data={data} routeBasePath="/management/units" />;
}
